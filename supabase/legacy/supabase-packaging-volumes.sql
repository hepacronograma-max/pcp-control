-- Volumes de embalagem (uma linha = uma etiqueta = uma caixa física).
-- Execute no SQL Editor do Supabase após packaging_boxes existir.

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
