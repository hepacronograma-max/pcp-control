-- Aba Abastecimento (Logística): data planejada e status do item de produção.
-- Execute no SQL Editor do Supabase se a API avisar que faltam colunas.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supply_planned_date date;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supply_status text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supply_status_at timestamptz;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supply_status_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_supply_status_check'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_supply_status_check
      CHECK (supply_status IS NULL OR supply_status IN ('partial', 'full'));
  END IF;
END $$;
