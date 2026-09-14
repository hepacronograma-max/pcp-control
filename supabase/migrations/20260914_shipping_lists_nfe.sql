-- Número da NF-e (Omie) na lista de embarque.

ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS nfe_number text;
