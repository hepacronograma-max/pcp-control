-- Políticas RLS para permitir acesso com chave anon (admin@local)
-- Execute no SQL Editor do Supabase: https://supabase.com/dashboard/project/kmlhjhaimfverxwdiwhn/sql

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Allow read companies" ON companies;
DROP POLICY IF EXISTS "Allow read orders" ON orders;
DROP POLICY IF EXISTS "Allow read order_items" ON order_items;
DROP POLICY IF EXISTS "Allow read production_lines" ON production_lines;
DROP POLICY IF EXISTS "Allow read holidays" ON holidays;
DROP POLICY IF EXISTS "Allow all companies" ON companies;
DROP POLICY IF EXISTS "Allow all orders" ON orders;
DROP POLICY IF EXISTS "Allow all order_items" ON order_items;
DROP POLICY IF EXISTS "Allow all production_lines" ON production_lines;
DROP POLICY IF EXISTS "Allow all holidays" ON holidays;

-- Habilitar RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Permitir leitura e escrita (admin@local usa anon key)
CREATE POLICY "Allow read companies" ON companies FOR SELECT USING (true);
CREATE POLICY "Allow read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Allow read order_items" ON order_items FOR SELECT USING (true);
CREATE POLICY "Allow read production_lines" ON production_lines FOR SELECT USING (true);
CREATE POLICY "Allow read holidays" ON holidays FOR SELECT USING (true);

CREATE POLICY "Allow all companies" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all orders" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all production_lines" ON production_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all holidays" ON holidays FOR ALL USING (true) WITH CHECK (true);
