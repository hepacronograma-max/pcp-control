-- Número da NF-e (Omie) na lista de embarque.
-- Rode no SQL Editor (idempotente).

ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS nfe_number text;
