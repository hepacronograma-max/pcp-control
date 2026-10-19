"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  PASSWORD_RULE_TEXT,
  translateAuthError,
  validatePassword,
} from "@/lib/auth/password-policy";

/**
 * Fluxo:
 * 1. O e-mail traz ?token_hash=...&type=recovery.
 * 2. O token só é validado quando a pessoa clica em "Salvar nova senha"
 *    (assim, antivírus/Outlook que "pré-abrem" links não queimam o token).
 * 3. Sem token na URL, a tela funciona para quem já está logado (trocar senha).
 */
export function RedefinirSenhaForm() {
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const otpType = (searchParams.get("type") || "recovery") as EmailOtpType;
  const linkError = searchParams.get("error_description");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    if (tokenHash) {
      setHasSession(true);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setHasSession(false);
      return;
    }
    void supabase.auth.getUser().then(({ data }) => {
      setHasSession(Boolean(data.user));
    });
  }, [tokenHash]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg("");

    const policyError = validatePassword(password);
    if (policyError) {
      setErrorMsg(policyError);
      return;
    }
    if (password !== confirm) {
      setErrorMsg("As duas senhas não são iguais.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setErrorMsg("Sistema sem conexão com o banco. Fale com o administrador.");
      return;
    }

    setLoading(true);
    try {
      if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });
        if (otpError) {
          setErrorMsg(translateAuthError(otpError.message));
          setLoading(false);
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMsg(translateAuthError(error.message));
        setLoading(false);
        return;
      }

      // Encerra sessões abertas em outros aparelhos/navegadores.
      await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);

      setDone(true);
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 2500);
    } catch {
      setErrorMsg("Não foi possível salvar a senha. Tente novamente.");
      setLoading(false);
    }
  }

  if (linkError) {
    return (
      <InvalidLink message="Este link expirou ou já foi usado." />
    );
  }

  if (hasSession === null) {
    return <p className="text-sm text-slate-500 text-center py-4">Carregando…</p>;
  }

  if (!hasSession) {
    return (
      <InvalidLink message="Para criar uma nova senha, abra o link enviado para o seu e-mail." />
    );
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
          Senha alterada com sucesso. Você já está conectado e será levado ao
          sistema em instantes.
        </div>
        <p className="text-slate-500 text-xs">
          Por segurança, o acesso foi encerrado nos outros aparelhos onde você
          estava conectado.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
          Nova senha
        </label>
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1">
          Confirmar nova senha
        </label>
        <input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
        />
        Mostrar senha
      </label>
      <p className="text-xs text-slate-500">{PASSWORD_RULE_TEXT}</p>
      {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full h-9 rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#2E86C1] disabled:opacity-60"
      >
        {loading ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}

function InvalidLink({ message }: { message: string }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
        {message}
      </div>
      <Link
        href="/esqueci-senha"
        className="block w-full h-9 leading-9 text-center rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#2E86C1]"
      >
        Pedir um novo link
      </Link>
      <p className="text-center text-xs">
        <Link href="/login" className="text-[#1B4F72] hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
