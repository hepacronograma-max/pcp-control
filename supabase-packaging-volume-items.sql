-- Itens dentro de um volume (várias peças de itens diferentes na mesma caixa).
-- Execute no SQL Editor após packaging_volumes existir.

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
