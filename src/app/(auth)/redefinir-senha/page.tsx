import type { Metadata } from "next";
import { Suspense } from "react";
import { RedefinirSenhaForm } from "./redefinir-senha-form";

export const metadata: Metadata = {
  title: "Nova senha - PCP Control",
};

export default function RedefinirSenhaPage() {
  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gray-50 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#1B4F72]">PCP Control</h1>
          <p className="text-sm text-slate-500 mt-1">Criar nova senha</p>
        </div>
        <Suspense
          fallback={
            <p className="text-sm text-slate-500 text-center py-4">Carregando…</p>
          }
        >
          <RedefinirSenhaForm />
        </Suspense>
      </div>
    </div>
  );
}
