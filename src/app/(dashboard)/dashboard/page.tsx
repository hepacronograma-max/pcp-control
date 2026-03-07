'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/use-user";
import { getOperatorLineIdsForLocalUser } from "@/lib/local-users";
import type { OrderItem, OrderWithItems, ProductionLine } from "@/lib/types/database";
import { computeDashboardFromOrders } from "@/lib/utils/dashboard-local";
import { KPICard } from "@/components/dashboard/kpi-card";

interface OperatorLineStats {
  lineId: string;
  lineName: string;
  total: number;
  waiting: number;
  scheduled: number;
  completed: number;
}

function computeOperatorStats(
  orders: OrderWithItems[],
  lineIds: string[],
  allLines: ProductionLine[]
) {
  const lineSet = new Set(lineIds);
  const items: (OrderItem & { orderNumber: string; clientName: string; deliveryDeadline: string | null })[] = [];

  for (const order of orders) {
    for (const item of order.items) {
      if (item.line_id && lineSet.has(item.line_id)) {
        items.push({
          ...item,
          orderNumber: order.order_number,
          clientName: order.client_name,
          deliveryDeadline: order.delivery_deadline,
        });
      }
    }
  }

  const total = items.length;
  const waiting = items.filter((i) => i.status === "waiting").length;
  const scheduled = items.filter((i) => i.status === "scheduled").length;
  const completed = items.filter((i) => i.status === "completed").length;

  const today = new Date().toISOString().slice(0, 10);
  const overdue = items.filter(
    (i) =>
      i.status !== "completed" &&
      i.deliveryDeadline &&
      i.deliveryDeadline < today
  ).length;

  const lineStatsMap = new Map<string, OperatorLineStats>();
  for (const lid of lineIds) {
    const line = allLines.find((l) => l.id === lid);
    lineStatsMap.set(lid, {
      lineId: lid,
      lineName: line?.name ?? "Linha",
      total: 0,
      waiting: 0,
      scheduled: 0,
      completed: 0,
    });
  }
  for (const item of items) {
    const stat = lineStatsMap.get(item.line_id!);
    if (!stat) continue;
    stat.total++;
    if (item.status === "waiting") stat.waiting++;
    else if (item.status === "scheduled") stat.scheduled++;
    else if (item.status === "completed") stat.completed++;
  }

  return {
    total,
    waiting,
    scheduled,
    completed,
    overdue,
    lineStats: Array.from(lineStatsMap.values()),
    recentItems: items
      .filter((i) => i.status !== "completed")
      .sort((a, b) => {
        if (!a.deliveryDeadline) return 1;
        if (!b.deliveryDeadline) return -1;
        return a.deliveryDeadline.localeCompare(b.deliveryDeadline);
      })
      .slice(0, 10),
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile, loading } = useUser();

  const isLocal =
    !supabase ||
    profile?.company_id === "local-company" ||
    profile?.id === "local-admin" ||
    profile?.id?.startsWith("local-");

  const isOperator = profile?.role === "operator";

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [allLines, setAllLines] = useState<ProductionLine[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const operatorLineIds = useMemo(() => {
    if (!isOperator || !profile) return [];
    return getOperatorLineIdsForLocalUser(profile.id);
  }, [isOperator, profile]);

  useEffect(() => {
    if (!profile?.company_id) return;
    const companyId = profile.company_id;

    async function loadData() {
      setLoadingData(true);

      if (isLocal) {
        try {
          const raw = window.localStorage.getItem("pcp-local-orders");
          if (raw) {
            setOrders(JSON.parse(raw) as OrderWithItems[]);
          } else {
            setOrders([]);
          }
        } catch {
          setOrders([]);
        }
        try {
          const rawLines = window.localStorage.getItem("pcp-local-lines");
          if (rawLines) {
            setAllLines(JSON.parse(rawLines) as ProductionLine[]);
          }
        } catch {
          setAllLines([]);
        }
        setLoadingData(false);
        return;
      }

      if (!supabase) return;
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, client_name, delivery_deadline, pcp_deadline, production_deadline, status, created_at, finished_at")
        .eq("company_id", companyId)
        .order("delivery_deadline", { ascending: true });

      const ordersWithItems = (data ?? []).map((o) => ({
        ...o,
        items: [],
      })) as unknown as OrderWithItems[];
      setOrders(ordersWithItems);
      setLoadingData(false);
    }

    loadData();
  }, [profile, supabase, isLocal]);

  const dashboard = useMemo(
    () => computeDashboardFromOrders(orders),
    [orders]
  );

  const operatorDash = useMemo(() => {
    if (!isOperator) return null;
    return computeOperatorStats(orders, operatorLineIds, allLines);
  }, [isOperator, orders, operatorLineIds, allLines]);

  const monthYear = useMemo(
    () =>
      new Date().toLocaleDateString("pt-BR", {
        month: "short",
        year: "numeric",
      }),
    []
  );

  if (loading || !profile) {
    return (
      <div className="text-sm text-slate-500">Carregando dashboard...</div>
    );
  }

  if (isOperator && operatorDash) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Meus Itens
            </h1>
            <p className="text-xs text-slate-500">
              Resumo dos itens nas suas linhas de produção
            </p>
          </div>
          <div className="text-xs text-slate-500">
            <span>📅 {monthYear}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard
            title="Total de itens"
            value={loadingData ? "..." : operatorDash.total}
            icon="📦"
          />
          <KPICard
            title="Aguardando"
            value={loadingData ? "..." : operatorDash.waiting}
            icon="⏳"
            variant={operatorDash.waiting > 0 ? "warning" : "default"}
          />
          <KPICard
            title="Programados"
            value={loadingData ? "..." : operatorDash.scheduled}
            icon="📅"
          />
          <KPICard
            title="Concluídos"
            value={loadingData ? "..." : operatorDash.completed}
            icon="✅"
            variant={operatorDash.completed > 0 ? "success" : "default"}
          />
        </div>

        {operatorDash.overdue > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">
              ⚠️ {operatorDash.overdue}{" "}
              {operatorDash.overdue === 1 ? "item atrasado" : "itens atrasados"}
            </p>
          </div>
        )}

        {operatorDash.lineStats.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Por linha de produção
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {operatorDash.lineStats.map((ls) => {
                const pct =
                  ls.total > 0
                    ? Math.round((ls.completed / ls.total) * 100)
                    : 0;
                return (
                  <button
                    key={ls.lineId}
                    onClick={() => router.push(`/linha/${ls.lineId}`)}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm text-left hover:border-[#1B4F72] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {ls.lineName}
                      </span>
                      <span className="text-xs text-slate-500">
                        {ls.total} {ls.total === 1 ? "item" : "itens"}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>
                        {ls.waiting > 0 && (
                          <span className="text-amber-600 font-medium mr-2">
                            {ls.waiting} aguardando
                          </span>
                        )}
                        {ls.scheduled > 0 && (
                          <span className="text-blue-600 font-medium mr-2">
                            {ls.scheduled} programados
                          </span>
                        )}
                      </span>
                      <span className="text-emerald-600 font-medium">
                        {pct}% concluído
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {operatorDash.recentItems.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Próximos itens a produzir
            </h2>
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-3 py-2 text-left font-medium text-slate-600">
                      Pedido
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">
                      Cliente
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">
                      Descrição
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">
                      Qtd
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">
                      Prazo
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {operatorDash.recentItems.map((item) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const isOverdue =
                      item.deliveryDeadline && item.deliveryDeadline < today;
                    return (
                      <tr
                        key={item.id}
                        className={`border-b last:border-0 ${
                          isOverdue ? "bg-red-50" : ""
                        }`}
                      >
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {item.orderNumber}
                        </td>
                        <td className="px-3 py-2 text-slate-600 truncate max-w-[120px]">
                          {item.clientName}
                        </td>
                        <td className="px-3 py-2 text-slate-600 truncate max-w-[180px]" title={item.description}>
                          {item.description}
                        </td>
                        <td className="px-3 py-2 text-center text-slate-700">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {item.deliveryDeadline
                            ? new Date(
                                item.deliveryDeadline + "T00:00:00"
                              ).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                              })
                            : "--"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              item.status === "scheduled"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {item.status === "scheduled"
                              ? "Programado"
                              : "Aguardando"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <div className="text-xs text-slate-500">
          <span>📅 {monthYear}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard
          title="Pedidos em aberto"
          value={loadingData ? "..." : dashboard.openOrders}
          icon="📋"
        />
        <KPICard
          title="Pedidos em atraso"
          value={loadingData ? "..." : dashboard.delayedOrders}
          icon="⏰"
          variant={dashboard.delayedOrders > 0 ? "danger" : "default"}
        />
        <KPICard
          title="Prazo médio"
          value={
            loadingData
              ? "..."
              : dashboard.avgLeadTime === "--"
              ? "--"
              : `${dashboard.avgLeadTime} dias`
          }
          icon="⏱️"
        />
        <KPICard
          title="Entrega no prazo"
          value={loadingData ? "..." : `${dashboard.onTimeRate}%`}
          icon="✅"
          variant={dashboard.onTimeRate >= 80 ? "success" : "warning"}
        />
      </div>
    </section>
  );
}
