-- Departamentos por empresa — executar após existir `companies`.
-- Índice único garante INSERT idempotente por (empresa, nome).

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_company_name
  ON departments(company_id, name);

CREATE INDEX IF NOT EXISTS idx_departments_company ON departments(company_id);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all departments" ON departments;
CREATE POLICY "Allow all departments" ON departments FOR ALL USING (true) WITH CHECK (true);

INSERT INTO departments (company_id, name, description)
SELECT c.id, v.name, v.description::text
FROM companies c
CROSS JOIN (
  VALUES
    ('Engenharia', NULL::text),
    ('Produção', NULL),
    ('Compras', NULL),
    ('Comercial', NULL),
    ('PCP', NULL),
    ('Qualidade', NULL),
    ('Manutenção', NULL),
    ('Logística', NULL),
    ('RH', NULL),
    ('TI', NULL)
) AS v(name, description)
ON CONFLICT (company_id, name) DO NOTHING;
