import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/types/database";
import { parseExtraRoles } from "@/lib/utils/permissions";

export type ActorProfile = {
  company_id: string | null;
  role: string | null;
  extra_roles: UserRole[];
};

/** Perfil do usuário autenticado, com `extra_roles` se a coluna existir. */
export async function fetchActorProfile(
  client: SupabaseClient,
  userId: string
): Promise<ActorProfile | null> {
  const full = await client
    .from("profiles")
    .select("company_id, role, extra_roles")
    .eq("id", userId)
    .maybeSingle();

  if (
    full.error &&
    /extra_roles/i.test(full.error.message) &&
    /column|does not exist|schema cache/i.test(full.error.message)
  ) {
    const retry = await client
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (!retry.data) return null;
    return {
      company_id: (retry.data.company_id as string | null) ?? null,
      role: (retry.data.role as string | null) ?? null,
      extra_roles: [],
    };
  }

  if (!full.data) return null;
  return {
    company_id: (full.data.company_id as string | null) ?? null,
    role: (full.data.role as string | null) ?? null,
    extra_roles: parseExtraRoles(full.data.extra_roles, full.data.role),
  };
}
