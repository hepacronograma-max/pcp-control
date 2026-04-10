import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const hasLocalAuth = request.cookies.get("pcp-local-auth")?.value === "1";
  if (hasLocalAuth) {
    return "local-admin";
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id || null;
}

export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const scope = request.nextUrl.searchParams.get("scope");
  if (!scope) {
    return NextResponse.json({ error: "scope required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", userId)
    .eq("scope", scope)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preferences: data?.preferences || null });
}

export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { scope, preferences } = body;

  if (!scope || preferences === undefined) {
    return NextResponse.json(
      { error: "scope and preferences required" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("user_preferences").upsert(
    {
      user_id: userId,
      scope,
      preferences,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,scope" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
