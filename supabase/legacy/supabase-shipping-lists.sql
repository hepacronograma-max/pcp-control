-- Lista de embarque: 1 pedido = 1 lista. Rode no SQL Editor se a aba Faturamento pedir.

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

ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS invoiced_at timestamptz;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS collected_at timestamptz;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS nfe_number text;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_url text;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_path text;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_taken_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_shipping_lists_company
  ON public.shipping_lists (company_id);

ALTER TABLE public.shipping_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all shipping_lists" ON public.shipping_lists;
CREATE POLICY "Allow all shipping_lists"
  ON public.shipping_lists FOR ALL
  USING (true)
  WITH CHECK (true);
