import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRODUCTION_LINES_ACTIVE_OR } from "@/lib/supabase/production-line-filters";
import { reconcileAlmoxMirrorsForCompany } from "@/lib/supabase/reconcile-almoxarifado";
import { attachPoDatesToLineItems } from "@/lib/utils/pc-purchase-dates";
import {
  productionLineIsAlmoxarifado,
  resolveAlmoxLineId,
} from "@/lib/supabase/sync-almoxarifado-on-program";

/** Throttle em memória por processo Node: evita reconcile completo a cada pedido à linha Almox. */
const ALMOX_RECONCILE_THROTTLE_MS = 5 * 60 * 1000;
const almoxReconcileLastSuccessAt = new Map<string, number>();

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

    /** Garante espelhos no servidor antes de listar. */
    const lineRow = lineData as {
      name?: string | null;
      is_almoxarifado?: boolean | null;
    };
    let isAlmoxPage = productionLineIsAlmoxarifado(lineRow);
    if (!isAlmoxPage) {
      const resolvedAlmox = await resolveAlmoxLineId(supabase, companyId);
      isAlmoxPage = resolvedAlmox != null && resolvedAlmox === lineId;
    }
    if (isAlmoxPage) {
      const last = almoxReconcileLastSuccessAt.get(lineId);
      const shouldReconcile =
        last == null || Date.now() - last >= ALMOX_RECONCILE_THROTTLE_MS;
      if (shouldReconcile) {
        try {
          const result = await reconcileAlmoxMirrorsForCompany(
            supabase,
            lineId
          );
          if (!result.error) {
            almoxReconcileLastSuccessAt.set(lineId, Date.now());
          } else {
            console.error("[line-data] reconcile almox:", result.error);
          }
        } catch (e) {
          console.error("[line-data] reconcile almox:", e);
        }
      }
    }

    // Queries independentes rodam em paralelo.
    const itemsPromise = (async () => {
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
      return data ?? [];
    })();

    const holidaysPromise = supabase
      .from("holidays")
      .select("id, company_id, date, description, is_recurring, created_at")
      .eq("company_id", companyId)
      .then((r) => r.data ?? []);

    const allLinesPromise = (async () => {
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
          })) as Record<string, unknown>[];
        }
        return [];
      }
      return (res.data ?? []) as Record<string, unknown>[];
    })();

    const [itemsData, holidaysData, allLinesData] = await Promise.all([
      itemsPromise,
      holidaysPromise,
      allLinesPromise,
    ]);

    const itemsWithPo = await attachPoDatesToLineItems(
      supabase,
      companyId,
      (itemsData ?? []) as { id: string }[]
    );

    return NextResponse.json({
      line: lineData,
      items: itemsWithPo,
      holidays: holidaysData,
      allLines: allLinesData,
    });
  } catch (err) {
    console.error("[line-data]", err);
    return NextResponse.json(
      { line: null, items: [], holidays: [], allLines: [] },
      { status: 200 }
    );
  }
}
