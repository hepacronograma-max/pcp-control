'use client';

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types/database";

/** Resultado do hook: id efetivo e se já terminou de carregar (para perfil local). */
export type EffectiveCompanyResult = {
  companyId: string | null;
  /** false = ainda buscando; true = já buscou (pode ser null se não houver empresa). */
  loaded: boolean;
};

/**
 * Retorna o company_id efetivo para consultas ao Supabase.
 * Quando o perfil é "local" (company_id === "local-company") mas o Supabase está configurado,
 * busca a primeira empresa via API (service role) para evitar problemas com anon key/RLS.
 */
export function useEffectiveCompanyId(profile: Profile | null): EffectiveCompanyResult {
  const [companyId, setCompanyId] = useState<string | null>(
    profile?.company_id ?? null
  );
  const [loaded, setLoaded] = useState(!profile || profile.company_id !== "local-company");

  useEffect(() => {
    if (!profile?.company_id) {
      setCompanyId(null);
      setLoaded(true);
      return;
    }

    if (profile.company_id !== "local-company") {
      setCompanyId(profile.company_id);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    async function fetchFirstCompany() {
      try {
        const res = await fetch("/api/effective-company", {
          credentials: "include",
        });
        const json = await res.json();
        setCompanyId(json.companyId ?? null);
      } catch {
        setCompanyId(null);
      } finally {
        setLoaded(true);
      }
    }
    fetchFirstCompany();
  }, [profile?.company_id]);

  return { companyId, loaded };
}
