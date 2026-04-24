import type { SupabaseClient } from "@supabase/supabase-js";
import {
  productionLineIsAlmoxarifado,
  syncAlmoxarifadoOnProgram,
} from "./sync-almoxarifado-on-program";

/**
 * Cria/atualiza itens espelho **nesta** linha Almoxarifado (a da URL do menu).
 * Só considera itens nas linhas de chão com **início e fim** já programados.
 */
export async function reconcileAlmoxMirrorsForCompany(
  supabase: SupabaseClient,
  targetAlmoxLineId: string
): Promise<{ touched: number; error?: string }> {
  const { data: almoxRow, error: ae } = await supabase
    .from("production_lines")
    .select("id, company_id, name, is_almoxarifado")
    .eq("id", targetAlmoxLineId)
    .maybeSingle();

  if (ae || !almoxRow?.company_id) {
    return { touched: 0, error: ae?.message ?? "Linha não encontrada" };
  }

  const companyId = almoxRow.company_id as string;

  const { data: allLines, error: le } = await supabase
    .from("production_lines")
    .select("id, name, is_almoxarifado")
    .eq("company_id", companyId);

  if (le || !allLines?.length) {
    return { touched: 0, error: le?.message };
  }

  const sourceLineIds = allLines
    .filter(
      (l) =>
        l.id !== targetAlmoxLineId && !productionLineIsAlmoxarifado(l)
    )
    .map((l) => l.id);

  if (!sourceLineIds.length) return { touched: 0 };

  const { data: items, error: qe } = await supabase
    .from("order_items")
    .select(
      "id, order_id, line_id, description, quantity, pcp_deadline, pc_delivery_date, production_start, production_end"
    )
    .in("line_id", sourceLineIds)
    .not("production_start", "is", null)
    .not("production_end", "is", null)
    .neq("status", "completed");

  if (qe) {
    console.error("[reconcile-almox]", qe);
    return { touched: 0, error: qe.message };
  }

  const itemList = items ?? [];
  console.log(`[reconcile-almox] start: ${itemList.length} items`);

  const orderIds = [...new Set(itemList.map((it) => it.order_id))];
  const orderPcpMap = new Map<string, string | null>();
  const CHUNK = 120;
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK);
    const { data: ords } = await supabase
      .from("orders")
      .select("id, pcp_deadline")
      .in("id", chunk);
    for (const o of ords ?? []) {
      orderPcpMap.set(o.id, (o.pcp_deadline as string | null) ?? null);
    }
  }

  let touched = 0;

  for (const it of itemList) {
    const orderPcp = orderPcpMap.get(it.order_id) ?? null;

    const changed = await syncAlmoxarifadoOnProgram({
      supabase,
      sourceItemId: it.id,
      orderId: it.order_id,
      sourceLineId: it.line_id,
      sourceDescription: String(it.description ?? ""),
      sourceQuantity: Number(it.quantity ?? 1),
      productionStart: it.production_start as string,
      productionEnd: it.production_end as string,
      orderPcpDeadline: orderPcp,
      itemPcpDeadline: it.pcp_deadline,
      pcDeliveryDate: it.pc_delivery_date,
      targetAlmoxLineId,
    });
    if (changed) touched += 1;
  }

  console.log(
    `[reconcile-almox] end: ${touched} espelhos criados/atualizados`
  );

  return { touched };
}
