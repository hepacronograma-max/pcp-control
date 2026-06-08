-- Fase 3 — Entrega 1.5: sync incremental de itens Omie ↔ PCP
-- Aplicar manualmente no SQL Editor após revisão.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS omie_codigo_item BIGINT;
CREATE INDEX IF NOT EXISTS idx_order_items_omie_codigo_item ON order_items(omie_codigo_item);

-- Item sumiu no Omie mas permanece no PCP (regra de segurança em produção)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS omie_sync_flag TEXT;
-- NULL = normal | 'removido_no_omie' = ausente no Omie, preservado no PCP
