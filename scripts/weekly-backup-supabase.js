#!/usr/bin/env node
/**
 * Backup completo do Supabase (JSON por tabela + opcional pg_dump).
 *
 * Uso:
 *   node scripts/weekly-backup-supabase.js
 *   npm run backup:weekly
 *
 * Requer no .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Opcional:
 *   DATABASE_URL — gera também supabase-dump.sql (precisa pg_dump no PATH)
 *   PCP_BACKUP_DIR — pasta base (sobrescreve detecção automática)
 *   PCP_BACKUP_ONEDRIVE=0 — não usar pasta OneDrive automaticamente
 *   PCP_BACKUP_KEEP_WEEKS — se > 0, apaga pastas antigas além de N (padrão: 0 = nunca apaga)
 *
 * Destino padrão: OneDrive\Backups\PCP-Control (sincroniza na nuvem sozinho).
 */
require("dotenv").config();
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.local"),
  override: true,
});

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createClient } = require("@supabase/supabase-js");
const { resolveBackupBaseDir } = require("./lib/resolve-backup-dir");

const execFileAsync = promisify(execFile);

const PAGE_SIZE = 1000;
const PROJECT_ROOT = path.join(__dirname, "..");

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const TABLES = [
  "companies",
  "production_lines",
  "holidays",
  "departments",
  "orders",
  "order_items",
  "profiles",
  "operator_lines",
  "user_preferences",
  "cq_categorias",
  "cq_registros",
  "purchase_orders",
  "purchase_order_lines",
  "purchase_order_item_links",
  "tasks",
  "subtasks",
  "task_comments",
  "task_history",
];

/** Tabelas de backup manual no Supabase (se existirem). */
const OPTIONAL_TABLES = [
  "backup_production_lines_20260507",
  "backup_cq_20260507",
];

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Pasta única por execução: data + hora + ms (nunca reutiliza a mesma pasta). */
function timestampFolder() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function resolveUniqueOutDir(baseDir, folderName) {
  let name = folderName;
  let n = 1;
  while (fs.existsSync(path.join(baseDir, name))) {
    n += 1;
    name = `${folderName}_${n}`;
  }
  return path.join(baseDir, name);
}

function isSkippableTableError(err) {
  const msg = (err && err.message) || String(err);
  const code = err && err.code;
  return (
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("Could not find the table") ||
    msg.includes("schema cache")
  );
}

async function fetchAllRows(supabase, table) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (isSkippableTableError(error)) {
        return { rows: [], skipped: true, reason: error.message };
      }
      throw new Error(`${table}: ${error.message}`);
    }
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { rows, skipped: false };
}

async function exportAuthUsers(supabase) {
  const users = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error("auth.users: " + error.message);
    const batch = data?.users || [];
    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.email,
        phone: u.phone,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
      });
    }
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function tryPgDump(outDir) {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    return { ok: false, reason: "DATABASE_URL não configurada" };
  }
  const dumpPath = path.join(outDir, "supabase-dump.sql");
  try {
    await execFileAsync(
      "pg_dump",
      ["--no-owner", "--no-acl", "--format=plain", "--file", dumpPath, dbUrl],
      { timeout: 600000, windowsHide: true }
    );
    return { ok: true, path: dumpPath };
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      return {
        ok: false,
        reason:
          "pg_dump não encontrado. Instale PostgreSQL client ou use só o backup JSON.",
      };
    }
    return { ok: false, reason: msg };
  }
}

