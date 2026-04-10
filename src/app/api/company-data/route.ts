import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { itemNeedsProductionProgram } from "@/lib/utils/line-program-indicator";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

async function loadNormalizedProductionLines(
  supabase: SupabaseClient,
  companyId: string
): Promise<Record<string, unknown>[]> {
  const linesFull = await supabase
    .from("production_lines")
    .select(
      "id, name, company_id, is_active, sort_order, is_almoxarifado, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  let rawLines: Record<string, unknown>[] = (linesFull.data ?? []) as Record<
    string,
    unknown
  >[];
  if (linesFull.error) {
    console.warn("[company-data] linhas (completo):", linesFull.error.message);
    const linesMid = await supabase
      .from("production_lines")
      .select("id, name, company_id, is_active, sort_order, created_at, updated_at")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true });
    if (!linesMid.error && linesMid.data) {
      rawLines = linesMid.data as Record<string, unknown>[];
    } else if (linesMid.error) {
      console.warn("[company-data] linhas (médio):", linesMid.error.message);
      const linesMin = await supabase
        .from("production_lines")
        .select("id, name, company_id")
        .eq("company_id", companyId);
      if (!linesMin.error && linesMin.data) {
        rawLines = linesMin.data as Record<string, unknown>[];
      } else if (linesMin.error) {
        console.error("[company-data] linhas (mínimo):", linesMin.error.message);
        rawLines = [];
      }
    }
  }

  const lines: Record<string, unknown>[] = [...rawLines].map((row, i) => ({
    ...row,
    is_active: row.is_active !== false,
    is_almoxarifado: row.is_almoxarifado === true,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : i,
  }));
  lines.sort((a, b) => {
    const sa = a.sort_order as number;
    const sb = b.sort_order as number;
    if (sa !== sb) return sa - sb;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
  return lines;
}

/** Contagem leve para o menu lateral (sem carregar todos os pedidos). */
async function unprogrammedByLineFromDb(
  supabase: SupabaseClient,
  companyId: string
): Promise<Record<string, number>> {
  const { data: orderRows } = await supabase
    .from("orders")
    .select("id")
    .eq("company_id", companyId);
  const ids = (orderRows ?? []).map((r) => r.id);
  if (ids.length === 0) return {};

  const unprogrammedByLine: Record<string, number> = {};
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data: items } = await supabase
      .from("order_items")
      .select("line_id, status, production_start, production_end")
      .in("order_id", chunk);
    for (const it of items ?? []) {
      if (!itemNeedsProductionProgram(it)) continue;
      const lid = it.line_id;
      if (!lid) continue;
      unprogrammedByLine[lid] = (unprogrammedByLine[lid] ?? 0) + 1;
    }
  }
  return unprogrammedByLine;
}

