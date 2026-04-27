"use client";

import { format } from "date-fns";
import { useEffect, useState } from "react";
import type { DashboardData } from "@/lib/queries/dashboard";
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
import { DelayedOrdersSidebar } from "./delayed-orders-sidebar";
import { KPICard } from "./kpi-card";
import { LineMetrics } from "./line-metrics";
import { OnTimeChart } from "./on-time-chart";

interface ChartByLineRow {
  name: string;
  total: number;
  concluidos: number;
  atrasados: number;
}

interface ChartByStatusRow {
  name: string;
  value: number;
}

interface DelayedOrderListItem {
  id: string;
  order_number: string;
  client_name: string | null;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  status: string;
}

type ManagerDashboardData = DashboardData & {
  chartByLine?: ChartByLineRow[];
  chartByStatus?: ChartByStatusRow[];
  delayedOrdersList?: DelayedOrderListItem[];
};

const STATUS_COLORS: Record<string, string> = {
  Aguardando: "#f59e0b",
  Programados: "#3b82f6",
  Concluídos: "#22c55e",
  "Em atraso": "#ef4444",
};

interface ManagerDashboardProps {
  companyId: string;
}

export function ManagerDashboard({ companyId }: ManagerDashboardProps) {
  const [dashboard, setDashboard] = useState<ManagerDashboardData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [includeCompletedInStatusDonut, setIncludeCompletedInStatusDonut] =
    useState(false);

  useEffect(() => {
    fetch(
      `/api/manager-dashboard?companyId=${encodeURIComponent(companyId)}`,
      { credentials: "include" }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) {
          setDashboard(null);
        } else {
          setDashboard(data as ManagerDashboardData);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [companyId]);

  if (loading) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">Carregando...</p>
    );
  }

  if (!dashboard) {
    return (
      <p className="text-sm text-red-500 text-center py-8">
        Erro ao carregar dados.
      </p>
    );
  }

  const now = new Date();
  const monthYear = format(now, "d/M/yy");

  const pieDataRaw = (dashboard.chartByStatus ?? []).filter(
    (s) => s.value > 0
  );
  const pieData = includeCompletedInStatusDonut
    ? pieDataRaw
    : pieDataRaw.filter((s) => s.name !== "Concluídos");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>📅 {monthYear}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard
          title="Pedidos em aberto"
          value={dashboard.openOrders}
          icon="📋"
        />
        <KPICard
          title="Pedidos atrasados"
          value={dashboard.delayedOrders}
          icon="⏰"
          variant={dashboard.delayedOrders > 0 ? "danger" : "default"}
        />
        <KPICard
          title="Lead time médio"
          hint="Média de dias (criado → finalizado) dos pedidos concluídos nos últimos 90 dias, na empresa."
          value={
            dashboard.avgLeadTime === "--"
              ? "--"
              : `${dashboard.avgLeadTime} dias`
          }
          icon="⏱️"
        />
        <KPICard
          title="Entrega no prazo"
          value={`${dashboard.onTimeRate}%`}
          icon="✅"
          variant={dashboard.onTimeRate >= 80 ? "success" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Itens por Linha de Produção
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={dashboard.chartByLine ?? []}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="total"
                  name="Total"
                  fill="#64748b"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="concluidos"
                  name="Concluídos"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="atrasados"
                  name="Atrasados"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">
                  Distribuição de Itens por Status
                </h3>
                <p className="text-[11px] text-slate-500">
                  Itens (não pedidos). “Em atraso” = produção atrasada ou
                  pedido com prazo vencido (cada item em aberto conta).
                </p>
              </div>
              <label className="flex items-center gap-2 shrink-0 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={includeCompletedInStatusDonut}
                  onChange={(e) =>
                    setIncludeCompletedInStatusDonut(e.target.checked)
                  }
                />
                <span>Incluir concluídos</span>
              </label>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.name] || "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <DelayedOrdersSidebar items={dashboard.delayedOrdersList ?? []} />
      </div>

      <LineMetrics
        avgByLine={dashboard.avgByLine}
        orderLeadTimeByLine={dashboard.orderLeadTimeByLine ?? []}
        suggestedPrazoNovosItensByLine={dashboard.suggestedPrazoNovosItensByLine ?? []}
        occupancyByLine={dashboard.occupancyByLine}
        todayByLine={dashboard.todayByLine}
      />
      <OnTimeChart data={dashboard.weeklyOnTimeData} />
    </section>
  );
}
