import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  acquireSyncLock,
  releaseSyncLock,
  runOmiePoll,
} from "@/lib/omie/sync-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const LOCK_NAME = "omie-poll";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET não configurado" },
      { status: 503 }
    );
  }

  const key =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (key !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const locked = await acquireSyncLock(supabase, LOCK_NAME, 10);
  if (!locked) {
    return NextResponse.json(
      { ok: false, error: "Poll já em execução (lock)" },
      { status: 409 }
    );
  }

  try {
    const report = await runOmiePoll(supabase);
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    await releaseSyncLock(supabase, LOCK_NAME);
  }
}
