-- Observação Comercial → PCP (campo por pedido). Rode no SQL Editor do Supabase se ainda não existir.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comercial_pcp_observation text;
