'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";

/**
 * Retorna o company_id efetivo para consultas ao Supabase.
 * Quando o perfil é "local" (company_id === "local-company") mas o Supabase está configurado,
 * busca a primeira empresa no banco para usar como contexto.
 * Isso permite que usuários com auth local (admin@local) usem os dados do Supabase.
 */
export function useEffectiveCompanyId(profile: Profile | null): string | null {
  const supabase = createClient();
  const [effectiveId, setEffectiveId] = useState<string | null>(
    profile?.company_id ?? null
  );

  useEffect(() => {
    if (!profile?.company_id) {
      setEffectiveId(null);
      return;
    }

    // Se não for "local-company", usa o company_id do perfil normalmente
    if (profile.company_id !== "local-company") {
      setEffectiveId(profile.company_id);
      return;
    }

    // Perfil local sem Supabase: mantém company_id
    if (!supabase) {
      setEffectiveId(profile.company_id);
      return;
    }

    // Perfil local COM Supabase: busca a primeira empresa
    async function fetchFirstCompany() {
      const { data } = await supabase!
        .from("companies")
        .select("id")
        .limit(1)
        .maybeSingle();
      setEffectiveId(data?.id ?? null);
    }
    fetchFirstCompany();
  }, [profile?.company_id, supabase]);

  return effectiveId;
}
