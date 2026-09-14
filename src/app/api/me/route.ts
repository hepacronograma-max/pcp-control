import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchOperatorLineIdsForUserId } from "@/lib/supabase/fetch-operator-line-ids";
import { actorUsesOperatorLines } from "@/lib/utils/permissions";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  let { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, role, extra_roles, company_id")
    .eq("id", user.id)
    .single();
  if (
    profileErr &&
    /extra_roles/i.test(profileErr.message) &&
    /column|does not exist|schema cache/i.test(profileErr.message)
  ) {
    const retry = await supabase
      .from("profiles")
      .select("id, full_name, role, company_id")
      .eq("id", user.id)
      .single();
    profile = retry.data
      ? { ...retry.data, extra_roles: [] }
      : retry.data;
  }

  let operatorLineIds: string[] | undefined;
  if (profile && actorUsesOperatorLines(profile)) {
    operatorLineIds = await fetchOperatorLineIdsForUserId(user.id);
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile,
    operatorLineIds,
  });
}
