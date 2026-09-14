import { Client } from "pg";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS public.packaging_volumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  box_id uuid NOT NULL REFERENCES public.packaging_boxes(id) ON DELETE RESTRICT,
  piece_quantity integer NOT NULL,
  weight_kg numeric(10, 3) NULL,
  sequence integer NOT NULL,
  qr_token text NOT NULL,
  status text NOT NULL DEFAULT 'generated',
  scanned_at timestamptz NULL,
  scanned_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT packaging_volumes_piece_qty_positive CHECK (piece_quantity > 0),
  CONSTRAINT packaging_volumes_weight_positive CHECK (weight_kg IS NULL OR weight_kg > 0),
  CONSTRAINT packaging_volumes_sequence_positive CHECK (sequence > 0),
  CONSTRAINT packaging_volumes_status_check CHECK (
    status IN ('pending', 'generated', 'printed', 'scanned')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_packaging_volumes_qr_token
  ON public.packaging_volumes (qr_token);

CREATE INDEX IF NOT EXISTS idx_packaging_volumes_order_item
  ON public.packaging_volumes (order_item_id, sequence);

CREATE INDEX IF NOT EXISTS idx_packaging_volumes_order
  ON public.packaging_volumes (order_id, sequence);

CREATE INDEX IF NOT EXISTS idx_packaging_volumes_company
  ON public.packaging_volumes (company_id);

CREATE OR REPLACE FUNCTION public.packaging_adjust_stock(p_box_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_qty integer;
BEGIN
  UPDATE public.packaging_boxes
  SET stock_quantity = stock_quantity + p_delta,
      updated_at = now()
  WHERE id = p_box_id
    AND stock_quantity + p_delta >= 0
  RETURNING stock_quantity INTO new_qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;
  RETURN new_qty;
END;
$$;

ALTER TABLE public.packaging_volumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all packaging_volumes" ON public.packaging_volumes;
CREATE POLICY "Allow all packaging_volumes"
  ON public.packaging_volumes FOR ALL
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
      console.error("[ensurePackagingVolumes] Management API:", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ensurePackagingVolumes] Management API error:", err);
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
    console.error("[ensurePackagingVolumes] pg:", err);
    return false;
  }
}

export async function ensurePackagingVolumesTable(): Promise<boolean> {
  if (await tryManagementApi(CREATE_SQL)) return true;
  return tryDirectConnection(CREATE_SQL);
}
