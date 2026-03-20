import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureDeliveryColumns } from "@/lib/db/ensure-delivery-columns";

/**
 * Adiciona delivery_deadline e pcp_deadline em orders e pcp_deadline em order_items.
 * Usa SUPABASE_ACCESS_TOKEN (Management API) ou DATABASE_URL.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";
    if (!hasLocalAuth) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const ok = await ensureDeliveryColumns();

    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Configure SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens) ou DATABASE_URL no .env.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      msg: "Colunas adicionadas (prazos, linha, PC: pc_number / pc_delivery_date em order_items). Salve de novo o pedido de compras se precisar.",
    });
  } catch (err) {
    console.error("[setup-delivery-columns]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
