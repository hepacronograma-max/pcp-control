import { NextRequest, NextResponse } from "next/server";
import { assertTasksCompanyAccess } from "@/lib/tasks-api-guard";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const gate = await assertTasksCompanyAccess(companyId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, departments: [] }, { status: gate.status });
  }

  const { admin } = gate;
  const { data, error } = await admin
    .from("departments")
    .select("id, name, description, company_id, created_at")
    .eq("company_id", companyId!)
    .order("name", { ascending: true });

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return NextResponse.json({ departments: [], schemaMissing: true });
    }
    return NextResponse.json({ error: error.message, departments: [] }, { status: 500 });
  }

  return NextResponse.json({ departments: data ?? [] });
}
