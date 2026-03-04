import { getDashboardData } from "@/lib/queries/dashboard";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KPICard } from "@/components/dashboard/kpi-card";
import { LineMetrics } from "@/components/dashboard/line-metrics";
import { OnTimeChart } from "@/components/dashboard/on-time-chart";

export default async function DashboardIndexPage() {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) {
    redirect("/login");
  }

  if (profile.role === "operator") {
    redirect("/pedidos");
  }

  const dashboard = await getDashboardData(profile.company_id);
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


