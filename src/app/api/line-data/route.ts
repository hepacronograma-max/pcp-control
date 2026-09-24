import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { PRODUCTION_LINES_ACTIVE_OR } from "@/lib/supabase/production-line-filters";
import { attachPoDatesToLineItems } from "@/lib/utils/pc-purchase-dates";
import type { ProductionLine } from "@/lib/types/database";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/**
 * Retorna dados da linha de produção (itens, feriados, etc).
 * Usa service role para bypassar RLS - garante que dados apareçam para perfil local.
 */
export async function GET(request: NextRequest) {
  try {
    const hasLocalAuth = await hasServerLocalAuthCookie();
    if (!hasLocalAuth) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lineId = searchParams.get("lineId");
    const tabParam = searchParams.get("tab");

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

    const holidaysPromise = supabase
      .from("holidays")
      .select("id, company_id, date, description, is_recurring, created_at")
      .eq("company_id", companyId)
      .then((r) => r.data ?? []);

    const allLinesPromise = (async (): Promise<ProductionLine[]> => {
      const res = await supabase
        .from("production_lines")
        .select("id, name, company_id, is_active, sort_order, is_almoxarifado")
        .eq("company_id", companyId)
        .or(PRODUCTION_LINES_ACTIVE_OR)
        .order("sort_order");
      if (
        res.error &&
        /is_almoxarifado|column|does not exist|schema cache/i.test(
          res.error.message
        )
      ) {
        const retry = await supabase
          .from("production_lines")
          .select("id, name, company_id, is_active, sort_order")
          .eq("company_id", companyId)
          .or(PRODUCTION_LINES_ACTIVE_OR)
          .order("sort_order");
        if (!retry.error && retry.data) {
          return retry.data.map((row) => ({
            ...row,
            is_almoxarifado: false,
          })) as ProductionLine[];
        }
        return [];
      }
      return (res.data ?? []) as ProductionLine[];
    })();

    const [holidaysData, allLinesData] = await Promise.all([
      holidaysPromise,
      allLinesPromise,
    ]);

    const tab = tabParam ?? "in_progress";

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

    const { data } = await baseQuery;
    const itemsData = data ?? [];

    const itemsWithPo = await attachPoDatesToLineItems(
      supabase,
      companyId,
      itemsData as { id: string }[]
    );

    return NextResponse.json(
      {
        line: lineData,
        items: itemsWithPo,
        holidays: holidaysData,
        allLines: allLinesData,
      },
      NO_STORE
    );
  } catch (err) {
    console.error("[line-data]", err);
    return NextResponse.json(
      { line: null, items: [], holidays: [], allLines: [] },
      { status: 200 }
    );
  }
}
