-- Estações do Faturamento: Liberado para faturar / Faturado / Coletado.
-- Rode no SQL Editor (idempotente).

ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS invoiced_at timestamptz;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS collected_at timestamptz;
