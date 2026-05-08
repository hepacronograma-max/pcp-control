-- Índices sugeridos para listas Almox / tarefas / CQ (rode no SQL Editor quando o tráfego for baixo).
-- CONCURRENTLY evita bloquear escritas prolongadas em produção.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_production_start_not_null
  ON order_items (production_start)
  WHERE production_start IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_almox_supplied_at
  ON order_items (almox_supplied_at);

-- Ajuste a condição se o enum de status for diferente no seu projeto
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_assigned_open
  ON tasks (assigned_to)
  WHERE status IS DISTINCT FROM 'done';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cq_registros_target
  ON cq_registros (target_type, target_id);
