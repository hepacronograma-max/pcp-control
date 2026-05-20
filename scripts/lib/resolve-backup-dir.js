/**
 * Pasta base dos backups.
 * Ordem: PCP_BACKUP_DIR → OneDrive (se existir) → %USERPROFILE%\Backups\PCP-Control
 *
 * PCP_BACKUP_ONEDRIVE=0 desativa o uso automático do OneDrive.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

function firstExistingDir(candidates) {
  for (const dir of candidates) {
    if (!dir || typeof dir !== "string") continue;
    const trimmed = dir.trim();
    if (!trimmed) continue;
    try {
      if (fs.existsSync(trimmed)) return trimmed;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function resolveBackupBaseDir() {
  const explicit = (process.env.PCP_BACKUP_DIR || "").trim();
  if (explicit) return explicit;

  const skipOneDrive =
    process.env.PCP_BACKUP_ONEDRIVE === "0" ||
    process.env.PCP_BACKUP_ONEDRIVE === "false";

  if (!skipOneDrive) {
    const oneDriveRoot = firstExistingDir([
      process.env.OneDrive,
      process.env.ONEDRIVE,
      process.env.OneDriveCommercial,
      process.env.ONEDRIVECOMMERCIAL,
      process.env.OneDriveConsumer,
      process.env.ONEDRIVECONSUMER,
      path.join(os.homedir(), "OneDrive"),
      path.join(os.homedir(), "OneDrive - Empresa"),
    ]);
    if (oneDriveRoot) {
      return path.join(oneDriveRoot, "Backups", "PCP-Control");
    }
  }

  return path.join(os.homedir(), "Backups", "PCP-Control");
}

module.exports = { resolveBackupBaseDir };
