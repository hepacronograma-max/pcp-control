/**
 * Pasta raiz dos backups diários (camada 1 — local).
 * PCP_DAILY_BACKUP_DIR sobrescreve o padrão.
 */
const path = require("path");
const os = require("os");

function resolveDailyBackupRoot() {
  const explicit = (process.env.PCP_DAILY_BACKUP_DIR || "").trim();
  if (explicit) return explicit;
  return path.join(os.homedir(), "Backups", "PCP-Control", "daily");
}

function todayFolderName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = { resolveDailyBackupRoot, todayFolderName };
