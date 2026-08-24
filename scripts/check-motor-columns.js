/**
 * Verifica se as colunas motor_* existem em order_items.
 * Uso: node scripts/check-motor-columns.js
 */
const path = require("path");
require("dotenv").config();
require("dotenv").config({
  path: path.join(process.cwd(), ".env.local"),
  override: true,
});

const QUERY = `select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'order_items'
and column_name like 'motor_%' order by column_name;`;

const EXPECTED = [
  "motor_dpi",
  "motor_dpf",
  "motor_espessura_papel_mm",
  "motor_material",
  "motor_num_elementos",
  "motor_tem_coroa",
  "motor_vazao",
];

function getProjectRef() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

async function tryManagementApi() {
  const token =
    process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
  const ref = getProjectRef();
  if (!token || !ref) {
    return { ok: false, reason: "sem SUPABASE_ACCESS_TOKEN" };
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: QUERY }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, reason: `Management API ${res.status}: ${text.slice(0, 300)}` };
  }
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return { ok: false, reason: "resposta JSON inválida" };
  }
  const cols = (Array.isArray(rows) ? rows : []).map((r) => r.column_name);
  return { ok: true, cols, via: "management-api" };
}

async function tryPg() {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl || !databaseUrl.startsWith("postgres")) {
    return { ok: false, reason: "sem DATABASE_URL" };
  }
  const { Client } = require("pg");
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const r = await client.query(QUERY);
    await client.end();
    return {
      ok: true,
      cols: r.rows.map((row) => row.column_name),
      via: "pg",
    };
  } catch (err) {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: err.message };
  }
}

async function trySupabaseSelect() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, reason: "sem service role" };
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(url, key);
  const { error } = await supabase
    .from("order_items")
    .select(
      "motor_espessura_papel_mm, motor_material, motor_tem_coroa, motor_num_elementos, motor_vazao, motor_dpi, motor_dpf"
    )
    .limit(1);
  if (error) {
    return { ok: false, reason: error.message, via: "postgrest" };
  }
  return { ok: true, cols: EXPECTED, via: "postgrest-select" };
}

async function main() {
  let result = await tryManagementApi();
  if (!result.ok) {
    console.log("Management API:", result.reason);
    result = await tryPg();
  }
  if (!result.ok) {
    console.log("pg:", result.reason);
    result = await trySupabaseSelect();
  }

  if (!result.ok) {
    console.log("RESULTADO: NAO_FOI_POSSIVEL_CONSULTAR");
    console.log("motivo:", result.reason);
    process.exit(2);
  }

  const cols = result.cols || [];
  const missing = EXPECTED.filter((c) => !cols.includes(c));
  console.log("via:", result.via);
  console.log("colunas encontradas:", cols.join(", ") || "(nenhuma)");
  console.log("faltando:", missing.join(", ") || "(nenhuma)");
  console.log("RESULTADO:", missing.length === 0 ? "SIM" : "NAO");
  process.exit(missing.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
