import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { hasPermission, PERMISSIONS } from "@/lib/utils/permissions";

export type PermissionGate =
  | { ok: true; userId: string | null; companyId: string | null }
  | { ok: false; response: NextResponse };

/**
 * Garante, NO SERVIDOR, que quem chama a rota está logado e tem a permissão
 * pedida (mesma matriz de `PERMISSIONS` usada nas telas).
 * Login local de desenvolvimento (cookie só fora de produção) passa direto.
 */
export async function requirePermission(
  permission: keyof typeof PERMISSIONS
): Promise<PermissionGate> {
  if (await hasServerLocalAuthCookie()) {
    return { ok: true, userId: null, companyId: null };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      ),
    };
  }

  const admin = createSupabaseAdminClient();
  // select("*") funciona com ou sem a coluna extra_roles.
  const { data } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data as {
    company_id: string | null;
    role: string | null;
    extra_roles?: string[] | null;
  } | null;

  if (!profile || !hasPermission(profile, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Sem permissão para esta ação" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    userId: user.id,
    companyId: (profile.company_id as string | null) ?? null,
  };
}
