'use client';

import { useState } from "react";
import Link from "next/link";

const links = [
  { href: "/configuracoes/linhas", label: "Linhas de Produção", description: "Criar, editar e desativar linhas de produção." },
  { href: "/configuracoes/empresa", label: "Empresa", description: "Logo da empresa e pasta matriz para PDFs dos pedidos." },
  { href: "/configuracoes/feriados", label: "Feriados", description: "Cadastro de feriados para o calendário." },
  { href: "/configuracoes/usuarios", label: "Usuários", description: "Cadastro de usuários PCP e operadores." },
];

export default function ConfiguracoesPage() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);

  function handleClearOrders() {
    try {
      window.localStorage.removeItem("pcp-local-orders");
      setCleared(true);
      setShowConfirm(false);
      setTimeout(() => setCleared(false), 3000);
    } catch {
      // ignore
    }
  }

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

      <div className="border-t border-slate-200 pt-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Manutenção</h2>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
          <div>
            <h3 className="text-sm font-medium text-red-800">Zerar base de pedidos</h3>
            <p className="text-xs text-red-600 mt-0.5">
              Remove todos os pedidos e itens. Linhas, usuários, empresa e feriados são mantidos.
            </p>
          </div>
          {cleared ? (
            <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-md">
              Base zerada com sucesso!
            </span>
          ) : showConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-700 font-medium">Tem certeza?</span>
              <button
                onClick={handleClearOrders}
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
              >
                Sim, zerar
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-600 hover:bg-white"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-3 py-1.5 rounded-md border border-red-300 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              Zerar pedidos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
