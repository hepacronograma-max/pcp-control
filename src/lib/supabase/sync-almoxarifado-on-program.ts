import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateOnly, toQuantity } from "@/lib/utils/supabase-data";

const REF_PREFIX = "almox-src:";

function almoxRefNote(sourceItemId: string): string {
  return `${REF_PREFIX}${sourceItemId}`;
}

/**
 * Marca no `notes` que este item do almox espelha o item de produção `sourceItemId`.
 * Evita colisão com LIKE: prefixo sem underscore.
 */
export function parseAlmoxSourceItemId(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const idx = notes.indexOf(REF_PREFIX);
  if (idx < 0) return null;
  const rest = notes.slice(idx + REF_PREFIX.length).trim();
  const uuidMatch = rest.match(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  return uuidMatch ? uuidMatch[0] : null;
}

async function resolveAlmoxLineId(
  supabase: SupabaseClient,
  companyId: string
): Promise<string | null> {
  const byFlag = await supabase
    .from("production_lines")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_almoxarifado", true)
    .limit(1)
    .maybeSingle();
  if (byFlag.data?.id) return byFlag.data.id;

  const msg = byFlag.error?.message ?? "";
  if (
    !byFlag.error ||
    /is_almoxarifado|column|does not exist|schema cache/i.test(msg)
  ) {
    const byName = await supabase
      .from("production_lines")
      .select("id")
      .eq("company_id", companyId)
      .ilike("name", "%almox%")
      .limit(1)
      .maybeSingle();
    if (byName.data?.id) return byName.data.id;
  }
  return null;
}

/**
 * Quando a produção agenda início numa linha “de chão”, o almoxarifado abastece **no mesmo dia**
 * (production_start = production_end = data de início da produção).
 */
export async function syncAlmoxarifadoOnProgram(params: {
  supabase: SupabaseClient;
  sourceItemId: string;
  orderId: string;
  sourceLineId: string | null;
  sourceDescription: string;
  sourceQuantity: number;
  /** Início efetivo após o update (null = limpar datas no espelho almox) */
  productionStart: string | null;
  orderPcpDeadline: string | null;
  itemPcpDeadline: string | null;
  pcDeliveryDate: string | null;
}): Promise<void> {
  const {
    supabase,
    sourceItemId,
    orderId,
    sourceLineId,
    sourceDescription,
    sourceQuantity,
    productionStart,
    orderPcpDeadline,
    itemPcpDeadline,
    pcDeliveryDate,
  } = params;

  if (!sourceLineId) return;

  const { data: sourceLine } = await supabase
    .from("production_lines")
    .select("id, company_id, is_almoxarifado, name")
    .eq("id", sourceLineId)
    .maybeSingle();

  if (!sourceLine) return;

  const isAlmox =
    sourceLine.is_almoxarifado === true ||
    (typeof sourceLine.name === "string" &&
      sourceLine.name.toLowerCase().includes("almox"));
  if (isAlmox) return;

  const companyId = sourceLine.company_id as string;
  const almoxLineId = await resolveAlmoxLineId(supabase, companyId);
  if (!almoxLineId) return;

  const ref = almoxRefNote(sourceItemId);
  const likePattern = `%${ref}%`;

  const { data: existingRows } = await supabase
    .from("order_items")
    .select("id, notes")
    .eq("order_id", orderId)
    .eq("line_id", almoxLineId)
    .ilike("notes", likePattern)
    .limit(2);

  const existing =
    existingRows?.find((r) => (r.notes ?? "").includes(ref)) ?? existingRows?.[0];

  const day = productionStart ? toDateOnly(productionStart) : null;
  const pcDelivery = pcDeliveryDate ? toDateOnly(pcDeliveryDate) : null;
  if (day && pcDelivery && day < pcDelivery) {
    return;
  }

  const pcp =
    toDateOnly(itemPcpDeadline) ?? toDateOnly(orderPcpDeadline) ?? null;

  if (!day) {
    if (existing?.id) {
      await supabase
        .from("order_items")
        .update({
          production_start: null,
          production_end: null,
          status: "waiting",
        })
        .eq("id", existing.id);
    }
    return;
  }

  const payload = {
    production_start: day,
    production_end: day,
    status: "scheduled" as const,
    pcp_deadline: pcp,
    pc_delivery_date: pcDelivery,
  };

  if (existing?.id) {
    await supabase.from("order_items").update(payload).eq("id", existing.id);
    return;
  }

  const { data: maxRow } = await supabase
    .from("order_items")
    .select("item_number")
    .eq("order_id", orderId)
    .order("item_number", { ascending: false })
    .limit(1);
  const nextNum = (maxRow?.[0]?.item_number ?? 0) + 1;
  const desc = `Abast.: ${String(sourceDescription || "Item").trim()}`.slice(0, 500);

  await supabase.from("order_items").insert({
    order_id: orderId,
    item_number: nextNum,
    description: desc,
    quantity: toQuantity(sourceQuantity),
    line_id: almoxLineId,
    notes: ref,
    ...payload,
  });
}
