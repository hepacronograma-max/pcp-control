import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { reconcileAlmoxMirrorsForCompany } from "@/lib/supabase/reconcile-almoxarifado";

/**
 * Garante itens espelho no almox para programações já existentes nas outras linhas.
 * Chamado ao abrir a página da linha Almoxarifado (login local).
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    if (cookieStore.get("pcp-local-auth")?.value !== "1") {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const lineId = body?.lineId as string | undefined;
    if (!lineId || typeof lineId !== "string") {
      return NextResponse.json(
        { success: false, error: "lineId obrigatório" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: lineRow, error: le } = await supabase
      .from("production_lines")
      .select("company_id")
      .eq("id", lineId)
      .maybeSingle();

    if (le || !lineRow?.company_id) {
      return NextResponse.json(
        { success: false, error: le?.message ?? "Linha não encontrada" },
        { status: 404 }
      );
    }

    const { touched, error: reErr } = await reconcileAlmoxMirrorsForCompany(
      supabase,
      lineId
    );

    return NextResponse.json({
      success: true,
      touched,
      warning:
        reErr === "not_almox_line"
          ? "Esta rota só se aplica à linha Almoxarifado."
          : reErr,
    });
  } catch (err) {
    console.error("[reconcile-almox]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erro" },
      { status: 500 }
    );
  }
}
