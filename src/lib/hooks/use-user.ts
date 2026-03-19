'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types/database";

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
            if (raw) setProfile(JSON.parse(raw) as Profile);
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

