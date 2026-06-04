-- Fase 4 — Bloco A: índices de performance (PCP Control)
-- Aplicar manualmente no SQL Editor do Supabase após revisão.
-- Idempotente: todos os índices usam IF NOT EXISTS.
--
-- Schema confirmado no projeto:
--   Pedidos de venda: public.orders (NÃO production_orders)
--   Itens: public.order_items
--   Colunas orders: company_id, order_number, client_name, delivery_deadline,
--                   pcp_deadline, production_deadline, status, ...
--   Colunas order_items: order_id, line_id, status, production_start, production_end, ...
--
-- Índices já presentes em scripts do repo (IF NOT EXISTS abaixo não duplica):
--   idx_orders_company_order_number        UNIQUE (company_id, order_number) — supabase-constraints.sql
--   idx_holidays_company_date              UNIQUE (company_id, date) — supabase-constraints.sql
--   idx_purchase_orders_company            (company_id) — supabase-purchase-orders.sql
--   idx_polink_po / idx_polink_oi          purchase_order_item_links — supabase-purchase-orders.sql
--   idx_tasks_company_status               (company_id, status) — supabase-tasks.sql
--   idx_subtasks_task_sort                 (task_id, sort_order) — supabase-subtasks.sql
--   idx_cq_registros_company               (company_id) — supabase-cq.sql
--   idx_cq_registros_target                (target_type, target_id) — supabase-cq.sql
--   idx_audit_log_company_created          audit_log — supabase/migrations/20260520_audit_log.sql
--
-- Sugeridos em docs/perf/sprint1-indices.sql (mesmas definições reutilizadas aqui):
--   idx_orders_company_delivery_deadline, idx_order_items_order_id,
--   idx_order_items_line_status_production_start

-- =============================================================================
-- orders (pedidos de venda)
-- =============================================================================

-- Filtros por empresa (company_id sozinho também coberto pelo prefixo de
-- idx_orders_company_order_number, mas índice dedicado ajuda listagens amplas).
CREATE INDEX IF NOT EXISTS idx_perf_orders_company_id
  ON public.orders (company_id);

CREATE INDEX IF NOT EXISTS idx_perf_orders_company_status
  ON public.orders (company_id, status);

-- Listagem/ordenação por prazo de vendas (company-data, comercial-orders).
CREATE INDEX IF NOT EXISTS idx_orders_company_delivery_deadline
  ON public.orders (company_id, delivery_deadline);

-- Busca textual em número do pedido + cliente (prepara Fase 4 / filtros futuros).
CREATE INDEX IF NOT EXISTS idx_perf_orders_search_pt
  ON public.orders
  USING gin (
    to_tsvector(
      'portuguese',
      coalesce(order_number, '') || ' ' || coalesce(client_name, '')
    )
  );

-- =============================================================================
-- order_items
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_perf_order_items_line_id
  ON public.order_items (line_id);

CREATE INDEX IF NOT EXISTS idx_perf_order_items_line_status
  ON public.order_items (line_id, status);

CREATE INDEX IF NOT EXISTS idx_perf_order_items_order_status
  ON public.order_items (order_id, status);

-- Aba da linha + ordenação por datas (line-data GET).
CREATE INDEX IF NOT EXISTS idx_order_items_line_status_production_start
  ON public.order_items (line_id, status, production_start);

-- =============================================================================
-- purchase_orders
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_perf_purchase_orders_company_status
  ON public.purchase_orders (company_id, status);

-- idx_purchase_orders_company (company_id) — já em supabase-purchase-orders.sql

-- =============================================================================
-- purchase_order_item_links
-- =============================================================================

-- idx_polink_po (purchase_order_id), idx_polink_oi (order_item_id) — já existem

-- =============================================================================
-- tasks / subtasks
-- =============================================================================

-- idx_tasks_company_status (company_id, status) — já em supabase-tasks.sql
-- idx_subtasks_task_sort (task_id, sort_order) — já em supabase-subtasks.sql

-- =============================================================================
-- production_lines / holidays / cq_registros / profiles
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_perf_production_lines_company_sort
  ON public.production_lines (company_id, sort_order);

-- idx_holidays_company_date UNIQUE (company_id, date) — já em supabase-constraints.sql

CREATE INDEX IF NOT EXISTS idx_perf_cq_registros_company_target_created
  ON public.cq_registros (company_id, target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_perf_profiles_company_id
  ON public.profiles (company_id);
