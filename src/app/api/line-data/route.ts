import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRODUCTION_LINES_ACTIVE_OR } from "@/lib/supabase/production-line-filters";

/**
 * Retorna dados da linha de produção (itens, feriados, etc).
 * Usa service role para bypassar RLS - garante que dados apareçam para perfil local.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";
    if (!hasLocalAuth) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get("lineId");
    const tab = searchParams.get("tab") ?? "all";

    if (!lineId) {
      return NextResponse.json({ success: false, error: "lineId obrigatório" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: lineData } = await supabase
      .from("production_lines")
      .select("*")
      .eq("id", lineId)
      .single();

    if (!lineData) {
      return NextResponse.json({ line: null, items: [], holidays: [], allLines: [] });
    }

    const companyId = lineData.company_id;

    let baseQuery = supabase
      .from("order_items")
      .select(
        `
        *,
        order:orders(id, order_number, client_name, delivery_deadline, pcp_deadline, status)
      `
      )
      .eq("line_id", lineId)
      .order("production_start", { ascending: true, nullsFirst: false })
      .order("production_end", { ascending: true });

    if (tab === "in_progress") {
      baseQuery = baseQuery.neq("status", "completed");
    } else if (tab === "finished") {
      baseQuery = baseQuery.eq("status", "completed");
    }

    const { data: itemsData } = await baseQuery;

    const { data: holidaysData } = await supabase
      .from("holidays")
      .select("id, company_id, date, description, is_recurring, created_at")
      .eq("company_id", companyId);

    const { data: allLinesData } = await supabase
      .from("production_lines")
      .select("id, name, company_id, is_active, sort_order")
      .eq("company_id", companyId)
      .or(PRODUCTION_LINES_ACTIVE_OR)
      .order("sort_order");

    return NextResponse.json({
      line: lineData,
      items: itemsData ?? [],
      holidays: holidaysData ?? [],
      allLines: allLinesData ?? [],
    });
  } catch (err) {
    console.error("[line-data]", err);
    return NextResponse.json(
      { line: null, items: [], holidays: [], allLines: [] },
      { status: 200 }
    );
  }
}
