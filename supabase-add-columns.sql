-- Adiciona colunas para prazo de entrega e PCP (se não existirem)
-- Execute no SQL Editor do Supabase: https://supabase.com/dashboard/project/kmlhjhaimfverxwdiwhn/sql

-- Prazo de entrega no pedido
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_deadline date;

-- Prazo PCP no pedido
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pcp_deadline date;

-- Data/hora em que o pedido foi finalizado na tela Pedidos (action "finish")
ALTER TABLE orders ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- Prazo PCP por item (espelha o do pedido na UI e na linha de produção)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pcp_deadline date;

-- Linha de produção do item (obrigatório para alocar item na linha / Gantt)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_id uuid REFERENCES production_lines(id) ON DELETE SET NULL;

-- Pedido de compras (PC): número e data de entrega da matéria-prima
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pc_number text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pc_delivery_date date;

-- Ciclo do item na linha (obrigatório para programar início/fim e concluir)
-- Valores usados pelo app: waiting | scheduled | delayed | completed
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status text DEFAULT 'waiting';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS production_start date;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS production_end date;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_by text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes text;

-- Se o comando acima falhar (ex.: tipos incompatíveis), crie só a coluna:
-- ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_id uuid;

-- Linhas de produção (menu lateral + company-data)
ALTER TABLE production_lines ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE production_lines ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE production_lines ADD COLUMN IF NOT EXISTS is_almoxarifado boolean DEFAULT false;

-- Registros antigos com is_active NULL não apareciam na UI (filtro .eq true).
UPDATE production_lines SET is_active = true WHERE is_active IS NULL;

-- Empresa: pasta matriz (PDFs) e logo — evita erro de schema cache se faltar coluna
ALTER TABLE companies ADD COLUMN IF NOT EXISTS orders_path text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS import_path text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text;

-- Perfis: alinhar com o app (multi-tenant + usuários)
-- company_id: use o mesmo tipo da sua tabela companies(id); ajuste se necessário.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
UPDATE profiles SET is_active = true WHERE is_active IS NULL;

-- operator_lines: vínculo operador ↔ linha (tela Usuários / linhas do operador)
-- Se a tabela não existir, o CREATE abaixo cria; se existir sem colunas, o ALTER completa.
CREATE TABLE IF NOT EXISTS public.operator_lines (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, line_id)
);
ALTER TABLE public.operator_lines ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.operator_lines ADD COLUMN IF NOT EXISTS line_id uuid;
