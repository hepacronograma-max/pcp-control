'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { allowLocalAuthClient } from "@/lib/allow-local-auth";
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

/**
 * Cache do perfil em memória (vale para todas as telas da mesma aba).
 * Antes cada tela fazia 2 idas ao Supabase (auth + profiles) ao abrir.
 * As permissões continuam sendo validadas no servidor em cada rota.
 */
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
let profileCache: { userId: string; profile: Profile | null; at: number } | null = null;
let profileInflight: Promise<Profile | null> | null = null;
let authListenerAttached = false;

function clearProfileCache() {
  profileCache = null;
  profileInflight = null;
}

function attachAuthListener(supabase: NonNullable<ReturnType<typeof createClient>>) {
  if (authListenerAttached) return;
  authListenerAttached = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || event === "USER_UPDATED") {
      clearProfileCache();
    } else if (
      event === "SIGNED_IN" &&
      profileCache &&
      session?.user?.id !== profileCache.userId
    ) {
      clearProfileCache();
    }
  });
}

async function loadSupabaseProfile(
  supabase: NonNullable<ReturnType<typeof createClient>>
): Promise<Profile | null> {
  // getSession lê o cookie local (sem ida à rede); o servidor revalida o token.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) {
    clearProfileCache();
    return null;
  }
  if (
    profileCache &&
    profileCache.userId === userId &&
    Date.now() - profileCache.at < PROFILE_CACHE_TTL_MS
  ) {
    return profileCache.profile;
  }
  if (!profileInflight) {
    profileInflight = (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      const p = (data as Profile | null) ?? null;
      profileCache = { userId, profile: p, at: Date.now() };
      return p;
    })().finally(() => {
      profileInflight = null;
    });
  }
  return profileInflight;
}

export function useUser() {
  const [profile, setProfile] = useState<Profile | null>(
    () => profileCache?.profile ?? null
  );
  const [loading, setLoading] = useState(() => !profileCache);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    async function getProfile() {
      // Dev localhost: perfil em localStorage (cookie httpOnly só no servidor)
      if (typeof window !== "undefined" && allowLocalAuthClient()) {
        const rawProfile = window.localStorage.getItem("pcp-local-profile");
        if (rawProfile) {
          try {
            const parsed = JSON.parse(rawProfile) as Profile;
            setProfile(parsed);
            void syncLocalProfileCompanyId(parsed, setProfile);
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

      attachAuthListener(supabase);
      try {
        const p = await loadSupabaseProfile(supabase);
        if (!cancelled) setProfile(p);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void getProfile();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return { profile, loading };
}
