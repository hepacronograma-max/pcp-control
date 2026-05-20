import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { productionLineIsAlmoxarifado } from "@/lib/supabase/sync-almoxarifado-on-program";

interface OrderItemCompanyRow {
  id: string;
  line_id: string | null;
  production_start: string | null;
  production_end: string | null;
  almox_supplied_at: string | null;
  order?: { company_id: string | null };
}

interface ProductionLineBrief {
  is_almoxarifado?: boolean | null;
  name?: string | null;
}

/**
 * POST: marca um item como abastecido no Almox (almox_supplied_at / almox_supplied_by).
 * Usa service role no modo cookie local; com sessão Supabase valida empresa no servidor.
 */
export async function POST(request: NextRequest) {
  try {
    const hasLocalAuth = await hasServerLocalAuthCookie();

    let body: {
      item_id?: string;
      company_id?: string;
      supplied_by?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Corpo JSON inválido." },
        { status: 400 }
      );
    }

    const itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
    const bodyCompany =
      typeof body.company_id === "string" ? body.company_id.trim() : "";
    if (!itemId || !bodyCompany) {
      return NextResponse.json(
        { success: false, error: "item_id e company_id são obrigatórios." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    let actorId: string;
    /** Empresa já validada pelo perfil/sessão; item deve pertencer à mesma empresa. */
    let expectedCompanyId: string = bodyCompany;

    if (!hasLocalAuth) {
      const authClient = await createServerSupabaseClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { success: false, error: "Não autenticado." },
          { status: 401 }
        );
      }
      actorId = user.id;
      const { data: prof } = await authClient
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .maybeSingle();
      const pc = prof?.company_id ?? null;
      const role = prof?.role ?? "";
      if (role !== "super_admin") {
        if (!pc || pc !== bodyCompany) {
          return NextResponse.json(
            { success: false, error: "Sem permissão para esta empresa." },
            { status: 403 }
          );
        }
        expectedCompanyId = pc;
      } else {
        expectedCompanyId = bodyCompany;
      }
    } else {
      const sb = typeof body.supplied_by === "string" ? body.supplied_by.trim() : "";
      if (!sb) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Modo local: envie supplied_by (uuid do usuário que está marcando).",
          },
          { status: 400 }
        );
      }
      actorId = sb;
      const { data: actorProfile } = await admin
        .from("profiles")
        .select("company_id, role")
        .eq("id", actorId)
        .maybeSingle();
      const acl = actorProfile?.company_id ?? null;
      if (
        actorProfile?.role !== "super_admin" &&
        (!acl || acl !== bodyCompany)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "usuário não pertence à empresa informada.",
          },
          { status: 403 }
        );
      }
    }

    const { data: itemRowRaw, error: fetchErr } = await admin
      .from("order_items")
      .select(
        `id, line_id, production_start, production_end, almox_supplied_at, order:orders(company_id)`
      )
      .eq("id", itemId)
      .maybeSingle();

    const itemRow = itemRowRaw as OrderItemCompanyRow | null;
    if (fetchErr || !itemRow?.id) {
      return NextResponse.json(
        {
          success: false,
          error: fetchErr?.message || "Item não encontrado.",
        },
        { status: fetchErr ? 500 : 404 }
      );
    }

    const orderCo = itemRow.order?.company_id ?? null;
    if (!orderCo || orderCo !== expectedCompanyId) {
      return NextResponse.json(
        { success: false, error: "Item não pertence a esta empresa." },
        { status: 403 }
      );
    }

    if (!itemRow.line_id) {
      return NextResponse.json(
        { success: false, error: "Item sem linha de produção." },
        { status: 400 }
      );
    }

    const { data: lineBrief } = await admin
      .from("production_lines")
      .select("is_almoxarifado, name")
      .eq("id", itemRow.line_id)
      .maybeSingle();

    const lineTyped = lineBrief as ProductionLineBrief | null;
    if (lineTyped && productionLineIsAlmoxarifado(lineTyped)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Itens só na linha Almox não recebem esta marcação; use o item na linha de produção.",
        },
        { status: 400 }
      );
    }

    if (!itemRow.production_start) {
      return NextResponse.json(
        {
          success: false,
          error: "Item sem data de início programada.",
        },
        { status: 400 }
      );
    }

    if (itemRow.production_end) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Produção já finalizada: o Almox foi fechado automaticamente. Item não aparece mais nas listagens do Almox.",
        },
        { status: 400 }
      );
    }

    if (itemRow.almox_supplied_at) {
      return NextResponse.json(
        { success: false, error: "Item já consta como abastecido." },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const withAutoPatch = {
      almox_supplied_at: nowIso,
      almox_supplied_by: actorId,
      almox_supplied_auto: false,
    };

    let { error: upErr } = await admin
      .from("order_items")
      .update(withAutoPatch)
      .eq("id", itemId);

    if (
      upErr &&
      /almox_supplied_auto|schema cache|column|does not exist/i.test(upErr.message)
    ) {
      ({
        error: upErr,
      } = await admin
        .from("order_items")
        .update({
          almox_supplied_at: nowIso,
          almox_supplied_by: actorId,
        })
        .eq("id", itemId));
    }

    if (
      upErr &&
      /almox_supplied|column|does not exist|schema cache/i.test(upErr.message)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `${upErr.message} Rode no SQL Editor o bloco almox em supabase-add-columns.sql (almox_supplied_at / almox_supplied_by).`,
        },
        { status: 500 }
      );
    }

    if (upErr) {
      return NextResponse.json(
        { success: false, error: upErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      item: {
        id: itemId,
        almox_supplied_at: nowIso,
        almox_supplied_by: actorId,
      },
    });
  } catch (e) {
    console.error("[order-items/supply]", e);
    return NextResponse.json(
      { success: false, error: "Erro interno." },
      { status: 500 }
    );
  }
}
