import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Espelhos automáticos foram desligados: o Almoxarifado só lista itens
 * alocados nessa linha, como as demais linhas de produção.
 */
export async function reconcileAlmoxMirrorsForCompany(
  _supabase: SupabaseClient,
  _targetAlmoxLineId: string
): Promise<{ touched: number; error?: string }> {
  return { touched: 0 };
}
