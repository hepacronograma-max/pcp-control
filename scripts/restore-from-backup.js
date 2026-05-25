#!/usr/bin/env node
/**
 * Restaura dados de um backup via upsert (nunca DELETE em massa).
 *
 * Uso:
 *   npm run restore:dry -- --backup-path="C:\...\pasta"
 *   npm run restore:apply -- --backup-path="C:\...\pasta"
 *
 * Padrão: --dry-run (não escreve). --apply exige digitar CONFIRMO RESTAURAR.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");
const {
  createSupabaseAdmin,
  readJsonSafe,
  fetchAllRows,
} = require("./lib/backup-common");

const DEFAULT_TABLES = [
  "companies",
  "production_lines",
  "holidays",
  "orders",
  "order_items",
  "profiles",
  "user_preferences",
  "cq_registros",
];

function parseArgs(argv) {
  const out = {
    backupPath: null,
    tables: DEFAULT_TABLES,
    dryRun: true,
    apply: false,
  };
  for (const arg of argv) {
    if (arg === "--apply") {
      out.apply = true;
      out.dryRun = false;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      out.apply = false;
    }
    if (arg.startsWith("--backup-path=")) {
      out.backupPath = arg.slice("--backup-path=".length).replace(/^["']|["']$/g, "");
    }
    if (arg.startsWith("--tables=")) {
      out.tables = arg
        .slice("--tables=".length)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }
  return out;
}

function runValidate(backupPath) {
  const script = path.join(__dirname, "validate-backup.js");
  const r = spawnSync(process.execPath, [script, backupPath], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  return r.status === 0;
}

async function countTable(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    if (error.code === "PGRST205") return { count: null, error: "tabela ausente" };
    return { count: null, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

function askConfirmation() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      'Digite exatamente "CONFIRMO RESTAURAR" para continuar: ',
      (answer) => {
        rl.close();
        resolve(answer.trim() === "CONFIRMO RESTAURAR");
      }
    );
  });
}

async function upsertBatch(supabase, table, rows, dryRun) {
  const BATCH = 200;
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    if (dryRun) {
      written += chunk.length;
      continue;
    }
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
    written += chunk.length;
    console.log(`  ${table}: upsert ${written}/${rows.length}`);
  }
  return written;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.backupPath) {
    console.error("Obrigatório: --backup-path=C:\\caminho\\da\\pasta");
    process.exit(1);
  }

  const backupPath = path.resolve(opts.backupPath);
  if (!fs.existsSync(backupPath)) {
    console.error("Pasta não encontrada:", backupPath);
    process.exit(1);
  }

  console.log("=== Pré-validação (validate-backup) ===");
  if (!runValidate(backupPath)) {
    console.error("Validação falhou. Abortando restore.");
    process.exit(1);
  }

  const supabase = createSupabaseAdmin();
  const mode = opts.dryRun ? "DRY-RUN (simulação)" : "APPLY (grava no Supabase)";
  console.log(`\n=== Restore — ${mode} ===`);
  console.log("Backup:", backupPath);
  console.log("Tabelas:", opts.tables.join(", "));

  console.log("\n--- Contagens: banco atual vs backup ---");
  for (const table of opts.tables) {
    const filePath = path.join(backupPath, `${table}.json`);
    const live = await countTable(supabase, table);
    let backupCount = "—";
    if (fs.existsSync(filePath)) {
      try {
        backupCount = readJsonSafe(filePath).length;
      } catch {
        backupCount = "erro JSON";
      }
    } else {
      backupCount = "arquivo ausente";
    }
    console.log(
      `  ${table}: banco=${live.count ?? "?"} (${live.error || "ok"}) | backup=${backupCount}`
    );
  }

  if (opts.apply) {
    const ok = await askConfirmation();
    if (!ok) {
      console.error("Confirmação incorreta. Abortado.");
      process.exit(1);
    }
  } else {
    console.log("\n(dry-run) Nenhum dado será gravado. Use --apply para executar.");
  }

  for (const table of opts.tables) {
    const filePath = path.join(backupPath, `${table}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`Ignorando ${table}: arquivo não existe`);
      continue;
    }
    const rows = readJsonSafe(filePath);
    if (!Array.isArray(rows)) {
      throw new Error(`${table}.json não é um array`);
    }
    console.log(`\n${table}: ${rows.length} registros`);
    await upsertBatch(supabase, table, rows, opts.dryRun);
  }

  console.log(
    opts.dryRun
      ? "\nDry-run concluído (nenhuma escrita)."
      : "\nRestore aplicado com sucesso."
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
