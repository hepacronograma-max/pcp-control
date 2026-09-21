import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeShippingListForOrder } from "@/lib/packaging/shipping-list";

/**
 * Se todos os itens do pedido estão concluídos, marca o pedido como `finished`.
 * Assim a aba Finalizados fica igual para todo mundo (não só na sessão de quem clicou).
 */
export async function finishOrderIfAllItemsCompleted(
  supabase: SupabaseClient,
  orderId: string | null | undefined
): Promise<boolean> {
  const id = String(orderId ?? "").trim();
  if (!id) return false;

  const { data: items, error } = await supabase
    .from("order_items")
    .select("status")
    .eq("order_id", id);
  if (error || !items?.length) return false;
  if (items.some((it) => it.status !== "completed")) return false;

  const { data: order } = await supabase
    .from("orders")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (order?.status === "finished") return false;

  const nowIso = new Date().toISOString();
  let { error: upd } = await supabase
    .from("orders")
    .update({ status: "finished", finished_at: nowIso })
    .eq("id", id);
  if (
    upd &&
    /finished_at|schema cache|column|does not exist/i.test(upd.message)
  ) {
    ({ error: upd } = await supabase
      .from("orders")
      .update({ status: "finished" })
      .eq("id", id));
  }
  if (upd) {
    console.warn("[finish-order-if-complete]", upd.message);
    return false;
  }

  await finalizeShippingListForOrder(supabase, id);
  return true;
}
