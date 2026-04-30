import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ChartRow = { name: string; value: number };
type SupplierBarRow = { name: string; total: number };

type DelayedPcRow = {
  id: string;
  number: string;
  supplier_name: string | null;
  expected_delivery: string | null;
  follow_up_date: string | null;
  overdue_days: number;
};

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

function parseIsoDate(s: string): Date | null {
  const d = new Date(`${s.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calendarDaysBetween(start: Date, end: Date): number {
  const a = new Date(start);
  const b = new Date(end);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Perfis que podem ver o dashboard de compras (mesmo conjunto que lista PCs em leitura ampla). */
function canAccessComprasDashboard(role: string | null | undefined): boolean {
  return (
    role === "super_admin" ||
    role === "manager" ||
    role === "compras"
  );
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const isLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

  if (!isLocalAuth) {
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "not authenticated" }, { status: 401 });
    }
    const { data: profile } = await supabaseAuth
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .single();

    if (!canAccessComprasDashboard(profile?.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
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

  const admin = createSupabaseAdminClient();
  const today = todayIso();

  let list: {
    id: string;
    number: string;
    supplier_name: string | null;
    expected_delivery: string | null;
    follow_up_date: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }[] = [];

  let full = await admin
    .from("purchase_orders")
    .select(
      "id, number, supplier_name, expected_delivery, follow_up_date, status, created_at, updated_at"
    )
    .eq("company_id", companyId);

  if (
    full.error &&
    /follow_up_date/i.test(full.error.message) &&
    /column|does not exist/i.test(full.error.message)
  ) {
    const stripped = await admin
      .from("purchase_orders")
      .select(
        "id, number, supplier_name, expected_delivery, status, created_at, updated_at"
      )
      .eq("company_id", companyId);
    if (!stripped.error) {
      list = (stripped.data ?? []).map((r) => ({
        ...r,
        follow_up_date: null as string | null,
      }));
    } else {
      console.error("[compras-dashboard]", stripped.error.message);
      return NextResponse.json(
        { error: "Erro ao carregar pedidos de compra." },
        { status: 500 }
      );
    }
  } else if (full.error) {
    console.error("[compras-dashboard]", full.error.message);
    return NextResponse.json(
      {
        error:
          /relation|does not exist/i.test(full.error.message)
            ? "Execute supabase-purchase-orders.sql no Supabase para habilitar métricas de compras."
            : "Erro ao carregar pedidos de compra.",
      },
      { status: 500 }
    );
  } else {
    list = full.data ?? [];
  }

  const openRows = list.filter((r) => r.status === "open");

  const delayedPcList: DelayedPcRow[] = [];
  for (const po of openRows) {
    let overdueDays = 0;
    let hit = false;
    const exp = po.expected_delivery
      ? parseIsoDate(po.expected_delivery)
      : null;
    const fu = po.follow_up_date ? parseIsoDate(po.follow_up_date) : null;
    const todayD = parseIsoDate(today);
    if (todayD && exp && calendarDaysBetween(exp, todayD) > 0) {
      const d = calendarDaysBetween(exp, todayD);
      overdueDays = Math.max(overdueDays, d);
      hit = true;
    }
    if (todayD && fu && calendarDaysBetween(fu, todayD) > 0) {
      const d = calendarDaysBetween(fu, todayD);
      overdueDays = Math.max(overdueDays, d);
      hit = true;
    }
    if (hit) {
      delayedPcList.push({
        id: po.id,
        number: po.number,
        supplier_name: po.supplier_name ?? null,
        expected_delivery: po.expected_delivery ?? null,
        follow_up_date: po.follow_up_date ?? null,
        overdue_days: overdueDays,
      });
    }
  }

  delayedPcList.sort((a, b) => b.overdue_days - a.overdue_days);

  const statusCounts = new Map<string, number>();
  for (const po of list) {
    const key = po.status || "open";
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  const chartByPcStatus: ChartRow[] = [];
  const label: Record<string, string> = {
    open: "Abertos",
    received: "Recebidos",
    cancelled: "Cancelados",
  };
  for (const [st, val] of statusCounts) {
    chartByPcStatus.push({
      name: label[st] ?? st,
      value: val,
    });
  }
  chartByPcStatus.sort((a, b) => a.name.localeCompare(b.name));

  const supplierOpenMap = new Map<string, number>();
  for (const po of openRows) {
    const name = (po.supplier_name || "Sem fornecedor").trim() || "Sem fornecedor";
    supplierOpenMap.set(name, (supplierOpenMap.get(name) ?? 0) + 1);
  }
  const chartSuppliersOpen: SupplierBarRow[] = [...supplierOpenMap.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString();

  const receivedRecent = list.filter(
    (po) =>
      po.status === "received" &&
      po.updated_at &&
      po.updated_at >= cutoff
  );

  let avgLeadTime = "--";
  if (receivedRecent.length > 0) {
    let sum = 0;
    let n = 0;
    for (const po of receivedRecent) {
      const c = po.created_at ? new Date(po.created_at).getTime() : NaN;
      const u = po.updated_at ? new Date(po.updated_at).getTime() : NaN;
      if (!Number.isNaN(c) && !Number.isNaN(u) && u >= c) {
        sum += Math.round((u - c) / 86_400_000);
        n++;
      }
    }
    if (n > 0) {
      avgLeadTime = String(Math.round((sum / n) * 10) / 10);
    }
  }

  let onTimeRate = 100;
  const receivedWithDeadline = receivedRecent.filter((po) => !!po.expected_delivery);
  if (receivedWithDeadline.length > 0) {
    let onTime = 0;
    for (const po of receivedWithDeadline) {
      const upd = po.updated_at!.slice(0, 10);
      const exp = po.expected_delivery!.slice(0, 10);
      if (upd <= exp) onTime++;
    }
    onTimeRate = Math.round((onTime / receivedWithDeadline.length) * 100);
  } else if (receivedRecent.length === 0) {
    onTimeRate = 100;
  }

  return NextResponse.json({
    openPurchaseOrders: openRows.length,
    delayedPurchaseOrders: delayedPcList.length,
    avgLeadTime,
    onTimeRate,
    chartByPcStatus,
    chartSuppliersOpen,
    delayedPcList,
  });
}
