import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";

/**
 * Retorna o company_id principal no banco (empresa com mais pedidos).
 * Usado quando o perfil é local (admin@local) para obter company_id sem depender do anon key.
 */
export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    let companyId = await resolvePrimaryCompanyId(supabase);
    if (!companyId) {
      const { data: companyData } = await supabase
        .from("companies")
        .select("id")
        .limit(1)
        .maybeSingle();
      companyId = companyData?.id ?? null;
    }
    return NextResponse.json({ companyId });
  } catch {
    return NextResponse.json({ companyId: null }, { status: 200 });
  }
}
