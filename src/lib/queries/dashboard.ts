import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getDashboardData(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const todayIso = new Date().toISOString().split("T")[0];

  const { data: allOrders } = await supabase
    .from("orders")
    .select(
      "id, delivery_deadline, pcp_deadline, production_deadline, status, created_at, finished_at"
    )
    .eq("company_id", companyId);

  const openCount =
    allOrders?.filter((o) => o.status !== "finished").length ?? 0;

  const delayedCount =
    allOrders?.filter((o) => {
      if (o.status === "finished" || !o.production_deadline) return false;
      const prod = new Date(o.production_deadline);
      const delivery = o.delivery_deadline
        ? new Date(o.delivery_deadline)
        : null;
      const pcp = o.pcp_deadline ? new Date(o.pcp_deadline) : null;
      return (delivery && prod > delivery) || (pcp && prod > pcp);
    }).length ?? 0;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const finishedRecent =
    allOrders?.filter(
      (o) =>
        o.status === "finished" &&
        o.finished_at &&
        new Date(o.finished_at) >= ninetyDaysAgo
    ) ?? [];

  const leadTimes = finishedRecent.map((o) => {
    const created = new Date(o.created_at);
    const finished = new Date(o.finished_at!);
    return Math.ceil(
      (finished.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    );
  });

  const avgLeadTime =
    leadTimes.length > 0
      ? (leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length).toFixed(1)
      : "--";

  const onTimeCount = finishedRecent.filter((o) => {
    if (!o.delivery_deadline || !o.finished_at) return false;
    return new Date(o.finished_at) <= new Date(o.delivery_deadline);
  }).length;

  const onTimeRate =
    finishedRecent.length > 0
      ? Math.round((onTimeCount / finishedRecent.length) * 100)
      : 0;

  const { data: lineItems } = await supabase
    .from("order_items")
    .select(
      `
      production_start,
      production_end,
      line_id,
      production_line:production_lines(name)
    `
    )
    .not("production_start", "is", null)
    .not("production_end", "is", null);

  const lineStats: Record<string, { name: string; days: number[] }> = {};
  lineItems?.forEach((item) => {
    if (!item.line_id || !item.production_start || !item.production_end) return;
    if (!lineStats[item.line_id]) {
      lineStats[item.line_id] = {
        name: (item.production_line as any)?.name || "Desconhecida",
        days: [],
      };
    }
    const start = new Date(item.production_start);
    const end = new Date(item.production_end);
    const days = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    lineStats[item.line_id].days.push(days);
  });

  const avgByLine = Object.entries(lineStats).map(([lineId, stat]) => ({
    lineId,
    lineName: stat.name,
    avgDays: Number(
      (stat.days.reduce((a, b) => a + b, 0) / stat.days.length).toFixed(1)
    ),
  }));

  const next30 = new Date();
  next30.setDate(next30.getDate() + 30);

  const { data: scheduledItems } = await supabase
    .from("order_items")
    .select("line_id, production_start, production_end")
    .neq("status", "completed")
    .not("production_start", "is", null)
    .lte("production_start", next30.toISOString().split("T")[0]);

  const occupancy: Record<string, { lineId: string; occupiedDays: number }> =
    {};
  scheduledItems?.forEach((item) => {
    if (!item.line_id || !item.production_start || !item.production_end) return;
    const start = new Date(item.production_start);
    const end = new Date(item.production_end);
    const clampedStart = start < new Date() ? new Date() : start;
    const clampedEnd = end > next30 ? next30 : end;
    const days = Math.max(
      0,
      Math.ceil(
        (clampedEnd.getTime() - clampedStart.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    if (!occupancy[item.line_id]) {
      occupancy[item.line_id] = { lineId: item.line_id, occupiedDays: 0 };
    }
    occupancy[item.line_id].occupiedDays += days;
  });

  const maxDaysWindow = 30;
  const occupancyByLine = Object.values(occupancy).map((o) => ({
    lineId: o.lineId,
    occupancy: Math.min(
      100,
      Math.round((o.occupiedDays / maxDaysWindow) * 100)
    ),
  }));

  const { data: todayItems } = await supabase
    .from("order_items")
    .select(`
      id,
      line_id,
      production_start,
      production_end,
      production_line:production_lines(name)
    `)
    .neq("status", "completed")
    .not("production_start", "is", null)
    .not("production_end", "is", null);

  const todayDate = new Date(todayIso);
  const itemsByLine: Record<string, { name: string; count: number }> = {};
  todayItems?.forEach((item) => {
    if (!item.line_id || !item.production_start || !item.production_end) return;
    const start = new Date(item.production_start);
    const end = new Date(item.production_end);
    if (start <= todayDate && end >= todayDate) {
      if (!itemsByLine[item.line_id]) {
        itemsByLine[item.line_id] = {
          name: (item.production_line as any)?.name || "",
          count: 0,
        };
      }
      itemsByLine[item.line_id].count++;
    }
  });

  const todayByLine = Object.values(itemsByLine);

  // Agrupar taxa de entrega no prazo por semana (últimos 90 dias)
  const weeklyBuckets: Record<
    string,
    { weekStart: Date; total: number; onTime: number }
  > = {};

  finishedRecent.forEach((o) => {
    if (!o.finished_at) return;
    const finishedDate = new Date(o.finished_at);

    // Início da semana (segunda-feira)
    const weekStart = new Date(
      Date.UTC(
        finishedDate.getUTCFullYear(),
        finishedDate.getUTCMonth(),
        finishedDate.getUTCDate()
      )
    );
    const day = weekStart.getUTCDay(); // 0 = domingo
    const diffToMonday = (day + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - diffToMonday);

    const key = weekStart.toISOString().split("T")[0];

    if (!weeklyBuckets[key]) {
      weeklyBuckets[key] = { weekStart, total: 0, onTime: 0 };
    }

    weeklyBuckets[key].total += 1;

    if (o.delivery_deadline) {
      const delivery = new Date(o.delivery_deadline);
      if (finishedDate <= delivery) {
        weeklyBuckets[key].onTime += 1;
      }
    }
  });

  const weeklyOnTimeData = Object.values(weeklyBuckets)
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
    .map((bucket) => {
      const label = bucket.weekStart.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      const rate =
        bucket.total > 0
          ? Math.round((bucket.onTime / bucket.total) * 100)
          : 0;
      return { week: label, rate };
    });

  return {
    openOrders: openCount,
    delayedOrders: delayedCount,
    avgLeadTime,
    onTimeRate,
    avgByLine,
    occupancyByLine,
    todayByLine,
    weeklyOnTimeData,
  };
}

