import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toDateOnly, toQuantity } from "@/lib/utils/supabase-data";
import { OmieClient } from "./client";
import { resolveClientNameForPedido, type OmieClientNameCache } from "./client-name-resolver";
import { getOmieIntegrationMode } from "./integration-mode";
import {
  diffOrderHeader,
  isOrderClosedForOmieAdds,
  planItemSync,
  type PcpItemRow,
  type PerOrderMatchStats,
} from "./incremental-sync";
import { mapOmiePedidoToPcp } from "./mapper";
import type {
  OmieImportReport,
  OmiePedidoCompleto,
  OmieSyncIncrementalCounters,
  PerOrderSyncSummary,
  PcpOrderImportDraft,
} from "./types";

const LOCK_NAME = "omie-import";
const LOCK_TTL_MINUTES = 10;

export function getOmieEtapaFabricacao(): string {
  return (process.env.OMIE_ETAPA_FABRICACAO ?? "20").trim();
}

export function getOmieCompanyId(): string {
  const id = process.env.OMIE_CODIGO_EMPRESA_HEPA?.trim();
  if (!id) {
    throw new Error(
      "OMIE_CODIGO_EMPRESA_HEPA ausente — defina o UUID da empresa HEPA no .env"
    );
  }
  return id;
}

function emptyCounters(): OmieSyncIncrementalCounters {
  return {
    itens_adicionados: 0,
    itens_atualizados: 0,
    itens_removidos: 0,
    itens_marcados_removido_no_omie: 0,
    itens_marcados_divergente_no_omie: 0,
  };
}

export function createEmptyOmieReport(modo: "shadow" | "active"): OmieImportReport {
  return {
    modo,
    pedidos_novos: 0,
    pedidos_sincronizados: 0,
    ...emptyCounters(),
    erros: [],
    encontrados: 0,
    skipped: 0,
    criados: 0,
    shadow_detectados: 0,
    shadow_logs: [],
    pedido_sync_resumos: [],
  };
}

async function acquireLock(
  supabase: SupabaseClient,
  holder: string
): Promise<boolean> {
  const now = new Date();
  const expires = new Date(now.getTime() + LOCK_TTL_MINUTES * 60_000);

  const { data: existing } = await supabase
    .from("sync_locks")
    .select("expires_at")
    .eq("lock_name", LOCK_NAME)
    .maybeSingle();

  if (existing?.expires_at) {
    const exp = new Date(existing.expires_at as string);
    if (exp > now) return false;
  }

  const { error } = await supabase.from("sync_locks").upsert(
    {
      lock_name: LOCK_NAME,
      acquired_at: now.toISOString(),
      acquired_by: holder,
      expires_at: expires.toISOString(),
    },
    { onConflict: "lock_name" }
  );

  return !error;
}

async function releaseLock(supabase: SupabaseClient) {
  await supabase.from("sync_locks").delete().eq("lock_name", LOCK_NAME);
}

async function insertOrderItems(
  supabase: SupabaseClient,
  orderId: string,
  items: PcpOrderImportDraft["items"],
  modo: "shadow" | "active"
): Promise<{ error: string | null }> {
  if (modo === "shadow") return { error: null };

  const rows = items.map((item) => {
    const row: Record<string, unknown> = {
      order_id: orderId,
      description: item.description,
      quantity: toQuantity(item.quantity),
      line_id: null,
    };
    if (item.productCode) row.product_code = item.productCode;
    if (item.omieCodigoItem != null) row.omie_codigo_item = item.omieCodigoItem;
    return row;
  });

  let res = await supabase.from("order_items").insert(rows);
  if (
    res.error &&
    /product_code|omie_codigo_item|omie_sync_flag|schema cache|column|does not exist|PGRST204/i.test(
      res.error.message
    )
  ) {
    const stripped = rows.map((r) => {
      const {
        product_code: _p,
        omie_codigo_item: _o,
        ...rest
      } = r;
      return rest;
    });
    res = await supabase.from("order_items").insert(stripped);
  }

  return { error: res.error?.message ?? null };
}

function countersFromStats(stats: PerOrderMatchStats): OmieSyncIncrementalCounters {
  return {
    itens_adicionados: stats.itens_adicionados,
    itens_atualizados: stats.itens_atualizados,
    itens_removidos: stats.itens_removidos,
    itens_marcados_removido_no_omie: stats.itens_marcados_removido_no_omie,
    itens_marcados_divergente_no_omie: stats.itens_marcados_divergente_no_omie,
  };
}

