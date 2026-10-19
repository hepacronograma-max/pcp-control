-- Chegada física do material (Compras/PCP), independente de NF / faturamento Omie.
-- Execute no SQL Editor do Supabase após `supabase-purchase-orders.sql`.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS material_arrived_at timestamptz;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS material_arrived_by text;

COMMENT ON COLUMN purchase_orders.material_arrived_at IS
  'Quando o material chegou fisicamente. Independente de nQtdeRec/NF no Omie.';

COMMENT ON COLUMN purchase_orders.material_arrived_by IS
  'Quem sinalizou a chegada (PCP ou Compras).';
