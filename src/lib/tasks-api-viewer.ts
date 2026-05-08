import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Identificador do utilizador atual nos endpoints que precisam de `viewerId`. */
export async function resolveTasksViewerId(
  requestViewerIdParam: string | null
): Promise<
  | { ok: true; viewerId: string }
  | { ok: false; error: string; status: number }
> {
  const cookieStore = await cookies();
  const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

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
