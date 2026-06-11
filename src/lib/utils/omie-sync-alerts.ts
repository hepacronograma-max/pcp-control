import type { OrderItem, OrderWithItems } from "@/lib/types/database";

export const OMIE_SYNC_FLAG_LABELS: Record<string, string> = {
  removido_no_omie: "Removido no Omie",
  divergente_no_omie: "Divergente no Omie",
};

export function itemHasOmieSyncAlert(
  item: Pick<OrderItem, "omie_sync_flag">
): boolean {
  return !!item.omie_sync_flag?.trim();
}

export function orderOmieSyncAlertCount(order: OrderWithItems): number {
  return order.items.filter(itemHasOmieSyncAlert).length;
}

export function totalOmieSyncAlertCount(orders: OrderWithItems[]): number {
  return orders.reduce((sum, order) => sum + orderOmieSyncAlertCount(order), 0);
}

export function omieSyncAlertShortLabel(flag: string | null | undefined): string {
  const key = (flag ?? "").trim();
  return OMIE_SYNC_FLAG_LABELS[key] ?? "Alerta Omie";
}

export function omieSyncAlertDetail(
  item: Pick<OrderItem, "omie_sync_flag" | "omie_sync_detail">
): string {
  const detail = (item.omie_sync_detail ?? "").trim();
  if (detail) return detail;
  const flag = (item.omie_sync_flag ?? "").trim();
  if (flag === "removido_no_omie") {
    return "Item sumiu no Omie mas permanece no PCP — mediar com vendas/produção.";
  }
  if (flag === "divergente_no_omie") {
    return "Omie diverge deste item em produção/concluído — mediar com vendas/produção.";
  }
  return "Revisão manual necessária após sync Omie.";
}
