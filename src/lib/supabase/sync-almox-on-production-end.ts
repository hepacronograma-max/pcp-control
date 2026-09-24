import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateOnly } from "@/lib/utils/supabase-data";

/** Converte `production_end` (data) para `almox_supplied_at` (timestamptz ISO). */
export function productionEndDateToAlmoxTimestamptz(productionEndDate: string): string {
  const d = toDateOnly(productionEndDate);
  if (!d) return `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`;
  return `${d}T12:00:00.000Z`;
}

/**
 * Antes marcava abastecimento ao gravar `production_end`.
 * O Almoxarifado agora só finaliza com o botão explícito, como as outras linhas.
 */
export async function syncAlmoxOnProductionEndChange(
  _supabase: SupabaseClient,
  _itemId: string,
  _opts: {
    nextProductionEnd: string | null;
    previousProductionEnd: string | null;
    actorUserId: string | null;
  }
): Promise<void> {
  return;
}
