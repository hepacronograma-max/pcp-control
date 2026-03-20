import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Escolhe o company_id “principal” quando há várias empresas no banco.
 * Evita usar .limit(1) sem ordenação (PostgreSQL: linha indefinida) e prioriza
 * a empresa com mais pedidos — típico cenário após import local → Supabase.
 */
export async function resolvePrimaryCompanyId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data: rows, error } = await supabase
    .from("orders")
    .select("company_id");

  if (error || !rows?.length) {
    const { data: anyCompany } = await supabase
      .from("companies")
      .select("id")
      .limit(1)
      .maybeSingle();
    return anyCompany?.id ?? null;
  }

  const tally = new Map<string, number>();
  for (const r of rows) {
    const id = r.company_id as string | null | undefined;
    if (!id) continue;
    tally.set(id, (tally.get(id) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = -1;
  for (const [id, n] of tally) {
    if (n > bestCount || (n === bestCount && (best === null || id < best))) {
      bestCount = n;
      best = id;
    }
  }

  return best;
}
