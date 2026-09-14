-- Vínculo Omie ↔ pedidos de compra (somente leitura na API Omie).

CREATE TABLE IF NOT EXISTS omie_purchase_order_links (
  id BIGSERIAL PRIMARY KEY,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  omie_codigo_pedcompra BIGINT NOT NULL UNIQUE,
  omie_numero TEXT,
  omie_etapa TEXT,
  omie_payload_original JSONB,
  sync_status TEXT DEFAULT 'synced',
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_omie_po_links_po
  ON omie_purchase_order_links(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_omie_po_links_codigo
  ON omie_purchase_order_links(omie_codigo_pedcompra);

ALTER TABLE omie_purchase_order_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all omie_purchase_order_links" ON omie_purchase_order_links;
CREATE POLICY "Allow all omie_purchase_order_links" ON omie_purchase_order_links
  FOR ALL USING (true) WITH CHECK (true);
