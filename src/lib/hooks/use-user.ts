'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Com cookie local, o perfil padrão usa company_id "local-company".
 * Sincroniza com /api/effective-company (empresa com mais pedidos) para o restante
 * do app e o localStorage usarem o UUID real — evita menu sem linhas e saves “estranhos”.
 */
async function syncLocalProfileCompanyId(
  current: Profile,
  setProfile: (p: Profile) => void
): Promise<void> {
  const cid = current.company_id ?? "";
  if (cid !== "local-company" && UUID_RE.test(cid)) {
    return;
  }
  try {
    const res = await fetch("/api/effective-company", { credentials: "include" });
    const json = (await res.json()) as { companyId?: string | null };
    const id = json.companyId?.trim() ?? "";
    if (!id || !UUID_RE.test(id)) return;
    const merged: Profile = { ...current, company_id: id };
    window.localStorage.setItem("pcp-local-profile", JSON.stringify(merged));
    setProfile(merged);
  } catch {
    // ignore
  }
}

export function useUser() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function getProfile() {
      // Auth local (admin@local): perfil no localStorage, funciona em localhost e produção
      if (typeof window !== "undefined") {
        const hasLocalAuth = document.cookie
          .split("; ")
          .some((c) => c.startsWith("pcp-local-auth=1"));
        if (hasLocalAuth) {
          try {
            let raw = window.localStorage.getItem("pcp-local-profile");
            if (!raw) {
              const defaultProfile: Profile = {
                id: "local-admin",
                company_id: "local-company",
                full_name: "Administrador Local",
                email: "admin@local",
                role: "manager",
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              window.localStorage.setItem(
                "pcp-local-profile",
                JSON.stringify(defaultProfile)
              );
              raw = JSON.stringify(defaultProfile);
            }
            if (raw) {
              const parsed = JSON.parse(raw) as Profile;
              setProfile(parsed);
              void syncLocalProfileCompanyId(parsed, setProfile);
            }
          } catch {
            // ignore
          }
          setLoading(false);
          return;
        }
      }

      // Modo local/demo: sem Supabase, usa perfil salvo em localStorage.
      if (!supabase) {
        try {
          const raw = window.localStorage.getItem("pcp-local-profile");
          if (raw) {
            setProfile(JSON.parse(raw) as Profile);
          }
        } catch {
          // ignore
        }
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(data);
      }
      setLoading(false);
    }
    getProfile();
  }, [supabase]);

  return { profile, loading };
}

