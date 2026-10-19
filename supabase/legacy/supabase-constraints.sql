-- Constraints para otimizar e evitar duplicatas no Supabase
-- Execute manualmente no SQL Editor do Supabase

-- 1. Unique: um pedido por número por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_company_order_number
  ON orders (company_id, order_number);

-- 2. Unique: um feriado por data por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_company_date
  ON holidays (company_id, date);
