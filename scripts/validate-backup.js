#!/usr/bin/env node
/**
 * Valida integridade de um backup (diário ou semanal).
 *
 * Uso:
 *   node scripts/validate-backup.js [caminho-da-pasta]
 *   npm run backup:validate
 *   npm run backup:validate -- C:\...\2026-05-20_111119_976
 */
const fs = require("fs");
const path = require("path");
const {
  sha256File,
  readJsonSafe,
} = require("./lib/backup-common");
const { resolveBackupBaseDir } = require("./lib/resolve-backup-dir");
const { resolveDailyBackupRoot } = require("./lib/resolve-daily-backup-dir");

function resolveBackupPath(arg) {
  if (arg && arg.trim() && !arg.startsWith("-")) {
    return path.resolve(arg.trim());
  }
  for (const base of [resolveBackupBaseDir(), resolveDailyBackupRoot()]) {
    const latestFile = path.join(base, "latest.txt");
    if (!fs.existsSync(latestFile)) continue;
    const firstLine = fs.readFileSync(latestFile, "utf-8").split(/\r?\n/)[0].trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  }
  return null;
}

function check(name, ok, detail = "") {
  return { name, ok, detail };
}

function validateRelations(backupDir, manifest) {
  const results = [];
  const ordersPath = path.join(backupDir, "orders.json");
  const itemsPath = path.join(backupDir, "order_items.json");
  if (!fs.existsSync(ordersPath) || !fs.existsSync(itemsPath)) {
    results.push(
      check(
        "Relacionamento order_items → orders",
        true,
        "orders.json ou order_items.json ausente — ignorado"
      )
    );
    return results;
  }

  const orders = readJsonSafe(ordersPath);
  const items = readJsonSafe(itemsPath);
  const orderIds = new Set(orders.map((o) => o.id));
  const orphans = items.filter((it) => it.order_id && !orderIds.has(it.order_id));

  results.push(
    check(
      "Relacionamento order_items → orders",
      orphans.length === 0,
      orphans.length === 0
        ? `${items.length} itens, todos com order_id válido`
        : `${orphans.length} itens órfãos (order_id inexistente no backup)`
    )
  );
  return results;
}

function main() {
  const arg = process.argv[2];
  const backupDir = resolveBackupPath(arg);
  if (!backupDir) {
    console.error(
      "Informe o caminho da pasta de backup ou configure latest.txt em Backups/PCP-Control"
    );
    process.exit(1);
  }

  console.log("Validando:", backupDir);
  const results = [];

  const manifestPath = path.join(backupDir, "manifest.json");
  results.push(
    check(
      "manifest.json existe",
      fs.existsSync(manifestPath),
      manifestPath
    )
  );
  if (!fs.existsSync(manifestPath)) {
    printReport(results);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = readJsonSafe(manifestPath);
    results.push(check("manifest.json parseável", true));
  } catch (e) {
    results.push(check("manifest.json parseável", false, e.message));
    printReport(results);
    process.exit(1);
  }

  const tables = manifest.tables || {};
  for (const [table, meta] of Object.entries(tables)) {
    if (meta.skipped) continue;
    const fileName = meta.file || `${table}.json`;
    const filePath = path.join(backupDir, fileName);

    results.push(
      check(
        `${table}: arquivo existe`,
        fs.existsSync(filePath),
        fileName
      )
    );
    if (!fs.existsSync(filePath)) continue;

    let rows;
    try {
      rows = readJsonSafe(filePath);
      results.push(check(`${table}: JSON válido`, true));
    } catch (e) {
      results.push(check(`${table}: JSON válido`, false, e.message));
      continue;
    }

    if (typeof meta.count === "number") {
      results.push(
        check(
          `${table}: contagem`,
          rows.length === meta.count,
          `manifest=${meta.count} arquivo=${rows.length}`
        )
      );
    }

    if (meta.sha256) {
      const hash = sha256File(filePath);
      results.push(
        check(
          `${table}: SHA256`,
          hash === meta.sha256,
          hash === meta.sha256 ? "ok" : `esperado ${meta.sha256} obtido ${hash}`
        )
      );
    }
  }

  results.push(...validateRelations(backupDir, manifest));

  const failed = printReport(results);
  process.exit(failed > 0 ? 1 : 0);
}

function printReport(results) {
  console.log("\n=== Relatório de validação ===\n");
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? "✓" : "✗";
    if (!r.ok) failed += 1;
    const extra = r.detail ? ` — ${r.detail}` : "";
    console.log(`${mark} ${r.name}${extra}`);
  }
  console.log(`\nTotal: ${results.length} | Falhas: ${failed}`);
  return failed;
}

main();
