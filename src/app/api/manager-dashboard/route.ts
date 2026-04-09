import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/queries/dashboard";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

type ChartByLineRow = {
  name: string;
  total: number;
  concluidos: number;
  atrasados: number;
};

type ChartByStatusRow = { name: string; value: number };

type DelayedOrderRow = {
  id: string;
  order_number: string;
  client_name: string | null;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  status: string;
};

async function getManagerDashboardExtras(
  supabase: SupabaseClient,
  companyId: string
): Promise<{
  chartByLine: ChartByLineRow[];
  chartByStatus: ChartByStatusRow[];
  delayedOrdersList: DelayedOrderRow[];
}> {
  let chartByLine: ChartByLineRow[] = [];
  let chartByStatus: ChartByStatusRow[] = [];

  const { data: lines } = await supabase
    .from("production_lines")
    .select("id, name")
    .eq("company_id", companyId);

  const lineIds = (lines ?? []).map((l) => l.id);
  const lineNameMap: Record<string, string> = {};
  for (const line of lines ?? []) {
    lineNameMap[line.id] = line.name;
  }

  if (lineIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("id, status, line_id, pcp_deadline, production_end")
      .in("line_id", lineIds);

    const todayStr = new Date().toISOString().split("T")[0];
    const byLine: Record<
      string,
      { total: number; completed: number; delayed: number }
    > = {};
    let waiting = 0;
    let scheduled = 0;
    let completed = 0;
    let delayed = 0;

    for (const row of items ?? []) {
      if (row.line_id) {
        if (!byLine[row.line_id]) {
          byLine[row.line_id] = { total: 0, completed: 0, delayed: 0 };
        }
        byLine[row.line_id].total++;
      }

      if (row.status === "waiting") waiting++;
      else if (row.status === "scheduled") scheduled++;
      else if (row.status === "completed") {
        completed++;
        if (row.line_id) byLine[row.line_id].completed++;
        continue;
      }

      if (row.status !== "completed") {
        const isDelayed =
          (row.pcp_deadline && row.pcp_deadline < todayStr) ||
          (row.production_end && row.production_end < todayStr);
        if (isDelayed) {
          delayed++;
          if (row.line_id) byLine[row.line_id].delayed++;
        }
      }
    }

    chartByLine = Object.entries(byLine).map(([lineId, counts]) => ({
      name: lineNameMap[lineId] || lineId.slice(0, 8),
      total: counts.total,
      concluidos: counts.completed,
      atrasados: counts.delayed,
    }));

    chartByStatus = [
      { name: "Aguardando", value: waiting },
      { name: "Programados", value: scheduled },
      { name: "Concluídos", value: completed },
      { name: "Em atraso", value: delayed },
    ];
  }

  const todayStr2 = new Date().toISOString().split("T")[0];
  const { data: allOrders } = await supabase
    .from("orders")
    .select(
      "id, order_number, client_name, delivery_deadline, pcp_deadline, status"
    )
    .eq("company_id", companyId)
    .neq("status", "finished");

  const delayedOrdersList = (allOrders ?? [])
    .filter((o) => {
      if (o.delivery_deadline && o.delivery_deadline < todayStr2) return true;
      if (o.pcp_deadline && o.pcp_deadline < todayStr2) return true;
      return false;
    })
    .sort((a, b) => {
      const dateA = a.delivery_deadline || a.pcp_deadline || "";
      const dateB = b.delivery_deadline || b.pcp_deadline || "";
      return dateA.localeCompare(dateB);
    }) as DelayedOrderRow[];

  return { chartByLine, chartByStatus, delayedOrdersList };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  if (cookieStore.get("pcp-local-auth")?.value !== "1") {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json({ error: "no company" }, { status: 403 });
    }

    if (
      companyId !== profile.company_id &&
      profile.role !== "super_admin"
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const data = await getDashboardData(companyId);
  const supabase = await createServerSupabaseClient();
  const extras = await getManagerDashboardExtras(supabase, companyId);
  return NextResponse.json({ ...data, ...extras });
}
