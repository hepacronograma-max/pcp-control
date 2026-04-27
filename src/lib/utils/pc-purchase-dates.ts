import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateOnly } from "@/lib/utils/supabase-data";

/** Máximo entre duas datas `yyyy-MM-dd` (ou ISO); ignora nulos. */
export function maxYmd(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  const as = a ? toDateOnly(a) : null;
  const bs = b ? toDateOnly(b) : null;
  if (!as && !bs) return null;
  if (!as) return bs;
  if (!bs) return as;
  return as >= bs ? as : bs;
}

/**
 * Prazo de “chegada da matéria-prima” usado na linha de produção:
 * max entre previsão de entrega do PC e data de follow-up (quando o item está
 * vinculado a um pedido de compra); se não houver nenhum dos dois no PC, cai
 * no `pc_delivery_date` do item (ex.: prazo vindo do PV na vinculação).
 */
export function itemPcArrivalForProduction(
  poExpected: string | null | undefined,
  poFollowUp: string | null | undefined,
  itemPcDelivery: string | null | undefined
): string | null {
  const m = maxYmd(poExpected, poFollowUp);
  if (m) return m;
  return itemPcDelivery ? toDateOnly(itemPcDelivery) : null;
}

type ItemWithId = { id: string };

/** Anexa `po_expected_delivery` e `po_follow_up_date` a cada item (vínculo Compras). */
export async function attachPoDatesToLineItems<T extends ItemWithId>(
  supabase: SupabaseClient,
  companyId: string,
  items: T[]
): Promise<
  (T & { po_expected_delivery: string | null; po_follow_up_date: string | null })[]
> {
  const empty = items.map((it) => ({
    ...it,
    po_expected_delivery: null as string | null,
    po_follow_up_date: null as string | null,
  }));
  if (items.length === 0) {
    return empty;
  }
  const ids = items.map((i) => i.id);
  const byItem = new Map<string, { ed: string | null; fu: string | null }>();

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: linkRows, error: e1 } = await supabase
      .from("purchase_order_item_links")
      .select("order_item_id, purchase_order_id")
      .in("order_item_id", chunk);
    if (e1) {
      if (/relation|does not exist|schema cache/i.test(e1.message)) {
        return empty;
      }
      console.warn("[attachPoDatesToLineItems] links", e1.message);
      continue;
    }
    const poIds = [
      ...new Set((linkRows ?? []).map((r) => r.purchase_order_id as string)),
    ];
    if (poIds.length === 0) continue;
    const { data: posRows, error: e2 } = await supabase
      .from("purchase_orders")
      .select("id, company_id, expected_delivery, follow_up_date")
      .in("id", poIds)
      .eq("company_id", companyId);
    if (e2) {
      if (/follow_up_date|column|does not exist|schema cache/i.test(e2.message)) {
        const { data: posFallback } = await supabase
          .from("purchase_orders")
          .select("id, company_id, expected_delivery")
          .in("id", poIds)
          .eq("company_id", companyId);
        if (!posFallback) continue;
        const byPo = new Map(
          posFallback.map((p) => [
            p.id as string,
            {
              ed: p.expected_delivery ? toDateOnly(p.expected_delivery as string) : null,
              fu: null as string | null,
            },
          ])
        );
        for (const row of linkRows ?? []) {
          const po = byPo.get(row.purchase_order_id as string);
          if (!po) continue;
          byItem.set(row.order_item_id as string, po);
        }
        continue;
      }
      console.warn("[attachPoDatesToLineItems] POs", e2.message);
      continue;
    }
    const byPo = new Map(
      (posRows ?? []).map((p) => {
        const id = p.id as string;
        return [
          id,
          {
            ed: p.expected_delivery ? toDateOnly(p.expected_delivery as string) : null,
            fu:
              p.follow_up_date != null
                ? toDateOnly(p.follow_up_date as string)
                : (null as string | null),
          },
        ];
      })
    );
    for (const row of linkRows ?? []) {
      const po = byPo.get(row.purchase_order_id as string);
      if (!po) continue;
      byItem.set(row.order_item_id as string, po);
    }
  }

  return items.map((it) => {
    const x = byItem.get(it.id);
    return {
      ...it,
      po_expected_delivery: x?.ed ?? null,
      po_follow_up_date: x?.fu ?? null,
    };
  });
}
