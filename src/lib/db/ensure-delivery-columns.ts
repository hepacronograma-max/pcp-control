import { Client } from "pg";

const ALTER_SQL = `
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
`;

function getProjectRef(): string | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

/**
 * Tenta adicionar colunas via Supabase Management API (não precisa de DATABASE_URL).
 * Requer SUPABASE_ACCESS_TOKEN (PAT) ou SUPABASE_SERVICE_ROLE_KEY (pode funcionar em alguns casos).
 */
async function tryManagementApi(): Promise<boolean> {
  const token =
    process.env.SUPABASE_ACCESS_TOKEN ||
    process.env.SUPABASE_PAT;
  const ref = getProjectRef();
  if (!token || !ref) return false;

  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: ALTER_SQL.trim() }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("[ensureDeliveryColumns] Management API:", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ensureDeliveryColumns] Management API error:", err);
    return false;
  }
}

/**
 * Adiciona as colunas via conexão direta (requer DATABASE_URL).
 */
async function tryDirectConnection(): Promise<boolean> {
  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (!databaseUrl || !databaseUrl.startsWith("postgres")) {
    return false;
  }

  try {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(ALTER_SQL);
    await client.end();
    return true;
  } catch (err) {
    console.error("[ensureDeliveryColumns] pg:", err);
    return false;
  }
}

/**
 * Adiciona delivery_deadline e pcp_deadline em orders e pcp_deadline em order_items.
 * Tenta: 1) Management API (SUPABASE_ACCESS_TOKEN), 2) Conexão direta (DATABASE_URL).
 */
export async function ensureDeliveryColumns(): Promise<boolean> {
  const ok = (await tryManagementApi()) || (await tryDirectConnection());
  if (ok) {
    console.log("[ensureDeliveryColumns] Colunas adicionadas com sucesso.");
  }
  return ok;
}
