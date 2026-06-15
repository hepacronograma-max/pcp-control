"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { hasPermission } from "@/lib/utils/permissions";
import type { OmieImportReport } from "@/lib/omie/types";
import { ImportReportSummary } from "@/components/omie/import-report-summary";

type OmieLink = {
  id: number;
  omie_codigo_pedido: number;
  omie_numero_pedido: string | null;
  omie_etapa: string | null;
  sync_status: string | null;
  last_synced_at: string | null;
  created_at: string;
  pcp_order_id: string | null;
};

type RemovedOmieItem = {
  id: string;
  description: string;
  quantity: number;
  product_code: string | null;
  omie_codigo_item: number | null;
  order_id: string;
  orders: { order_number: string; client_name: string } | null;
};

type DashboardData = {
  mode: "shadow" | "active";
  links: OmieLink[];
  metrics: {
    shadow_detected: { today: number; yesterday: number; last7days: number };
    synced: { today: number; yesterday: number; last7days: number };
    backfill_skipped: { today: number; yesterday: number; last7days: number };
  };
  removedInOmie?: {
    items: RemovedOmieItem[];
    error?: string;
  };
  lastImport: { at: string; report: OmieImportReport } | null;
};

type ImportResponse = {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  report?: OmieImportReport;
  error?: string;
};

export default function AdminOmiePage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [running, setRunning] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<OmieImportReport | null>(null);
  const [importSkipped, setImportSkipped] = useState(false);

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile.role, "viewSettings")) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  const load = useCallback(async () => {
    if (!profile || !hasPermission(profile.role, "viewSettings")) return;
    setLoadingData(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/omie", { credentials: "include" });
      const json = (await res.json()) as DashboardData & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Erro ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoadingData(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  const runImport = async () => {
    setRunning(true);
    setImportError(null);
    setImportReport(null);
    setImportSkipped(false);
    try {
      const res = await fetch("/api/admin/omie", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as ImportResponse;
      if (!res.ok) {
        setImportError(json.error ?? `Erro ${res.status}`);
        return;
      }
      if (json.skipped && json.reason === "locked") {
        setImportSkipped(true);
      }
      if (json.report) {
        setImportReport(json.report);
      }
      await load();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Erro ao importar");
    } finally {
      setRunning(false);
    }
  };

  const mode = data?.mode ?? "shadow";
  const isShadow = mode === "shadow";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Integração Omie</h1>
          <p className="text-sm text-slate-600">
            Importação sob demanda da etapa Fabricação (20). Somente leitura no Omie.
          </p>
        </div>
        <Link href="/configuracoes" className="text-sm text-blue-700 hover:underline">
          ← Configurações
        </Link>
      </div>

      <div
        className={`rounded-xl border-2 p-6 text-center ${
          isShadow
            ? "border-amber-400 bg-amber-50 text-amber-950"
            : "border-emerald-500 bg-emerald-50 text-emerald-950"
        }`}
      >
        <p className="text-sm font-medium uppercase tracking-wide">Modo atual</p>
        <p className="mt-2 text-3xl font-bold">{isShadow ? "SHADOW" : "ACTIVE"}</p>
        <p className="mt-2 text-sm">
          {isShadow
            ? "Detecta e registra o que importaria — não cria pedidos no PCP."
            : "Cria pedidos e itens no PCP ao importar."}
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-5">
        <h2 className="font-semibold text-slate-900">Importar pedidos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Busca pedidos na etapa 20 do Omie e aplica o casamento incremental. Use quando
          precisar trazer pedidos novos ou atualizar os já vinculados.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runImport}
            disabled={running}
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
          >
            {running ? "Importando…" : "Importar pedidos do Omie"}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={running}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Atualizar painel
          </button>
        </div>

        {importSkipped && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Outra importação já está em andamento. Aguarde alguns segundos e tente novamente.
          </p>
        )}

        {importError && (
          <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {importError}
          </p>
        )}

        {importReport && <ImportReportSummary report={importReport} />}
      </div>

      {data?.lastImport && !importReport && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-800">Última importação</h2>
          <p className="text-sm text-slate-600">
            {new Date(data.lastImport.at).toLocaleString("pt-BR")}
          </p>
          <div className="mt-3">
            <ImportReportSummary report={data.lastImport.report} compact />
          </div>
        </div>
      )}

      {data?.metrics && (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard title="Shadow detectados" m={data.metrics.shadow_detected} />
          <MetricCard title="Sincronizados" m={data.metrics.synced} />
          <MetricCard title="Backfill ignorados" m={data.metrics.backfill_skipped} />
        </div>
      )}

      <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
        <h2 className="font-semibold text-red-900">
          Itens marcados como removidos no Omie (preservados)
        </h2>
        <p className="mt-1 text-sm text-red-800">
          Estes itens sumiram no Omie mas estão em produção no PCP — revisão manual necessária.
        </p>
        {data?.removedInOmie?.error && (
          <p className="mt-2 text-sm text-red-700">
            {data.removedInOmie.error.includes("omie_sync_flag")
              ? "Coluna omie_sync_flag ausente — aplique supabase/migrations/20260608_omie_item_sync.sql"
              : data.removedInOmie.error}
          </p>
        )}
        <div className="mt-3 overflow-x-auto rounded border border-red-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-red-100/50 text-red-900">
              <tr>
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Código Omie</th>
                <th className="px-3 py-2">Qtd</th>
              </tr>
            </thead>
            <tbody>
              {(data?.removedInOmie?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    Nenhum item com flag removido_no_omie.
                  </td>
                </tr>
              ) : (
                data?.removedInOmie?.items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.orders?.order_number ?? row.order_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">{row.orders?.client_name ?? "—"}</td>
                    <td className="px-3 py-2">{row.description}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.omie_codigo_item ?? "—"}
                    </td>
                    <td className="px-3 py-2">{row.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2">Nº Omie</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {loadingData ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Carregando…
                </td>
              </tr>
            ) : (data?.links ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Nenhum vínculo ainda.
                </td>
              </tr>
            ) : (
              data?.links.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.omie_numero_pedido ?? "—"}
                  </td>
                  <td className="px-3 py-2">{row.omie_codigo_pedido}</td>
                  <td className="px-3 py-2">{row.omie_etapa ?? "—"}</td>
                  <td className="px-3 py-2">{row.sync_status ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString("pt-BR")
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  m,
}: {
  title: string;
  m: { today: number; yesterday: number; last7days: number };
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-medium text-slate-800">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        <li>Hoje: {m.today}</li>
        <li>Ontem: {m.yesterday}</li>
        <li>7 dias: {m.last7days}</li>
      </ul>
    </div>
  );
}
