-- Campos Compras: prazo de follow-up e observação (editáveis na lista).
-- Execute no SQL Editor do Supabase após `supabase-purchase-orders.sql`.

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS follow_up_date date;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS compras_observation text;
