import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login - PCP Control",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMsg =
    params?.error === "credenciais" ? "Email ou senha incorretos." : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#1B4F72]">PCP Control</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sistema de Planejamento e Controle de Produção
          </p>
        </div>

        {/* Formulário HTML puro - sem JavaScript, funciona sempre */}
        <form
          action="/api/auth/local-login"
          method="POST"
          className="space-y-4"
        >
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
              defaultValue="admin@local"
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
              defaultValue="123456"
              required
              className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
            />
          </div>
          {errorMsg && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}
          <button
            type="submit"
            className="w-full h-9 rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#2E86C1]"
          >
            Entrar
          </button>
        </form>

        <p className="mt-3 text-xs text-slate-500 text-center">
          Local: admin@local / 123456
        </p>
      </div>
    </div>
  );
}
