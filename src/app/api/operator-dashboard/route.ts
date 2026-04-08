import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: opLines } = await supabase
    .from("operator_lines")
    .select("line_id")
    .eq("user_id", user.id);

  const lineIds = [
    ...new Set(
      (opLines ?? [])
        .map((r) => r.line_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  if (lineIds.length === 0) {
    return NextResponse.json({
      total: 0,
      waiting: 0,
      scheduled: 0,
      completed: 0,
    });
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("id, status")
    .in("line_id", lineIds);

  const rows = items ?? [];
  let waiting = 0;
  let scheduled = 0;
  let completed = 0;
  for (const row of rows) {
    if (row.status === "waiting") waiting++;
    else if (row.status === "scheduled") scheduled++;
    else if (row.status === "completed") completed++;
  }

  return NextResponse.json({
    total: rows.length,
    waiting,
    scheduled,
    completed,
  });
}
