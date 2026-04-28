import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchOperatorLineIdsForUserId } from "@/lib/supabase/fetch-operator-line-ids";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, company_id")
    .eq("id", user.id)
    .single();

  let operatorLineIds: string[] | undefined;
  const role = profile?.role;
  if (
    profile &&
    (role === "operator" || role === "logistica")
  ) {
    operatorLineIds = await fetchOperatorLineIdsForUserId(user.id);
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile,
    operatorLineIds,
  });
}
