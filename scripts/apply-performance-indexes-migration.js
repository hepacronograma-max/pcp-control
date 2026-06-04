/**
 * Aplica supabase/migrations/20260601_performance_indexes.sql no projeto remoto.
 * Mesmo fluxo de apply-audit-migration.js: Management API → pg (DATABASE_URL).
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
  "20260601_performance_indexes.sql"
);

const validationSql = `
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public'
AND (
  indexname LIKE 'idx_perf_%'
  OR indexname IN (
    'idx_orders_company_delivery_deadline',
    'idx_order_items_order_id',
    'idx_order_items_line_status_production_start'
  )
)
ORDER BY tablename, indexname;
`;

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
    return {
      ok: false,
      reason: `Management API ${res.status}: ${text.slice(0, 400)}`,
    };
  }
  const body = await res.json().catch(() => null);
  return { ok: true, rows: body };
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
    const result = await client.query(query);
    await client.end();
    return { ok: true, rows: result.rows };
  } catch (err) {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: err.message };
  }
}

async function runQuery(query) {
  let result = await tryManagementApi(query);
  if (!result.ok) {
    result = await tryPg(query);
  }
  return result;
}

async function main() {
  if (!fs.existsSync(sqlPath)) {
    console.error("Arquivo não encontrado:", sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log("Aplicando migration performance indexes...");

  let apply = await tryManagementApi(sql);
  if (!apply.ok) {
    console.log("Management API:", apply.reason);
    apply = await tryPg(sql);
  }

  if (!apply.ok) {
    console.error("Falha:", apply.reason);
    process.exit(1);
  }

  console.log("SQL executado com sucesso.");

  let validate = await runQuery(validationSql);
  if (!validate.ok) {
    console.error("Validação falhou:", validate.reason);
    process.exit(1);
  }

  console.log("VALIDATION_JSON:" + JSON.stringify(validate.rows ?? []));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
