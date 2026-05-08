import { toDateOnly } from "@/lib/utils/supabase-data";
import { getEffectiveTaskStatus } from "@/lib/task-hierarchy";
import type { Subtask } from "@/lib/types/subtasks";
import type { Task } from "@/lib/types/tasks";

/** Data «hoje» em America/Sao_Paulo para comparar atrasos com datas de programa (YYYY-MM-DD). */
export function todayYmdBrazil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export interface LinePendingOrderRow {
  line_id: string | null;
  status: string;
  production_start: string | null;
  production_end: string | null;
  /** `orders.status` — itens de pedidos finalizados ignorados. */
  order_status?: string | null;
}

function itemProductionFinished(it: Pick<LinePendingOrderRow, "production_end">): boolean {
  return toDateOnly(it.production_end) != null;
}

function itemExcludedStatus(it: Pick<LinePendingOrderRow, "status">): boolean {
  const s = String(it.status ?? "")
    .trim()
    .toLowerCase();
  return s === "completed" || s === "done" || s === "finished";
}

function orderClosed(it: Pick<LinePendingOrderRow, "order_status">): boolean {
  const os = String(it.order_status ?? "")
    .trim()
    .toLowerCase();
  return os === "finished" || os === "cancelled";
}

/**
 * Pendência real para o menu lateral por linha de chão:
 * - Produção **não terminou** (`production_end` ausente).
 * - Item **ativo** (`status` ≠ completed/done/finished; pedido ≠ finished/cancelled).
 * - Ou **sem data de início** (`production_start` ausente): precisa programar início —
 * **não** piscar só porque falta `production_end` com início já definido (evita falso positivo).
 * - Ou **atrasado**: `production_start` &lt; hoje (timezone BR) — ainda sem `production_end`.
 *
 * Não conta itens já finalizados no chão, nem esperas futuras (`production_start` &gt;= hoje) sem atraso.
 */
export function orderItemNeedsLineAttention(
  it: LinePendingOrderRow,
  todayYmd: string
): boolean {
  if (!it.line_id) return false;
  if (itemExcludedStatus(it)) return false;
  if (orderClosed(it)) return false;
  if (itemProductionFinished(it)) return false;

  const start = toDateOnly(it.production_start);

  /** Sem programa de início → atenção (caso típico “sem data de início”). */
  if (!start) return true;

  if (start < todayYmd) return true;

  return false;
}

export function countAttentionOrderItemsByLineId(
  rows: LinePendingOrderRow[],
  todayYmd: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of rows) {
    if (!it.line_id) continue;
    if (!orderItemNeedsLineAttention(it, todayYmd)) continue;
    out[it.line_id] = (out[it.line_id] ?? 0) + 1;
  }
  return out;
}

function normForLineDeptMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Mapa department_id → linha de produção com o mesmo nome (normalizado). */
export function buildDepartmentIdToLineIdMap(
  lines: { id: string; name: string }[],
  departments: { id: string; name: string }[]
): Record<string, string> {
  const byNorm = new Map<string, string>();
  for (const l of lines) {
    byNorm.set(normForLineDeptMatch(l.name), l.id);
  }
  const out: Record<string, string> = {};
  for (const d of departments) {
    const lid = byNorm.get(normForLineDeptMatch(d.name));
    if (lid) out[d.id] = lid;
  }
  return out;
}

/** Tarefa no quadro exige atenção do viewer (estado efetivo ≠ done ou atribuída e não aberta). */
export function taskNeedsViewerAttention(
  task: Task,
  subtasks: Subtask[],
  viewerId: string | null
): boolean {
  const eff = getEffectiveTaskStatus(task, subtasks);
  if (eff !== "done") return true;
  if (viewerId && task.assigned_to === viewerId && task.viewed_at == null) {
    return true;
  }
  return false;
}

/**
 * Conta tarefas «em atenção» por line_id quando o departamento da task tem o mesmo nome que a linha.
 * Uso opcional na API (`includeTasks=1`) para evitar falso positivo (ex.: departamento “Produção” vs linhas).
 */
export function countAttentionTasksByLineId(
  tasks: Task[],
  subtasksByTaskId: Record<string, Subtask[]>,
  deptIdToLineId: Record<string, string>,
  viewerId: string | null
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    if (!t.department_id) continue;
    const lineId = deptIdToLineId[t.department_id];
    if (!lineId) continue;
    const subs = subtasksByTaskId[t.id] ?? [];
    if (!taskNeedsViewerAttention(t, subs, viewerId)) continue;
    out[lineId] = (out[lineId] ?? 0) + 1;
  }
  return out;
}

export function mergeCountMaps(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