function mergeSimulatedShadowCounters(
  report: OmieImportReport,
  c: OmieSyncIncrementalCounters
) {
  const prev = report.itens_simulados_shadow ?? 0;
  report.itens_simulados_shadow =
    prev +
    c.itens_adicionados +
    c.itens_atualizados +
    c.itens_removidos +
    c.itens_marcados_removido_no_omie +
    c.itens_marcados_divergente_no_omie;
}

async function createPcpOrderFromDraft(
  supabase: SupabaseClient,
  draft: PcpOrderImportDraft,
  companyId: string
): Promise<{ orderId: string } | { error: string }> {
  const orderPayload = {
    company_id: companyId,
    order_number: draft.orderNumber,
    client_name: draft.clientName,
    delivery_deadline: toDateOnly(draft.deliveryDeadline),
    status: draft.status,
  };

  let ordersRes = await supabase.from("orders").insert(orderPayload).select("id");
  if (ordersRes.error?.message?.includes("delivery_deadline")) {
    const { delivery_deadline: _, ...without } = orderPayload;
    ordersRes = await supabase.from("orders").insert(without).select("id");
  }

  if (ordersRes.error || !ordersRes.data?.[0]?.id) {
    return {
      error: ordersRes.error?.message ?? "falha ao criar order",
    };
  }

  return { orderId: ordersRes.data[0].id as string };
}

async function recordAuditSummary(
  supabase: SupabaseClient,
  companyId: string,
  report: OmieImportReport,
  operation: "OMIE_IMPORT" | "OMIE_SYNC_INCREMENTAL"
) {
  await supabase.from("audit_log").insert({
    company_id: companyId,
    table_name: "omie_import",
    record_id: `batch-${Date.now()}`,
    action: "INSERT",
    new_data: {
      operation,
      ...report,
    },
    user_email: "system@omie-cron",
  });
}

async function fetchPcpItems(
  supabase: SupabaseClient,
  orderId: string
): Promise<PcpItemRow[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select(
      "id, order_id, description, quantity, product_code, omie_codigo_item, omie_sync_flag, omie_sync_detail, line_id, production_start, production_end, status, completed_at, almox_supplied_at"
    )
    .eq("order_id", orderId);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as PcpItemRow[];
}

/**
 * Sincroniza itens Omie ↔ PCP para pedido já vinculado.
 * Preserva line_id, produção, almox e demais campos operacionais.
 */
function statsToSummary(
  stats: PerOrderMatchStats,
  meta: {
    omieCodigoPedido: number;
    orderNumber?: string;
    pcpOrderId: string | null;
  }
): PerOrderSyncSummary {
  return {
    omie_codigo_pedido: meta.omieCodigoPedido,
    order_number: meta.orderNumber,
    pcp_order_id: meta.pcpOrderId,
    ...stats,
  };
}

function logPerOrderSummary(
  summary: PerOrderSyncSummary,
  modo: "shadow" | "active"
) {
  console.info(`[omie ${modo}] resumo casamento pedido ${summary.order_number ?? summary.omie_codigo_pedido}:`, {
    total_itens_omie: summary.total_itens_omie,
    total_itens_pcp: summary.total_itens_pcp,
    casados_chave_forte: summary.casados_chave_forte,
    casados_fallback_identico: summary.casados_fallback_identico,
    casados_fallback_ordem: summary.casados_fallback_ordem,
    omie_codigo_item_preenchidos: summary.omie_codigo_item_preenchidos,
    itens_adicionados: summary.itens_adicionados,
    itens_atualizados: summary.itens_atualizados,
    itens_alertados: summary.itens_alertados,
    itens_marcados_removido_no_omie: summary.itens_marcados_removido_no_omie,
    itens_marcados_divergente_no_omie: summary.itens_marcados_divergente_no_omie,
    itens_qty_atualizados: summary.itens_qty_atualizados,
    itens_qty_divergentes_alertados: summary.itens_qty_divergentes_alertados,
    itens_qty_ignorados_nao_confiavel: summary.itens_qty_ignorados_nao_confiavel,
    alertas: summary.alertas,
  });
}

export async function sincronizarItensDoPedido(
  supabase: SupabaseClient,
  opts: {
    pcpOrderId: string | null;
    omieCodigoPedido: number;
    draft: PcpOrderImportDraft;
    modo: "shadow" | "active";
    shadowLogs: string[];
  }
): Promise<
  OmieSyncIncrementalCounters & {
    summary?: PerOrderSyncSummary;
    simulatedCounters?: OmieSyncIncrementalCounters;
  }
