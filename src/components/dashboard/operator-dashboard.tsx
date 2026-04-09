"use client";

import { useEffect, useState } from "react";
import { KPICard } from "./kpi-card";

interface OperatorKpis {
  total: number;
  waiting: number;
  scheduled: number;
  completed: number;
  delayed: number;
  totalOrders: number;
  delayedOrders: number;
}

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
    </section>
  );
}
