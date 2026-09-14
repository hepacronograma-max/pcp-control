import { Client } from "pg";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS public.packaging_volume_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  volume_id uuid NOT NULL REFERENCES public.packaging_volumes(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  piece_quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT packaging_volume_items_qty_positive CHECK (piece_quantity > 0),
  CONSTRAINT packaging_volume_items_unique UNIQUE (volume_id, order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_packaging_volume_items_item
  ON public.packaging_volume_items (order_item_id);

CREATE INDEX IF NOT EXISTS idx_packaging_volume_items_volume
  ON public.packaging_volume_items (volume_id);

CREATE INDEX IF NOT EXISTS idx_packaging_volume_items_company
  ON public.packaging_volume_items (company_id);

INSERT INTO public.packaging_volume_items (
  company_id, volume_id, order_item_id, piece_quantity
)
SELECT v.company_id, v.id, v.order_item_id, v.piece_quantity
FROM public.packaging_volumes v
WHERE NOT EXISTS (
  SELECT 1 FROM public.packaging_volume_items i WHERE i.volume_id = v.id
);

ALTER TABLE public.packaging_volume_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all packaging_volume_items" ON public.packaging_volume_items;
CREATE POLICY "Allow all packaging_volume_items"
  ON public.packaging_volume_items FOR ALL
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
      console.error(
        "[ensurePackagingVolumeItems] Management API:",
        res.status,
        text
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ensurePackagingVolumeItems] Management API error:", err);
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
    console.error("[ensurePackagingVolumeItems] pg:", err);
    return false;
  }
}

export async function ensurePackagingVolumeItemsTable(): Promise<boolean> {
  if (await tryManagementApi(CREATE_SQL)) return true;
  return tryDirectConnection(CREATE_SQL);
}
