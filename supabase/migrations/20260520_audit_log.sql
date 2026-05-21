-- Fase 1 — Auditoria nativa (plano-mestre-hepa)
-- Execute no SQL Editor do Supabase (Production) ou: supabase db push
-- Não apaga dados existentes.

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_company_created
  ON audit_log (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
  ON audit_log (table_name, record_id);

COMMENT ON TABLE audit_log IS 'Trilha de alterações em tabelas críticas (Fase 1 segurança HEPA)';

-- ---------------------------------------------------------------------------
-- RLS: gestores da mesma empresa
-- ---------------------------------------------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select_managers ON audit_log;
CREATE POLICY audit_log_select_managers ON audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id IS NOT NULL
        AND p.company_id = audit_log.company_id
        AND p.role IN ('manager', 'super_admin')
    )
  );

-- Service role e triggers SECURITY DEFINER inserem sem passar por esta policy.

-- ---------------------------------------------------------------------------
-- Funções (search_path fixo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pcp_audit_resolve_company_id(
  p_table text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_order_id uuid;
BEGIN
  IF p_payload IS NULL THEN
    RETURN NULL;
  END IF;

  CASE p_table
    WHEN 'companies' THEN
      RETURN (p_payload ->> 'id')::uuid;
    WHEN 'orders', 'production_lines', 'holidays', 'purchase_orders', 'cq_registros' THEN
      RETURN (p_payload ->> 'company_id')::uuid;
    WHEN 'profiles' THEN
      RETURN (p_payload ->> 'company_id')::uuid;
    WHEN 'order_items' THEN
      v_order_id := (p_payload ->> 'order_id')::uuid;
      IF v_order_id IS NULL THEN
        RETURN NULL;
      END IF;
      SELECT o.company_id INTO v_company_id FROM orders o WHERE o.id = v_order_id;
      RETURN v_company_id;
    ELSE
      RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION pcp_audit_log_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_email text;
  v_old jsonb;
  v_new jsonb;
  v_record_id text;
BEGIN
  v_user_id := auth.uid();
  v_email := COALESCE(
    NULLIF(TRIM(auth.jwt() ->> 'email'), ''),
    NULLIF(TRIM(current_setting('request.jwt.claim.email', true)), '')
  );

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id::text;
    v_company_id := pcp_audit_resolve_company_id(TG_TABLE_NAME, v_old);
  ELSIF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'profiles' THEN
      IF OLD.role IS NOT DISTINCT FROM NEW.role
         AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
        RETURN NEW;
      END IF;
    END IF;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id::text;
    v_company_id := pcp_audit_resolve_company_id(TG_TABLE_NAME, v_new);
  ELSE
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id::text;
    v_company_id := pcp_audit_resolve_company_id(TG_TABLE_NAME, v_new);
  END IF;

  INSERT INTO audit_log (
    company_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    user_id,
    user_email
  ) VALUES (
    v_company_id,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old,
    v_new,
    v_user_id,
    v_email
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers (idempotente)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders',
    'order_items',
    'purchase_orders',
    'profiles',
    'production_lines',
    'cq_registros'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I
       AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION pcp_audit_log_row()',
      t,
      t
    );
  END LOOP;
END;
$$;

-- companies: só UPDATE/DELETE (INSERT de empresa é raro e auditado via app admin)
DROP TRIGGER IF EXISTS trg_audit_companies ON companies;
CREATE TRIGGER trg_audit_companies
  AFTER UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION pcp_audit_log_row();
