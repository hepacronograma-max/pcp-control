import type { Profile } from "@/lib/types/database";

/**
 * Quando true, mutações (linha, prazo, qtde) devem usar /api/* com service role.
 * - Perfil demo: company_id === "local-company"
 * - Login local (admin ou usuário cadastrado): cookie pcp-local-auth=1 —
 *   mesmo que company_id seja o UUID real da empresa no perfil salvo.
 */
export function shouldUseLocalServiceApi(profile: Profile | null | undefined): boolean {
  if (profile?.company_id === "local-company") return true;
  if (typeof window === "undefined") return false;
  try {
    return document.cookie
      .split("; ")
      .some((c) => c.trim().startsWith("pcp-local-auth=1"));
  } catch {
    return false;
  }
}
