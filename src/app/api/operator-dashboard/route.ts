import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  orderAppliesToDashboardDelayKpi,
  orderItemInDashboardAtrasoStatusPiece,
} from "@/lib/utils/order-aggregates";
import { NextResponse } from "next/server";

type DelayedOrderRow = {
  id: string;
  order_number: string;
  client_name: string | null;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  status: string;
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: opLines } = await supabase
    .from("operator_lines")
    .select("line_id")
    .eq("user_id", user.id);

  const lineIds = [
    ...new Set(
      (opLines ?? [])
        .map((r) => r.line_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  if (lineIds.length === 0) {
    return NextResponse.json({
      total: 0,
      waiting: 0,
      scheduled: 0,
      completed: 0,
      delayed: 0,
      totalOrders: 0,
      delayedOrders: 0,
      delayedOrdersList: [] as DelayedOrderRow[],
      chartByLine: [],
      chartByStatus: [
        { name: "Aguardando", value: 0 },
        { name: "Programados", value: 0 },
        { name: "Concluídos", value: 0 },
        { name: "Em atraso", value: 0 },
      ],
    });
  }

  const { data: lines } = await supabase
    .from("production_lines")
    .select("id, name")
    .in("id", lineIds);

  const lineNameMap: Record<string, string> = {};
  for (const line of lines ?? []) {
    lineNameMap[line.id] = line.name;
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("id, status, line_id, order_id, production_end")
    .in("line_id", lineIds);

  const rows = items ?? [];

  const orderIdList = [
    ...new Set(rows.map((r) => r.order_id).filter((id): id is string => !!id)),
  ];
  const orderById = new Map<
    string,
    {
      id: string;
      order_number: string;
      client_name: string | null;
      delivery_deadline: string | null;
      pcp_deadline: string | null;
      status: string;
    }
  >();

  if (orderIdList.length > 0) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select(
        "id, order_number, client_name, delivery_deadline, pcp_deadline, status"
      )
      .in("id", orderIdList);
    for (const o of orderRows ?? []) orderById.set(o.id, o);
  }

  const lineIdSet = new Set(lineIds);
  const itemsByOrderFull = new Map<
    string,
    { line_id: string | null; status: string; production_end: string | null }[]
  >();
  if (orderIdList.length > 0) {
    const { data: allOrderItems } = await supabase
      .from("order_items")
      .select("order_id, line_id, status, production_end")
      .in("order_id", orderIdList);
    for (const it of allOrderItems ?? []) {
      if (!it.order_id) continue;
      const list = itemsByOrderFull.get(it.order_id) ?? [];
      list.push({
        line_id: it.line_id,
        status: it.status,
        production_end: it.production_end,
      });
      itemsByOrderFull.set(it.order_id, list);
    }
  }

  const delayedOrderIds = new Set<string>();
  for (const oid of orderIdList) {
    const o = orderById.get(oid);
    if (!o || o.status === "finished") continue;
    const full = itemsByOrderFull.get(oid) ?? [];
    if (!full.some((it) => it.line_id && lineIdSet.has(it.line_id))) continue;
    if (
      orderAppliesToDashboardDelayKpi(
        {
          status: o.status,
          delivery_deadline: o.delivery_deadline,
          pcp_deadline: o.pcp_deadline,
        },
        full.map((it) => ({ status: it.status, production_end: it.production_end }))
      )
    ) {
      delayedOrderIds.add(oid);
    }
  }

  let waiting = 0;
  let scheduled = 0;
  let completed = 0;
  let delayed = 0;
  const orderIds = new Set<string>();

  const byLine: Record<
    string,
    { total: number; completed: number; delayed: number }
  > = {};

  for (const row of rows) {
    if (row.order_id) orderIds.add(row.order_id);

    const ord = row.order_id ? orderById.get(row.order_id) : undefined;
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

  const chartByLine = Object.entries(byLine).map(([lineId, counts]) => ({
    name: lineNameMap[lineId] || lineId.slice(0, 8),
    total: counts.total,
    concluidos: counts.completed,
    atrasados: counts.delayed,
  }));

  const delayedOrdersList: DelayedOrderRow[] = [...delayedOrderIds]
    .map((id) => orderById.get(id))
    .filter((o): o is NonNullable<typeof o> => !!o && o.status !== "finished")
    .sort((a, b) => {
      const dateA = a.delivery_deadline || a.pcp_deadline || "";
      const dateB = b.delivery_deadline || b.pcp_deadline || "";
      return dateA.localeCompare(dateB);
    });

  return NextResponse.json({
    total: rows.length,
    waiting,
    scheduled,
    completed,
    delayed,
    totalOrders: orderIds.size,
    delayedOrders: delayedOrderIds.size,
    delayedOrdersList,
    chartByLine,
    chartByStatus: [
      { name: "Aguardando", value: waiting },
      { name: "Programados", value: scheduled },
      { name: "Concluídos", value: completed },
      { name: "Em atraso", value: delayed },
    ],
  });
}
