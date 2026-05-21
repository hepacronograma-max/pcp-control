import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/utils/permissions";
import type { UserRole } from "@/lib/types/database";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 100;

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

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(sp.get("limit") ?? String(PAGE_SIZE_DEFAULT), 10) || PAGE_SIZE_DEFAULT)
  );
  const table = sp.get("table")?.trim();
  const operation = sp.get("operation")?.trim();
  const userEmail = sp.get("user")?.trim();
  const from = sp.get("from")?.trim();
  const to = sp.get("to")?.trim();

  const fromIdx = (page - 1) * limit;
  const toIdx = fromIdx + limit - 1;

  let query = supabase
    .from("audit_log")
    .select(
      "id, company_id, table_name, record_id, action, user_id, user_email, created_at, old_data, new_data",
      { count: "exact" }
    )
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (table) query = query.eq("table_name", table);
  if (operation) query = query.eq("action", operation);
  if (userEmail) query = query.ilike("user_email", `%${userEmail}%`);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data, error, count } = await query.range(fromIdx, toIdx);

  if (error) {
    const missing = error.message.includes("audit_log") || error.code === "42P01";
    return NextResponse.json(
      {
        error: missing
          ? "Tabela audit_log ausente. Aplique supabase/migrations/20260520_audit_log.sql."
          : error.message,
      },
      { status: missing ? 503 : 500 }
    );
  }

  return NextResponse.json({
    events: data ?? [],
    page,
    limit,
    total: count ?? 0,
    totalPages: count ? Math.ceil(count / limit) : 0,
  });
}
