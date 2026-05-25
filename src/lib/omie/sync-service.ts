import type { SupabaseClient } from "@supabase/supabase-js";
import { OmieClient } from "./client";
import { isOmieShadowMode } from "./integration-mode";
import { loadLineRoutingRules, mapOmieOrderToPcp } from "./mapper";
import type { OmiePedidoCompleto, OmieWebhookPayload, PcpOrderDraft } from "./types";

export interface SyncResult {
  action: "created" | "updated" | "skipped" | "shadow" | "error";
  omieCodigoPedido?: number;
  pcpOrderId?: string;
  message?: string;
}

export function getOmieEtapaPcp(): string {
  return (process.env.OMIE_ETAPA_PCP || "60").trim();
}

export async function resolveDefaultCompanyId(
  supabase: SupabaseClient
): Promise<string> {
  const fromEnv = process.env.OMIE_DEFAULT_COMPANY_ID?.trim();
  if (fromEnv) return fromEnv;

  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("Nenhuma company_id ativa. Defina OMIE_DEFAULT_COMPANY_ID.");
  }
  return data.id as string;
}

async function resolveClientName(
  omie: OmiePedidoCompleto,
  client?: OmieClient
): Promise<string> {
  const cod = omie.cabecalho?.codigo_cliente;
  if (!cod) return "Cliente Omie";
  const c = client ?? new OmieClient();
  const info = await c.consultarCliente(cod);
  return (
    info?.nome_fantasia ||
    info?.razao_social ||
    `Cliente ${cod}`
  ).slice(0, 255);
}

export async function syncOmiePedidoToPcp(
  supabase: SupabaseClient,
  omiePedido: OmiePedidoCompleto,
  opts?: { client?: OmieClient; forceUpdate?: boolean }
): Promise<SyncResult> {
  const codigo = omiePedido.cabecalho?.codigo_pedido;
  if (!codigo) {
    return { action: "error", message: "codigo_pedido ausente" };
  }

  const etapaAlvo = getOmieEtapaPcp();
  const etapaAtual = omiePedido.cabecalho?.etapa;
  if (etapaAtual && etapaAtual !== etapaAlvo) {
    return {
      action: "skipped",
      omieCodigoPedido: codigo,
      message: `Etapa ${etapaAtual} ≠ ${etapaAlvo}`,
    };
  }

  const companyId = await resolveDefaultCompanyId(supabase);
  const rules = await loadLineRoutingRules(supabase, companyId);
  const clientName = await resolveClientName(omiePedido, opts?.client);
  const draft = mapOmieOrderToPcp(omiePedido, { companyId, clientName, rules });

  const { data: existingLink } = await supabase
    .from("omie_order_links")
    .select("id, pcp_order_id, sync_status")
    .eq("omie_codigo_pedido", codigo)
    .maybeSingle();

  if (existingLink?.sync_status === "manual_override") {
    return {
      action: "skipped",
      omieCodigoPedido: codigo,
      pcpOrderId: existingLink.pcp_order_id,
      message: "manual_override",
    };
  }

  if (isOmieShadowMode()) {
    console.info("[omie shadow] Pedido mapeado:", {
      codigo,
      orderNumber: draft.orderNumber,
      clientName: draft.clientName,
      items: draft.items.length,
    });
    return {
      action: "shadow",
      omieCodigoPedido: codigo,
      message: JSON.stringify(draft, null, 0).slice(0, 500),
    };
  }

  if (existingLink?.pcp_order_id && !opts?.forceUpdate) {
    await updateExistingOrder(supabase, existingLink.pcp_order_id, draft, omiePedido, codigo);
    return {
      action: "updated",
      omieCodigoPedido: codigo,
      pcpOrderId: existingLink.pcp_order_id,
    };
  }

  if (existingLink?.pcp_order_id) {
    await updateExistingOrder(supabase, existingLink.pcp_order_id, draft, omiePedido, codigo);
    return {
      action: "updated",
      omieCodigoPedido: codigo,
      pcpOrderId: existingLink.pcp_order_id,
    };
  }

  const created = await createOrderFromDraft(supabase, draft, omiePedido, codigo);
  return {
    action: "created",
    omieCodigoPedido: codigo,
    pcpOrderId: created.orderId,
  };
}

async function loadLineIdsByName(
  supabase: SupabaseClient,
  companyId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("production_lines")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.name).trim().toUpperCase(), row.id as string);
  }
  return map;
}

async function createOrderFromDraft(
  supabase: SupabaseClient,
  draft: PcpOrderDraft,
  omie: OmiePedidoCompleto,
  omieCodigo: number
): Promise<{ orderId: string }> {
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      company_id: draft.companyId,
      order_number: draft.orderNumber,
      client_name: draft.clientName,
      delivery_deadline: draft.deliveryDeadline,
      status: draft.status,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message ?? "Falha ao criar order");
  }

  const lineMap = await loadLineIdsByName(supabase, draft.companyId);
  const items = draft.items.map((it, i) => ({
    order_id: order.id,
    item_number: i + 1,
    description: it.description,
    quantity: it.quantity,
    line_id: lineMap.get(it.lineName.toUpperCase()) ?? null,
    status: "waiting" as const,
    product_code: it.productCode,
  }));

  if (items.length) {
    const { error: itemsErr } = await supabase.from("order_items").insert(items);
    if (itemsErr) throw new Error(itemsErr.message);
  }

  await supabase.from("omie_order_links").upsert(
    {
      pcp_order_id: order.id,
      omie_codigo_pedido: omieCodigo,
      omie_numero_pedido: draft.orderNumber,
      omie_etapa: omie.cabecalho?.etapa,
      omie_payload_original: omie,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "omie_codigo_pedido" }
  );

  await writeAudit(supabase, draft.companyId, order.id, "INSERT", null, draft);

  return { orderId: order.id as string };
}

