"use client";

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

interface OperatorKpis {
  total: number;
  waiting: number;
  scheduled: number;
  completed: number;
  delayed: number;
  totalOrders: number;
  delayedOrders: number;
  chartByLine: Array<{
    name: string;
    total: number;
    concluidos: number;
    atrasados: number;
  }>;
  chartByStatus: Array<{ name: string; value: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  Aguardando: "#f59e0b",
  Programados: "#3b82f6",
  Concluídos: "#22c55e",
  "Em atraso": "#ef4444",
};

export function OperatorDashboard() {
  const [kpis, setKpis] = useState<OperatorKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/operator-dashboard", { credentials: "include" })
      .then(async (r) => {
        const data = (await r.json()) as OperatorKpis & { error?: string };
        if (!r.ok || data.error) {
          setKpis(null);
          setLoading(false);
          return;
        }
        if (data.total === undefined) {
          setKpis(null);
          setLoading(false);
          return;
        }
        setKpis({
          total: data.total,
          waiting: data.waiting,
          scheduled: data.scheduled,
          completed: data.completed,
          delayed: data.delayed ?? 0,
          totalOrders: data.totalOrders ?? 0,
          delayedOrders: data.delayedOrders ?? 0,
          chartByLine: data.chartByLine ?? [],
          chartByStatus: data.chartByStatus ?? [],
        });
        setLoading(false);
      })
      .catch(() => {
        setKpis(null);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">Carregando...</p>
    );
  }

  if (!kpis) {
    return null;
  }

  const now = new Date();
  const monthYear = now.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });

  const pieData = kpis.chartByStatus.filter((s) => s.value > 0);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Meus Itens</h1>
          <p className="text-sm text-slate-500 mt-1">
            Resumo dos itens nas suas linhas de produção
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
          <span>📅 {monthYear}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        <KPICard title="Total de pedidos" value={kpis.totalOrders} icon="📋" />
        <KPICard
          title="Pedidos em atraso"
          value={kpis.delayedOrders}
          icon="⏰"
          variant={kpis.delayedOrders > 0 ? "danger" : "default"}
        />
        <KPICard title="Total de itens" value={kpis.total} icon="📦" />
        <KPICard
          title="Itens em atraso"
          value={kpis.delayed}
          icon="🔴"
          variant={kpis.delayed > 0 ? "danger" : "default"}
        />
        <KPICard title="Aguardando" value={kpis.waiting} icon="⏳" />
        <KPICard title="Programados" value={kpis.scheduled} icon="📅" />
        <KPICard
          title="Concluídos"
          value={kpis.completed}
          icon="✅"
          variant={kpis.completed > 0 ? "success" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            Itens por Linha de Produção
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={kpis.chartByLine}
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
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            Distribuição por Status
          </h3>
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
    </section>
  );
}
