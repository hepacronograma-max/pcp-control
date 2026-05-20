-- =============================================================================
-- APAGAR registros INCLUÍDOS após um horário de corte (por created_at)
-- PCP Control — executar no Supabase → SQL Editor
--
-- Corte padrão: 19/05/2026 15:00 (horário de Brasília)
-- Ajuste a linha em params se o dia/hora estiver errado.
--
-- IMPORTANTE:
-- - Só apaga linhas com created_at >= corte (não desfaz edições em registros antigos).
-- - Faça PASSO 1 (preview) antes do PASSO 2 (delete).
-- - Supabase Free não tem “desfazer”; exporte o preview se quiser evidência.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PASSO 1 — PREVIEW (só leitura): quantos registros seriam afetados
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo') AS cutoff
),
new_orders AS (
  SELECT id FROM orders o, params p WHERE o.created_at >= p.cutoff
),
new_items AS (
  SELECT id FROM order_items oi, params p WHERE oi.created_at >= p.cutoff
  UNION
  SELECT oi.id FROM order_items oi
  INNER JOIN new_orders no ON no.id = oi.order_id
),
new_pos AS (
  SELECT id FROM purchase_orders po, params p WHERE po.created_at >= p.cutoff
)
SELECT 'orders' AS tabela, COUNT(*)::bigint AS qtd
FROM orders o, params p WHERE o.created_at >= p.cutoff
UNION ALL
SELECT 'order_items', COUNT(*)::bigint FROM new_items
UNION ALL
SELECT 'purchase_orders', COUNT(*)::bigint FROM new_pos
UNION ALL
SELECT 'purchase_order_lines', COUNT(*)::bigint
FROM purchase_order_lines pol, params p
WHERE pol.created_at >= p.cutoff
   OR pol.purchase_order_id IN (SELECT id FROM new_pos)
UNION ALL
SELECT 'purchase_order_item_links', COUNT(*)::bigint
FROM purchase_order_item_links l, params p
WHERE l.created_at >= p.cutoff
   OR l.purchase_order_id IN (SELECT id FROM new_pos)
   OR l.order_item_id IN (SELECT id FROM new_items)
UNION ALL
SELECT 'cq_registros', COUNT(*)::bigint
FROM cq_registros r, params p
WHERE r.created_at >= p.cutoff
UNION ALL
SELECT 'cq_categorias', COUNT(*)::bigint
FROM cq_categorias c, params p WHERE c.created_at >= p.cutoff
UNION ALL
SELECT 'tasks', COUNT(*)::bigint
FROM tasks t, params p WHERE t.created_at >= p.cutoff
UNION ALL
SELECT 'subtasks', COUNT(*)::bigint
FROM subtasks s, params p WHERE s.created_at >= p.cutoff
UNION ALL
SELECT 'task_comments', COUNT(*)::bigint
FROM task_comments tc, params p WHERE tc.created_at >= p.cutoff
UNION ALL
SELECT 'task_history', COUNT(*)::bigint
FROM task_history th, params p WHERE th.created_at >= p.cutoff
UNION ALL
SELECT 'departments', COUNT(*)::bigint
FROM departments d, params p WHERE d.created_at >= p.cutoff
UNION ALL
SELECT 'production_lines', COUNT(*)::bigint
FROM production_lines pl, params p WHERE pl.created_at >= p.cutoff
UNION ALL
SELECT 'holidays', COUNT(*)::bigint
FROM holidays h, params p WHERE h.created_at >= p.cutoff
UNION ALL
SELECT 'profiles', COUNT(*)::bigint
FROM profiles pr, params p WHERE pr.created_at >= p.cutoff
ORDER BY tabela;

-- Amostra de pedidos que seriam removidos
WITH params AS (
  SELECT (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo') AS cutoff
)
SELECT order_number, client_name, status, created_at, updated_at
FROM orders o, params p
WHERE o.created_at >= p.cutoff
ORDER BY o.created_at DESC
LIMIT 50;

-- -----------------------------------------------------------------------------
-- PASSO 2 — DELETE (irreversível). Rode só após conferir o PASSO 1.
-- Descomente o bloco BEGIN…COMMIT inteiro abaixo (uma query no editor).
-- -----------------------------------------------------------------------------
/*
BEGIN;

-- CQ
DELETE FROM cq_registros r
WHERE r.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   OR (r.target_type = 'order' AND r.target_id IN (
         SELECT id FROM orders
         WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
       ))
   OR (r.target_type = 'order_item' AND r.target_id IN (
         SELECT oi.id FROM order_items oi
         WHERE oi.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
            OR oi.order_id IN (
              SELECT id FROM orders
              WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
            )
       ))
   OR (r.target_type = 'purchase_order' AND r.target_id IN (
         SELECT id FROM purchase_orders
         WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
       ));

DELETE FROM cq_categorias
WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');

-- Compras
DELETE FROM purchase_order_item_links l
WHERE l.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   OR l.purchase_order_id IN (
     SELECT id FROM purchase_orders
     WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   )
   OR l.order_item_id IN (
     SELECT oi.id FROM order_items oi
     WHERE oi.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
        OR oi.order_id IN (
          SELECT id FROM orders
          WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
        )
   );

DELETE FROM purchase_order_lines pol
WHERE pol.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   OR pol.purchase_order_id IN (
     SELECT id FROM purchase_orders
     WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   );

DELETE FROM purchase_orders
WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');

-- Tarefas
DELETE FROM task_history th
WHERE th.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   OR th.task_id IN (
     SELECT id FROM tasks
     WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   );

DELETE FROM task_comments tc
WHERE tc.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   OR tc.task_id IN (
     SELECT id FROM tasks
     WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   );

DELETE FROM subtasks s
WHERE s.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   OR s.task_id IN (
     SELECT id FROM tasks
     WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   );

DELETE FROM tasks
WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');

-- Pedidos de venda (itens antes dos pedidos)
DELETE FROM order_items oi
WHERE oi.created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   OR oi.order_id IN (
     SELECT id FROM orders
     WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo')
   );

DELETE FROM orders
WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');

-- Configuração
DELETE FROM holidays
WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');

DELETE FROM production_lines
WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');

DELETE FROM departments
WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');

DELETE FROM profiles
WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');

COMMIT;
*/

-- NOTA auth.users: apagar só em profiles não remove login no Authentication.
-- Se o preview mostrar profiles > 0, remova manualmente em Authentication → Users
-- ou rode (com cuidado) após listar os e-mails:
--   SELECT id, email, created_at FROM auth.users
--   WHERE created_at >= (TIMESTAMP '2026-05-19 15:00:00' AT TIME ZONE 'America/Sao_Paulo');
