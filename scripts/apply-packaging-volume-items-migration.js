/**
 * Aplica supabase/migrations/20260827_packaging_volume_items.sql no projeto remoto.
 * Uso: node scripts/apply-packaging-volume-items-migration.js
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(process.cwd(), ".env.local"),
  override: true,
});

const sqlPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260827_packaging_volume_items.sql"
);

function getProjectRef() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

async function tryManagementApi(query) {
  const token =
    process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
  const ref = getProjectRef();
  if (!token || !ref) {
    return { ok: false, reason: "SUPABASE_ACCESS_TOKEN ou SUPABASE_PAT ausente" };
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, reason: `Management API ${res.status}: ${text.slice(0, 400)}` };
  }
  return { ok: true };
}

async function tryPg(query) {
  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl || !databaseUrl.startsWith("postgres")) {
    return { ok: false, reason: "DATABASE_URL ausente" };
  }
  const { Client } = require("pg");
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(query);
    await client.end();
    return { ok: true };
  } catch (err) {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: err.message };
  }
}

async function main() {
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log("Aplicando migration packaging_volume_items...");
  let result = await tryManagementApi(sql);
  if (!result.ok) {
    console.log("Management API:", result.reason);
    result = await tryPg(sql);
  }
  if (!result.ok) {
    console.error("Falha:", result.reason);
    console.error(
      "Cole supabase-packaging-volume-items.sql no SQL Editor do Supabase."
    );
    process.exit(1);
  }
  console.log("SQL executado com sucesso.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
