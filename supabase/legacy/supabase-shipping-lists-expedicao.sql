-- Foto da carga na expedição (Finalizar carregamento → Faturamento Coletado).
-- Rode no SQL Editor (idempotente).

ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_url text;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_path text;
ALTER TABLE public.shipping_lists ADD COLUMN IF NOT EXISTS cargo_photo_taken_at timestamptz;
