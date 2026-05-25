-- Fase 3 — Integração Omie ↔ PCP Control
-- Execute no SQL Editor do Supabase (não roda automaticamente).

-- ---------------------------------------------------------------------------
-- Regras de roteamento produto → linha de produção (configurável)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS line_routing_rules (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 100,
  match_type TEXT NOT NULL CHECK (match_type IN ('prefix', 'contains', 'exact', 'regex')),
  match_value TEXT NOT NULL,
  production_line_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_routing_rules_company_priority
  ON line_routing_rules (company_id, priority ASC);

COMMENT ON TABLE line_routing_rules IS 'Mapeamento código/descrição Omie → nome da linha em production_lines';

-- ---------------------------------------------------------------------------
-- Vínculo Omie ↔ pedido PCP (tabela orders)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omie_order_links (
  id BIGSERIAL PRIMARY KEY,
  pcp_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  omie_codigo_pedido BIGINT NOT NULL,
  omie_numero_pedido TEXT,
  omie_etapa TEXT,
  omie_data_aprovacao TIMESTAMPTZ,
  omie_payload_original JSONB,
  sync_status TEXT NOT NULL DEFAULT 'synced'
    CHECK (sync_status IN ('synced', 'pending', 'error', 'manual_override')),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT omie_order_links_omie_codigo_unique UNIQUE (omie_codigo_pedido)
);

CREATE INDEX IF NOT EXISTS idx_omie_links_pcp_order ON omie_order_links(pcp_order_id);
CREATE INDEX IF NOT EXISTS idx_omie_links_omie_codigo ON omie_order_links(omie_codigo_pedido);
CREATE INDEX IF NOT EXISTS idx_omie_links_last_synced ON omie_order_links(last_synced_at DESC);

-- ---------------------------------------------------------------------------
-- Eventos webhook (idempotência + auditoria operacional)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omie_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'duplicate')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON omie_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON omie_webhook_events(received_at DESC);

-- ---------------------------------------------------------------------------
-- Lock distribuído para polling
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_locks (
  lock_name TEXT PRIMARY KEY,
  acquired_at TIMESTAMPTZ NOT NULL,
  acquired_by TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- Estado do último poll (opcional, além de omie_order_links)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS omie_sync_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  last_poll_at TIMESTAMPTZ,
  last_poll_success_at TIMESTAMPTZ,
  last_poll_report JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO omie_sync_state (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS (leitura gestores — escrita via service role nas APIs)
-- ---------------------------------------------------------------------------
ALTER TABLE line_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE omie_order_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE omie_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE omie_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS line_routing_rules_select_managers ON line_routing_rules;
CREATE POLICY line_routing_rules_select_managers ON line_routing_rules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'super_admin')
        AND (line_routing_rules.company_id IS NULL OR line_routing_rules.company_id = p.company_id)
    )
  );

DROP POLICY IF EXISTS omie_order_links_select_managers ON omie_order_links;
CREATE POLICY omie_order_links_select_managers ON omie_order_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN orders o ON o.id = omie_order_links.pcp_order_id
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'super_admin')
        AND p.company_id = o.company_id
    )
  );

DROP POLICY IF EXISTS omie_webhook_events_select_managers ON omie_webhook_events;
CREATE POLICY omie_webhook_events_select_managers ON omie_webhook_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'super_admin')
    )
  );

DROP POLICY IF EXISTS omie_sync_state_select_managers ON omie_sync_state;
CREATE POLICY omie_sync_state_select_managers ON omie_sync_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'super_admin')
    )
  );

-- Regras padrão HEPA (podem ser editadas depois no Supabase)
INSERT INTO line_routing_rules (company_id, priority, match_type, match_value, production_line_name)
SELECT NULL, 10, 'prefix', 'HF-FFP', 'ABSOLUTO / FINO'
WHERE NOT EXISTS (
  SELECT 1 FROM line_routing_rules WHERE match_value = 'HF-FFP' AND match_type = 'prefix'
);

INSERT INTO line_routing_rules (company_id, priority, match_type, match_value, production_line_name)
SELECT NULL, 20, 'prefix', 'HF-BSF', 'MULTIBOLSA'
WHERE NOT EXISTS (
  SELECT 1 FROM line_routing_rules WHERE match_value = 'HF-BSF' AND match_type = 'prefix'
);

INSERT INTO line_routing_rules (company_id, priority, match_type, match_value, production_line_name)
SELECT NULL, 30, 'prefix', 'HF-PL', 'CARTONADO GP/PL'
WHERE NOT EXISTS (
  SELECT 1 FROM line_routing_rules WHERE match_value = 'HF-PL' AND match_type = 'prefix'
);

INSERT INTO line_routing_rules (company_id, priority, match_type, match_value, production_line_name)
SELECT NULL, 31, 'prefix', 'HF-GP', 'CARTONADO GP/PL'
WHERE NOT EXISTS (
  SELECT 1 FROM line_routing_rules WHERE match_value = 'HF-GP' AND match_type = 'prefix'
);

INSERT INTO line_routing_rules (company_id, priority, match_type, match_value, production_line_name)
SELECT NULL, 40, 'exact', 'HF-MS', 'LOGISTICA'
WHERE NOT EXISTS (
  SELECT 1 FROM line_routing_rules WHERE match_value = 'HF-MS' AND match_type = 'exact'
);

INSERT INTO line_routing_rules (company_id, priority, match_type, match_value, production_line_name)
SELECT NULL, 41, 'contains', 'MANTA', 'LOGISTICA'
WHERE NOT EXISTS (
  SELECT 1 FROM line_routing_rules WHERE match_value = 'MANTA' AND match_type = 'contains'
);

-- Fallback "ALMOXARIFADO" é aplicado no código quando nenhuma regra casa.
