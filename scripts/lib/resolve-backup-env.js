/**
 * Resolve credenciais de backup a partir de .env / .env.local.
 * Aceita nomes alternativos (ex.: GitHub_token_clássico no .env do Helder).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadEnv } = require("./load-env");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function readEnvFiles() {
  const vars = {};
  for (const file of [".env", ".env.local"]) {
    const p = path.join(PROJECT_ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  }
  return vars;
}

function pickToken(vars) {
  const keys = [
    "GITHUB_BACKUP_TOKEN",
    "GITHUB_ADMIN_TOKEN",
    "GITHUB_TOKEN",
  ];
  for (const k of keys) {
    if (vars[k]?.trim()) return vars[k].trim();
  }
  for (const [k, v] of Object.entries(vars)) {
    if (/^github.*token/i.test(k) && v?.trim()) return v.trim();
  }
  return "";
}

function ensureBackupEnvInDotenv() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  const vars = readEnvFiles();
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    : [];
  let changed = false;

  function hasKey(name) {
    return lines.some((l) => l.trim().startsWith(`${name}=`));
  }

  function appendLine(line) {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push(line);
    changed = true;
  }

  if (!hasKey("GITHUB_BACKUP_REPO") && !vars.GITHUB_BACKUP_REPO) {
    appendLine(
      "GITHUB_BACKUP_REPO=hepacronograma-max/pcp-control-backups"
    );
  }

  if (!pickToken(vars) && !hasKey("GITHUB_BACKUP_TOKEN")) {
    return { changed: false, needsToken: true };
  }

  if (!hasKey("GITHUB_BACKUP_TOKEN") && pickToken(vars)) {
    appendLine(`GITHUB_BACKUP_TOKEN=${pickToken(vars)}`);
  }

  let generatedPassword = null;
  if (
    !hasKey("BACKUP_ENCRYPTION_PASSWORD") &&
    !vars.BACKUP_ENCRYPTION_PASSWORD?.trim()
  ) {
    generatedPassword = crypto.randomBytes(18).toString("base64url");
    appendLine(`BACKUP_ENCRYPTION_PASSWORD=${generatedPassword}`);
  }

  if (changed) {
    fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
  }

  return { changed, generatedPassword, needsToken: false };
}

function resolveBackupCredentials() {
  loadEnv();
  ensureBackupEnvInDotenv();
  loadEnv();

  const vars = readEnvFiles();
  const token = pickToken(vars) || process.env.GITHUB_BACKUP_TOKEN?.trim() || "";
  const repo = (
    process.env.GITHUB_BACKUP_REPO ||
    vars.GITHUB_BACKUP_REPO ||
    "hepacronograma-max/pcp-control-backups"
  ).trim();
  const password = (
    process.env.BACKUP_ENCRYPTION_PASSWORD ||
    vars.BACKUP_ENCRYPTION_PASSWORD ||
    ""
  ).trim();

  return { token, repo, password, vars };
}

async function ensureBackupRepoHasCommit(token, repo) {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return { ok: false, reason: "repo inválido" };

  const readmeCheck = await fetch(
    `https://api.github.com/repos/${owner}/${name}/contents/README.md`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (readmeCheck.ok) {
    return { ok: true, initialized: false };
  }
  if (readmeCheck.status !== 404) {
    return { ok: false, reason: `README check ${readmeCheck.status}` };
  }

  const readme = [
    "# pcp-control-backups",
    "",
    "Repositório **privado** só para [GitHub Releases](https://github.com/hepacronograma-max/pcp-control-backups/releases) com ZIPs cifrados do backup do PCP Control.",
    "",
    "Não coloque código da aplicação aqui.",
  ].join("\n");

  const put = await fetch(
    `https://api.github.com/repos/${owner}/${name}/contents/README.md`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        message: "chore: inicializar repo de backups",
        content: Buffer.from(readme, "utf8").toString("base64"),
      }),
    }
  );
  const body = await put.json().catch(() => ({}));
  if (!put.ok) {
    return {
      ok: false,
      reason: body.message || `PUT README ${put.status}`,
    };
  }
  return { ok: true, initialized: true };
}

module.exports = {
  resolveBackupCredentials,
  ensureBackupEnvInDotenv,
  ensureBackupRepoHasCommit,
  pickToken,
};
