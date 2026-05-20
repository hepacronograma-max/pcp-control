import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";

/**
 * Retorna o company_id principal no banco (empresa com mais pedidos).
 * Requer sessão Supabase ou cookie local de desenvolvimento.
 */
export async function GET() {
  const hasLocal = await hasServerLocalAuthCookie();
  if (!hasLocal) {
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
  }

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
