"use client";

import { useEffect, useState } from "react";
import type { DashboardData } from "@/lib/queries/dashboard";
import { KPICard } from "./kpi-card";
import { LineMetrics } from "./line-metrics";
import { OnTimeChart } from "./on-time-chart";

interface ManagerDashboardProps {
  companyId: string;
}

export function ManagerDashboard({ companyId }: ManagerDashboardProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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
          setDashboard(data as DashboardData);
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
  const monthYear = now.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });

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
      <LineMetrics
        avgByLine={dashboard.avgByLine}
        occupancyByLine={dashboard.occupancyByLine}
        todayByLine={dashboard.todayByLine}
      />
      <OnTimeChart data={dashboard.weeklyOnTimeData} />
    </section>
  );
}
