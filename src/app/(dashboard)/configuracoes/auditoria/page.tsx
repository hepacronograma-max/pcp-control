"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { hasPermission } from "@/lib/utils/permissions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type AuditEvent = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  user_email: string | null;
  created_at: string;
};

export default function AuditoriaPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile.role, "viewSettings")) {
      router.replace("/configuracoes");
    }
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile || !hasPermission(profile.role, "viewSettings")) return;

    let cancelled = false;
    async function load() {
      setLoadingData(true);
      setError(null);
      try {
        const res = await fetch("/api/audit-log?limit=100", {
          credentials: "include",
        });
        const json = (await res.json()) as {
          events?: AuditEvent[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Erro ${res.status}`);
          setEvents([]);
        } else {
          setEvents(json.events ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar");
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (loading || !profile) {
    return (
      <div className="p-6 text-sm text-slate-500">Carregando…</div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/configuracoes" className="hover:text-[#1B4F72]">
          Configurações
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Auditoria</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-slate-900">Trilha de auditoria</h1>
        <p className="text-sm text-slate-600 mt-1">
          Últimos 100 eventos da sua empresa (pedidos, itens, compras, perfis, linhas, CQ).
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
          <p className="mt-2 text-xs">
            Se a tabela ainda não existe, aplique{" "}
            <code className="bg-amber-100 px-1 rounded">supabase/migrations/20260520_audit_log.sql</code>{" "}
            no SQL Editor do Supabase (após backup).
          </p>
        </div>
      ) : null}

      {loadingData ? (
        <p className="text-sm text-slate-500">Carregando eventos…</p>
      ) : events.length === 0 && !error ? (
        <p className="text-sm text-slate-500">Nenhum evento registrado ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-2">Quando</th>
                <th className="text-left p-2">Ação</th>
                <th className="text-left p-2">Tabela</th>
                <th className="text-left p-2">Registro</th>
                <th className="text-left p-2">Usuário</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-t border-slate-100">
                  <td className="p-2 whitespace-nowrap">
                    {format(new Date(ev.created_at), "dd/MM/yy HH:mm", {
                      locale: ptBR,
                    })}
                  </td>
                  <td className="p-2 font-medium">{ev.action}</td>
                  <td className="p-2">{ev.table_name}</td>
                  <td className="p-2 font-mono text-[10px] max-w-[120px] truncate">
                    {ev.record_id}
                  </td>
                  <td className="p-2">{ev.user_email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500">
        Retenção sugerida: 90 dias — ver docs/AUDITORIA.md
      </p>
    </div>
  );
}
