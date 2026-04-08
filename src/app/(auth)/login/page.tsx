import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Login - PCP Control",
};

function LoginFormFallback() {
  return (
    <p className="text-sm text-slate-500 text-center py-4">Carregando…</p>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#1B4F72]">PCP Control</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sistema de Planejamento e Controle de Produção
          </p>
        </div>

        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
