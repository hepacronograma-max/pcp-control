import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyOmieWebhookSignature } from "@/lib/omie/hmac";
import {
  extractEventId,
  processOmieWebhookEvent,
  shouldProcessWebhook,
} from "@/lib/omie/sync-service";
import type { OmieWebhookPayload } from "@/lib/omie/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.OMIE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "OMIE_WEBHOOK_SECRET não configurado" },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-omie-signature") ||
    request.headers.get("X-Omie-Signature");

  if (!verifyOmieWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
  }

  let payload: OmieWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as OmieWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const eventId = extractEventId(payload, rawBody);
  const eventType = String(
    payload.event_type ?? payload.topic ?? payload.type ?? "unknown"
  );

  const supabase = createSupabaseAdminClient();

  const { data: existing } = await supabase
    .from("omie_webhook_events")
    .select("id, status")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("omie_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      payload,
      status: "received",
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json(
      { ok: false, error: insErr?.message ?? "Falha ao gravar evento" },
      { status: 500 }
    );
  }

  if (!shouldProcessWebhook(payload)) {
    await supabase
      .from("omie_webhook_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        error_message: "Etapa ignorada (não é OMIE_ETAPA_PCP)",
      })
      .eq("id", inserted.id);
    return NextResponse.json({ ok: true, ignored: true });
  }

  void processWebhookBackground(inserted.id as number, payload);

  return NextResponse.json({ ok: true, queued: true });
}

async function processWebhookBackground(
  eventId: number,
  payload: OmieWebhookPayload
) {
  const supabase = createSupabaseAdminClient();
  try {
    await processOmieWebhookEvent(supabase, eventId, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[omie webhook]", msg);
    await supabase
      .from("omie_webhook_events")
      .update({
        status: "failed",
        processed_at: new Date().toISOString(),
        error_message: msg.slice(0, 2000),
      })
      .eq("id", eventId);

    try {
      const { notify } = await import("@/lib/notify-telegram");
      await notify(`❌ Webhook Omie falhou: ${msg}`, "error");
    } catch {
      /* telegram opcional */
    }
  }
}
