import type { OrderWithItems } from "@/lib/types/database";
import { parseLocalDate } from "./date";

export interface DashboardLocalData {
  openOrders: number;
  delayedOrders: number;
  avgLeadTime: string;
  onTimeRate: number;
}

export function computeDashboardFromOrders(
  orders: OrderWithItems[]
): DashboardLocalData {
  const openCount = orders.filter((o) => o.status !== "finished").length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const delayedCount = orders.filter((o) => {
    if (o.status === "finished" || !o.production_deadline) return false;
    const prod =
      typeof o.production_deadline === "string" &&
      o.production_deadline.includes("-")
        ? parseLocalDate(o.production_deadline)
        : new Date(o.production_deadline);
    prod.setHours(0, 0, 0, 0);
    // Atrasado: prazo de produção já passou (hoje não conta)
    if (today > prod) return true;
    // Ou: datas planejadas inconsistentes (prod > entrega ou prod > pcp)
    const delivery = o.delivery_deadline
      ? parseLocalDate(o.delivery_deadline)
      : null;
    const pcp = o.pcp_deadline ? parseLocalDate(o.pcp_deadline) : null;
    if (delivery) delivery.setHours(0, 0, 0, 0);
    if (pcp) pcp.setHours(0, 0, 0, 0);
    return (delivery && prod > delivery) || (pcp && prod > pcp);
  }).length;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const finishedRecent = orders.filter(
    (o) =>
      o.status === "finished" &&
      o.finished_at &&
      new Date(o.finished_at) >= ninetyDaysAgo
  );

  const leadTimes = finishedRecent.map((o) => {
    const created = new Date(o.created_at);
    const finished = new Date(o.finished_at!);
    return Math.ceil(
      (finished.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    );
  });

  const avgLeadTime =
    leadTimes.length > 0
      ? (leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length).toFixed(1)
      : "--";

  const onTimeCount = finishedRecent.filter((o) => {
    if (!o.delivery_deadline || !o.finished_at) return false;
    return new Date(o.finished_at) <= parseLocalDate(o.delivery_deadline);
  }).length;

  const onTimeRate =
    finishedRecent.length > 0
      ? Math.round((onTimeCount / finishedRecent.length) * 100)
      : 0;

  return {
    openOrders: openCount,
    delayedOrders: delayedCount,
    avgLeadTime,
    onTimeRate,
  };
}
