-- Controle de qualidade / ocorrências — executar no SQL Editor do Supabase após companies existir.

CREATE TABLE IF NOT EXISTS cq_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text NOT NULL,
  categoria text NOT NULL,
  cor text NOT NULL DEFAULT '#94a3b8',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cq_categorias_company_role ON cq_categorias(company_id, role);

CREATE TABLE IF NOT EXISTS cq_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('order', 'order_item', 'purchase_order')),
  target_id uuid NOT NULL,
  registered_by uuid NOT NULL,
  registered_by_role text NOT NULL,
  categoria text NOT NULL,
  descricao text,
  gravidade text NOT NULL CHECK (gravidade IN ('baixa', 'media', 'alta', 'critica')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  resolvido_por uuid,
  resolucao text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cq_registros_target ON cq_registros(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_cq_registros_company ON cq_registros(company_id);

ALTER TABLE cq_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE cq_registros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all cq_categorias" ON cq_categorias;
CREATE POLICY "Allow all cq_categorias" ON cq_categorias FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all cq_registros" ON cq_registros;
CREATE POLICY "Allow all cq_registros" ON cq_registros FOR ALL USING (true) WITH CHECK (true);
