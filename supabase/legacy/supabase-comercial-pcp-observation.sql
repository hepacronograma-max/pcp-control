-- Observação Comercial → PCP + registo e resposta do PCP. Rode no SQL Editor se ainda não existir.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comercial_pcp_observation text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comercial_pcp_observation_by text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comercial_pcp_observation_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_reply_comercial_observation text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_reply_comercial_observation_by text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_reply_comercial_observation_at timestamptz;
