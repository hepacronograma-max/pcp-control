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

