import {
  getDashboardData,
  getOperatorDashboardKpis,
} from "@/lib/queries/dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KPICard } from "@/components/dashboard/kpi-card";
import { LineMetrics } from "@/components/dashboard/line-metrics";
import { OnTimeChart } from "@/components/dashboard/on-time-chart";

export const dynamic = "force-dynamic";

export default async function DashboardIndexPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("DASHBOARD - user:", user?.id, user?.email);

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  console.log("DASHBOARD - profile:", JSON.stringify(profile));

  if (!profile?.company_id) {
    redirect("/login");
  }

  const now = new Date();
  const monthYear = now.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });

  if (profile.role === "operator") {
    console.log("DASHBOARD - é operador, chamando KPIs para user:", user.id);

    const kpis = await getOperatorDashboardKpis(user.id);

    console.log("DASHBOARD - kpis:", JSON.stringify(kpis));

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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KPICard title="Total de itens" value={kpis.total} icon="📦" />
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

  const dashboard = await getDashboardData(profile.company_id);

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
