-- Chegada física do material (Compras/PCP), independente de NF / faturamento Omie.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS material_arrived_at timestamptz;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS material_arrived_by text;
