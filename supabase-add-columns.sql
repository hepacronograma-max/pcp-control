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
