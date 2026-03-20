import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { itemNeedsProductionProgram } from "@/lib/utils/line-program-indicator";

/**
 * Retorna pedidos (com itens), linhas e dados da empresa.
 * Usa service role para bypassar RLS - garante que o backup apareça.
 */
export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // Empresa com mais pedidos (evita pegar outro tenant por .limit(1) sem ordem)
    let companyId = await resolvePrimaryCompanyId(supabase);
    if (!companyId) {
      const { data: anyCompany } = await supabase
        .from("companies")
        .select("id")
        .limit(1)
        .maybeSingle();
      companyId = anyCompany?.id ?? null;
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
    const linesRes = await supabase
      .from("production_lines")
      .select("id, name, company_id")
      .eq("company_id", companyId);

    const orders = ordersRes.data ?? [];
    const lines = linesRes.data ?? [];

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
      company: company ? { id: company.id, name: company.name ?? "", logo_url: company.logo_url } : { id: companyId, name: "Empresa", logo_url: null },
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
