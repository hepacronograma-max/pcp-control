import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertTasksCompanyAccess } from "@/lib/tasks-api-guard";
import type { TaskAssigneeOption } from "@/lib/types/tasks";

function rowDisplayName(row: Record<string, unknown>): string {
  const fn = row.full_name;
  if (typeof fn === "string" && fn.trim()) return fn.trim();
  const nm = row.name;
  if (typeof nm === "string" && nm.trim()) return nm.trim();
  const un = row.username;
  if (typeof un === "string" && un.trim()) return un.trim();
  return "Sem nome";
}

function rowsToAssignees(rows: Record<string, unknown>[]): TaskAssigneeOption[] {
  return rows
    .filter((r) => {
      const ia = r.is_active;
      return typeof ia !== "boolean" || ia !== false;
    })
    .map((r) => {
      const rawEmail = r.email;
      const email =
        typeof rawEmail === "string" && rawEmail.trim().length > 0
          ? rawEmail.trim()
          : undefined;
      return {
        id: String(r.id),
        full_name: rowDisplayName(r),
        email,
      };
    });
}

async function fetchProfilesForCompany(
  admin: SupabaseClient,
  companyId: string
): Promise<{ rows: Record<string, unknown>[]; error: Error | null }> {
  const { data: rows1, error: err1 } = await admin
    .from("profiles")
    .select("*")
    .eq("company_id", companyId);

  if (err1) return { rows: [], error: err1 };

  const list = (rows1 ?? []) as Record<string, unknown>[];

  /** Perfis órfãos: `profiles.company_id` ainda `"local-company"` após empresa principal ser UUID */
  const hasLocalAuth = await hasServerLocalAuthCookie();
  if (list.length === 0 && hasLocalAuth) {
    const { data: rows2, error: err2 } = await admin
      .from("profiles")
      .select("*")
      .eq("company_id", "local-company");
    if (err2) return { rows: [], error: err2 };
    return { rows: (rows2 ?? []) as Record<string, unknown>[], error: null };
  }

  return { rows: list, error: null };
}

/** Lista utilizadores da empresa para atribuição em tarefas (qualquer papel ativo). */
export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const gate = await assertTasksCompanyAccess(companyId);
  if (!gate.ok) {
    console.warn("[api/tasks/assignees] negado:", gate.status, gate.error, "companyId=", companyId);
    return NextResponse.json({ error: gate.error, assignees: [] }, { status: gate.status });
  }

  const { admin } = gate;
  const { rows: rawRows, error } = await fetchProfilesForCompany(admin, companyId!);

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[api/tasks/assignees] erro DB:", msg);
    return NextResponse.json({ error: msg, assignees: [] }, { status: 500 });
  }

  rawRows.sort((a, b) =>
    rowDisplayName(a).localeCompare(rowDisplayName(b), "pt", { sensitivity: "base" })
  );

  const assignees = rowsToAssignees(rawRows);
  console.info("[api/tasks/assignees] companyId=%s assignees=%s", companyId, assignees.length);

  return NextResponse.json({ assignees });
}
