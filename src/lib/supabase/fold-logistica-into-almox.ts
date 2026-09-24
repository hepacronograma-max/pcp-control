import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductionLine } from "@/lib/types/database";
import { productionLineIsAlmoxarifado } from "@/lib/supabase/sync-almoxarifado-on-program";
import { navLineIsRedundantLogisticaMenuItem } from "@/lib/utils/nav-line-groups";

/**
 * Itens na linha avulsa "LOGISTICA" passam para Almoxarifado e a linha
 * LOGISTICA é desativada (some da seleção em Pedidos).
 */
export async function foldStandaloneLogisticaIntoAlmox(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ folded: boolean }> {
  const { data: lines, error } = await supabase
    .from("production_lines")
    .select("id, name, company_id, is_almoxarifado, is_active")
    .eq("company_id", companyId);
  if (error || !lines?.length) return { folded: false };

  const typed = lines as Pick<
    ProductionLine,
    "id" | "name" | "company_id" | "is_almoxarifado" | "is_active"
  >[];
  const logisticaIds = typed
    .filter((l) => navLineIsRedundantLogisticaMenuItem(l as ProductionLine))
    .map((l) => l.id);
  if (logisticaIds.length === 0) return { folded: false };

  let almoxId =
    typed.find((l) => l.is_almoxarifado === true && !logisticaIds.includes(l.id))
      ?.id ??
    typed.find(
      (l) =>
        productionLineIsAlmoxarifado(l as ProductionLine) &&
        !logisticaIds.includes(l.id)
    )?.id ??
    null;

  if (!almoxId) {
    const payload: Record<string, unknown> = {
      company_id: companyId,
      name: "Almoxarifado",
      is_active: true,
      is_almoxarifado: true,
    };
    let ins = await supabase
      .from("production_lines")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (
      ins.error &&
      /is_almoxarifado|column|does not exist|schema cache/i.test(
        ins.error.message
      )
    ) {
      const { is_almoxarifado: _skip, ...rest } = payload;
      ins = await supabase
        .from("production_lines")
        .insert(rest)
        .select("id")
        .maybeSingle();
    }
    almoxId = (ins.data as { id?: string } | null)?.id ?? null;
  }
  if (!almoxId) return { folded: false };

  const toFold = logisticaIds.filter((id) => id !== almoxId);
  if (toFold.length === 0) return { folded: false };

  for (const id of toFold) {
    await supabase.from("order_items").update({ line_id: almoxId }).eq("line_id", id);

    const { data: ops } = await supabase
      .from("operator_lines")
      .select("user_id")
      .eq("line_id", id);
    for (const op of ops ?? []) {
      const uid = String((op as { user_id?: string }).user_id ?? "");
      if (!uid) continue;
      const { data: already } = await supabase
        .from("operator_lines")
        .select("user_id")
        .eq("user_id", uid)
        .eq("line_id", almoxId)
        .maybeSingle();
      if (already) {
        await supabase
          .from("operator_lines")
          .delete()
          .eq("user_id", uid)
          .eq("line_id", id);
      } else {
        await supabase
          .from("operator_lines")
          .update({ line_id: almoxId })
          .eq("user_id", uid)
          .eq("line_id", id);
      }
    }

    await supabase
      .from("production_lines")
      .update({ is_active: false })
      .eq("id", id);
  }

  return { folded: true };
}
