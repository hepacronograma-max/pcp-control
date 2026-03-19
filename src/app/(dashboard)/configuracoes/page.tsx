'use client';

import { useState, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";

const links = [
  { href: "/configuracoes/linhas", label: "Linhas de Produção", description: "Criar, editar e desativar linhas de produção." },
  { href: "/configuracoes/empresa", label: "Empresa", description: "Logo da empresa e pasta matriz para PDFs dos pedidos." },
  { href: "/configuracoes/feriados", label: "Feriados", description: "Cadastro de feriados para o calendário." },
  { href: "/configuracoes/usuarios", label: "Usuários", description: "Cadastro de usuários PCP e operadores." },
];

export default function ConfiguracoesPage() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const { profile } = useUser();
  const { companyId: effectiveCompanyId } = useEffectiveCompanyId(profile);

  async function handleRestoreFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await doRestore(data);
    } catch (err) {
      setRestoreResult({ success: false, msg: err instanceof Error ? err.message : "Erro ao ler arquivo" });
    } finally {
      setRestoring(false);
      e.target.value = "";
    }
  }

  async function handleRestoreFromRepo() {
    setRestoring(true);
    setRestoreResult(null);
    try {
      const res = await fetch("/backup-inicial.json");
      if (!res.ok) throw new Error("Backup não encontrado no repositório");
      const data = await res.json();
      await doRestore(data);
    } catch (err) {
      setRestoreResult({ success: false, msg: err instanceof Error ? err.message : "Erro ao buscar backup" });
    } finally {
      setRestoring(false);
    }
  }

  async function doRestore(data: unknown) {
    const res = await fetch("/api/import-backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (json.success) {
      setRestoreResult({
        success: true,
        msg: `Restaurado: ${json.orders} pedidos, ${json.items} itens, ${json.lines} linhas, ${json.holidays} feriados. Recarregue a página.`,
      });
      setTimeout(() => window.location.reload(), 2000);
    } else {
      setRestoreResult({ success: false, msg: json.error || "Erro ao restaurar" });
    }
  }

  async function handleClearOrders() {
    setClearing(true);
    try {
      if (supabase && effectiveCompanyId) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id")
          .eq("company_id", effectiveCompanyId);
        for (const o of orders ?? []) {
          await supabase.from("order_items").delete().eq("order_id", o.id);
        }
        await supabase.from("orders").delete().eq("company_id", effectiveCompanyId);
      }
      setCleared(true);
      setShowConfirm(false);
      setTimeout(() => setCleared(false), 3000);
    } catch {
      // ignore
    } finally {
      setClearing(false);
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

        {supabase && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50 mb-3">
            <div>
              <h3 className="text-sm font-medium text-emerald-800">Restaurar backup</h3>
              <p className="text-xs text-emerald-600 mt-0.5">
                Importa pedidos, linhas, empresa e feriados para o Supabase. Use o backup do repositório (recomendado) ou selecione um arquivo.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <button
                  onClick={handleRestoreFromRepo}
                  disabled={restoring}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {restoring ? "Restaurando..." : "Restaurar do repositório"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleRestoreFromFile}
                  disabled={restoring}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={restoring}
                  className="px-3 py-1.5 rounded-md border border-emerald-600 text-emerald-700 text-xs font-medium hover:bg-emerald-50 disabled:opacity-50"
                >
                  Selecionar arquivo
                </button>
              </div>
              {restoreResult && (
                <span className={`text-xs font-medium ${restoreResult.success ? "text-emerald-700" : "text-red-700"}`}>
                  {restoreResult.msg}
                </span>
              )}
            </div>
          </div>
        )}

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
                disabled={clearing}
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {clearing ? "Zerando..." : "Sim, zerar"}
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