> {
  const counters = emptyCounters();
  const { pcpOrderId, omieCodigoPedido, draft, modo, shadowLogs } = opts;

  const existingItems = pcpOrderId ? await fetchPcpItems(supabase, pcpOrderId) : [];

  let orderNumber = draft.orderNumber;
  let orderStatus: string | null = null;
  if (pcpOrderId) {
    const { data: orderRow } = await supabase
      .from("orders")
      .select("client_name, delivery_deadline, status, order_number")
      .eq("id", pcpOrderId)
      .maybeSingle();
    if (orderRow) {
      orderNumber = String(orderRow.order_number ?? orderNumber);
      orderStatus = orderRow.status as string | null;
      const headerPatch = diffOrderHeader(
        {
          client_name: String(orderRow.client_name ?? ""),
          delivery_deadline: orderRow.delivery_deadline as string | null,
        },
        draft
      );
      if (headerPatch) {
        if (modo === "active") {
          await supabase.from("orders").update(headerPatch).eq("id", pcpOrderId);
        } else {
          shadowLogs.push(
            `[omie shadow] atualizaria cabecalho pedido ${pcpOrderId}: ${JSON.stringify(headerPatch)}`
          );
        }
      }
    }
  }

  const orderClosed = isOrderClosedForOmieAdds(orderStatus, existingItems);
  const plan = planItemSync(existingItems, draft.items, modo, {
    orderClosed,
    orderNumber,
  });

  for (const log of plan.shadowLogs) {
    shadowLogs.push(log);
    console.info(log);
  }

  const summary = statsToSummary(plan.stats, {
    omieCodigoPedido,
    orderNumber,
    pcpOrderId,
  });
  logPerOrderSummary(summary, modo);

  for (const action of plan.actions) {
    if (action.type === "alert") {
      continue;
    }
    if (action.type === "add") {
      if (modo === "active" && pcpOrderId) {
        const row: Record<string, unknown> = {
          order_id: pcpOrderId,
          description: action.item.description,
          quantity: toQuantity(action.item.quantity),
          line_id: null,
          omie_codigo_item: action.omieCodigoItem,
        };
        if (action.item.productCode) row.product_code = action.item.productCode;
        const { error } = await supabase.from("order_items").insert(row);
        if (error) {
          throw new Error(`insert item ${action.omieCodigoItem}: ${error.message}`);
        }
        counters.itens_adicionados += 1;
      }
    } else if (action.type === "update") {
      if (modo === "active" && pcpOrderId) {
        const patch: Record<string, unknown> = {};
        if (action.setOmieCodigoItem) {
          patch.omie_codigo_item = action.omieCodigoItem;
        }
        for (const ch of action.changes) {
          if (ch.field === "description") patch.description = ch.to;
          if (ch.field === "quantity") patch.quantity = toQuantity(ch.to as number);
          if (ch.field === "product_code") patch.product_code = ch.to;
        }
        const { error } = await supabase
          .from("order_items")
          .update(patch)
          .eq("id", action.pcpItemId);
        if (error) {
          throw new Error(`update item ${action.omieCodigoItem}: ${error.message}`);
        }
        counters.itens_atualizados += 1;
      }
    } else if (action.type === "delete") {
      if (modo === "active" && pcpOrderId) {
        const { error } = await supabase
          .from("order_items")
          .delete()
          .eq("id", action.pcpItemId);
        if (error) {
          throw new Error(`delete item ${action.omieCodigoItem}: ${error.message}`);
        }
        counters.itens_removidos += 1;
      }
    } else if (action.type === "mark_removed") {
      if (modo === "active" && pcpOrderId) {
        const detail =
          "Item sumiu no Omie mas permanece no PCP (em produção) — mediar com vendas/produção";
        let { error } = await supabase
          .from("order_items")
          .update({
            omie_sync_flag: "removido_no_omie",
            omie_sync_detail: detail,
          })
          .eq("id", action.pcpItemId);
        if (
          error &&
          /omie_sync_detail|schema cache|column|does not exist/i.test(error.message)
        ) {
          ({ error } = await supabase
            .from("order_items")
            .update({ omie_sync_flag: "removido_no_omie" })
            .eq("id", action.pcpItemId));
        }
        if (error) {
          throw new Error(
            `mark removido_no_omie ${action.omieCodigoItem}: ${error.message}`
          );
        }
        counters.itens_marcados_removido_no_omie += 1;
      }
    } else if (action.type === "mark_divergent") {
      if (modo === "active" && pcpOrderId) {
        let { error } = await supabase
          .from("order_items")
          .update({
            omie_sync_flag: "divergente_no_omie",
            omie_sync_detail: action.motivo,
          })
          .eq("id", action.pcpItemId);
        if (
          error &&
          /omie_sync_detail|schema cache|column|does not exist/i.test(error.message)
        ) {
          ({ error } = await supabase
            .from("order_items")
            .update({ omie_sync_flag: "divergente_no_omie" })
            .eq("id", action.pcpItemId));
        }
        if (error) {
          throw new Error(
            `mark divergente_no_omie ${action.omieCodigoItem}: ${error.message}`
          );
        }
        counters.itens_marcados_divergente_no_omie += 1;
      }
    }
  }

  const simulatedCounters =
    modo === "shadow" ? countersFromStats(plan.stats) : undefined;

  return { ...counters, summary, simulatedCounters };
}

