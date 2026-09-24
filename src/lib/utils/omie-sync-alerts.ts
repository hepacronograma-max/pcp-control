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

export type OmieSyncAlertRow = {
  orderId: string;
  orderNumber: string;
  clientName: string;
  orderFinished: boolean;
  itemId: string;
  itemNumber: number;
  productCode: string;
  description: string;
  flagLabel: string;
  detail: string;
};

/** Pedido + item + motivo, para o PCP achar o alerta sem abrir um a um. */
export function listOmieSyncAlerts(orders: OrderWithItems[]): OmieSyncAlertRow[] {
  const rows: OmieSyncAlertRow[] = [];
  for (const order of orders) {
    for (const item of order.items ?? []) {
      if (!itemHasOmieSyncAlert(item)) continue;
      rows.push({
        orderId: order.id,
        orderNumber: String(order.order_number ?? "").trim() || "—",
        clientName: String(order.client_name ?? "").trim(),
        orderFinished: order.status === "finished",
        itemId: item.id,
        itemNumber: typeof item.item_number === "number" ? item.item_number : 0,
        productCode: String(item.product_code ?? "").trim(),
        description: String(item.description ?? "").trim(),
        flagLabel: omieSyncAlertShortLabel(item.omie_sync_flag),
        detail: omieSyncAlertDetail(item),
      });
    }
  }
  return rows;
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