function pruneOldBackups(baseDir, keepWeeks) {
  if (!fs.existsSync(baseDir)) return;
  const entries = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_/.test(e.name))
    .map((e) => ({
      name: e.name,
      path: path.join(baseDir, e.name),
      mtime: fs.statSync(path.join(baseDir, e.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const toRemove = entries.slice(keepWeeks);
  for (const ent of toRemove) {
    fs.rmSync(ent.path, { recursive: true, force: true });
    console.log("Removido backup antigo:", ent.name);
  }
}

async function main() {
  if (!url || !serviceKey) {
    console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
    process.exit(1);
  }

  const baseDir = resolveBackupBaseDir();
  const readmePath = path.join(baseDir, "LEIAME.txt");
  if (!fs.existsSync(readmePath)) {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(
      readmePath,
      [
        "Backups do PCP Control (Supabase)",
        "",
        "Cada execucao cria uma PASTA NOVA com data e hora, por exemplo:",
        "  2026-05-20_165806_344\\",
        "    orders.json",
        "    order_items.json",
        "    manifest.json",
        "    ...",
        "",
        "Backups antigos NAO sao sobrescritos.",
        "latest.txt apenas indica qual foi o ultimo backup.",
        "",
      ].join("\n"),
      "utf-8"
    );
  }

  const keepWeeks = parseInt(process.env.PCP_BACKUP_KEEP_WEEKS ?? "0", 10);
  const pruneEnabled = Number.isFinite(keepWeeks) && keepWeeks > 0;

  const folderName = timestampFolder();
  const outDir = resolveUniqueOutDir(baseDir, folderName);
  fs.mkdirSync(outDir, { recursive: true });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const manifest = {
    exportedAt: new Date().toISOString(),
    projectRoot: PROJECT_ROOT,
    supabaseUrl: url.replace(/\/\/[^@]+@/, "//***@"),
    folder: path.basename(outDir),
    tables: {},
    authUsersCount: 0,
    pgDump: null,
    warnings: [],
  };

  console.log("Destino base:", baseDir);
  console.log("Nova pasta (não sobrescreve backups anteriores):", outDir);

  for (const table of TABLES) {
    process.stdout.write(`  ${table}... `);
    const { rows, skipped, reason } = await fetchAllRows(supabase, table);
    if (skipped) {
      manifest.tables[table] = { count: 0, skipped: true, reason };
      manifest.warnings.push(`Tabela ignorada: ${table} (${reason})`);
      console.log("ignorada");
      continue;
    }
    writeJson(path.join(outDir, `${table}.json`), rows);
    manifest.tables[table] = { count: rows.length, file: `${table}.json` };
    console.log(rows.length, "registros");
  }

  for (const table of OPTIONAL_TABLES) {
    process.stdout.write(`  ${table} (opcional)... `);
    try {
      const { rows, skipped } = await fetchAllRows(supabase, table);
      if (skipped) {
        console.log("não existe");
        continue;
      }
      writeJson(path.join(outDir, `${table}.json`), rows);
      manifest.tables[table] = { count: rows.length, file: `${table}.json` };
      console.log(rows.length, "registros");
    } catch (e) {
      console.log("erro:", e.message);
      manifest.warnings.push(`${table}: ${e.message}`);
    }
  }

  process.stdout.write("  auth.users... ");
  try {
    const authUsers = await exportAuthUsers(supabase);
    writeJson(path.join(outDir, "auth-users.json"), authUsers);
    manifest.authUsersCount = authUsers.length;
    manifest.tables["auth-users"] = {
      count: authUsers.length,
      file: "auth-users.json",
      note: "Sem senhas; restauração exige recriar usuários no Auth.",
    };
    console.log(authUsers.length, "usuários");
  } catch (e) {
    manifest.warnings.push("auth.users: " + e.message);
    console.log("falhou:", e.message);
  }

  const pgResult = await tryPgDump(outDir);
  manifest.pgDump = pgResult;
  if (pgResult.ok) {
    console.log("  pg_dump → supabase-dump.sql");
  } else {
    console.log("  pg_dump:", pgResult.reason);
  }

  writeJson(path.join(outDir, "manifest.json"), manifest);
  fs.writeFileSync(
    path.join(baseDir, "latest.txt"),
    outDir + "\n" + manifest.exportedAt,
    "utf-8"
  );

  if (pruneEnabled) {
    pruneOldBackups(baseDir, keepWeeks);
  } else {
    console.log(
      "Backups antigos mantidos (defina PCP_BACKUP_KEEP_WEEKS=N para apagar os mais velhos)."
    );
  }

  console.log("\nConcluído:", outDir);
  console.log("Último backup registrado em:", path.join(baseDir, "latest.txt"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
