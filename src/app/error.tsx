"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Tela amigável para erros inesperados (em vez da tela técnica do Next.js).
 * O detalhe técnico vai para o console do navegador e para os logs da Vercel.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PCP Control] erro não tratado:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm text-center space-y-4">
        <h1 className="text-lg font-semibold text-slate-800">
          Algo deu errado nesta tela
        </h1>
        <p className="text-sm text-slate-600">
          Seus dados estão salvos. Tente carregar a tela de novo. Se o problema
          continuar, avise o administrador informando o horário e o código abaixo.
        </p>
        {error.digest ? (
          <p className="text-xs font-mono text-slate-400">Código: {error.digest}</p>
        ) : null}
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="h-9 px-4 rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#2E86C1]"
          >
            Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="h-9 leading-9 px-4 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