async function updateExistingOrder(
  supabase: SupabaseClient,
  orderId: string,
  draft: PcpOrderDraft,
  omie: OmiePedidoCompleto,
  omieCodigo: number
) {
  const { data: before } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  await supabase
    .from("orders")
    .update({
      client_name: draft.clientName,
      delivery_deadline: draft.deliveryDeadline,
    })
    .eq("id", orderId);

  await supabase
    .from("omie_order_links")
    .update({
      omie_numero_pedido: draft.orderNumber,
      omie_etapa: omie.cabecalho?.etapa,
      omie_payload_original: omie,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
    })
    .eq("omie_codigo_pedido", omieCodigo);

  await writeAudit(supabase, draft.companyId, orderId, "UPDATE", before, draft);
}

async function writeAudit(
  supabase: SupabaseClient,
  companyId: string,
  orderId: string,
  action: "INSERT" | "UPDATE",
  oldData: unknown,
  draft: PcpOrderDraft
) {
  await supabase.from("audit_log").insert({
    company_id: companyId,
    table_name: "orders",
    record_id: orderId,
    action,
    old_data: oldData ?? null,
    new_data: {
      source: "omie",
      order_number: draft.orderNumber,
      client_name: draft.clientName,
      items_count: draft.items.length,
    },
    user_email: "omie-integration@system",
  });
}

export function extractEventId(payload: OmieWebhookPayload, rawBody: string): string {
  if (payload.event_id) return String(payload.event_id);
  if (payload.id) return String(payload.id);
  const cod = payload.codigo_pedido ?? payload.nCodPed;
  const etapa = payload.nova_etapa ?? payload.etapa;
  return `hash-${cod ?? "x"}-${etapa ?? "y"}-${rawBody.length}`;
}

export function shouldProcessWebhook(payload: OmieWebhookPayload): boolean {
  const type = String(
    payload.event_type ?? payload.topic ?? payload.type ?? ""
  ).toLowerCase();
  if (type && !type.includes("etapa") && !type.includes("pedido")) {
    return false;
  }
  const nova = String(payload.nova_etapa ?? payload.etapa ?? "").trim();
  return nova === getOmieEtapaPcp();
}

export async function processOmieWebhookEvent(
  supabase: SupabaseClient,
  eventDbId: number,
  payload: OmieWebhookPayload
): Promise<void> {
  const client = new OmieClient();
  const codigo = Number(payload.codigo_pedido ?? payload.nCodPed);
  if (!Number.isFinite(codigo)) {
    throw new Error("Webhook sem codigo_pedido");
  }

  const pedido = await client.consultarPedido(codigo);
  const result = await syncOmiePedidoToPcp(supabase, pedido, { client });

  if (result.action === "error") {
    throw new Error(result.message ?? "sync error");
  }

  await supabase
    .from("omie_webhook_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      error_message: result.action === "shadow" ? "shadow mode" : null,
    })
    .eq("id", eventDbId);
}

export async function runOmiePoll(supabase: SupabaseClient): Promise<{
  encontrados: number;
  criados: number;
  atualizados: number;
  skipped: number;
  shadow: number;
  erros: number;
}> {
  const report = {
    encontrados: 0,
    criados: 0,
    atualizados: 0,
    skipped: 0,
    shadow: 0,
    erros: 0,
  };

  const { data: lastLink } = await supabase
    .from("omie_order_links")
    .select("last_synced_at")
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastLink?.last_synced_at
    ? new Date(new Date(lastLink.last_synced_at as string).getTime() - 3600_000)
    : new Date(Date.now() - 7 * 86400_000);

  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const client = new OmieClient();
  const pedidos = await client.listarPedidos({
    data_inicio: fmt(since),
    data_fim: fmt(new Date()),
    etapa: getOmieEtapaPcp(),
    registros_por_pagina: 30,
  });

  report.encontrados = pedidos.length;

  for (const pedido of pedidos) {
    try {
      const r = await syncOmiePedidoToPcp(supabase, pedido, { client });
      if (r.action === "created") report.criados += 1;
      else if (r.action === "updated") report.atualizados += 1;
      else if (r.action === "shadow") report.shadow += 1;
      else report.skipped += 1;
    } catch (e) {
      report.erros += 1;
      console.error("[omie poll]", e);
    }
  }

  await supabase.from("omie_sync_state").upsert({
    id: "default",
    last_poll_at: new Date().toISOString(),
    last_poll_success_at: new Date().toISOString(),
    last_poll_report: report,
    updated_at: new Date().toISOString(),
  });

  return report;
}

export async function acquireSyncLock(
  supabase: SupabaseClient,
  lockName: string,
  ttlMinutes = 10
): Promise<boolean> {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMinutes * 60_000);

  await supabase
    .from("sync_locks")
    .delete()
    .eq("lock_name", lockName)
    .lt("expires_at", now.toISOString());

  const { error } = await supabase.from("sync_locks").insert({
    lock_name: lockName,
    acquired_at: now.toISOString(),
    acquired_by: process.env.VERCEL_URL ?? "local",
    expires_at: expires.toISOString(),
  });

  return !error;
}

export async function releaseSyncLock(
  supabase: SupabaseClient,
  lockName: string
): Promise<void> {
  await supabase.from("sync_locks").delete().eq("lock_name", lockName);
}