/**
 * Retorna pedidos (com itens), linhas e dados da empresa.
 * Usa service role para bypassar RLS - garante que o backup apareça.
 *
 * Query opcional: `?companyId=<uuid>` — deve ser o mesmo retornado por /api/effective-company
 * (login local + produção), para não misturar tenant quando há mais de uma empresa.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const param = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";

    const cookieStore = await cookies();
    const isLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

    let companyId: string | null = null;

    if (!isLocalAuth) {
      const supabaseAuth = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: "not authenticated" },
          { status: 401 }
        );
      }

      const { data: profile } = await supabaseAuth
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .single();

      if (param && isUuid(param)) {
        const { data: row } = await supabase
          .from("companies")
          .select("id")
          .eq("id", param)
          .maybeSingle();
        if (row?.id) {
          if (
            profile?.role !== "super_admin" &&
            param !== profile?.company_id
          ) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
          }
          companyId = row.id;
        }
      }

      if (!companyId) {
        if (profile?.company_id) {
          companyId = profile.company_id;
        } else if (profile?.role === "super_admin") {
          companyId = await resolvePrimaryCompanyId(supabase);
          if (!companyId) {
            const { data: anyCompany } = await supabase
              .from("companies")
              .select("id")
              .limit(1)
              .maybeSingle();
            companyId = anyCompany?.id ?? null;
          }
        } else {
          return NextResponse.json({ error: "no company" }, { status: 403 });
        }
      }
    } else {
      if (param && isUuid(param)) {
        const { data: row } = await supabase
          .from("companies")
          .select("id")
          .eq("id", param)
          .maybeSingle();
        if (row?.id) companyId = row.id;
      }

      if (!companyId) {
        companyId = await resolvePrimaryCompanyId(supabase);
      }
      if (!companyId) {
        const { data: anyCompany } = await supabase
          .from("companies")
          .select("id")
          .limit(1)
          .maybeSingle();
        companyId = anyCompany?.id ?? null;
      }
    }
    if (!companyId) {
      return NextResponse.json({
        companyId: null,
        company: null,
        orders: [],
        lines: [],
        unprogrammedByLine: {},
      });
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id, name, logo_url")
      .eq("id", companyId)
      .maybeSingle();

    const companyPayload = company
      ? {
          id: company.id,
          name: company.name ?? "",
          logo_url: company.logo_url,
        }
      : { id: companyId, name: "Empresa", logo_url: null };

    const lite = request.nextUrl.searchParams.get("lite") === "1";
    if (lite) {
      const lines = await loadNormalizedProductionLines(supabase, companyId);
      const unprogrammedByLine = await unprogrammedByLineFromDb(supabase, companyId);
      return NextResponse.json({
        companyId,
        company: companyPayload,
        orders: [],
        lines,
        unprogrammedByLine,
      });
    }

    let ordersRes = await supabase
      .from("orders")
      .select(
        `
        *,
        items:order_items(
          *,
          production_line:production_lines(id, name)
        )
      `
      )
      .eq("company_id", companyId)
      .order("delivery_deadline", { ascending: true });

    if (ordersRes.error?.message?.includes("delivery_deadline")) {
      ordersRes = await supabase
        .from("orders")
        .select(
          `
          *,
          items:order_items(
            *,
            production_line:production_lines(id, name)
          )
        `
        )
        .eq("company_id", companyId)
        .order("id", { ascending: true });
    }

    // Se a query com embed production_line falhar (schema cache, FK, coluna nova), não retornar lista vazia: tentar só order_items(*)
    if (ordersRes.error) {
      console.warn("[company-data] select com production_line falhou:", ordersRes.error.message);
      ordersRes = await supabase
        .from("orders")
        .select(
          `
          *,
          items:order_items(*)
        `
        )
        .eq("company_id", companyId)
        .order("delivery_deadline", { ascending: true });
    }
    if (ordersRes.error?.message?.includes("delivery_deadline")) {
      ordersRes = await supabase
        .from("orders")
        .select(
          `
          *,
          items:order_items(*)
        `
        )
        .eq("company_id", companyId)
        .order("id", { ascending: true });
    }
    if (ordersRes.error) {
      console.error(
        "[company-data] falha ao carregar pedidos após fallbacks:",
        ordersRes.error.message
      );
    }
    const orders = ordersRes.data ?? [];
    const lines = await loadNormalizedProductionLines(supabase, companyId);

    const unprogrammedByLine: Record<string, number> = {};
    for (const o of orders) {
      const items =
        (o as {
          items?: {
            line_id: string | null;
            status: string;
            production_start: string | null;
            production_end?: string | null;
          }[];
        }).items ?? [];
      for (const it of items) {
        if (!itemNeedsProductionProgram(it)) continue;
        unprogrammedByLine[it.line_id!] = (unprogrammedByLine[it.line_id!] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      companyId,
      company: companyPayload,
      orders,
      lines,
      unprogrammedByLine,
    });
  } catch {
    return NextResponse.json(
      { companyId: null, company: null, orders: [], lines: [], unprogrammedByLine: {} },
      { status: 200 }
    );
  }
}
