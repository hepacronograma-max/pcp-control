"use client";

import { format } from "date-fns";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KPICard } from "./kpi-card";
import { formatShortDate } from "@/lib/utils/date";

interface ComprasDashboardPayload {
  openPurchaseOrders: number;
  delayedPurchaseOrders: number;
  avgLeadTime: string;
  onTimeRate: number;
  chartByPcStatus?: { name: string; value: number }[];
  chartSuppliersOpen?: { name: string; total: number }[];
  delayedPcList?: {
    id: string;
    number: string;
    supplier_name: string | null;
    expected_delivery: string | null;
    follow_up_date: string | null;
    overdue_days: number;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  Abertos: "#f59e0b",
  Recebidos: "#22c55e",
  Cancelados: "#94a3b8",
};

interface ComprasDashboardProps {
  companyId: string;
}

export function ComprasDashboard({ companyId }: ComprasDashboardProps) {
  const [data, setData] = useState<ComprasDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(
      `/api/compras-dashboard?companyId=${encodeURIComponent(companyId)}`,
      { credentials: "include" }
    )
      .then((r) => r.json())
      .then((json) => {
        if (json?.error) setData(null);
        else setData(json as ComprasDashboardPayload);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [companyId]);

  if (loading) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">Carregando...</p>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-red-500 text-center py-8">
        Erro ao carregar dados de compras.
      </p>
    );
  }

  const now = new Date();
  const monthYear = format(now, "d/M/yy");
  const pieRaw = (data.chartByPcStatus ?? []).filter((s) => s.value > 0);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-slate-900">
          Dashboard — Compras
        </h1>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>📅 {monthYear}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard
          title="PCs em aberto"
          value={data.openPurchaseOrders}
          icon="📋"
        />
        <KPICard
          title="PCs em atraso"
          hint="Abertos com previsão ou follow-up vencidos."
          value={data.delayedPurchaseOrders}
          icon="⏰"
          variant={data.delayedPurchaseOrders > 0 ? "danger" : "default"}
        />
        <KPICard
          title="Lead time médio"
          hint="Média em dias (criado → atualizado) dos PCs recebidos nos últimos 90 dias."
          value={
            data.avgLeadTime === "--" ? "--" : `${data.avgLeadTime} dias`
          }
          icon="⏱️"
        />
        <KPICard
          title="Recebidos no prazo"
          hint="% dos PCs recebidos (90 dias) com data de atualização até a previsão de entrega."
          value={`${data.onTimeRate}%`}
          icon="✅"
          variant={data.onTimeRate >= 80 ? "success" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              PCs em aberto por fornecedor
            </h3>
            {(data.chartSuppliersOpen ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                Nenhum PC em aberto.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data.chartSuppliersOpen ?? []}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 8, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="total"
                    name="PCs abertos"
                    fill="#1B4F72"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">
              Situação dos pedidos de compra
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">
              Total de registros por status no período carregado.
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieRaw}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={92}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieRaw.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.name] || "#64748b"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <DelayedPCsSidebar items={data.delayedPcList ?? []} />
      </div>
    </section>
  );
}

function DelayedPCsSidebar({
  items,
}: {
  items: NonNullable<ComprasDashboardPayload["delayedPcList"]>;
}) {
  function deadlineLabel(po: (typeof items)[number]): string {
    const raw = po.expected_delivery || po.follow_up_date;
    if (!raw) return "—";
    const s = formatShortDate(raw);
    return s === "--" ? "—" : s;
  }

  function badgeClass(days: number) {
    if (days >= 16) return "bg-red-100 text-red-800 border border-red-200";
    if (days >= 8) return "bg-orange-100 text-orange-800 border border-orange-200";
    return "bg-amber-100 text-amber-800 border border-amber-100";
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 max-h-[640px] overflow-y-auto">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        PCs em atraso ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum PC em atraso.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((po) => (
            <li
              key={po.id}
              className="flex items-start justify-between gap-2 p-2 rounded bg-slate-50 border border-slate-100"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-slate-800 font-mono">
                  PC {po.number}
                </span>
                <p className="text-xs text-slate-500 truncate max-w-[200px]">
                  {po.supplier_name || "—"}
                </p>
              </div>
              <div className="text-right flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                  Prazo / follow-up
                </span>
                <span className="text-xs text-slate-600 font-medium tabular-nums whitespace-nowrap">
                  {deadlineLabel(po)}
                </span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badgeClass(
                    po.overdue_days
                  )}`}
                >
                  {po.overdue_days}{" "}
                  {po.overdue_days === 1 ? "dia" : "dias"} em atraso
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
