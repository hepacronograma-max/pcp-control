import { format } from "date-fns";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { productionLineIsAlmoxarifado } from "@/lib/supabase/sync-almoxarifado-on-program";
import {
  addLocalCalendarDays,
  countBusinessDaysInclusive,
  formatPrazoSugeridoDiasUteis,
  normalizePrazoSugeridoDiasUteisDisplay,
} from "@/lib/utils/date";
import { orderAppliesToDashboardDelayKpi } from "@/lib/utils/order-aggregates";

export async function getDashboardData(companyId: string) {
  const supabase = await createServerSupabaseClient();
  const todayIso = new Date().toISOString().split("T")[0];

  // Queries independentes em paralelo. As que dependem de `allOrders`
  // (itemsForDelayed) são aguardadas depois.
  const [ordersRes, lineItemsRes, scheduledItemsRes, todayItemsRes] =
    await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, delivery_deadline, pcp_deadline, production_deadline, status, created_at, finished_at"
        )
        .eq("company_id", companyId),
      supabase
        .from("order_items")
        .select(
          `production_start, production_end, line_id, production_line:production_lines(name)`
        )
        .not("production_start", "is", null)
        .not("production_end", "is", null),
      (() => {
        const next30 = new Date();
        next30.setDate(next30.getDate() + 30);
        return supabase
          .from("order_items")
          .select("line_id, production_start, production_end")
          .neq("status", "completed")
          .not("production_start", "is", null)
          .lte("production_start", next30.toISOString().split("T")[0]);
      })(),
      supabase
        .from("order_items")
        .select(
          `id, line_id, production_start, production_end, production_line:production_lines(name)`
        )
        .neq("status", "completed")
        .not("production_start", "is", null)
        .not("production_end", "is", null),
    ]);

  const allOrders = ordersRes.data;
  const lineItems = lineItemsRes.data;
  const scheduledItems = scheduledItemsRes.data;
  const todayItems = todayItemsRes.data;

  const openCount =
    allOrders?.filter((o) => o.status !== "finished").length ?? 0;

  const openOrderIds = (allOrders ?? [])
    .filter((o) => o.status !== "finished")
    .map((o) => o.id);

  let delayedCount = 0;
  if (openOrderIds.length > 0) {
    const { data: openItems } = await supabase
      .from("order_items")
      .select("order_id, status, production_end")
      .in("order_id", openOrderIds);

    const byOrder = new Map<string, { status: string; production_end: string | null }[]>();
    for (const it of openItems ?? []) {
      if (!it.order_id) continue;
      const list = byOrder.get(it.order_id) ?? [];
      list.push({ status: it.status, production_end: it.production_end });
      byOrder.set(it.order_id, list);
    }

    for (const o of allOrders ?? []) {
      if (o.status === "finished") continue;
      const items = byOrder.get(o.id) ?? [];
      if (
        orderAppliesToDashboardDelayKpi(
          {
            status: o.status,
            delivery_deadline: o.delivery_deadline,
            pcp_deadline: o.pcp_deadline,
          },
          items
        )
      ) {
        delayedCount++;
      }
    }
  }

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

  // Compara somente a parte de data (YYYY-MM-DD) para evitar que um pedido
  // finalizado no mesmo dia do prazo seja contado como atrasado apenas
  // porque o timestamp do finished_at é depois da meia-noite.
  const onTimeCount = finishedRecent.filter((o) => {
    if (!o.delivery_deadline || !o.finished_at) return false;
    const finishedDateStr = new Date(o.finished_at).toISOString().split("T")[0];
    return finishedDateStr <= o.delivery_deadline;
  }).length;

  const onTimeRate =
    finishedRecent.length > 0
      ? Math.round((onTimeCount / finishedRecent.length) * 100)
      : 0;

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

  // Lead time do **pedido** (criação → finalizado) por linha, só pedidos
  // finalizados nos últimos 90 dias; cada (pedido, linha) conta uma vez.
  let orderLeadTimeByLine: {
    lineId: string;
    lineName: string;
    avgDays: number;
  }[] = [];
  if (finishedRecent.length > 0) {
    const finIds = finishedRecent.map((o) => o.id);
    const { data: oiForLead } = await supabase
      .from("order_items")
      .select("order_id, line_id, production_line:production_lines(name)")
      .in("order_id", finIds);
    const orderToLead = new Map(
      finishedRecent.map((o) => {
        const lead = Math.ceil(
          (new Date(o.finished_at!).getTime() -
            new Date(o.created_at).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        return [o.id, lead];
      })
    );
    const acc: Record<string, { name: string; days: number[] }> = {};
    const seen = new Set<string>();
    for (const row of oiForLead ?? []) {
      if (!row.line_id || !row.order_id) continue;
      const u = `${row.order_id}|${row.line_id}`;
      if (seen.has(u)) continue;
      seen.add(u);
      const lead = orderToLead.get(row.order_id);
      if (lead === undefined) continue;
      if (!acc[row.line_id]) {
        acc[row.line_id] = {
          name: (row.production_line as { name?: string } | null)?.name || "",
          days: [],
        };
      }
      acc[row.line_id].days.push(lead);
    }
    orderLeadTimeByLine = Object.entries(acc)
      .map(([lineId, s]) => ({
        lineId,
        lineName: s.name || lineId.slice(0, 8),
        avgDays: Number(
          (s.days.reduce((a, b) => a + b, 0) / s.days.length).toFixed(1)
        ),
      }))
      .sort((a, b) => a.lineName.localeCompare(b.lineName, "pt-BR"));
  }

  // Prazo sugerido p/ novos itens: prazo de entrega (ou PCP) do pedido cujo
  // item tem o maior fim de produção na fila, por linha, + 2 dias corridos.
  // A UI mostra a margem em dias úteis (hoje → data alvo, excl. fim de semana e feriados).
  const [
    { data: plinesForPrazo },
    { data: openRowItems },
    { data: companyHolidaysData },
  ] = await Promise.all([
    supabase
      .from("production_lines")
      .select("id, name, sort_order, is_almoxarifado")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("order_items")
      .select(
        "line_id, production_end, order_id, orders!inner(company_id, delivery_deadline, pcp_deadline)"
      )
      .eq("orders.company_id", companyId)
      .neq("status", "completed")
      .not("line_id", "is", null)
      .not("production_end", "is", null),
    supabase
      .from("holidays")
      .select("date, is_recurring")
      .eq("company_id", companyId),
  ]);

  const companyHolidays = (companyHolidaysData ?? []) as {
    date: string;
    is_recurring: boolean;
  }[];

  type OpenRow = NonNullable<typeof openRowItems>[number];
  const bestByLine: Record<string, { maxEnd: string; row: OpenRow }> = {};
  for (const it of openRowItems ?? []) {
    const e = it.production_end;
    const lid = it.line_id;
    if (!e || !lid) continue;
    const prev = bestByLine[lid];
    if (!prev || e > prev.maxEnd) bestByLine[lid] = { maxEnd: e, row: it };
  }

  /** Hoje (calendário local) como base 0; +2 dias alinha com a regra “prazo + 2” quando não há fila. */
  const todayLocalYmd = format(new Date(), "yyyy-MM-dd");

  const sugeridaLabelDiasUteis = (sugeridaIso: string) =>
    formatPrazoSugeridoDiasUteis(
      normalizePrazoSugeridoDiasUteisDisplay(
        countBusinessDaysInclusive(todayLocalYmd, sugeridaIso, companyHolidays)
      )
    );

  const plinesPrazoSemAlmoxarifado = (plinesForPrazo ?? []).filter(
    (L) => !productionLineIsAlmoxarifado(L)
  );

  const suggestedPrazoNovosItensByLine: {
    lineId: string;
    lineName: string;
    sugeridaIso: string | null;
    sugeridaLabel: string;
  }[] = plinesPrazoSemAlmoxarifado.map((L) => {
    const b = bestByLine[L.id];
    if (!b) {
      const sugeridaIso = addLocalCalendarDays(todayLocalYmd, 2);
      return {
        lineId: L.id,
        lineName: L.name ?? L.id,
        sugeridaIso,
        sugeridaLabel: sugeridaLabelDiasUteis(sugeridaIso),
      };
    }
    const ordRel = b.row.orders as
      | {
          company_id: string;
          delivery_deadline: string | null;
          pcp_deadline: string | null;
        }
      | {
          company_id: string;
          delivery_deadline: string | null;
          pcp_deadline: string | null;
        }[]
      | null;
    const ord = Array.isArray(ordRel) ? ordRel[0] : ordRel;
    const base = ord?.delivery_deadline ?? ord?.pcp_deadline ?? null;
    if (!base) {
      return {
        lineId: L.id,
        lineName: L.name ?? L.id,
        sugeridaIso: null,
        sugeridaLabel: "Sem prazo no pedido",
      };
    }
    const sugeridaIso = addLocalCalendarDays(base, 2);
    return {
      lineId: L.id,
      lineName: L.name ?? L.id,
      sugeridaIso,
      sugeridaLabel: sugeridaLabelDiasUteis(sugeridaIso),
    };
  });

  const next30 = new Date();
  next30.setDate(next30.getDate() + 30);

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
      const finishedYmd = finishedDate.toISOString().split("T")[0];
      if (finishedYmd <= o.delivery_deadline) {
        weeklyBuckets[key].onTime += 1;
      }
    }
  });

  const weeklyOnTimeData = Object.values(weeklyBuckets)
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
    .map((bucket) => {
      const label = format(bucket.weekStart, "d/M/yy");
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
    orderLeadTimeByLine,
    suggestedPrazoNovosItensByLine,
    occupancyByLine,
    todayByLine,
    weeklyOnTimeData,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export type OperatorDashboardKpis = {
  total: number;
  waiting: number;
  scheduled: number;
  completed: number;
};

/**
 * KPIs dos itens nas linhas vinculadas ao operador (`operator_lines`).
 */
export async function getOperatorDashboardKpis(
  userId: string
): Promise<OperatorDashboardKpis> {
  const supabase = await createServerSupabaseClient();

  const { data: opLines } = await supabase
    .from("operator_lines")
    .select("line_id")
    .eq("user_id", userId);

  const lineIds = [
    ...new Set(
      (opLines ?? [])
        .map((r) => r.line_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  if (lineIds.length === 0) {
    return { total: 0, waiting: 0, scheduled: 0, completed: 0 };
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("id, status")
    .in("line_id", lineIds);

  const rows = items ?? [];
  let waiting = 0;
  let scheduled = 0;
  let completed = 0;
  for (const row of rows) {
    const s = row.status;
    if (s === "waiting") waiting++;
    else if (s === "scheduled") scheduled++;
    else if (s === "completed") completed++;
  }

  return {
    total: rows.length,
    waiting,
    scheduled,
    completed,
  };
}
