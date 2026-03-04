'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/use-user";
import type { OrderWithItems } from "@/lib/types/database";
import { computeDashboardFromOrders } from "@/lib/utils/dashboard-local";
import { KPICard } from "@/components/dashboard/kpi-card";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile, loading } = useUser();

  useEffect(() => {
    if (profile?.role === "operator") {
      router.replace("/pedidos");
    }
  }, [profile, router]);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    const companyId = profile.company_id;

    async function loadData() {
      setLoadingData(true);

      if (!supabase) {
        try {
          const raw = window.localStorage.getItem("pcp-local-orders");
          if (raw) {
            const parsed = JSON.parse(raw) as OrderWithItems[];
            setOrders(parsed);
          } else {
            setOrders([]);
          }
        } catch {
          setOrders([]);
        }
        setLoadingData(false);
        return;
      }

      const { data } = await supabase
        .from("orders")
        .select("id, delivery_deadline, pcp_deadline, production_deadline, status, created_at, finished_at")
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
  }, [profile, supabase]);

  const dashboard = useMemo(
    () => computeDashboardFromOrders(orders),
    [orders]
  );

  const monthYear = useMemo(
    () =>
      new Date().toLocaleDateString("pt-BR", {
        month: "short",
        year: "numeric",
      }),
    []
  );

  if (loading || !profile || profile.role === "operator") {
    return (
      <div className="text-sm text-slate-500">Carregando dashboard...</div>
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
