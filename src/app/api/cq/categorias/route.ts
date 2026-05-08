import { NextRequest, NextResponse } from "next/server";
import { assertTasksCompanyAccess } from "@/lib/tasks-api-guard";
import { categoryRoleFallbackChain } from "@/lib/cq/category-role-chain";
import { normalizeUserRole } from "@/lib/utils/permissions";

/** Categorias CQ para o papel (fallback na cadeia) — server-side para modo local sem sessão JWT. */
export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const userRole = request.nextUrl.searchParams.get("userRole") ?? "";

  const gate = await assertTasksCompanyAccess(companyId);
  if (!gate.ok) {
    console.warn("[api/cq/categorias] acesso negado:", gate.status, gate.error);
    return NextResponse.json(
      { error: gate.error, categorias: [] },
      { status: gate.status }
    );
  }

  const normalized = normalizeUserRole(userRole);
  const chain = categoryRoleFallbackChain(normalized);

  console.info("[api/cq/categorias] companyId=%s userRole=%s chain=%s", companyId, userRole, chain.join(","));
  try {
    for (const catRole of chain) {
      const { data, error } = await gate.admin
        .from("cq_categorias")
        .select("*")
        .eq("company_id", companyId!)
        .eq("role", catRole)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("[api/cq/categorias] query erro:", catRole, error.message);
        return NextResponse.json(
          { error: error.message, categorias: [] },
          { status: 500 }
        );
      }
      if ((data ?? []).length > 0) {
        console.info("[api/cq/categorias] ok role=%s n=%s", catRole, (data ?? []).length);
        return NextResponse.json({ categorias: data ?? [] });
      }
    }

    const { data: anyRole, error: err2 } = await gate.admin
      .from("cq_categorias")
      .select("*")
      .eq("company_id", companyId!)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (err2) {
      console.error("[api/cq/categorias] fallback any-role erro:", err2.message);
      return NextResponse.json(
        { error: err2.message, categorias: [] },
        { status: 500 }
      );
    }

    console.info("[api/cq/categorias] fallback todas as roles n=%s", (anyRole ?? []).length);
    return NextResponse.json({ categorias: anyRole ?? [] });
  } catch (e) {
    console.error("[api/cq/categorias] excecao:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro interno", categorias: [] },
      { status: 500 }
    );
  }
}
