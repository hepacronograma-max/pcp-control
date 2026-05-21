import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/utils/permissions";
import type { UserRole } from "@/lib/types/database";

/**
 * Lista eventos de auditoria da empresa do usuário (manager / super_admin).
 * RLS em audit_log reforça o escopo.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  if (!role || !hasPermission(role, "viewSettings")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  if (!profile?.company_id) {
    return NextResponse.json({ error: "Empresa não definida" }, { status: 400 });
  }

  const limit = Math.min(
    200,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100)
  );

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, company_id, table_name, record_id, action, user_id, user_email, created_at, old_data, new_data"
    )
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const missing = error.message.includes("audit_log") || error.code === "42P01";
    return NextResponse.json(
      {
        error: missing
          ? "Tabela audit_log ausente. Aplique supabase/migrations/20260520_audit_log.sql no Supabase."
          : error.message,
      },
      { status: missing ? 503 : 500 }
    );
  }

  return NextResponse.json({ events: data ?? [] });
}
