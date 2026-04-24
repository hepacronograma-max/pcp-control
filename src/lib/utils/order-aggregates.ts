import type { OrderItem, OrderWithItems } from "@/lib/types/database";
import { isPastDeadline } from "@/lib/utils/date";
import { toDateOnly } from "@/lib/utils/supabase-data";

/** Mínimo para avaliar atraso no dashboard (KPI, gráficos) — basta bater com o pedido. */
type OrderDelayOrderShape = {
  status: string;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
};

type OrderDelayItemShape = {
  status: string;
  production_end: string | null;
};

const todayYyyyMmDd = () => new Date().toISOString().split("T")[0];

/**
 * Item "em atraso" / risco (mesma ideia de `getPrincipalStatus` em order-row)
 * atrasado: produção já deveria ter terminado; vai_atrasar: fim programado após o PCP do pedido.
 */
export function orderItemIsDelayedForCharts(
  item: OrderDelayItemShape,
  orderPcp: string | null
): boolean {
  if (item.status === "completed" || !item.production_end) return false;
  if (isPastDeadline(item.production_end)) return true;
  if (orderPcp && item.production_end > orderPcp) return true;
  return false;
}

/**
 * Uso no gráfico de pizza / barras: mesmo critério de “atraso” do KPI, por item.
 * Inclui atraso de produção (fim vencido ou fim &gt; PCP) e, quando o **pedido**
 * tem Prazo Vendas/PCP vencido, **cada item não concluído** do pedido entra
 * em “atraso” (evita 6 pedidos atrasados no card e só 4 itens na fatia).
 */
export function orderItemInDashboardAtrasoStatusPiece(
  item: OrderDelayItemShape,
  order: OrderDelayOrderShape
): boolean {
  if (item.status === "completed" || order.status === "finished") return false;
  if (orderItemIsDelayedForCharts(item, order.pcp_deadline)) return true;
  const t = todayYyyyMmDd();
  if (order.delivery_deadline && order.delivery_deadline < t) return true;
  if (order.pcp_deadline && order.pcp_deadline < t) return true;
  return false;
}

/**
 * Pedido contado no KPI "Pedidos atrasados" e na sidebar do dashboard: alinhado
 * à percepção da lista de pedidos (prazo comercial/PCP vencido e/ou itens
 * atrasados ou "vai atrasar" vs PCP).
 */
export function orderAppliesToDashboardDelayKpi(
  order: OrderDelayOrderShape,
  items: OrderDelayItemShape[]
): boolean {
  if (order.status === "finished") return false;
  const t = todayYyyyMmDd();
  if (order.delivery_deadline && order.delivery_deadline < t) return true;
  if (order.pcp_deadline && order.pcp_deadline < t) return true;
  for (const it of items) {
    if (orderItemIsDelayedForCharts(it, order.pcp_deadline)) return true;
  }
  return false;
}

/** Maior `production_end` entre os itens (YYYY-MM-DD); `null` se nenhum tiver fim. */
export function maxItemProductionEnd(
  items: Pick<OrderItem, "production_end">[]
): string | null {
  let best: string | null = null;
  for (const it of items) {
    const d = toDateOnly(it.production_end);
    if (!d) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

/**
 * Prazo de produção mostrado no pedido: **maior** data de fim entre os itens;
 * se nenhum item tiver fim programado, usa `orders.production_deadline` (legado).
 */
export function effectiveOrderProductionDeadline(
  order: Pick<OrderWithItems, "items" | "production_deadline">
): string | null {
  const fromItems = maxItemProductionEnd(order.items ?? []);
  if (fromItems) return fromItems;
  return order.production_deadline
    ? toDateOnly(order.production_deadline)
    : null;
}

export type OrderDeadlineTrafficLight = "white" | "red" | "yellow" | "green";

/** Vendas, PCP e prazo de produção (efetivo) na mesma data → atenção na UI. */
export function areAllOrderDeadlinesSameDay(order: OrderWithItems): boolean {
  const v = toDateOnly(order.delivery_deadline);
  const p = toDateOnly(order.pcp_deadline);
  const pr = effectiveOrderProductionDeadline(order);
  return !!(v && p && pr && v === p && p === pr);
}

/**
 * Farol na **linha do pedido** (datas normalizadas YYYY-MM-DD):
 * - **Branco**: falta prazo de vendas, PCP ou produção (maior fim entre itens).
 * - **Vermelho**: PCP > vendas **ou** produção > vendas.
 * - **Amarelo**: PCP < vendas **e** produção > PCP **e** produção ≤ vendas (inclui produção = vendas = atenção), **ou** as três datas iguais (atenção).
 * - **Verde**: PCP < vendas **e** produção ≤ PCP.
 */
export function getOrderDeadlineTrafficLight(
  order: OrderWithItems
): OrderDeadlineTrafficLight {
  const v = toDateOnly(order.delivery_deadline);
  const p = toDateOnly(order.pcp_deadline);
  const pr = effectiveOrderProductionDeadline(order);
  if (!v || !p || !pr) return "white";

  /** Mesma data nos três prazos = atenção (cor amarela na tabela). */
  if (v === p && p === pr) return "yellow";

  if (p > v) return "red";
  if (pr > v) return "red";
  if (p < v && pr > p && pr <= v) return "yellow";
  if (p < v && pr <= p) return "green";
  return "white";
}
