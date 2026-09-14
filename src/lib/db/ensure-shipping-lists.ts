import { Client } from "pg";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS public.shipping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  received_by_name text NULL,
  received_at timestamptz NULL,
  finalized_at timestamptz NULL,
  invoiced_at timestamptz NULL,
  collected_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipping_lists_order_unique UNIQUE (order_id),
  CONSTRAINT shipping_lists_status_check CHECK (status IN ('open', 'finalized'))
);

CREATE INDEX IF NOT EXISTS idx_shipping_lists_company
  ON public.shipping_lists (company_id);

ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS invoiced_at timestamptz;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS collected_at timestamptz;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS nfe_number text;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_url text;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_path text;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_taken_at timestamptz;

ALTER TABLE public.shipping_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all shipping_lists" ON public.shipping_lists;
CREATE POLICY "Allow all shipping_lists"
  ON public.shipping_lists FOR ALL
  USING (true)
  WITH CHECK (true);
`;

function getProjectRef(): string | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

async function tryManagementApi(sql: string): Promise<boolean> {
  const token =
    process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
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
        body: JSON.stringify({ query: sql }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("[ensureShippingLists] Management API:", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ensureShippingLists] Management API error:", err);
    return false;
  }
}

async function tryDirectConnection(sql: string): Promise<boolean> {
  const databaseUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl || !databaseUrl.startsWith("postgres")) return false;
  try {
    const client = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(sql);
    await client.end();
    return true;
  } catch (err) {
    console.error("[ensureShippingLists] pg:", err);
    return false;
  }
}

export async function ensureShippingListsTable(): Promise<boolean> {
  if (await tryManagementApi(CREATE_SQL)) return true;
  return tryDirectConnection(CREATE_SQL);
}
