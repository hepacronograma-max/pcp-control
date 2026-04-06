import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

async function assertCanEditCompany(
  companyId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const cookieStore = await cookies();
  if (cookieStore.get("pcp-local-auth")?.value === "1") {
    return { ok: true };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Não autenticado" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { ok: false, status: 403, error: "Perfil não encontrado" };
  }

  const role = profile.role;
  const isManagerLike =
    role === "manager" ||
    role === "admin" ||
    role === "super_admin";

  if (!isManagerLike) {
    return { ok: false, status: 403, error: "Sem permissão" };
  }

  if (
    role !== "super_admin" &&
    role !== "admin" &&
    profile.company_id !== companyId
  ) {
    return { ok: false, status: 403, error: "Sem permissão nesta empresa" };
  }

  return { ok: true };
}

/**
 * Salva nome e pasta matriz da empresa com service role (funciona com login local + Supabase).
 * POST JSON: { companyId?, name, orders_path }
 */
export async function POST(request: NextRequest) {
  try {
    let body: { companyId?: string; name?: string; orders_path?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "JSON inválido" },
        { status: 400 }
      );
    }

    const name = String(body.name ?? "").trim();
    const ordersPath = String(body.orders_path ?? "").trim();
    let companyId = body.companyId?.trim() ?? "";

    if (!companyId || !isUuid(companyId)) {
      const admin = createSupabaseAdminClient();
      companyId = (await resolvePrimaryCompanyId(admin)) ?? "";
    }

    if (!companyId || !isUuid(companyId)) {
      return NextResponse.json(
        { success: false, error: "Empresa não encontrada" },
        { status: 400 }
      );
    }

    const gate = await assertCanEditCompany(companyId);
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error },
        { status: gate.status }
      );
    }

    const supabase = createSupabaseAdminClient();

    const payloadFull: Record<string, unknown> = {
      name: name.slice(0, 255),
      orders_path: ordersPath.slice(0, 2000),
      import_path: ordersPath.slice(0, 2000),
    };

    let { error } = await supabase.from("companies").update(payloadFull).eq("id", companyId);

    if (error?.message?.includes("orders_path") || error?.message?.includes("column")) {
      const payloadMin: Record<string, unknown> = {
        name: name.slice(0, 255),
        import_path: ordersPath.slice(0, 2000),
      };
      ({ error } = await supabase.from("companies").update(payloadMin).eq("id", companyId));
    }

    if (error) {
      console.error("[company-settings]", error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
