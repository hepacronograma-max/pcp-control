import type { OrderWithItems } from "@/lib/types/database";

/**
 * Aviso "filtro pronto" na tela Pedidos: o pedido pisca quando a fábrica ou o
 * almoxarifado finaliza um item, até o PCP abrir (expandir) o pedido.
 * Guardado no navegador do PCP (localStorage), por pedido.
 */
const STORAGE_PREFIX = "pcp-seen-items-ready-v1";

/** Itens concluídos do pedido (id + data), em ordem — muda quando um novo item fica pronto. */
export function completedItemsToken(order: Pick<OrderWithItems, "items">): string {
  return order.items
    .filter((it) => it.status === "completed")
    .map((it) => it.id)
    .sort()
    .join(",");
}

export function readItemsReadySeen(orderId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = localStorage.getItem(`${STORAGE_PREFIX}:${orderId}`);
    return v ? v.split(",").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function writeItemsReadySeen(orderId: string, token: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${orderId}`, token);
  } catch {
    /* quota / modo privado */
  }
}
