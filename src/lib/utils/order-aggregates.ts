import type { OrderItem, OrderWithItems } from "@/lib/types/database";
import { toDateOnly } from "@/lib/utils/supabase-data";

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
