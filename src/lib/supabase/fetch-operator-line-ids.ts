import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * IDs de linhas vinculadas ao usuário em `operator_lines`.
 * Usa service role para não depender de RLS no cliente (operador não via lê suas próprias linhas).
 */
export async function fetchOperatorLineIdsForUserId(
  userId: string
): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const admin = createSupabaseAdminClient();
    return await fetchOperatorLineIdsWithClient(admin, userId);
  } catch {
    return [];
  }
}

async function fetchOperatorLineIdsWithClient(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: rows } = await admin
    .from("operator_lines")
    .select("line_id")
    .eq("user_id", userId);

  const fromLineId = new Set<string>();
  for (const r of rows ?? []) {
    const row = r as { line_id?: string | null };
    const id = row.line_id?.trim();
    if (id) fromLineId.add(id);
  }
  if (fromLineId.size > 0) return [...fromLineId];

  const { data: alt } = await admin
    .from("operator_lines")
    .select("production_line_id")
    .eq("user_id", userId);

  const fromAlt = new Set<string>();
  for (const r of alt ?? []) {
    const row = r as { production_line_id?: string | null };
    const id = row.production_line_id?.trim();
    if (id) fromAlt.add(id);
  }
  return [...fromAlt];
}
