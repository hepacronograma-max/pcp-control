#!/usr/bin/env node
/**
 * Adiciona as colunas delivery_deadline e pcp_deadline na tabela orders.
 * Uso: node scripts/add-delivery-columns.js
 * Requer: SUPABASE_ACCESS_TOKEN no .env (crie em https://supabase.com/dashboard/account/tokens)
 *   ou: DATABASE_URL no .env
 */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const ref = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];

async function viaManagementApi() {
  const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
  if (!token || !ref) return false;
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_deadline date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_deadline date;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pcp_deadline date;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_id uuid REFERENCES production_lines(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pc_number text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pc_delivery_date date;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status text DEFAULT 'waiting';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS production_start date;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS production_end date;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_by text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes text;`,
      }),
    }
  );
  return res.ok;
}

async function viaPg() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl || !dbUrl.startsWith("postgres")) return false;
  const { Client } = require("pg");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  await client.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_deadline date;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_deadline date;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pcp_deadline date;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_id uuid REFERENCES production_lines(id) ON DELETE SET NULL;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pc_number text;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pc_delivery_date date;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status text DEFAULT 'waiting';
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS production_start date;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS production_end date;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_at timestamptz;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_by text;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes text;
  `);
  await client.end();
  return true;
}

async function main() {
  console.log("Adicionando colunas delivery_deadline e pcp_deadline...");
  const ok = (await viaManagementApi()) || (await viaPg());
  if (ok) {
    console.log("OK! Colunas adicionadas. O prazo de entrega funcionará na importação.");
  } else {
    console.error("Erro. Configure no .env.local:");
    console.error("  SUPABASE_ACCESS_TOKEN (de https://supabase.com/dashboard/account/tokens)");
    console.error("  ou DATABASE_URL (de Supabase > Project Settings > Database)");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
