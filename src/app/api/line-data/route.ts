import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRODUCTION_LINES_ACTIVE_OR } from "@/lib/supabase/production-line-filters";
import { reconcileAlmoxMirrorsForCompany } from "@/lib/supabase/reconcile-almoxarifado";
import {
  fetchAlmoxScheduledOrderItems,
  countAlmoxSupplyPending,
} from "@/lib/supabase/fetch-almox-scheduled-items";
import type { AlmoxPeriod } from "@/lib/supabase/fetch-almox-scheduled-items";
import { attachPoDatesToLineItems } from "@/lib/utils/pc-purchase-dates";
import type { ProductionLine } from "@/lib/types/database";
import {
  productionLineIsAlmoxarifado,
  resolveAlmoxLineId,
} from "@/lib/supabase/sync-almoxarifado-on-program";

/** Throttle em memória por processo Node: evita reconcile completo a cada pedido à linha Almox. */
const ALMOX_RECONCILE_THROTTLE_MS = 5 * 60 * 1000;
const almoxReconcileLastSuccessAt = new Map<string, number>();

function parseAlmoxPeriod(v: string | null): AlmoxPeriod {
  if (v === "7" || v === "15" || v === "30") return v;
  return "all";
}

function parseAlmoxListLimitParam(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 10) return 50;
  return Math.min(500, Math.floor(n));
}

function parseAlmoxOffsetParam(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(500_000, Math.floor(n));
}

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
    const tabParam = searchParams.get("tab");
    const almoxPeriod = parseAlmoxPeriod(searchParams.get("almoxPeriod"));
    const almoxListLimit = parseAlmoxListLimitParam(searchParams.get("almoxLimit"));
    const almoxListOffset = parseAlmoxOffsetParam(searchParams.get("almoxOffset"));
    const wantDiag =
      searchParams.get("diag") === "1" ||
      searchParams.get("diag") === "true";

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

    /** Garante espelhos no servidor (outras telas); a lista Almox usa vista agregada. */
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

    const tab = tabParam ?? (isAlmoxPage ? "in_progress" : "all");

    let itemsData: unknown[];
    let almoxPendingCount: number | null = null;
    let almoxSupplyFallback = false;

    if (isAlmoxPage) {
      const [agg, pendingRes] = await Promise.all([
        fetchAlmoxScheduledOrderItems(supabase, allLinesData, {
          tab,
          period: almoxPeriod,
          limit: almoxListLimit,
          offset: almoxListOffset,
        }),
        countAlmoxSupplyPending(supabase, allLinesData, {
          period: almoxPeriod,
        }),
      ]);

      almoxSupplyFallback = !!(
        agg.fallbackNoSupplyColumns || pendingRes.fallbackNoSupplyColumns
      );

      if (agg.error) {
        console.error("[line-data] almox agregação:", agg.error.message);
      }
      itemsData = agg.data;
      if (pendingRes.error) {
        console.warn("[line-data] almox pendente count:", pendingRes.error.message);
      }
      almoxPendingCount = pendingRes.error ? 0 : pendingRes.count;

      const realLineIdsCount = allLinesData.filter(
        (l) => !productionLineIsAlmoxarifado(l)
      ).length;
      console.log("[line-data] almox", {
        lineId,
        tab,
        almoxPeriod,
        realLineIdsCount,
        itemsCount: (itemsData ?? []).length,
        almoxPendingCount,
        almoxSupplyFallback,
        almoxListLimit,
        almoxListOffset,
        aggError: agg.error?.message ?? null,
        pendingError: pendingRes.error?.message ?? null,
      });
    } else {
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
      itemsData = data ?? [];
    }

    const itemsWithPo = await attachPoDatesToLineItems(
      supabase,
      companyId,
      (itemsData ?? []) as { id: string }[]
    );

    type LineDataPayload = Record<string, unknown>;
    const jsonResponse: LineDataPayload = {
      line: lineData,
      items: itemsWithPo,
      holidays: holidaysData,
      allLines: allLinesData,
    };
    if (isAlmoxPage) {
      jsonResponse.almoxPendingCount = almoxPendingCount ?? 0;
      jsonResponse.almoxSupplyFallback = almoxSupplyFallback;
      if (wantDiag) {
        jsonResponse.almoxDiag = {
          tabParam,
          resolvedTab: tab,
          period: almoxPeriod,
          realLineIdsCount: allLinesData.filter(
            (l) => !productionLineIsAlmoxarifado(l)
          ).length,
          itemsLength: itemsWithPo.length,
          pendingCount: almoxPendingCount,
          supplyFallbackActive: almoxSupplyFallback,
          hintMissingSql:
            "Colunas: supabase-add-columns.sql (almox_supplied_at, almox_supplied_by).",
        };
      }
    }

    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error("[line-data]", err);
    return NextResponse.json(
      { line: null, items: [], holidays: [], allLines: [] },
      { status: 200 }
    );
  }
}
