import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";

/** Identificador do utilizador atual nos endpoints que precisam de `viewerId`. */
export async function resolveTasksViewerId(
  requestViewerIdParam: string | null
): Promise<
  | { ok: true; viewerId: string }
  | { ok: false; error: string; status: number }
> {
  const hasLocalAuth = await hasServerLocalAuthCookie();

  if (hasLocalAuth) {
    const v = (requestViewerIdParam ?? "").trim();
    if (!v) {
      return { ok: false, error: "viewerId obrigatório (modo local)", status: 400 };
    }
    return { ok: true, viewerId: v };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Não autenticado", status: 401 };
  }

  return { ok: true, viewerId: user.id };
}
