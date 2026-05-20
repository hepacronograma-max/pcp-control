/**
 * Login local (admin@local, /entrar, cookie pcp-local-auth) só em desenvolvimento.
 * Em produção (Vercel) o acesso deve ser exclusivamente Supabase Auth.
 */
export function allowLocalAuth(): boolean {
  if (process.env.PCP_ALLOW_LOCAL_AUTH === "1") return true;
  if (process.env.PCP_DISABLE_LOCAL_AUTH === "1") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV !== "production";
}

/** Uso em componentes client: apenas hostname local (sem flag pública na Vercel). */
export function allowLocalAuthClient(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}
