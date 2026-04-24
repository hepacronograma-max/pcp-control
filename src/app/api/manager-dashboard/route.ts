import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/queries/dashboard";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  orderAppliesToDashboardDelayKpi,
  orderItemInDashboardAtrasoStatusPiece,
} from "@/lib/utils/order-aggregates";

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
  const { data: lines } = await supabase
    .from("production_lines")
    .select("id, name")
    .eq("company_id", companyId);

  const lineNameMap: Record<string, string> = {};
  for (const line of lines ?? []) {
    lineNameMap[line.id] = line.name;
  }

  // Busca todos os pedidos da empresa (inclui finalizados para referência do
  // `chartByStatus` de itens; itens de pedidos finalizados entram como
  // "Concluídos" se estiverem completos).
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, client_name, delivery_deadline, pcp_deadline, status"
    )
    .eq("company_id", companyId);

  const orderList = orders ?? [];
  const orderIds = orderList.map((o) => o.id);
  type OrderRow = (typeof orderList)[number];
  const orderMap = new Map<string, OrderRow>();
  for (const o of orderList) orderMap.set(o.id, o);

  let waiting = 0;
  let scheduled = 0;
  let completed = 0;
  let delayed = 0;

  const byLine: Record<
    string,
    { total: number; completed: number; delayed: number }
  > = {};

  const delayedOrderIds = new Set<string>();

  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("id, status, line_id, order_id, production_end")
      .in("order_id", orderIds);

    const byOrder: Record<string, { status: string; production_end: string | null }[]> = {};
    for (const it of items ?? []) {
      if (!it.order_id) continue;
      if (!byOrder[it.order_id]) byOrder[it.order_id] = [];
      byOrder[it.order_id]!.push({
        status: it.status,
        production_end: it.production_end,
      });
    }

    for (const o of orderList) {
      if (o.status === "finished") continue;
      const list = byOrder[o.id] ?? [];
      if (
        orderAppliesToDashboardDelayKpi(
          {
            status: o.status,
            delivery_deadline: o.delivery_deadline,
            pcp_deadline: o.pcp_deadline,
          },
          list
        )
      ) {
        delayedOrderIds.add(o.id);
      }
    }

    for (const row of items ?? []) {
      const ord = row.order_id ? orderMap.get(row.order_id) : undefined;
      const isDelayed =
        !!ord &&
        orderItemInDashboardAtrasoStatusPiece(
          { status: row.status, production_end: row.production_end },
          {
            status: ord.status,
            delivery_deadline: ord.delivery_deadline,
            pcp_deadline: ord.pcp_deadline,
          }
        );

      // Categorias mutuamente exclusivas:
      let bucket: "waiting" | "scheduled" | "completed" | "delayed";
      if (row.status === "completed") bucket = "completed";
      else if (isDelayed) bucket = "delayed";
      else if (row.status === "scheduled") bucket = "scheduled";
      else bucket = "waiting";

      if (bucket === "waiting") waiting++;
      else if (bucket === "scheduled") scheduled++;
      else if (bucket === "completed") completed++;
      else delayed++;

      if (row.line_id) {
        if (!byLine[row.line_id]) {
          byLine[row.line_id] = { total: 0, completed: 0, delayed: 0 };
        }
        byLine[row.line_id].total++;
        if (bucket === "completed") byLine[row.line_id].completed++;
        else if (bucket === "delayed") byLine[row.line_id].delayed++;
      }
    }
  }

  const chartByLine: ChartByLineRow[] = Object.entries(byLine).map(
    ([lineId, counts]) => ({
      name: lineNameMap[lineId] || lineId.slice(0, 8),
      total: counts.total,
      concluidos: counts.completed,
      atrasados: counts.delayed,
    })
  );

  const chartByStatus: ChartByStatusRow[] = [
    { name: "Aguardando", value: waiting },
    { name: "Programados", value: scheduled },
    { name: "Concluídos", value: completed },
    { name: "Em atraso", value: delayed },
  ];

  const delayedOrdersList = [...delayedOrderIds]
    .map((id) => orderMap.get(id))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .sort((a, b) => {
      const dateA = a.delivery_deadline || a.pcp_deadline || "";
      const dateB = b.delivery_deadline || b.pcp_deadline || "";
      return dateA.localeCompare(dateB);
    }) as DelayedOrderRow[];

  return {
    chartByLine,
    chartByStatus,
    delayedOrdersList,
  };
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

  const supabase = await createServerSupabaseClient();
  const [data, extras] = await Promise.all([
    getDashboardData(companyId),
    getManagerDashboardExtras(supabase, companyId),
  ]);
  return NextResponse.json({ ...data, ...extras });
}
