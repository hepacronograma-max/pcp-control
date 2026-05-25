#!/usr/bin/env node
/**
 * Backup diário incremental (somente leitura no Supabase).
 *
 * Destino: %USERPROFILE%\Backups\PCP-Control\daily\YYYY-MM-DD\
 * Espelha também em OneDrive\Backups\PCP-Control\daily\ se disponível.
 * Rotação: mantém últimos 30 dias.
 *
 * Uso: npm run backup:daily
 */
const fs = require("fs");
const path = require("path");
const {
  createSupabaseAdmin,
  fetchRowsSince,
  writeJson,
  buildFileEntry,
  formatBytes,
  copyDirRecursive,
} = require("./lib/backup-common");
const { resolveDailyBackupRoot, todayFolderName } = require("./lib/resolve-daily-backup-dir");
const { resolveBackupBaseDir } = require("./lib/resolve-backup-dir");
const { notify } = require("./lib/notify-telegram");

/** Nomes reais no Supabase (production_orders → orders). */
const DAILY_TABLES = [
  "orders",
  "order_items",
  "production_lines",
  "profiles",
  "companies",
  "holidays",
  "user_preferences",
  "cq_registros",
];

const KEEP_DAYS = parseInt(process.env.PCP_DAILY_BACKUP_KEEP_DAYS ?? "30", 10);

function pad(n) {
  return String(n).padStart(2, "0");
}

function ensureLogDir() {
  const logDir = path.join(__dirname, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  return logDir;
}

function logLine(logPath, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(logPath, line + "\n", "utf-8");
  console.log(msg);
}

function loadWatermark(dailyRoot) {
  const statePath = path.join(dailyRoot, ".state.json");
  if (!fs.existsSync(statePath)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    return s.lastWatermark || null;
  } catch {
    return null;
  }
}

function saveWatermark(dailyRoot, watermark, outDir) {
  const statePath = path.join(dailyRoot, ".state.json");
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        lastWatermark: watermark,
        lastRunAt: new Date().toISOString(),
        lastBackupDir: outDir,
      },
      null,
      2
    ),
    "utf-8"
  );
}

function pruneOldDailyFolders(dailyRoot) {
  if (!Number.isFinite(KEEP_DAYS) || KEEP_DAYS <= 0) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const entries = fs.readdirSync(dailyRoot, { withFileTypes: true }).filter((e) => {
    if (!e.isDirectory()) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(e.name);
  });
  for (const ent of entries) {
    const [y, m, d] = ent.name.split("-").map(Number);
    const folderDate = new Date(y, m - 1, d);
    if (folderDate < cutoff) {
      fs.rmSync(path.join(dailyRoot, ent.name), { recursive: true, force: true });
      console.log("Removido backup diário antigo:", ent.name);
    }
  }
}

function mirrorToOneDrive(localDir, dayName) {
  try {
    const oneDriveBase = resolveBackupBaseDir();
    const localRoot = resolveDailyBackupRoot();
    if (path.resolve(oneDriveBase) === path.resolve(localRoot)) return;
    const mirrorDir = path.join(oneDriveBase, "daily", dayName);
    if (path.resolve(mirrorDir) === path.resolve(localDir)) return;
    fs.mkdirSync(path.dirname(mirrorDir), { recursive: true });
    if (fs.existsSync(mirrorDir)) {
      fs.rmSync(mirrorDir, { recursive: true, force: true });
    }
    copyDirRecursive(localDir, mirrorDir);
    console.log("Espelhado no OneDrive:", mirrorDir);
  } catch (e) {
    console.warn("Aviso: espelhamento OneDrive falhou:", e.message);
  }
}

async function main() {
  const logDir = ensureLogDir();
  const logPath = path.join(
    logDir,
    `daily-backup-${todayFolderName()}.log`
  );

  const dailyRoot = resolveDailyBackupRoot();
  const dayName = todayFolderName();
  const outDir = path.join(dailyRoot, dayName);
  fs.mkdirSync(outDir, { recursive: true });

  const watermarkFrom = loadWatermark(dailyRoot);
  const runStarted = new Date().toISOString();

  logLine(logPath, `Início backup diário → ${outDir}`);
  if (watermarkFrom) {
    logLine(logPath, `Incremental desde: ${watermarkFrom}`);
  } else {
    logLine(logPath, "Primeira execução: exportação completa das tabelas diárias");
  }

  const supabase = createSupabaseAdmin();
  const manifest = {
    type: "daily",
    exportedAt: runStarted,
    folder: dayName,
    watermarkFrom,
    watermarkTo: runStarted,
    mode: watermarkFrom ? "incremental" : "full",
    tables: {},
    totalRecords: 0,
    totalBytes: 0,
    warnings: [],
  };

  let maxSeen = watermarkFrom;

  for (const table of DAILY_TABLES) {
    process.stdout.write(`  ${table}... `);
    try {
      const { rows, skipped, reason, incrementalColumn } = await fetchRowsSince(
        supabase,
        table,
        watermarkFrom
      );
      if (skipped) {
        manifest.tables[table] = { count: 0, skipped: true, reason };
        manifest.warnings.push(`${table}: ${reason}`);
        console.log("ignorada");
        continue;
      }

      const filePath = path.join(outDir, `${table}.json`);
      writeJson(filePath, rows);
      const entry = buildFileEntry(filePath, rows.length);
      manifest.tables[table] = {
        ...entry,
        incrementalColumn: incrementalColumn || null,
      };
      manifest.totalRecords += rows.length;
      manifest.totalBytes += entry.sizeBytes;

      for (const row of rows) {
        const ts = row.updated_at || row.created_at;
        if (ts && (!maxSeen || ts > maxSeen)) maxSeen = ts;
      }

      console.log(rows.length, "registros");
      logLine(logPath, `${table}: ${rows.length} registros`);
    } catch (e) {
      manifest.warnings.push(`${table}: ${e.message}`);
      logLine(logPath, `ERRO ${table}: ${e.message}`);
      throw e;
    }
  }

  manifest.watermarkTo = maxSeen || runStarted;
  writeJson(path.join(outDir, "manifest.json"), manifest);
  saveWatermark(dailyRoot, manifest.watermarkTo, outDir);

  fs.writeFileSync(
    path.join(dailyRoot, "latest.txt"),
    `${outDir}\n${manifest.exportedAt}\n`,
    "utf-8"
  );

  pruneOldDailyFolders(dailyRoot);
  mirrorToOneDrive(outDir, dayName);

  const tableCount = Object.keys(manifest.tables).filter(
    (t) => !manifest.tables[t].skipped
  ).length;
  const summary = `✅ Backup diário concluído. ${tableCount} tabelas, ${manifest.totalRecords} registros, ${formatBytes(manifest.totalBytes)}. Pasta: ${dayName}`;
  logLine(logPath, summary.replace("✅ ", ""));
  console.log("\n" + summary);

  const tg = await notify(summary, "info");
  if (!tg.sent && process.env.TELEGRAM_BOT_TOKEN) {
    logLine(logPath, `Telegram: ${tg.reason}`);
  }
}

main().catch(async (err) => {
  const msg = `❌ Backup diário falhou: ${err.message}`;
  console.error(msg);
  try {
    const logDir = path.join(__dirname, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, `daily-backup-${todayFolderName()}.log`),
      `[${new Date().toISOString()}] ${msg}\n`,
      "utf-8"
    );
  } catch {
    /* ignore */
  }
  await notify(msg, "error");
  process.exit(1);
});
