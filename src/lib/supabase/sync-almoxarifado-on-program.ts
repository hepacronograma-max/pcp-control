import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateOnly, toQuantity } from "@/lib/utils/supabase-data";

const REF_PREFIX = "almox-src:";

function almoxRefNote(sourceItemId: string): string {
  return `${REF_PREFIX}${sourceItemId}`;
}

export function productionLineIsAlmoxarifado(l: {
  name?: string | null;
  is_almoxarifado?: boolean | null;
}): boolean {
  return (
    l.is_almoxarifado === true ||
    (typeof l.name === "string" && l.name.toLowerCase().includes("almox"))
  );
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

export async function resolveAlmoxLineId(
  supabase: SupabaseClient,
  companyId: string
): Promise<string | null> {
  /** Não usar maybeSingle: 0 linhas OK; 2+ linhas com flag geram erro e quebram o fallback. */
  const byFlag = await supabase
    .from("production_lines")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_almoxarifado", true)
    .order("sort_order", { ascending: true })
    .limit(1);
  const idFromFlag = byFlag.data?.[0]?.id;
  if (idFromFlag) return idFromFlag;

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
      .order("sort_order", { ascending: true })
      .limit(1);
    const idFromName = byName.data?.[0]?.id;
    if (idFromName) return idFromName;
  }
  return null;
}

async function pickAlmoxLineId(
  supabase: SupabaseClient,
  companyId: string,
  targetAlmoxLineId?: string | null
): Promise<string | null> {
  if (targetAlmoxLineId) {
    const { data: t } = await supabase
      .from("production_lines")
      .select("id, company_id")
      .eq("id", targetAlmoxLineId)
      .maybeSingle();
    /** Mesma empresa: confia no UUID da URL/menu (evita falhar se nome não contém "almox" ou flag null). */
    if (t && String(t.company_id) === companyId) {
      return t.id;
    }
  }
  return resolveAlmoxLineId(supabase, companyId);
}

/**
 * Lista de abastecimento: só entra no almox com **início e fim** programados na linha de chão.
 * O espelho usa a **data de início** (início = fim no item do almox).
 * `targetAlmoxLineId` = linha do menu (URL), para não gravar em outro UUID almox da empresa.
 */
export async function syncAlmoxarifadoOnProgram(params: {
  supabase: SupabaseClient;
  sourceItemId: string;
  orderId: string;
  sourceLineId: string | null;
  sourceDescription: string;
  sourceQuantity: number;
  productionStart: string | null;
  productionEnd: string | null;
  orderPcpDeadline: string | null;
  itemPcpDeadline: string | null;
  pcDeliveryDate: string | null;
  targetAlmoxLineId?: string | null;
}): Promise<boolean> {
  const {
    supabase,
    sourceItemId,
    orderId,
    sourceLineId,
    sourceDescription,
    sourceQuantity,
    productionStart,
    productionEnd,
    orderPcpDeadline,
    itemPcpDeadline,
    pcDeliveryDate,
    targetAlmoxLineId,
  } = params;

  if (!sourceLineId) {
    console.warn("[sync-almox] skip: sourceLineId ausente", {
      orderId,
      itemId: sourceItemId,
    });
    return false;
  }

  const { data: sourceLine } = await supabase
    .from("production_lines")
    .select("id, company_id, is_almoxarifado, name")
    .eq("id", sourceLineId)
    .maybeSingle();

  if (!sourceLine) {
    console.warn("[sync-almox] skip: linha de origem não encontrada", {
      orderId,
      itemId: sourceItemId,
    });
    return false;
  }

  if (productionLineIsAlmoxarifado(sourceLine)) {
    console.warn("[sync-almox] skip: linha de origem é almoxarifado", {
      orderId,
      itemId: sourceItemId,
    });
    return false;
  }

  const companyId = sourceLine.company_id as string;
  const almoxLineId = await pickAlmoxLineId(
    supabase,
    companyId,
    targetAlmoxLineId
  );
  if (!almoxLineId) {
    console.warn(
      "[sync-almox] skip: nenhum line_id almox (pickAlmoxLineId/resolve vazio)",
      { orderId, itemId: sourceItemId }
    );
    return false;
  }

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
  const endDay = productionEnd ? toDateOnly(productionEnd) : null;
  const pcDelivery = pcDeliveryDate ? toDateOnly(pcDeliveryDate) : null;

  const pcp =
    toDateOnly(itemPcpDeadline) ?? toDateOnly(orderPcpDeadline) ?? null;

  if (!day || !endDay) {
    if (existing?.id) {
      const { data: cur } = await supabase
        .from("order_items")
        .select("production_start, production_end")
        .eq("id", existing.id)
        .maybeSingle();
      if (!cur?.production_start && !cur?.production_end) {
        console.warn(
          "[sync-almox] skip: espelho existente sem datas para limpar",
          { orderId, itemId: sourceItemId }
        );
        return false;
      }
      const { error } = await supabase
        .from("order_items")
        .update({
          production_start: null,
          production_end: null,
          status: "waiting",
        })
        .eq("id", existing.id);
      if (error) {
        console.error("[sync-almox] clear mirror:", error.message);
        console.warn(
          "[sync-almox] skip: falha ao limpar espelho (erro de update)",
          { orderId, itemId: sourceItemId }
        );
        return false;
      }
      return true;
    }
    console.warn(
      "[sync-almox] skip: production_start/fim ausentes e sem espelho a limpar",
      { orderId, itemId: sourceItemId }
    );
    return false;
  }

  const payload = {
    production_start: day,
    production_end: day,
    status: "scheduled" as const,
    pcp_deadline: pcp,
    pc_delivery_date: pcDelivery,
  };

  if (existing?.id) {
    const { data: cur } = await supabase
      .from("order_items")
      .select("production_start, production_end, status, pcp_deadline, pc_delivery_date")
      .eq("id", existing.id)
      .maybeSingle();
    const curPcp = toDateOnly(cur?.pcp_deadline as string | null);
    const curPc = toDateOnly(cur?.pc_delivery_date as string | null);
    const same =
      toDateOnly(cur?.production_start as string | null) === day &&
      toDateOnly(cur?.production_end as string | null) === day &&
      String(cur?.status ?? "") === payload.status &&
      curPcp === pcp &&
      curPc === pcDelivery;
    if (same) return false;
    const { error } = await supabase
      .from("order_items")
      .update(payload)
      .eq("id", existing.id);
    if (error) {
      console.error("[sync-almox] update mirror:", error.message);
      console.warn(
        "[sync-almox] skip: falha ao atualizar espelho (erro de update)",
        { orderId, itemId: sourceItemId }
      );
      return false;
    }
    return true;
  }

  const { data: maxRow } = await supabase
    .from("order_items")
    .select("item_number")
    .eq("order_id", orderId)
    .order("item_number", { ascending: false })
    .limit(1);
  const nextNum = (maxRow?.[0]?.item_number ?? 0) + 1;
  const desc = `Abast.: ${String(sourceDescription || "Item").trim()}`.slice(0, 500);

  const { error: insErr } = await supabase.from("order_items").insert({
    order_id: orderId,
    item_number: nextNum,
    description: desc,
    quantity: toQuantity(sourceQuantity),
    line_id: almoxLineId,
    notes: ref,
    ...payload,
  });
  if (insErr) {
    console.error("[sync-almox] insert mirror:", insErr.message);
    console.warn(
      "[sync-almox] skip: falha ao inserir espelho (erro de insert)",
      { orderId, itemId: sourceItemId }
    );
    return false;
  }
  return true;
}
