import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOmieIntegrationMode } from "@/lib/omie/integration-mode";
import {
  acquireSyncLock,
  processOmieWebhookEvent,
  releaseSyncLock,
  runOmiePoll,
} from "@/lib/omie/sync-service";
import type { OmieWebhookPayload } from "@/lib/omie/types";

async function requireManager() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["manager", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET() {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;

  const admin = createSupabaseAdminClient();

  const [events, links, state, lastWebhook] = await Promise.all([
    admin
      .from("omie_webhook_events")
      .select("id, event_id, event_type, status, received_at, processed_at, error_message")
      .order("received_at", { ascending: false })
      .limit(50),
    admin
      .from("omie_order_links")
      .select(
        "id, pcp_order_id, omie_codigo_pedido, omie_numero_pedido, omie_etapa, sync_status, last_synced_at"
      )
      .order("last_synced_at", { ascending: false })
      .limit(50),
    admin.from("omie_sync_state").select("*").eq("id", "default").maybeSingle(),
    admin
      .from("omie_webhook_events")
      .select("received_at, status")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    mode: getOmieIntegrationMode(),
    etapaPcp: process.env.OMIE_ETAPA_PCP ?? "60",
    events: events.data ?? [],
    links: links.data ?? [],
    syncState: state.data,
    lastWebhook: lastWebhook.data,
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    eventId?: number;
  };

  const admin = createSupabaseAdminClient();

  if (body.action === "poll") {
    const locked = await acquireSyncLock(admin, "omie-poll", 10);
    if (!locked) {
      return NextResponse.json({ error: "Poll em execução" }, { status: 409 });
    }
    try {
      const report = await runOmiePoll(admin);
      return NextResponse.json({ ok: true, report });
    } finally {
      await releaseSyncLock(admin, "omie-poll");
    }
  }

  if (body.action === "reprocess" && body.eventId) {
    const { data: ev } = await admin
      .from("omie_webhook_events")
      .select("id, payload, status")
      .eq("id", body.eventId)
      .maybeSingle();

    if (!ev) {
      return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
    }

    try {
      await processOmieWebhookEvent(
        admin,
        ev.id as number,
        ev.payload as OmieWebhookPayload
      );
      return NextResponse.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin
        .from("omie_webhook_events")
        .update({ status: "failed", error_message: msg })
        .eq("id", body.eventId);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
