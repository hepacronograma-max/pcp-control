-- Fase 3 — Entrega 1: vínculo Omie ↔ PCP (importação somente leitura no Omie)
-- Aplicar manualmente no SQL Editor após revisão. Não executar automaticamente.

-- Vinculo Omie <-> PCP (idempotencia)
CREATE TABLE IF NOT EXISTS omie_order_links (
  id BIGSERIAL PRIMARY KEY,
  pcp_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  omie_codigo_pedido BIGINT NOT NULL UNIQUE,
  omie_numero_pedido TEXT,
  omie_etapa TEXT,
  omie_payload_original JSONB,
  sync_status TEXT DEFAULT 'synced',
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_omie_links_pcp_order ON omie_order_links(pcp_order_id);
CREATE INDEX IF NOT EXISTS idx_omie_links_omie_codigo ON omie_order_links(omie_codigo_pedido);

-- Lock de sincronizacao
CREATE TABLE IF NOT EXISTS sync_locks (
  lock_name TEXT PRIMARY KEY,
  acquired_at TIMESTAMPTZ,
  acquired_by TEXT,
  expires_at TIMESTAMPTZ
);

-- RLS: so admin le
ALTER TABLE omie_order_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read omie_order_links" ON omie_order_links;
CREATE POLICY "Admins read omie_order_links" ON omie_order_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'manager', 'super_admin')
    )
  );
