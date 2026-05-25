#!/usr/bin/env node
/**
 * Envia o último backup semanal para GitHub Release (repo privado separado).
 * ZIP com senha (BACKUP_ENCRYPTION_PASSWORD).
 *
 * Uso: npm run backup:upload
 */
const fs = require("fs");
const path = require("path");
const { resolveBackupBaseDir } = require("./lib/resolve-backup-dir");
const { notify } = require("./lib/notify-telegram");
const {
  resolveBackupCredentials,
  ensureBackupEnvInDotenv,
  ensureBackupRepoHasCommit,
} = require("./lib/resolve-backup-env");

const PROJECT_ROOT = path.join(__dirname, "..");

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayTag() {
  const d = new Date();
  return `backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function resolveLatestWeeklyDir() {
  const base = resolveBackupBaseDir();
  const latestFile = path.join(base, "latest.txt");
  if (!fs.existsSync(latestFile)) {
    throw new Error(`latest.txt não encontrado em ${base}. Rode npm run backup:weekly primeiro.`);
  }
  const dir = fs.readFileSync(latestFile, "utf-8").split(/\r?\n/)[0].trim();
  if (!dir || !fs.existsSync(dir)) {
    throw new Error(`Pasta do último backup inválida: ${dir}`);
  }
  return dir;
}

let zipEncryptedRegistered = false;

async function createEncryptedZip(sourceDir, zipPath, pwd) {
  const archiverLib = require("archiver");
  try {
    if (!zipEncryptedRegistered) {
      archiverLib.registerFormat(
        "zip-encrypted",
        require("archiver-zip-encrypted")
      );
      zipEncryptedRegistered = true;
    }
  } catch (e) {
    throw new Error(
      "Pacote archiver-zip-encrypted não instalado. Rode: npm install archiver-zip-encrypted archiver"
    );
  }

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiverLib.create("zip-encrypted", {
      zlib: { level: 9 },
      encryptionMethod: "aes256",
      password: pwd,
    });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function ghApi(token, method, pathname, body) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body && !(body instanceof Buffer)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      body instanceof Buffer
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, headers: res.headers };
}

async function main() {
  const setup = ensureBackupEnvInDotenv();
  const { token, repo, password } = resolveBackupCredentials();

  if (setup.generatedPassword) {
    const hintDir = path.join(PROJECT_ROOT, "secrets");
    fs.mkdirSync(hintDir, { recursive: true });
    const hintFile = path.join(hintDir, "backup-encryption-password.txt");
    fs.writeFileSync(
      hintFile,
      [
        "Senha do ZIP de backup (GitHub Release) — gerada automaticamente.",
        `Arquivo: ${hintFile}`,
        `Data: ${new Date().toISOString()}`,
        "",
        `BACKUP_ENCRYPTION_PASSWORD=${setup.generatedPassword}`,
        "",
        "Guarde também no gerenciador de senhas. Não commitar este arquivo.",
      ].join("\n"),
      "utf-8"
    );
    console.log(
      "Senha ZIP gerada e salva em secrets/backup-encryption-password.txt (gitignored)."
    );
  }

  if (!token) {
    throw new Error(
      "Token GitHub ausente. Coloque GITHUB_BACKUP_TOKEN ou GitHub_token_* no .env"
    );
  }
  if (!password) {
    throw new Error("BACKUP_ENCRYPTION_PASSWORD ausente no .env");
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error("GITHUB_BACKUP_REPO inválido (use owner/repo)");
  }

  const repoInit = await ensureBackupRepoHasCommit(token, repo);
  if (!repoInit.ok) {
    throw new Error(`Repo de backups não inicializado: ${repoInit.reason}`);
  }
  if (repoInit.initialized) {
    console.log("Repo estava vazio — README inicial criado via API.");
  }

  const sourceDir = resolveLatestWeeklyDir();
  const tag = todayTag();
  const zipName = `${path.basename(sourceDir)}.zip`;
  const zipPath = path.join(path.dirname(sourceDir), zipName);

  console.log("Backup fonte:", sourceDir);
  console.log("Criando ZIP cifrado:", zipPath);
  await createEncryptedZip(sourceDir, zipPath, password);
  const zipSize = fs.statSync(zipPath).size;

  console.log("Criando release:", tag);
  const release = await ghApi(token, "POST", `/repos/${owner}/${name}/releases`, {
    tag_name: tag,
    name: `Backup ${tag.replace("backup-", "")}`,
    body: [
      "Backup automático PCP Control (semanal).",
      "",
      `Pasta origem: \`${path.basename(sourceDir)}\``,
      `Tamanho ZIP: ${(zipSize / (1024 * 1024)).toFixed(2)} MB`,
      "",
      "Arquivo protegido por senha (BACKUP_ENCRYPTION_PASSWORD).",
    ].join("\n"),
    draft: false,
    prerelease: false,
  });

  if (!release.ok) {
    const msg = release.json?.message || JSON.stringify(release.json);
    if (release.status === 422 && /already exists/i.test(msg)) {
      throw new Error(`Release ${tag} já existe. Use outro dia ou apague a release antiga.`);
    }
    throw new Error(`Criar release falhou (${release.status}): ${msg}`);
  }

  const uploadUrl = release.json.upload_url.replace(
    "{?name,label}",
    `?name=${encodeURIComponent(zipName)}`
  );
  const zipBuf = fs.readFileSync(zipPath);

  console.log("Enviando asset...");
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/zip",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: zipBuf,
  });
  const uploadJson = await upload.json().catch(() => ({}));
  if (!upload.ok) {
    throw new Error(
      `Upload falhou (${upload.status}): ${uploadJson.message || "erro"}`
    );
  }

  const htmlUrl = release.json.html_url;
  console.log("Release publicada:", htmlUrl);

  await notify(
    `✅ Backup enviado ao GitHub Release.\nTag: ${tag}\nZIP: ${zipName} (${(zipSize / (1024 * 1024)).toFixed(1)} MB)\n${htmlUrl}`,
    "info"
  );
}

main().catch(async (err) => {
  console.error(err.message || err);
  await notify(`❌ Upload backup GitHub falhou: ${err.message}`, "error");
  process.exit(1);
});
