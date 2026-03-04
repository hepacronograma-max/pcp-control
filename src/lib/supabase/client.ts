import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient | null {
  // Se não houver variáveis do Supabase, não tenta criar o client
  // (evita erro em ambiente local sem .env configurado).
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const url = rawUrl.trim();
  const anonKey = rawAnonKey.trim();

  const urlPareceValida =
    url.startsWith("http://") || url.startsWith("https://");

  if (!urlPareceValida || !anonKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[pcp-control] Supabase não configurado ou URL/KEY inválidas (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)."
      );
    }
    return null;
  }

  if (!cachedClient) {
    cachedClient = createBrowserClient(url, anonKey);
  }

  return cachedClient;
}

