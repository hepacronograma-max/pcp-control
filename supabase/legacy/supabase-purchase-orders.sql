-- Pedidos de compras (Compras) — executar manualmente no SQL Editor do Supabase.
-- Necessário para a aba Compras: cadastro de PCs e vínculo a itens de pedido de venda.
-- Depois execute também: supabase-purchase-order-lines.sql (itens do PC + vínculo por linha).

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  supplier_name text,
  expected_delivery date,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, number)
);

CREATE TABLE IF NOT EXISTS purchase_order_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_polink_po ON purchase_order_item_links(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_polink_oi ON purchase_order_item_links(order_item_id);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_item_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all purchase_orders" ON purchase_orders;
CREATE POLICY "Allow all purchase_orders" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all purchase_order_item_links" ON purchase_order_item_links;
CREATE POLICY "Allow all purchase_order_item_links" ON purchase_order_item_links FOR ALL USING (true) WITH CHECK (true);
