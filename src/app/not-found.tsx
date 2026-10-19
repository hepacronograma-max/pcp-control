import Link from "next/link";

export const metadata = {
  title: "Página não encontrada - PCP Control",
};

export default function NotFound() {
  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#1B4F72]">PCP Control</h1>
        <p className="text-4xl font-semibold text-slate-300">404</p>
        <p className="text-sm text-slate-600">
          A página que você tentou abrir não existe ou foi movida.
        </p>
        <Link
          href="/dashboard"
          className="inline-block h-9 leading-9 px-4 rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#2E86C1]"
        >
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
