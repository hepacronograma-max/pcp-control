'use client';

import Link from "next/link";

const links = [
  { href: "/configuracoes/linhas", label: "Linhas de Produção", description: "Criar, editar e desativar linhas de produção." },
  { href: "/configuracoes/empresa", label: "Empresa", description: "Logo, pasta de importação e pasta de pedidos." },
  { href: "/configuracoes/feriados", label: "Feriados", description: "Cadastro de feriados para o calendário." },
  { href: "/configuracoes/usuarios", label: "Usuários", description: "Cadastro de usuários PCP e operadores." },
];

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-600 mt-1">
          Configure linhas de produção, dados da empresa, feriados e usuários.
        </p>
      </div>
      <div className="grid gap-3">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-[#1B4F72] transition-colors"
          >
            <div>
              <h2 className="text-sm font-medium text-slate-900">{item.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
            </div>
            <span className="text-xs text-[#1B4F72] font-medium">Abrir →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
