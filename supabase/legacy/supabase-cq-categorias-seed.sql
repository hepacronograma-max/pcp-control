-- =====================================================================
-- Seeds de categorias CQ (cq_categorias) — executar no SQL Editor do Supabase
-- Pré-requisito: tabela criada (supabase-cq.sql) e linhas em companies.
--
-- IMPORTANTE: o PCP Control usa role = 'operator' (inglês), NÃO 'operador'.
-- Se já inseriste com 'operador', corre no fim o bloco opcional de migração.
-- =====================================================================

-- Opcional: remover seeds antigos com papel errado (só se sabes o que estás a fazer)
-- DELETE FROM cq_categorias WHERE role = 'operador';

-- Corrigir papel legado PT → EN (executar uma vez, se aplicável)
UPDATE cq_categorias SET role = 'operator' WHERE role = 'operador';

-- ---------- OPERADOR (operator) ----------
INSERT INTO cq_categorias (company_id, role, categoria, cor, sort_order, is_active)
SELECT 
    c.id,
    'operator',
    data.categoria,
    data.cor,
    data.sort_order,
    true
FROM companies c
CROSS JOIN (
    VALUES 
        ('Falta de matéria prima', '#ef4444', 1),
        ('Acúmulo na produção', '#f97316', 2),
        ('Erro de produção', '#eab308', 3),
        ('Manutenção não programada', '#3b82f6', 4),
        ('Falta de instrução/desenho', '#8b5cf6', 5)
) AS data(categoria, cor, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM cq_categorias 
    WHERE company_id = c.id AND role = 'operator' AND categoria = data.categoria
);

-- ---------- PCP ----------
INSERT INTO cq_categorias (company_id, role, categoria, cor, sort_order, is_active)
SELECT 
    c.id,
    'pcp',
    data.categoria,
    data.cor,
    data.sort_order,
    true
FROM companies c
CROSS JOIN (
    VALUES 
        ('Prazo curto (cliente apertou)', '#ef4444', 1),
        ('Atraso de compras', '#f97316', 2),
        ('Capacidade produtiva insuficiente', '#eab308', 3),
        ('Erro de planejamento', '#3b82f6', 4)
) AS data(categoria, cor, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM cq_categorias 
    WHERE company_id = c.id AND role = 'pcp' AND categoria = data.categoria
);

-- ---------- COMPRAS ----------
INSERT INTO cq_categorias (company_id, role, categoria, cor, sort_order, is_active)
SELECT 
    c.id,
    'compras',
    data.categoria,
    data.cor,
    data.sort_order,
    true
FROM companies c
CROSS JOIN (
    VALUES 
        ('Fornecedor atrasou', '#ef4444', 1),
        ('Cotação demorou', '#f97316', 2),
        ('Erro no pedido de compra', '#eab308', 3)
) AS data(categoria, cor, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM cq_categorias 
    WHERE company_id = c.id AND role = 'compras' AND categoria = data.categoria
);

-- ---------- COMERCIAL (opcional; alinha com perfil app: comercial) ----------
INSERT INTO cq_categorias (company_id, role, categoria, cor, sort_order, is_active)
SELECT 
    c.id,
    'comercial',
    data.categoria,
    data.cor,
    data.sort_order,
    true
FROM companies c
CROSS JOIN (
    VALUES 
        ('Alteração urgente solicitada pelo cliente', '#ef4444', 1),
        ('Especificação / desenho incorreto no PV', '#f97316', 2),
        ('Incerteza de prazo junto ao cliente', '#eab308', 3)
) AS data(categoria, cor, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM cq_categorias 
    WHERE company_id = c.id AND role = 'comercial' AND categoria = data.categoria
);

-- ---------- Verificar ----------
SELECT company_id, role, categoria, cor, sort_order, is_active
FROM cq_categorias 
WHERE role IN ('operator', 'pcp', 'compras', 'comercial')
ORDER BY company_id, role, sort_order;
