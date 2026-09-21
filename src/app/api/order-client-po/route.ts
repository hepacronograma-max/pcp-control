import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { extractOmieClientOrderNumber } from "@/lib/omie/mapper";
import { isUuid } from "@/lib/utils/is-uuid";

/** Pedido do cliente (Omie) para gravar na etiqueta junto com a OS interna. */
export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId")?.trim() ?? "";
  if (!isUuid(orderId)) {
    return NextResponse.json({ error: "orderId inválido" }, { status: 400 });
  }

  if (!(await hasServerLocalAuthCookie())) {
    const auth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("omie_order_links")
    .select("omie_payload_original")
    .eq("pcp_order_id", orderId)
    .maybeSingle();

  return NextResponse.json({
    clientOrderNumber: extractOmieClientOrderNumber(
      data?.omie_payload_original
    ),
  });
}
