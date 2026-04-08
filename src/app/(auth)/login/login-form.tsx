"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function findLocalUser(email: string, password: string) {
  try {
    const raw = window.localStorage.getItem("pcp-local-users");
    if (!raw) return null;
    const users = JSON.parse(raw) as Array<{
      email: string;
      password: string;
      is_active?: boolean;
      id: string;
      company_id: string;
      full_name: string;
      role: string;
      created_at: string;
      updated_at: string;
    }>;
    for (const u of users) {
      if (
        u.email.toLowerCase() === email.toLowerCase() &&
        u.password === password &&
        u.is_active !== false
      ) {
        return u;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setLocalProfile(user: {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}) {
  const profile = {
    id: user.id,
    company_id: user.company_id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
  window.localStorage.setItem("pcp-local-profile", JSON.stringify(profile));
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState(() =>
    searchParams.get("error") === "credenciais"
      ? "Email ou senha incorretos."
      : ""
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    if (!email || !password) {
      setErrorMsg("Preencha email e senha.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      // 1) Administrador local (cookie + perfil demo)
      if (email === "admin@local" && password === "123456") {
        const adminProfile = {
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
          JSON.stringify(adminProfile)
        );
        window.location.href = "/entrar";
        return;
      }

      // 2) Usuários só em localStorage (modo demo sem Supabase)
      const localUser = findLocalUser(email, password);
      if (localUser) {
        setLocalProfile({
          ...localUser,
          is_active: localUser.is_active !== false,
        });
        window.location.href = "/entrar";
        return;
      }

      // 3) Supabase Auth (operadores / PCP cadastrados na tela Usuários)
      const supabase = createClient();
      if (!supabase) {
        setErrorMsg(
          "Supabase não configurado neste ambiente. Use admin@local / 123456 ou configure o .env."
        );
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(
          error.message === "Invalid login credentials"
            ? "Email ou senha incorretos."
            : error.message
        );
        setLoading(false);
        return;
      }

      router.refresh();
      router.push("/dashboard");
    } catch {
      setErrorMsg("Não foi possível entrar. Tente de novo.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="text"
          autoComplete="email"
          required
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
        />
      </div>
      {errorMsg ? (
        <p className="text-sm text-red-500">{errorMsg}</p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full h-9 rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#2E86C1] disabled:opacity-60"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
      <p className="mt-3 text-xs text-slate-500 text-center">
        <strong>Administrador da rede:</strong> admin@local / 123456
        <br />
        <span className="text-slate-400">
          Operadores e PCP: use o mesmo e-mail e senha cadastrados em
          Configurações → Usuários.
        </span>
      </p>
    </form>
  );
}
