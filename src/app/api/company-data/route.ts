import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Retorna pedidos (com itens), linhas e dados da empresa.
 * Usa service role para bypassar RLS - garante que o backup apareça.
 */
export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    // Busca empresa que TEM pedidos (evita empresa vazia de imports antigos)
    const { data: orderWithCompany } = await supabase
      .from("orders")
      .select("company_id")
      .limit(1)
      .maybeSingle();

    const companyId = orderWithCompany?.company_id;
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
    const linesRes = await supabase
      .from("production_lines")
      .select("id, name, company_id")
      .eq("company_id", companyId);

    const orders = ordersRes.data ?? [];
    const lines = linesRes.data ?? [];

    const unprogrammedByLine: Record<string, number> = {};
    for (const o of orders) {
      const items = (o as { items?: { line_id: string | null; status: string; production_start: string | null }[] }).items ?? [];
      for (const it of items) {
        if (!it.line_id) continue;
        if (it.status === "waiting" || !it.production_start) {
          unprogrammedByLine[it.line_id] = (unprogrammedByLine[it.line_id] ?? 0) + 1;
        }
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
