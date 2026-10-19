import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { PRODUCTION_LINES_ACTIVE_OR } from "@/lib/supabase/production-line-filters";
import { attachPoDatesToLineItems } from "@/lib/utils/pc-purchase-dates";
import type { ProductionLine } from "@/lib/types/database";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/utils/permissions";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/**
 * Retorna dados da linha de produção (itens, feriados, etc).
 * Usa service role para bypassar RLS - garante que dados apareçam para perfil local.
 */
export async function GET(request: NextRequest) {
  try {
    const hasLocalAuth = await hasServerLocalAuthCookie();

    // Sessão Supabase: quem pode ver a linha é validado aqui no servidor
    // (antes a tela fazia /api/me + operator_lines + 4 consultas direto do navegador).
    let actor: { id: string; company_id: string | null; role: string | null } | null =
      null;
    if (!hasLocalAuth) {
      const authClient = await createServerSupabaseClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
      }
      const admin = createSupabaseAdminClient();
      const { data: prof } = await admin
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (!prof) {
        return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
      }
      actor = prof as { id: string; company_id: string | null; role: string | null };
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

    if (actor) {
      if (actor.role !== "super_admin" && actor.company_id !== companyId) {
        return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
      }
      const seesAll = hasPermission(actor, "viewAllLines");
      const isLineOperator = actor.role === "operator" || actor.role === "logistica";
      if (!seesAll && isLineOperator) {
        const { data: access } = await supabase
          .from("operator_lines")
          .select("line_id")
          .eq("user_id", actor.id)
          .eq("line_id", lineId)
          .maybeSingle();
        if (!access) {
          return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
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
