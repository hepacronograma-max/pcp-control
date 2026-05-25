"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { hasPermission } from "@/lib/utils/permissions";

type WebhookEvent = {
  id: number;
  event_id: string;
  event_type: string | null;
  status: string;
  received_at: string;
  processed_at: string | null;
  error_message: string | null;
};

type OmieLink = {
  id: number;
  pcp_order_id: string;
  omie_codigo_pedido: number;
  omie_numero_pedido: string | null;
  omie_etapa: string | null;
  sync_status: string;
  last_synced_at: string;
};

type OmieStatus = {
  mode: "shadow" | "active";
  etapaPcp: string;
  events: WebhookEvent[];
  links: OmieLink[];
  syncState: {
    last_poll_at?: string;
    last_poll_success_at?: string;
    last_poll_report?: Record<string, number>;
  } | null;
  lastWebhook: { received_at?: string; status?: string } | null;
};

export default function AdminOmiePage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const [data, setData] = useState<OmieStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile.role, "viewSettings")) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/omie", { credentials: "include" });
      const json = (await res.json()) as OmieStatus & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Erro ${res.status}`);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    if (profile && hasPermission(profile.role, "viewSettings")) {
      void load();
    }
  }, [profile, load]);

  async function forcePoll() {
    setBusy("poll");
    try {
      const res = await fetch("/api/admin/omie", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "poll" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha no poll");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function reprocess(id: number) {
    setBusy(`ev-${id}`);
    try {
      const res = await fetch("/api/admin/omie", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprocess", eventId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao reprocessar");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !profile) {
    return <div className="p-6 text-slate-600">Carregando…</div>;
  }

  const mode = data?.mode ?? "shadow";
  const modeClass =
    mode === "active"
      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
      : "bg-amber-100 text-amber-900 border-amber-300";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/configuracoes" className="text-sm text-slate-500 hover:underline">
            ← Configurações
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Integração Omie</h1>
          <p className="text-sm text-slate-600">
            Webhook + polling (15 min). Etapa alvo: <strong>{data?.etapaPcp ?? "—"}</strong>
          </p>
        </div>
        <span className={`rounded-lg border px-3 py-1 text-sm font-semibold ${modeClass}`}>
          Modo: {mode === "active" ? "ATIVO" : "SHADOW"}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void forcePoll()}
          disabled={busy === "poll"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "poll" ? "Executando…" : "Forçar polling agora"}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          Atualizar
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">Último webhook</h2>
          <p className="mt-2 text-sm text-slate-600">
            {data?.lastWebhook?.received_at
              ? new Date(data.lastWebhook.received_at).toLocaleString("pt-BR")
              : "Nenhum ainda"}
            {data?.lastWebhook?.status ? ` — ${data.lastWebhook.status}` : ""}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">Último polling</h2>
          <p className="mt-2 text-sm text-slate-600">
            {data?.syncState?.last_poll_success_at
              ? new Date(data.syncState.last_poll_success_at).toLocaleString("pt-BR")
              : "Nunca"}
          </p>
          {data?.syncState?.last_poll_report && (
            <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-xs">
              {JSON.stringify(data.syncState.last_poll_report, null, 2)}
            </pre>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 font-semibold">Eventos webhook (50)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Recebido</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(data?.events ?? []).map((ev) => (
                <tr key={ev.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{ev.event_id.slice(0, 24)}</td>
                  <td className="px-3 py-2">{ev.event_type ?? "—"}</td>
                  <td className="px-3 py-2">{ev.status}</td>
                  <td className="px-3 py-2">
                    {new Date(ev.received_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-2">
                    {ev.status === "failed" && (
                      <button
                        type="button"
                        className="text-blue-600 hover:underline"
                        disabled={busy === `ev-${ev.id}`}
                        onClick={() => void reprocess(ev.id)}
                      >
                        Reprocessar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 font-semibold">Vínculos Omie ↔ PCP (50)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Omie</th>
                <th className="px-3 py-2">Nº pedido</th>
                <th className="px-3 py-2">Etapa</th>
                <th className="px-3 py-2">Sync</th>
                <th className="px-3 py-2">PCP order</th>
              </tr>
            </thead>
            <tbody>
              {(data?.links ?? []).map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2">{l.omie_codigo_pedido}</td>
                  <td className="px-3 py-2">{l.omie_numero_pedido ?? "—"}</td>
                  <td className="px-3 py-2">{l.omie_etapa ?? "—"}</td>
                  <td className="px-3 py-2">{l.sync_status}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.pcp_order_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
