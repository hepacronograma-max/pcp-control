"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subDays } from "date-fns";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CQGravidade, CQRegistro } from "@/lib/types/cq";
import {
  cqAggByGravidade,
  cqAveragePerDayInRange,
  cqDailySeries,
  cqTopCategories,
  cqTotalsCurrentMonth,
  filterCQRegistros,
  type CQDashboardFilterState,
} from "@/lib/cq-stats";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["#22c55e", "#eab308", "#f97316", "#dc2626"];

function targetLabel(r: CQRegistro): string {
  switch (r.target_type) {
    case "order":
      return "Pedido";
    case "order_item":
      return "Item";
    case "purchase_order":
      return "PC compra";
    default:
      return String(r.target_type ?? "—");
  }
}

interface CQDashboardProps {
  companyId: string;
}

export function CQDashboard({ companyId }: CQDashboardProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState<CQRegistro[]>([]);
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [filters, setFilters] = useState<CQDashboardFilterState>({
    lineId: "",
    category: "",
    gravidade: "",
    status: "",
  });

  const load = useCallback(async () => {
    if (!supabase || !companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const since = subDays(new Date(), 130).toISOString();
      const { data, error } = await supabase
        .from("cq_registros")
        .select("*")
        .eq("company_id", companyId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(8000);

      if (error) {
        console.error("[CQDashboard]", error);
        setRegistros([]);
      } else {
        setRegistros((data ?? []) as CQRegistro[]);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodCutoff = useMemo(
    () => subDays(new Date(), periodDays).getTime(),
    [periodDays]
  );

  /** Linha do tempo aplicada aos gráficos e à tabela. */
  const inPeriodRows = useMemo(
    () =>
      registros.filter((r) => {
        const t = new Date(r.created_at).getTime();
        return !Number.isNaN(t) && t >= periodCutoff;
      }),
    [registros, periodCutoff]
  );

  /** Filtros de status e gravidade (sem linha/categoria nesta página). */
  const filteredRows = useMemo(
    () =>
      filterCQRegistros(inPeriodRows, filters, new Map()),
    [inPeriodRows, filters]
  );

  const monthTotals = useMemo(
    () => cqTotalsCurrentMonth(registros, new Date()),
    [registros]
  );

  const avgPerDay = useMemo(
    () =>
      cqAveragePerDayInRange(filteredRows, periodDays, new Date()),
    [filteredRows, periodDays]
  );

  const categoryChart = useMemo(
    () => cqTopCategories(filteredRows, 5),
    [filteredRows]
  );

  const gravChart = useMemo(
    () => cqAggByGravidade(filteredRows),
    [filteredRows]
  );

  const dailySeries = useMemo(
    () => cqDailySeries(filteredRows, periodDays),
    [filteredRows, periodDays]
  );

  const tableRows = useMemo(() => {
    return [...filteredRows]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      )
      .slice(0, 20);
  }, [filteredRows]);

  function gravBadge(g: string) {
    const map: Record<string, string> = {
      baixa: "bg-emerald-100 text-emerald-800",
      media: "bg-amber-100 text-amber-900",
      alta: "bg-orange-100 text-orange-900",
      critica: "bg-red-100 text-red-800",
    };
    return map[g] ?? "bg-slate-100 text-slate-700";
  }

  function statusBadge(r: CQRegistro) {
    return r.resolvido_em
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-rose-50 text-rose-800 border-rose-200";
  }

  if (!supabase) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        CQ Dashboard precisa do Supabase configurado.
      </div>
    );
  }

  if (loading && registros.length === 0) {
    return (
      <div className="flex justify-center py-16 text-sm text-slate-500">
        Carregando ocorrências…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            CQ Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visão consolidada das ocorrências (acesso apenas super admin).
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-[#1B4F72] hover:underline"
          onClick={() => void load()}
        >
          Atualizar
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase">
            Período (gráficos e tabela)
          </label>
          <select
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
            value={periodDays}
            onChange={(e) =>
              setPeriodDays(Number(e.target.value) as 7 | 30 | 90)
            }
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase">
            Situação
          </label>
          <select
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value as CQDashboardFilterState["status"],
              }))
            }
          >
            <option value="">Todas</option>
            <option value="open">Não resolvidas</option>
            <option value="resolved">Resolvidas</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-500 uppercase">
            Gravidade
          </label>
          <select
            className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
            value={filters.gravidade}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                gravidade: e.target.value as "" | CQGravidade,
              }))
            }
          >
            <option value="">Todas</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] text-slate-500 uppercase font-medium">
            Total no mês atual
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {monthTotals.total}
          </div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
          <div className="text-[11px] text-emerald-800 uppercase font-medium">
            Resolvidas (no mês)
          </div>
          <div className="text-2xl font-semibold text-emerald-900">
            {monthTotals.resolved}
          </div>
        </div>
        <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-4 shadow-sm">
          <div className="text-[11px] text-rose-800 uppercase font-medium">
            Não resolvidas (no mês)
          </div>
          <div className="text-2xl font-semibold text-rose-900">
            {monthTotals.open}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] text-slate-500 uppercase font-medium">
            Média por dia ({periodDays} d)
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {avgPerDay}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Com base nos filtros atuais.
          </p>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm min-h-[300px]">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            Top 5 categorias ({periodDays} dias)
          </h2>
          {categoryChart.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">
              Sem dados neste período e filtros.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryChart} margin={{ bottom: 40, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-60" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-28}
                  textAnchor="end"
                  height={70}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}`, "Quantidade"]} />
                <Bar dataKey="total" fill="#1B4F72" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm min-h-[300px]">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            Distribuição por gravidade
          </h2>
          {gravChart.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">
              Sem dados neste período e filtros.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={gravChart}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={88}
                  label={({ name, percent }) =>
                    `${name ?? ""} (${(((percent ?? 0) * 100).toFixed(0))}%)`
                  }
                  labelLine={false}
                  fontSize={11}
                >
                  {gravChart.map((_, i) => (
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                      stroke="#fff"
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [`${v}`, "Ocorrências"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm min-h-[280px]">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">
          Ocorrências por dia ({periodDays} dias)
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={dailySeries}
            margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-60" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9 }}
              interval="preserveStartEnd"
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#1B4F72"
              strokeWidth={2}
              dot={{ r: 3, fill: "#1B4F72" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">
            Últimas 20 ocorrências
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Ordenado por data; aplica período, situação e gravidade selecionados.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[640px]">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">
                  Data
                </th>
                <th className="px-3 py-2 font-semibold">Categoria</th>
                <th className="px-3 py-2 font-semibold">Gravidade</th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">Target</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-slate-500"
                  >
                    Nenhuma ocorrência nos filtros atuais.
                  </td>
                </tr>
              ) : (
                tableRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {format(new Date(r.created_at), "dd/MM/yy HH:mm", {
                        locale: ptBR,
                      })}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900 max-w-[200px]">
                      <span className="block truncate">{r.categoria}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 capitalize border ${gravBadge(r.gravidade)}`}
                      >
                        {r.gravidade}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 capitalize">
                      {r.registered_by_role}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <span className="font-medium">{targetLabel(r)}</span>
                      <span
                        className="block text-[10px] font-mono text-slate-400 truncate max-w-[140px]"
                        title={r.target_id}
                      >
                        {r.target_id.slice(0, 10)}…
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium border capitalize ${statusBadge(r)}`}
                      >
                        {r.resolvido_em ? "Resolvida" : "Aberta"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
