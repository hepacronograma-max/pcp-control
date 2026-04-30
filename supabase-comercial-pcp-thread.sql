-- Metadados da observação Comercial e resposta do PCP (rode após comercial_pcp_observation base).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comercial_pcp_observation_by text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comercial_pcp_observation_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_reply_comercial_observation text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_reply_comercial_observation_by text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_reply_comercial_observation_at timestamptz;
