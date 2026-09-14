import { Client } from "pg";

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS public.packaging_boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  length_cm numeric(10, 2) NOT NULL,
  width_cm numeric(10, 2) NOT NULL,
  height_cm numeric(10, 2) NOT NULL,
  empty_weight_kg numeric(10, 3) NULL,
  stock_quantity integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT packaging_boxes_code_not_blank CHECK (length(btrim(code)) > 0),
  CONSTRAINT packaging_boxes_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT packaging_boxes_dims_positive CHECK (
    length_cm > 0 AND width_cm > 0 AND height_cm > 0
  ),
  CONSTRAINT packaging_boxes_empty_weight_nonneg CHECK (
    empty_weight_kg IS NULL OR empty_weight_kg >= 0
  ),
  CONSTRAINT packaging_boxes_stock_nonneg CHECK (stock_quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_packaging_boxes_company_code
  ON public.packaging_boxes (company_id, lower(code));

CREATE INDEX IF NOT EXISTS idx_packaging_boxes_company_active
  ON public.packaging_boxes (company_id, active);

ALTER TABLE public.packaging_boxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all packaging_boxes" ON public.packaging_boxes;
CREATE POLICY "Allow all packaging_boxes"
  ON public.packaging_boxes FOR ALL
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
      console.error("[ensurePackagingBoxes] Management API:", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ensurePackagingBoxes] Management API error:", err);
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
    console.error("[ensurePackagingBoxes] pg:", err);
    return false;
  }
}

export async function ensurePackagingBoxesTable(): Promise<boolean> {
  if (await tryManagementApi(CREATE_SQL)) return true;
  return tryDirectConnection(CREATE_SQL);
}
