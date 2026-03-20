import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveAlmoxLineId,
  syncAlmoxarifadoOnProgram,
} from "./sync-almoxarifado-on-program";

function lineLooksAlmox(l: {
  id: string;
  name?: string | null;
  is_almoxarifado?: boolean | null;
}): boolean {
  return (
    l.is_almoxarifado === true ||
    (typeof l.name === "string" && l.name.toLowerCase().includes("almox"))
  );
}

/**
 * Cria/atualiza itens espelho no almox para todos os itens já programados nas linhas de chão.
 * Útil quando a programação foi feita antes do sync existir ou se o insert falhou em silêncio.
 */
export async function reconcileAlmoxMirrorsForCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ touched: number; error?: string }> {
  const almoxLineId = await resolveAlmoxLineId(supabase, companyId);
  if (!almoxLineId) {
    return { touched: 0, error: "no_almox_line" };
  }

  const { data: allLines, error: le } = await supabase
    .from("production_lines")
    .select("id, name, is_almoxarifado")
    .eq("company_id", companyId);

  if (le || !allLines?.length) {
    return { touched: 0, error: le?.message };
  }

  const sourceLineIds = allLines
    .filter((l) => l.id !== almoxLineId && !lineLooksAlmox(l))
    .map((l) => l.id);

  if (!sourceLineIds.length) return { touched: 0 };

  const { data: items, error: qe } = await supabase
    .from("order_items")
    .select(
      "id, order_id, line_id, description, quantity, pcp_deadline, pc_delivery_date, production_start"
    )
    .in("line_id", sourceLineIds)
    .not("production_start", "is", null);

  if (qe) {
    console.error("[reconcile-almox]", qe);
    return { touched: 0, error: qe.message };
  }

  let touched = 0;
  const orderPcpCache = new Map<string, string | null>();

  for (const it of items ?? []) {
    let orderPcp: string | null;
    if (orderPcpCache.has(it.order_id)) {
      orderPcp = orderPcpCache.get(it.order_id) ?? null;
    } else {
      const { data: ord } = await supabase
        .from("orders")
        .select("pcp_deadline")
        .eq("id", it.order_id)
        .maybeSingle();
      orderPcp = ord?.pcp_deadline ?? null;
      orderPcpCache.set(it.order_id, orderPcp);
    }

    const changed = await syncAlmoxarifadoOnProgram({
      supabase,
      sourceItemId: it.id,
      orderId: it.order_id,
      sourceLineId: it.line_id,
      sourceDescription: String(it.description ?? ""),
      sourceQuantity: Number(it.quantity ?? 1),
      productionStart: it.production_start as string,
      orderPcpDeadline: orderPcp,
      itemPcpDeadline: it.pcp_deadline,
      pcDeliveryDate: it.pc_delivery_date,
    });
    if (changed) touched += 1;
  }

  return { touched };
}
