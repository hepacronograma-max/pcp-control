import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toSortOrder } from "@/lib/utils/supabase-data";

/**
 * CRUD de linhas de produção com service role (login local na rede / cookie pcp-local-auth).
 * O cliente Supabase no browser não tem permissão RLS para managers locais.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    if (cookieStore.get("pcp-local-auth")?.value !== "1") {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { action, companyId, lineId, name, isActive, direction } = body as {
      action?: string;
      companyId?: string;
      lineId?: string;
      name?: string;
      isActive?: boolean;
      direction?: "up" | "down";
    };

    if (!action) {
      return NextResponse.json({ success: false, error: "Ação obrigatória" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    if (action === "create") {
      if (!companyId || typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
          { success: false, error: "companyId e name obrigatórios" },
          { status: 400 }
        );
      }
      const { data: maxOrder } = await supabase
        .from("production_lines")
        .select("sort_order")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = toSortOrder(maxOrder?.[0]?.sort_order) + 1;
      const { error } = await supabase.from("production_lines").insert({
        company_id: companyId,
        name: name.trim().slice(0, 255),
        is_active: true,
        sort_order: nextOrder,
      });
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "update_name") {
      if (!lineId || typeof name !== "string") {
        return NextResponse.json({ success: false, error: "lineId e name" }, { status: 400 });
      }
      const { error } = await supabase
        .from("production_lines")
        .update({ name: name.trim().slice(0, 255) })
        .eq("id", lineId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "toggle_active") {
      if (!lineId || typeof isActive !== "boolean") {
        return NextResponse.json(
          { success: false, error: "lineId e isActive" },
          { status: 400 }
        );
      }
      const { error } = await supabase
        .from("production_lines")
        .update({ is_active: isActive })
        .eq("id", lineId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      if (!lineId) {
        return NextResponse.json({ success: false, error: "lineId" }, { status: 400 });
      }
      await supabase.from("operator_lines").delete().eq("line_id", lineId);
      await supabase.from("order_items").update({ line_id: null }).eq("line_id", lineId);
      const { error } = await supabase.from("production_lines").delete().eq("id", lineId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    /** Garante uma linha "Almoxarifado" marcada como is_almoxarifado (abastecimento). */
    if (action === "ensure_defaults") {
      if (!companyId || typeof companyId !== "string") {
        return NextResponse.json(
          { success: false, error: "companyId obrigatório" },
          { status: 400 }
        );
      }
      const { data: almoxRows } = await supabase
        .from("production_lines")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_almoxarifado", true)
        .limit(1);
      if (almoxRows?.length) {
        return NextResponse.json({ success: true, created: false });
      }
      const { data: minRow } = await supabase
        .from("production_lines")
        .select("sort_order")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true })
        .limit(1);
      const first =
        typeof minRow?.[0]?.sort_order === "number" ? minRow[0].sort_order : 0;
      const sortOrder = first - 1;
      let payload: Record<string, unknown> = {
        company_id: companyId,
        name: "Almoxarifado",
        is_active: true,
        sort_order: sortOrder,
        is_almoxarifado: true,
      };
      let { error } = await supabase.from("production_lines").insert(payload);
      const msg = error?.message ?? "";
      if (/is_almoxarifado|column|does not exist|schema cache/i.test(msg)) {
        payload = {
          company_id: companyId,
          name: "Almoxarifado",
          is_active: true,
          sort_order: Math.min(sortOrder, 0),
        };
        ({ error } = await supabase.from("production_lines").insert(payload));
      }
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, created: true });
    }

    if (action === "reorder") {
      if (!lineId || (direction !== "up" && direction !== "down")) {
        return NextResponse.json(
          { success: false, error: "lineId e direction" },
          { status: 400 }
        );
      }
      const { data: current } = await supabase
        .from("production_lines")
        .select("id, company_id, sort_order")
        .eq("id", lineId)
        .maybeSingle();
      if (!current) {
        return NextResponse.json({ success: false, error: "Linha não encontrada" }, { status: 404 });
      }
      const { data: siblings } = await supabase
        .from("production_lines")
        .select("id, sort_order")
        .eq("company_id", current.company_id)
        .order("sort_order", { ascending: true });
      const list = siblings ?? [];
      const idx = list.findIndex((r) => r.id === lineId);
      if (idx < 0) {
        return NextResponse.json({ success: false, error: "Índice inválido" }, { status: 400 });
      }
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= list.length) {
        return NextResponse.json({ success: true });
      }
      const a = list[idx];
      const b = list[targetIdx];
      await supabase.from("production_lines").update({ sort_order: b.sort_order }).eq("id", a.id);
      await supabase.from("production_lines").update({ sort_order: a.sort_order }).eq("id", b.id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    console.error("[production-lines]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erro" },
      { status: 500 }
    );
  }
}
