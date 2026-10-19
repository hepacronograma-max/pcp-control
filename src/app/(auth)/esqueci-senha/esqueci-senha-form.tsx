"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EsqueciSenhaForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setErrorMsg("Informe um e-mail válido.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setErrorMsg("Sistema sem conexão com o banco. Fale com o administrador.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });

      // Só mostramos erro de limite de envio; qualquer outro caso recebe a mesma
      // mensagem neutra, para não revelar quais e-mails estão cadastrados.
      if (error) {
        const m = error.message.toLowerCase();
        if (
          error.status === 429 ||
          m.includes("rate limit") ||
          m.includes("security purposes")
        ) {
          setErrorMsg(
            "Um link já foi enviado há pouco. Aguarde um minuto antes de pedir outro."
          );
          setLoading(false);
          return;
        }
      }
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
          Se o e-mail <strong>{email.trim()}</strong> estiver cadastrado, você vai
          receber em alguns minutos um link para criar uma nova senha.
        </div>
        <ul className="list-disc pl-5 text-slate-600 space-y-1">
          <li>Confira também a caixa de spam ou lixo eletrônico.</li>
          <li>O link vale por 1 hora e só pode ser usado uma vez.</li>
        </ul>
        <Link
          href="/login"
          className="block w-full h-9 leading-9 text-center rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#2E86C1]"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <p className="text-sm text-slate-600">
        Informe o e-mail cadastrado. Enviaremos um link para você criar uma nova
        senha.
      </p>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
        />
      </div>
      {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full h-9 rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#2E86C1] disabled:opacity-60"
      >
        {loading ? "Enviando…" : "Enviar link de redefinição"}
      </button>
      <p className="text-center text-xs">
        <Link href="/login" className="text-[#1B4F72] hover:underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}
