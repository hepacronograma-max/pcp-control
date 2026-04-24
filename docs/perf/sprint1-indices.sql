-- =============================================================================
-- Sprint 1 de performance — índices sugeridos (NÃO executado automaticamente)
-- =============================================================================
--
-- Aplicar manualmente no SQL Editor do Supabase, preferencialmente fora de horário
-- de pico. Cada CREATE INDEX abaixo usa IF NOT EXISTS — é idempotente e evita
-- erro se o índice já existir com o mesmo nome.
--
-- No PostgreSQL, a criação de índice em tabelas grandes pode levar segundos;
-- a operação é online: leituras e a escritas na tabela em geral continuam, mas
-- pode haver carga adicional de I/O. Monitorize em produção.
--
-- Este ficheiro não altera o schema sozinho; só a execução destes comandos
-- aplica as mudanças.
-- =============================================================================

-- Lista de itens de uma linha, filtrados por aba (status) e ordenados por datas
-- de produção — p.ex. `src/app/api/line-data/route.ts` (GET) e
-- `src/app/(dashboard)/linha/[id]/page.tsx` (caminho Supabase direto).
-- WHERE típico: line_id = :id, status = / <> ; ORDER BY production_start, production_end
CREATE INDEX IF NOT EXISTS idx_order_items_line_status_production_start
  ON order_items (line_id, status, production_start);

-- Muitas queries carregam todos os itens de um conjunto de pedidos: `.in("order_id", ids)`
-- em `src/lib/queries/dashboard.ts`, `src/app/api/manager-dashboard/route.ts` (extras),
-- `src/app/api/company-data` (embutido em `orders`), `reconcile-almoxarifado.ts` (vía pedidos), etc.
-- O FK de `order_id` pode já ter índice, mas IF NOT EXISTS com este nome assegura cobertura explícita.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);

-- Listagem e ordenação de pedidos por empresa e prazo de entrega — p.ex. `src/app/api/company-data/route.ts`
-- (orders com `.eq("company_id", ...).order("delivery_deadline", ...)`).
CREATE INDEX IF NOT EXISTS idx_orders_company_delivery_deadline
  ON orders (company_id, delivery_deadline);
