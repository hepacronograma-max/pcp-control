import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { hasPermission } from "@/lib/utils/permissions";
import type { UserRole } from "@/lib/types/database";
import { importarPedidosDeCompra } from "@/lib/omie/purchase-sync-service";

export const runtime = "nodejs";
export const maxDuration = 300;

async function requireComprasImport() {
  if (await hasServerLocalAuthCookie()) {
    return { admin: createSupabaseAdminClient() };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  if (!role || !hasPermission(role, "editCompras")) {
    return {
      error: NextResponse.json(
        { error: "Sem permissão para importar pedidos de compra do Omie" },
        { status: 403 }
      ),
    };
  }

  return { profile, admin: createSupabaseAdminClient() };
}

export async function POST() {
  const gate = await requireComprasImport();
  if ("error" in gate && gate.error) return gate.error;

  try {
    const report = await importarPedidosDeCompra();
    if (report.skipped_reason === "locked") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "locked",
        report,
      });
    }
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const missing = /omie_purchase_order_links|does not exist|schema cache/i.test(
      msg
    );
    return NextResponse.json(
      {
        error: missing
          ? "Execute supabase-omie-purchase-links.sql no SQL Editor do Supabase."
          : msg,
      },
      { status: missing ? 503 : 500 }
    );
  }
}
