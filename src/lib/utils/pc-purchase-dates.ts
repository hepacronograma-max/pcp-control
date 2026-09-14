import type { SupabaseClient } from "@supabase/supabase-js";
import { todayLocalYyyyMmDd } from "@/lib/utils/date";
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
 * - se Compras/PCP sinalizou chegada física, usa essa data (não espera NF/Omie);
 * - senão, max entre previsão de entrega do PC e follow-up;
 * - se não houver nenhum dos dois no PC, cai no `pc_delivery_date` do item.
 */
export function itemPcArrivalForProduction(
  poExpected: string | null | undefined,
  poFollowUp: string | null | undefined,
  itemPcDelivery: string | null | undefined,
  materialArrivedAt?: string | null | undefined
): string | null {
  if (materialArrivedAt) {
    const arrived = toDateOnly(materialArrivedAt);
    const today = todayLocalYyyyMmDd();
    if (!arrived) return today;
    return arrived <= today ? arrived : today;
  }
  const m = maxYmd(poExpected, poFollowUp);
  if (m) return m;
  return itemPcDelivery ? toDateOnly(itemPcDelivery) : null;
}

type ItemWithId = { id: string };

export type LineItemPoDates<T> = T & {
  po_expected_delivery: string | null;
  po_follow_up_date: string | null;
  po_material_arrived_at: string | null;
};

type PoDateBundle = {
  ed: string | null;
  fu: string | null;
  arrived: string | null;
};

/** Anexa datas do PC vinculado (previsão, follow-up e chegada física). */
export async function attachPoDatesToLineItems<T extends ItemWithId>(
  supabase: SupabaseClient,
  companyId: string,
  items: T[]
): Promise<LineItemPoDates<T>[]> {
  const empty: LineItemPoDates<T>[] = items.map((it) => ({
    ...it,
    po_expected_delivery: null,
    po_follow_up_date: null,
    po_material_arrived_at: null,
  }));
  if (items.length === 0) {
    return empty;
  }
  const ids = items.map((i) => i.id);
  const byItem = new Map<string, PoDateBundle>();

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

    let posRows:
      | {
          id: string;
          expected_delivery: string | null;
          follow_up_date?: string | null;
          material_arrived_at?: string | null;
        }[]
      | null = null;

    const full = await supabase
      .from("purchase_orders")
      .select("id, company_id, expected_delivery, follow_up_date, material_arrived_at")
      .in("id", poIds)
      .eq("company_id", companyId);
    if (full.error) {
      const msg = full.error.message;
      if (/material_arrived_at/i.test(msg) && /column|does not exist|schema cache/i.test(msg)) {
        const mid = await supabase
          .from("purchase_orders")
          .select("id, company_id, expected_delivery, follow_up_date")
          .in("id", poIds)
          .eq("company_id", companyId);
        if (mid.error) {
          if (/follow_up_date|column|does not exist|schema cache/i.test(mid.error.message)) {
            const { data: posFallback } = await supabase
              .from("purchase_orders")
              .select("id, company_id, expected_delivery")
              .in("id", poIds)
              .eq("company_id", companyId);
            posRows = (posFallback ?? []).map((p) => ({
              id: p.id as string,
              expected_delivery: (p.expected_delivery as string | null) ?? null,
              follow_up_date: null,
              material_arrived_at: null,
            }));
          } else {
            console.warn("[attachPoDatesToLineItems] POs", mid.error.message);
            continue;
          }
        } else {
          posRows = (mid.data ?? []).map((p) => ({
            id: p.id as string,
            expected_delivery: (p.expected_delivery as string | null) ?? null,
            follow_up_date: (p.follow_up_date as string | null) ?? null,
            material_arrived_at: null,
          }));
        }
      } else if (/follow_up_date|column|does not exist|schema cache/i.test(msg)) {
        const { data: posFallback } = await supabase
          .from("purchase_orders")
          .select("id, company_id, expected_delivery")
          .in("id", poIds)
          .eq("company_id", companyId);
        posRows = (posFallback ?? []).map((p) => ({
          id: p.id as string,
          expected_delivery: (p.expected_delivery as string | null) ?? null,
          follow_up_date: null,
          material_arrived_at: null,
        }));
      } else {
        console.warn("[attachPoDatesToLineItems] POs", msg);
        continue;
      }
    } else {
      posRows = (full.data ?? []).map((p) => ({
        id: p.id as string,
        expected_delivery: (p.expected_delivery as string | null) ?? null,
        follow_up_date: (p.follow_up_date as string | null) ?? null,
        material_arrived_at: (p.material_arrived_at as string | null) ?? null,
      }));
    }

    const byPo = new Map(
      (posRows ?? []).map((p) => {
        return [
          p.id,
          {
            ed: p.expected_delivery ? toDateOnly(p.expected_delivery) : null,
            fu: p.follow_up_date != null ? toDateOnly(p.follow_up_date) : null,
            arrived: p.material_arrived_at
              ? toDateOnly(p.material_arrived_at) ?? String(p.material_arrived_at)
              : null,
          } satisfies PoDateBundle,
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
      po_material_arrived_at: x?.arrived ?? null,
    };
  });
}

/** Chegada física do PC vinculado ao item de venda, se houver. */
export async function orderItemLinkedPoMaterialArrivedAt(
  supabase: SupabaseClient,
  orderItemId: string
): Promise<string | null> {
  const { data: link, error: le } = await supabase
    .from("purchase_order_item_links")
    .select("purchase_order_id")
    .eq("order_item_id", orderItemId)
    .maybeSingle();
  if (le || !link?.purchase_order_id) return null;
  const { data: po, error: pe } = await supabase
    .from("purchase_orders")
    .select("material_arrived_at")
    .eq("id", link.purchase_order_id)
    .maybeSingle();
  if (pe) return null;
  const v = po?.material_arrived_at;
  return v ? String(v) : null;
}
