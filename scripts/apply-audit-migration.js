/**
 * Aplica supabase/migrations/20260520_audit_log.sql no projeto remoto.
 * Tenta: SUPABASE_ACCESS_TOKEN (PAT) → Management API, depois DATABASE_URL (pg).
 *
 * Uso: node scripts/apply-audit-migration.js
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
  "20260520_audit_log.sql"
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

async function verifyTable() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(url, key);
  const { error } = await supabase.from("audit_log").select("id").limit(1);
  return !error || !error.message.includes("does not exist");
}

async function main() {
  if (!fs.existsSync(sqlPath)) {
    console.error("Arquivo não encontrado:", sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log("Aplicando migration audit_log...");

  let result = await tryManagementApi(sql);
  if (!result.ok) {
    console.log("Management API:", result.reason);
    result = await tryPg(sql);
  }

  if (!result.ok) {
    console.error("Falha:", result.reason);
    console.error(
      "\nConfigure no .env.local uma das opções:\n" +
        "  SUPABASE_ACCESS_TOKEN=https://supabase.com/dashboard/account/tokens\n" +
        "  DATABASE_URL=postgresql://... (Settings → Database → Connection string)\n" +
        "Depois rode: node scripts/apply-audit-migration.js\n" +
        "Ou cole o SQL manualmente no SQL Editor do Supabase."
    );
    process.exit(1);
  }

  console.log("SQL executado com sucesso.");
  const ok = await verifyTable();
  console.log(ok ? "Verificação: tabela audit_log acessível." : "Verificação: conferir no SQL Editor.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
