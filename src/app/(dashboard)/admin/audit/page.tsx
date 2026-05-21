"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { hasPermission } from "@/lib/utils/permissions";
import { AuditFilters, type AuditFiltersState } from "./audit-filters";
import { AuditTable, type AuditEvent } from "./audit-table";
import { eventsToCsv } from "@/lib/audit/diff-json";

const AUDITED_TABLES = [
  "orders",
  "order_items",
  "purchase_orders",
  "profiles",
  "production_lines",
  "companies",
  "cq_registros",
  "holidays",
];

const emptyFilters: AuditFiltersState = {
  table: "",
  operation: "",
  user: "",
  from: "",
  to: "",
};

export default function AdminAuditPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const [filters, setFilters] = useState<AuditFiltersState>(emptyFilters);
  const [applied, setApplied] = useState<AuditFiltersState>(emptyFilters);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile.role, "viewSettings")) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  const load = useCallback(async () => {
    if (!profile || !hasPermission(profile.role, "viewSettings")) return;
    setLoadingData(true);
    setError(null);
    const qp = new URLSearchParams();
    qp.set("page", String(page));
    qp.set("limit", "50");
    if (applied.table) qp.set("table", applied.table);
    if (applied.operation) qp.set("operation", applied.operation);
    if (applied.user) qp.set("user", applied.user);
    if (applied.from) qp.set("from", applied.from);
    if (applied.to) qp.set("to", applied.to);

    try {
      const res = await fetch(`/api/audit?${qp}`, { credentials: "include" });
      const json = (await res.json()) as {
        events?: AuditEvent[];
        error?: string;
        total?: number;
        totalPages?: number;
      };
      if (!res.ok) {
        setError(json.error ?? `Erro ${res.status}`);
        setEvents([]);
        return;
      }
      setEvents(json.events ?? []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoadingData(false);
    }
  }, [profile, page, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleExportCsv() {
    const csv = eventsToCsv(events);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-pagina-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !profile) {
    return <div className="p-6 text-sm text-slate-500">Carregando…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/configuracoes" className="text-sm text-slate-500 hover:text-[#1B4F72]">
            ← Configurações
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">
            Auditoria (admin)
          </h1>
          <p className="text-sm text-slate-600">
            Histórico de alterações — gestores e super_admin da empresa.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={events.length === 0}
          className="px-3 py-1.5 rounded-md border border-slate-300 text-sm disabled:opacity-40"
        >
          Exportar CSV (página atual)
        </button>
      </div>

      <AuditFilters
        value={filters}
        onChange={setFilters}
        tables={AUDITED_TABLES}
        onApply={() => {
          setApplied(filters);
          setPage(1);
        }}
      />

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
          <p className="mt-2 text-xs">
            Aplique <code>supabase/migrations/20260520_audit_log.sql</code> — ver{" "}
            <code>docs/COMO-RODAR-MIGRATIONS.md</code>.
          </p>
        </div>
      ) : null}

      {loadingData ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <AuditTable
          events={events}
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
