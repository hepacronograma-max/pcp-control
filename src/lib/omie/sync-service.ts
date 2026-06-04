import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toDateOnly, toQuantity } from "@/lib/utils/supabase-data";
import { OmieClient } from "./client";
import { getOmieIntegrationMode } from "./integration-mode";
import { mapOmiePedidoToPcp } from "./mapper";
import type { OmieImportReport, OmiePedidoCompleto, PcpOrderImportDraft } from "./types";

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
  items: PcpOrderImportDraft["items"]
): Promise<{ error: string | null }> {
  const rows = items.map((item) => {
    const row: Record<string, unknown> = {
      order_id: orderId,
      description: item.description,
      quantity: toQuantity(item.quantity),
      line_id: null,
    };
    if (item.productCode) row.product_code = item.productCode;
    return row;
  });

  let res = await supabase.from("order_items").insert(rows);
  if (
    res.error &&
    /product_code|schema cache|column|does not exist|PGRST204/i.test(res.error.message)
  ) {
    const stripped = rows.map((r) => {
      const { product_code: _, ...rest } = r;
      return rest;
    });
    res = await supabase.from("order_items").insert(stripped);
  }

  return { error: res.error?.message ?? null };
}

async function recordAuditSummary(
  supabase: SupabaseClient,
  companyId: string,
  report: OmieImportReport
) {
  await supabase.from("audit_log").insert({
    company_id: companyId,
    table_name: "omie_import",
    record_id: `batch-${Date.now()}`,
    action: "INSERT",
    new_data: {
      operation: "OMIE_IMPORT",
      ...report,
    },
    user_email: "system@omie-cron",
  });
}

async function processOnePedido(
  supabase: SupabaseClient,
  omie: OmiePedidoCompleto,
  companyId: string,
  client: OmieClient,
  modo: "shadow" | "active"
): Promise<{
  outcome: "created" | "shadow" | "skipped" | "error";
  message?: string;
}> {
  const codigo = omie.cabecalho?.codigo_pedido;
  if (!codigo) {
    return { outcome: "error", message: "codigo_pedido ausente" };
  }

  const { data: existingLink } = await supabase
    .from("omie_order_links")
    .select("id, pcp_order_id, sync_status")
    .eq("omie_codigo_pedido", codigo)
    .maybeSingle();

  if (existingLink) {
    return { outcome: "skipped", message: "ja vinculado em omie_order_links" };
  }

  let full = omie;
  if (!full.det?.length) {
    try {
      full = await client.consultarPedido(codigo);
    } catch (e) {
      return {
        outcome: "error",
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  let draft: PcpOrderImportDraft;
  try {
    draft = mapOmiePedidoToPcp(full, companyId);
  } catch (e) {
    return {
      outcome: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const etapa = full.cabecalho?.etapa ?? getOmieEtapaFabricacao();
  const numero = draft.orderNumber;
  const payloadOriginal = full as unknown as Record<string, unknown>;

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

    console.info("[omie shadow] Importaria pedido:", {
      codigo,
      orderNumber: numero,
      clientName: draft.clientName,
      items: draft.items.length,
      deliveryDeadline: draft.deliveryDeadline,
    });

    return { outcome: "shadow" };
  }

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
      outcome: "error",
      message: ordersRes.error?.message ?? "falha ao criar order",
    };
  }

  const orderId = ordersRes.data[0].id as string;
  const itemsRes = await insertOrderItems(supabase, orderId, draft.items);
  if (itemsRes.error) {
    return { outcome: "error", message: itemsRes.error };
  }

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
 * Importa pedidos Omie na etapa Ordem de Fabricação (20).
 * Somente leitura na API Omie. Shadow: não cria orders até OMIE_INTEGRATION_MODE=active.
 */
export async function importarPedidosDaFabricacao(): Promise<OmieImportReport> {
  const supabase = createSupabaseAdminClient();
  const modo = getOmieIntegrationMode();
  const companyId = getOmieCompanyId();
  const etapa = getOmieEtapaFabricacao();
  const client = new OmieClient();

  const report: OmieImportReport = {
    modo,
    encontrados: 0,
    criados: 0,
    shadow_detectados: 0,
    skipped: 0,
    erros: [],
  };

  const locked = await acquireLock(supabase, "importarPedidosDaFabricacao");
  if (!locked) {
    return {
      ...report,
      skipped: 0,
      skipped_reason: "locked",
    };
  }

  try {
    client.assertConfigured();
    const resumos = await client.listarTodosPedidosDaEtapa(etapa);
    report.encontrados = resumos.length;

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
          modo
        );

        if (result.outcome === "created") report.criados += 1;
        else if (result.outcome === "shadow") report.shadow_detectados += 1;
        else if (result.outcome === "skipped") report.skipped += 1;
        else if (result.outcome === "error") {
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

    await recordAuditSummary(supabase, companyId, report);
    return report;
  } finally {
    await releaseLock(supabase);
  }
}
