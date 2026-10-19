-- Linhas de pedido de compra + vínculo por linha (executar após supabase-purchase-orders.sql).

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number int NOT NULL,
  product_code text,
  description text,
  ncm text,
  quantity numeric,
  unit text,
  -- Código fornecedor (ex.: após "COD. FORNECEDOR" no PDF Omie)
  supplier_code text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(purchase_order_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id);

ALTER TABLE purchase_order_item_links
  ADD COLUMN IF NOT EXISTS purchase_order_line_id uuid REFERENCES purchase_order_lines(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poil_line_unique
  ON purchase_order_item_links (purchase_order_line_id)
  WHERE purchase_order_line_id IS NOT NULL;

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all purchase_order_lines" ON purchase_order_lines;
CREATE POLICY "Allow all purchase_order_lines" ON purchase_order_lines FOR ALL USING (true) WITH CHECK (true);
