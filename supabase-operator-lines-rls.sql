-- `operator_lines`: leitura/escrita com RLS sem bloquear operadores (mesmo padrão de supabase-rls-policies.sql).
-- Execute no SQL Editor do Supabase se a tabela existir sem políticas — sem isto, SELECT no browser pode voltar vazio.

DROP POLICY IF EXISTS "Allow read operator_lines" ON public.operator_lines;
DROP POLICY IF EXISTS "Allow all operator_lines" ON public.operator_lines;

ALTER TABLE public.operator_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read operator_lines" ON public.operator_lines FOR SELECT USING (true);
CREATE POLICY "Allow all operator_lines" ON public.operator_lines FOR ALL USING (true) WITH CHECK (true);
