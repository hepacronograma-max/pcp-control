import type { ItemStatus, OrderItem, OrderWithItems } from "@/lib/types/database";
import {
  deadlineDayStatus,
  isPastDeadline,
  parseLocalDate,
} from "@/lib/utils/date";
import { toDateOnly } from "@/lib/utils/supabase-data";

/**
 * Estado “principal” da linha do pedido (mesma lógica da lista de Pedidos).
 * Exportado para a aba Comercial (somente leitura).
 */
export type OrderPrincipalStatus =
  | "atrasado"
  | "vai_atrasar"
  | "falta_linha"
  | "aguardando_programacao"
  | "programado"
  | "produzindo"
  | "finalizado"
  | null;

/** Voltar um item de `completed`: `scheduled` se já tinha janela de produção, senão `waiting`. */
export function itemStatusAfterReopenCompleted(
  item: Pick<OrderItem, "production_start" | "production_end">
): ItemStatus {
  return item.production_start && item.production_end ? "scheduled" : "waiting";
}

export function getOrderPrincipalStatus(order: OrderWithItems): OrderPrincipalStatus {
  const items = order.items;
  if (items.length === 0) return null;

  if (order.status !== "finished") {
    if (order.delivery_deadline && isPastDeadline(order.delivery_deadline)) {
      return "atrasado";
    }
    if (order.pcp_deadline && isPastDeadline(order.pcp_deadline)) {
      return "atrasado";
    }
  }

  const hasDelayed = items.some(
    (it) =>
      it.status !== "completed" &&
      it.production_end &&
      isPastDeadline(it.production_end)
  );
  if (hasDelayed) return "atrasado";

  const pcpDeadline = order.pcp_deadline;
  const hasWillDelay = items.some(
    (it) =>
      it.status !== "completed" &&
      it.production_end &&
      pcpDeadline &&
      it.production_end > pcpDeadline
  );
  if (hasWillDelay) return "vai_atrasar";

  const hasWithoutLine = items.some((it) => !it.line_id);
  if (hasWithoutLine) return "falta_linha";

  const allCompleted = items.every((it) => it.status === "completed");
  if (allCompleted) return "finalizado";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let hasScheduled = false;
  let hasProducing = false;
  let hasAwaiting = false;

  for (const it of items) {
    if (it.status === "completed") continue;
    if (!it.production_start) {
      hasAwaiting = true;
      continue;
    }
    const start = it.production_start!.includes("-")
      ? parseLocalDate(it.production_start!)
      : new Date(it.production_start);
    start.setHours(0, 0, 0, 0);
    const end = it.production_end
      ? it.production_end.includes("-")
        ? parseLocalDate(it.production_end)
        : new Date(it.production_end)
      : null;
    if (end) end.setHours(0, 0, 0, 0);

    if (today < start) hasScheduled = true;
    else if (!end || today <= end) hasProducing = true;
  }

  if (hasAwaiting) return "aguardando_programacao";
  if (hasScheduled) return "programado";
  if (hasProducing) return "produzindo";

  return "aguardando_programacao";
}

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
 * Farol na **linha do pedido** (calendário local, pedidos em aberto):
 * - **Branco**: falta prazo de vendas, PCP ou produção, ou pedido finalizado.
 * - **Vermelho**: vendas, PCP ou produção **já passou** (ex.: vendas 18/05 e hoje 20/05 → vermelho mesmo com produção menor).
 * - **Amarelo**: algum desses prazos **é hoje**.
 * - **Verde**: todos os prazos ainda **no futuro**.
 */
export function getOrderDeadlineTrafficLight(
  order: OrderWithItems
): OrderDeadlineTrafficLight {
  const v = toDateOnly(order.delivery_deadline);
  const p = toDateOnly(order.pcp_deadline);
  const pr = effectiveOrderProductionDeadline(order);
  if (!v || !p || !pr) return "white";
  if (order.status === "finished") return "white";

  const vDay = deadlineDayStatus(v);
  const pDay = deadlineDayStatus(p);
  const prDay = deadlineDayStatus(pr);

  if (vDay === "past") return "red";
  if (pDay === "past" || prDay === "past") return "red";
  if (vDay === "today" || pDay === "today" || prDay === "today") return "yellow";
  return "green";
}

/**
 * Há texto do Comercial e falta resposta do PCP à mensagem atual.
 * Usa timestamps quando existem; senão compara só presença do texto da resposta (legado).
 * Novo recado após uma resposta: `comercial_pcp_observation_at` > `pcp_reply_comercial_observation_at`.
 */
export function orderComercialObsNeedsPcpReply(order: OrderWithItems): boolean {
  const obs = (order.comercial_pcp_observation ?? "").trim();
  if (!obs) return false;
  const replyText = (order.pcp_reply_comercial_observation ?? "").trim();
  const obsAt = order.comercial_pcp_observation_at;
  const replyAt = order.pcp_reply_comercial_observation_at;
  if (obsAt) {
    if (!replyAt) return !replyText;
    return obsAt > replyAt;
  }
  return !replyText;
}
