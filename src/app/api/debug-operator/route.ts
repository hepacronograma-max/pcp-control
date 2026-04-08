import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated", authError });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, company_id")
    .eq("id", user.id)
    .single();

  const { data: opLines, error: opError } = await supabase
    .from("operator_lines")
    .select("line_id")
    .eq("user_id", user.id);

  const lineIds = (opLines ?? [])
    .map((r) => r.line_id)
    .filter(Boolean);

  let items = null;
  let itemsError = null;
  if (lineIds.length > 0) {
    const result = await supabase
      .from("order_items")
      .select("id, status, line_id")
      .in("line_id", lineIds);
    items = result.data;
    itemsError = result.error;
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile,
    opLines,
    opError,
    lineIds,
    itemsCount: items?.length ?? 0,
    itemsError,
    sampleItems: (items ?? []).slice(0, 5),
  });
}
