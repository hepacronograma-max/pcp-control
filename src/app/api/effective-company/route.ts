import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Retorna o ID da primeira empresa no banco.
 * Usado quando o perfil é local (admin@local) para obter company_id sem depender do anon key.
 */
export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    // Prioriza empresa que TEM pedidos
    const { data: orderData } = await supabase
      .from("orders")
      .select("company_id")
      .limit(1)
      .maybeSingle();
    if (orderData?.company_id) {
      return NextResponse.json({ companyId: orderData.company_id });
    }
    const { data: companyData } = await supabase
      .from("companies")
      .select("id")
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ companyId: companyData?.id ?? null });
  } catch {
    return NextResponse.json({ companyId: null }, { status: 200 });
  }
}
