import type { SupabaseClient } from "@supabase/supabase-js";

const REF_PREFIX = "almox-src:";

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

/**
 * Almoxarifado funciona como as outras linhas: o item só aparece se estiver
 * alocado nela. Não cria mais espelhos automáticos ao programar o chão.
 */
export async function syncAlmoxarifadoOnProgram(_params: {
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
  return false;
}
