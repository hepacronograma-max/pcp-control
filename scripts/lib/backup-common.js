/**
 * Utilitários compartilhados de backup (somente leitura no Supabase).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { loadEnv } = require("./load-env");

const PAGE_SIZE = 1000;

const INCREMENTAL_COLUMN = {
  orders: "updated_at",
  order_items: "updated_at",
  production_lines: "updated_at",
  profiles: "updated_at",
  companies: "updated_at",
  holidays: "created_at",
  user_preferences: "updated_at",
  cq_registros: "updated_at",
};

function getSupabaseConfig() {
  loadEnv();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, serviceKey };
}

function createSupabaseAdmin() {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) {
    throw new Error(
      "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isSkippableTableError(err) {
  const msg = (err && err.message) || String(err);
  const code = err && err.code;
  return (
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("Could not find the table") ||
    msg.includes("schema cache") ||
    msg.includes("column")
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

async function fetchRowsSince(supabase, table, sinceIso) {
  const col = INCREMENTAL_COLUMN[table] || "updated_at";
  if (!sinceIso) {
    return fetchAllRows(supabase, table);
  }

  const rows = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select("*");
    q = q.gt(col, sinceIso);
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (isSkippableTableError(error)) {
        return fetchAllRows(supabase, table);
      }
      throw new Error(`${table}: ${error.message}`);
    }
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { rows, skipped: false, incrementalColumn: col };
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function buildFileEntry(filePath, count) {
  const sha256 = sha256File(filePath);
  const sizeBytes = fs.statSync(filePath).size;
  return {
    file: path.basename(filePath),
    count,
    sha256,
    sizeBytes,
  };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readJsonSafe(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

module.exports = {
  PAGE_SIZE,
  INCREMENTAL_COLUMN,
  getSupabaseConfig,
  createSupabaseAdmin,
  isSkippableTableError,
  fetchAllRows,
  fetchRowsSince,
  sha256File,
  writeJson,
  buildFileEntry,
  formatBytes,
  readJsonSafe,
  copyDirRecursive,
};
