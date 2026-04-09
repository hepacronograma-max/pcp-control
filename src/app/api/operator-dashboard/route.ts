import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    .select("id, status, line_id, order_id, pcp_deadline, production_end")
    .in("line_id", lineIds);

  const rows = items ?? [];
  const today = new Date().toISOString().split("T")[0];

  let waiting = 0;
  let scheduled = 0;
  let completed = 0;
  let delayed = 0;
  const orderIds = new Set<string>();
  const delayedOrderIds = new Set<string>();

  const byLine: Record<
    string,
    { total: number; completed: number; delayed: number }
  > = {};

  for (const row of rows) {
    if (row.order_id) orderIds.add(row.order_id);

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
      if (row.line_id) {
        if (!byLine[row.line_id]) {
          byLine[row.line_id] = { total: 0, completed: 0, delayed: 0 };
        }
        byLine[row.line_id].completed++;
      }
      continue;
    }

    if (row.status !== "completed") {
      const isDelayed =
        (row.pcp_deadline && row.pcp_deadline < today) ||
        (row.production_end && row.production_end < today);
      if (isDelayed) {
        delayed++;
        if (row.order_id) delayedOrderIds.add(row.order_id);
        if (row.line_id) {
          if (!byLine[row.line_id]) {
            byLine[row.line_id] = { total: 0, completed: 0, delayed: 0 };
          }
          byLine[row.line_id].delayed++;
        }
      }
    }
  }

  const chartByLine = Object.entries(byLine).map(([lineId, counts]) => ({
    name: lineNameMap[lineId] || lineId.slice(0, 8),
    total: counts.total,
    concluidos: counts.completed,
    atrasados: counts.delayed,
  }));

  return NextResponse.json({
    total: rows.length,
    waiting,
    scheduled,
    completed,
    delayed,
    totalOrders: orderIds.size,
    delayedOrders: delayedOrderIds.size,
    chartByLine,
    chartByStatus: [
      { name: "Aguardando", value: waiting },
      { name: "Programados", value: scheduled },
      { name: "Concluídos", value: completed },
      { name: "Em atraso", value: delayed },
    ],
  });
}
