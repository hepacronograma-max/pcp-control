import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(str: string | null | undefined): boolean {
  return !!(str && typeof str === "string" && UUID_REGEX.test(str));
}
function genUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBackup(data: unknown): { orders: any[]; lines: any[]; company: any; holidays: any[] } {
  const raw = data as Record<string, unknown>;
  const parse = (v: unknown) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);
  const orders = (parse(raw.orders ?? raw["pcp-local-orders"]) ?? []) as Array<unknown>;
  const lines = (parse(raw.lines ?? raw["pcp-local-lines"]) ?? []) as Array<unknown>;
  const company = parse(raw.company ?? raw["pcp-local-company"]) as { name?: string } | null;
  const holidays = (parse(raw.holidays ?? raw["pcp-local-holidays"]) ?? []) as Array<unknown>;
  return {
    orders: orders as any[],
    lines: lines as any[],
    company,
    holidays: holidays as any[],
  };
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";
    if (!hasLocalAuth) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { orders, lines, company, holidays } = parseBackup(body);

    const rawCompanyId = orders[0]?.company_id ?? lines[0]?.company_id ?? "local-company";
    const companyIdResolved = isValidUuid(rawCompanyId) ? rawCompanyId : genUuid();

    const lineIdMap: Record<string, string> = {};
    if (rawCompanyId === "local-company" || !isValidUuid(rawCompanyId)) {
      lineIdMap["local-company"] = companyIdResolved;
    }
    for (const l of lines) {
      if (l?.id && !isValidUuid(l.id)) {
        lineIdMap[l.id] = genUuid();
      }
    }

    const resolveLineId = (id: string | null | undefined) => (id && lineIdMap[id]) || id;
    const resolveCompanyId = (id: string | null | undefined) =>
      (!id || id === "local-company") ? companyIdResolved : id;

    const supabase = createSupabaseAdminClient();
    let ordersInserted = 0;
    let itemsInserted = 0;
    let linesInserted = 0;
    let holidaysInserted = 0;

    if (company && !isValidUuid(rawCompanyId)) {
      const { error } = await supabase.from("companies").upsert(
        { id: companyIdResolved, name: company.name || "Empresa Local" },
        { onConflict: "id" }
      );
      if (error) throw error;
    }

    if (lines.length) {
      const linesToInsert = lines.map((l) => ({
        id: resolveLineId(l.id) || l.id,
        company_id: resolveCompanyId(l.company_id),
        name: l.name,
      }));
      const { error } = await supabase.from("production_lines").upsert(linesToInsert, { onConflict: "id" });
      if (error) throw error;
      linesInserted = linesToInsert.length;
    }

    if (orders.length) {
      const ordersToInsert = orders.map((o) => ({
        id: isValidUuid(o.id) ? o.id : genUuid(),
        company_id: resolveCompanyId(o.company_id),
        order_number: String(o.order_number || "").slice(0, 50),
        client_name: String(o.client_name || "").slice(0, 255),
        delivery_deadline: o.delivery_deadline ?? null,
        pcp_deadline: o.pcp_deadline ?? null,
        status: o.status || "imported",
      }));
      const orderIdMap: Record<string, string> = {};
      orders.forEach((o, i) => {
        if (o.id !== ordersToInsert[i].id) orderIdMap[o.id] = ordersToInsert[i].id;
      });

      const { error } = await supabase.from("orders").upsert(ordersToInsert, { onConflict: "id" });
      if (error) throw error;
      ordersInserted = ordersToInsert.length;

      const allItems = orders.flatMap((o) =>
        (o.items || []).map((it: Record<string, unknown>) => ({
          ...it,
          order_id: orderIdMap[o.id] || o.id,
          line_id: it.line_id ? (resolveLineId(String(it.line_id)) ?? null) : null,
        }))
      );
      if (allItems.length) {
        const itemsToInsert = allItems.map((it, idx) => ({
          id: isValidUuid(it.id) ? it.id : genUuid(),
          order_id: it.order_id,
          item_number: it.item_number ?? idx + 1,
          description: (it.description || "").slice(0, 500),
          quantity: Math.max(1, Number(it.quantity) || 1),
          line_id: it.line_id ? (resolveLineId(String(it.line_id)) ?? null) : null,
          pcp_deadline: it.pcp_deadline ?? null,
          status: it.status || "waiting",
          notes: (it.notes || "").slice(0, 2000) || null,
        }));
        const { error } = await supabase.from("order_items").upsert(itemsToInsert, { onConflict: "id" });
        if (error) throw error;
        itemsInserted = itemsToInsert.length;
      }
    }

    if (holidays.length) {
      const holidaysToInsert = holidays.map((h) => ({
        id: isValidUuid(h.id) ? h.id : genUuid(),
        company_id: resolveCompanyId(h.company_id),
        date: h.date,
        description: h.description || "",
        is_recurring: h.is_recurring ?? true,
        created_at: h.created_at || new Date().toISOString(),
      }));
      const { error } = await supabase.from("holidays").upsert(holidaysToInsert, { onConflict: "id" });
      if (error) throw error;
      holidaysInserted = holidaysToInsert.length;
    }

    return NextResponse.json({
      success: true,
      orders: ordersInserted,
      items: itemsInserted,
      lines: linesInserted,
      holidays: holidaysInserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[import-backup]", err);
    return NextResponse.json(
      { success: false, error: msg || "Erro ao importar" },
      { status: 500 }
    );
  }
}
