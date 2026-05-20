import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { hasPermission, normalizeUserRole } from "@/lib/utils/permissions";
import { isUuid } from "@/lib/utils/is-uuid";

/**
 * Garante que o pedido pode agir sobre `companyId` nos endpoints de tasks
 * (padrão alinhado a `/api/users` com cookie pcp-local-auth).
 */
export async function assertTasksCompanyAccess(
  companyIdParam: string | null
): Promise<
  | { ok: true; admin: SupabaseClient }
  | { ok: false; error: string; status: number }
> {
  if (!companyIdParam || !isUuid(companyIdParam)) {
    return { ok: false, error: "companyId inválido", status: 400 };
  }

  let admin: SupabaseClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, error: "Servidor sem Supabase", status: 503 };
  }

  const hasLocalAuth = await hasServerLocalAuthCookie();

  if (hasLocalAuth) {
    let primary = await resolvePrimaryCompanyId(admin);
    if (!primary) {
      const { data: anyCompany } = await admin.from("companies").select("id").limit(1).maybeSingle();
      primary = anyCompany?.id ?? null;
    }
    if (primary && companyIdParam !== primary) {
      return { ok: false, error: "Não permitido para esta empresa", status: 403 };
    }
    if (!primary) {
      const { data: row } = await admin
        .from("companies")
        .select("id")
        .eq("id", companyIdParam)
        .maybeSingle();
      if (!row?.id) {
        return { ok: false, error: "Empresa não encontrada", status: 400 };
      }
    }
    return { ok: true, admin };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Não autenticado", status: 401 };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .maybeSingle();

  const role = normalizeUserRole(profile?.role);
  if (!profile || !hasPermission(role, "viewTasks")) {
    return { ok: false, error: "Sem permissão", status: 403 };
  }

  let resolved = profile.company_id as string | null;
  if (resolved === "local-company") {
    resolved = await resolvePrimaryCompanyId(admin);
  }
  if (!resolved || resolved !== companyIdParam) {
    return { ok: false, error: "Empresa inválida", status: 403 };
  }

  return { ok: true, admin };
}