function mergeCounters(
  report: OmieImportReport,
  c: OmieSyncIncrementalCounters
) {
  report.itens_adicionados += c.itens_adicionados;
  report.itens_atualizados += c.itens_atualizados;
  report.itens_removidos += c.itens_removidos;
  report.itens_marcados_removido_no_omie += c.itens_marcados_removido_no_omie;
  report.itens_marcados_divergente_no_omie =
    (report.itens_marcados_divergente_no_omie ?? 0) + c.itens_marcados_divergente_no_omie;
}

async function resolveFullPedido(
  omie: OmiePedidoCompleto,
  client: OmieClient
): Promise<OmiePedidoCompleto | { error: string }> {
  if (omie.det?.length) return omie;
  const codigo = omie.cabecalho?.codigo_pedido;
  if (!codigo) return { error: "codigo_pedido ausente" };
  try {
    return await client.consultarPedido(codigo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function processOnePedido(
  supabase: SupabaseClient,
  omie: OmiePedidoCompleto,
  companyId: string,
  client: OmieClient,
  modo: "shadow" | "active",
  report: OmieImportReport,
  clientNameCache: OmieClientNameCache = new Map()
): Promise<{ outcome: "created" | "shadow" | "synced" | "skipped" | "error"; message?: string }> {
  const codigo = omie.cabecalho?.codigo_pedido;
  if (!codigo) {
    return { outcome: "error", message: "codigo_pedido ausente" };
  }

  const { data: existingLink } = await supabase
    .from("omie_order_links")
    .select("id, pcp_order_id, sync_status")
    .eq("omie_codigo_pedido", codigo)
    .maybeSingle();

  if (existingLink?.sync_status === "backfill_skipped") {
    return { outcome: "skipped", message: "backfill_skipped — nao reprocessa" };
  }

  const fullResult = await resolveFullPedido(omie, client);
  if ("error" in fullResult) {
    return { outcome: "error", message: fullResult.error };
  }
  const full = fullResult;

  let draft: PcpOrderImportDraft;
  try {
    const clientName = await resolveClientNameForPedido(full, client, clientNameCache);
    draft = mapOmiePedidoToPcp(full, companyId, { clientName });
  } catch (e) {
    return {
      outcome: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const etapa = full.cabecalho?.etapa ?? getOmieEtapaFabricacao();
  const numero = draft.orderNumber;
  const payloadOriginal = full as unknown as Record<string, unknown>;
  const shadowLogs = report.shadow_logs ?? [];

  if (existingLink) {
    try {
      let pcpOrderId = existingLink.pcp_order_id as string | null;
      let materializedFromShadow = false;

      if (!pcpOrderId && modo === "active") {
        const created = await createPcpOrderFromDraft(supabase, draft, companyId);
        if ("error" in created) {
          return { outcome: "error", message: created.error };
        }
        pcpOrderId = created.orderId;
        materializedFromShadow = true;

        const { error: linkMatErr } = await supabase
          .from("omie_order_links")
          .update({
            pcp_order_id: pcpOrderId,
            sync_status: "synced",
            omie_numero_pedido: numero,
            omie_etapa: etapa,
            omie_payload_original: payloadOriginal,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", existingLink.id);

        if (linkMatErr) {
          return { outcome: "error", message: linkMatErr.message };
        }
      }

      const result = await sincronizarItensDoPedido(supabase, {
        pcpOrderId,
        omieCodigoPedido: codigo,
        draft,
        modo,
        shadowLogs,
      });
      mergeCounters(report, result);
      if (result.simulatedCounters) {
        mergeSimulatedShadowCounters(report, result.simulatedCounters);
      }
      if (result.summary) {
        report.pedido_sync_resumos = report.pedido_sync_resumos ?? [];
        report.pedido_sync_resumos.push(result.summary);
      }

      if (!materializedFromShadow) {
        await supabase
          .from("omie_order_links")
          .update({
            omie_numero_pedido: numero,
            omie_etapa: etapa,
            omie_payload_original: payloadOriginal,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", existingLink.id);
      }

      return { outcome: materializedFromShadow ? "created" : "synced" };
    } catch (e) {
      return {
        outcome: "error",
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  if (modo === "shadow") {
    const { error: linkErr } = await supabase.from("omie_order_links").insert({
      pcp_order_id: null,
      omie_codigo_pedido: codigo,
      omie_numero_pedido: numero,
      omie_etapa: etapa,
      omie_payload_original: payloadOriginal,
      sync_status: "shadow_detected",
    });

    if (linkErr) {
      return { outcome: "error", message: linkErr.message };
    }

    const plan = planItemSync([], draft.items, "shadow", {
      orderClosed: false,
      orderNumber: numero,
    });
    for (const log of plan.shadowLogs) {
      shadowLogs.push(log);
      console.info(log);
    }
    mergeSimulatedShadowCounters(report, countersFromStats(plan.stats));

    console.info("[omie shadow] Importaria pedido:", {
      codigo,
      orderNumber: numero,
      clientName: draft.clientName,
      items: draft.items.length,
      deliveryDeadline: draft.deliveryDeadline,
    });

    return { outcome: "shadow" };
  }

  const created = await createPcpOrderFromDraft(supabase, draft, companyId);
  if ("error" in created) {
    return { outcome: "error", message: created.error };
  }

  const orderId = created.orderId;
  const itemsRes = await insertOrderItems(supabase, orderId, draft.items, modo);
  if (itemsRes.error) {
    return { outcome: "error", message: itemsRes.error };
  }

  report.itens_adicionados += draft.items.length;

  const { error: linkErr } = await supabase.from("omie_order_links").insert({
    pcp_order_id: orderId,
    omie_codigo_pedido: codigo,
    omie_numero_pedido: numero,
    omie_etapa: etapa,
    omie_payload_original: payloadOriginal,
    sync_status: "synced",
  });

  if (linkErr) {
    return { outcome: "error", message: linkErr.message };
  }

  return { outcome: "created" };
}

/**
 * Importa / sincroniza pedidos Omie na etapa Ordem de Fabricação (20).
 * Somente leitura na API Omie.
 */
export async function importarPedidosDaFabricacao(): Promise<OmieImportReport> {
  const supabase = createSupabaseAdminClient();
  const modo = getOmieIntegrationMode();
  const companyId = getOmieCompanyId();
  const etapa = getOmieEtapaFabricacao();
  const client = new OmieClient();

  const report = createEmptyOmieReport(modo);

  const locked = await acquireLock(supabase, "importarPedidosDaFabricacao");
  if (!locked) {
    return { ...report, skipped_reason: "locked" };
  }

  try {
    client.assertConfigured();
    const resumos = await client.listarTodosPedidosDaEtapa(etapa);
    report.encontrados = resumos.length;

    let hasIncremental = false;
    const clientNameCache: OmieClientNameCache = new Map();

    for (const resumo of resumos) {
      const codigo = resumo.cabecalho?.codigo_pedido;
      if (!codigo) {
        report.erros.push({ message: "resumo sem codigo_pedido" });
        continue;
      }

      try {
        const result = await processOnePedido(
          supabase,
          resumo,
          companyId,
          client,
          modo,
          report,
          clientNameCache
        );

        if (result.outcome === "created") {
          report.pedidos_novos += 1;
          report.criados += 1;
        } else if (result.outcome === "shadow") {
          report.pedidos_novos += 1;
          report.shadow_detectados += 1;
        } else if (result.outcome === "synced") {
          report.pedidos_sincronizados += 1;
          hasIncremental = true;
        } else if (result.outcome === "skipped") {
          report.skipped += 1;
        } else if (result.outcome === "error") {
          report.erros.push({
            omie_codigo_pedido: codigo,
            message: result.message ?? "erro desconhecido",
          });
        }
      } catch (e) {
        report.erros.push({
          omie_codigo_pedido: codigo,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const operation = hasIncremental ? "OMIE_SYNC_INCREMENTAL" : "OMIE_IMPORT";
    await recordAuditSummary(supabase, companyId, report, operation);
    return report;
  } finally {
    await releaseLock(supabase);
  }
}
