import type { SupabaseClient } from "@supabase/supabase-js";

const PRIMARY_COMPANY_TTL_MS = 5 * 60 * 1000;

let primaryCompanyCache: { value: string | null; expiresAt: number } | null = null;

export function invalidatePrimaryCompanyCache() {
  primaryCompanyCache = null;
}

/**
 * Resolve o `company_id` principal para modo local / single-tenant.
 *
 * Usa cache em memória por instância de servidor ({@link invalidatePrimaryCompanyCache}
 * invalida explicitamente — ex.: após criar empresa). TTL: 5 minutos.
 *
 * Critério de negócio: ver documentação em `fetchPrimaryCompanyIdUncached`.
 */
export async function resolvePrimaryCompanyId(
  supabase: SupabaseClient
): Promise<string | null> {
  const now = Date.now();
  if (primaryCompanyCache && primaryCompanyCache.expiresAt > now) {
    return primaryCompanyCache.value;
  }

  try {
    const result = await fetchPrimaryCompanyIdUncached(supabase);
    primaryCompanyCache = {
      value: result,
      expiresAt: now + PRIMARY_COMPANY_TTL_MS,
    };
    return result;
  } catch (err) {
    console.error("[resolvePrimaryCompanyId] erro:", err);
    return null;
  }
}

/**
 * Corpo não-cacheado da resolução do tenant principal.
 *
 * **Hoje:** critério “empresa mais antiga” — primeira linha em `companies`
 * ordenada por `created_at` ascendente (`limit 1`; determinístico).
 *
 * **Regra histórica:** versões anteriores priorizavam a empresa com **mais linhas**
 * em `orders` (desempate por `company_id` ascendente lexicográfico).
 *
 * **Multi-tenant (reativar volume de pedidos):** substituir o corpo desta função
 * por uma chamada `.rpc('get_primary_company_id_by_order_volume')` após criar a
 * função no PostgreSQL / SQL Editor. SQL de referência:
 *
 * ```
 * CREATE OR REPLACE FUNCTION public.get_primary_company_id_by_order_volume()
 * RETURNS uuid
 * LANGUAGE sql
 * STABLE
 * AS $$
 *   SELECT company_id
 *   FROM orders
 *   WHERE company_id IS NOT NULL
 *   GROUP BY company_id
 *   ORDER BY COUNT(*) DESC, company_id ASC
 *   LIMIT 1;
 * $$;
 * ```
 */
async function fetchPrimaryCompanyIdUncached(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}
