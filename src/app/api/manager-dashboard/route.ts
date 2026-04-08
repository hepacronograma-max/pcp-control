import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/queries/dashboard";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  if (cookieStore.get("pcp-local-auth")?.value === "1") {
    const data = await getDashboardData(companyId);
    return NextResponse.json(data);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) {
    return NextResponse.json({ error: "no company" }, { status: 403 });
  }

  if (
    companyId !== profile.company_id &&
    profile.role !== "super_admin"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const data = await getDashboardData(companyId);
  return NextResponse.json(data);
}
