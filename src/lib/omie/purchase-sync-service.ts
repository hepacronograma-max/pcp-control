import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toDateOnly } from "@/lib/utils/supabase-data";
import { OmieClient } from "./client";
import { pickOmieClientDisplayName } from "./client-name-resolver";
import { getOmieIntegrationMode } from "./integration-mode";
import {
  extractPedCompraCodigo,
  extractPedCompraSupplierName,
  mapOmiePedCompraToPcp,
} from "./purchase-mapper";
import { getOmieCompanyId } from "./sync-service";
import type {
  OmiePedidoCompra,
  OmiePurchaseImportReport,
  PcpPurchaseImportDraft,
} from "./types";

const LOCK_NAME = "omie-compras-import";
const LOCK_TTL_MINUTES = 10;

function lookbackDays(): number {
  const n = Number(process.env.OMIE_COMPRAS_LOOKBACK_DAYS ?? "540");
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : 540;
}

function formatBrDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
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

async function resolveSupplierName(
  pedido: OmiePedidoCompra,
  client: OmieClient,
  cache: Map<number, string>
): Promise<string | null> {
  const fromPedido = extractPedCompraSupplierName(pedido);
  if (fromPedido) return fromPedido;
  const codigo = pedido.cabecalho_consulta?.nCodFor;
  if (codigo == null || !Number.isFinite(Number(codigo))) return null;
  const cached = cache.get(Number(codigo));
  if (cached) return cached;
  try {
    const cadastro = await client.consultarFornecedor(Number(codigo));
    const extra = cadastro as {
      razao_social?: string;
      nome_fantasia?: string;
      cRazaoSocial?: string;
      cNomeFantasia?: string;
      cRazaoFor?: string;
      cNomeFor?: string;
    };
    const resolved = pickOmieClientDisplayName(
      extra.razao_social || extra.cRazaoSocial || extra.cRazaoFor,
      extra.nome_fantasia || extra.cNomeFantasia || extra.cNomeFor
    );
    if (resolved) {
      cache.set(Number(codigo), resolved);
      return resolved;
    }
  } catch (err) {
    console.warn(
      `[omie compras] ConsultarFornecedor(${codigo}) falhou:`,
      err instanceof Error ? err.message : err
    );
  }
  return null;
}

async function resolveFullPedCompra(
  pedido: OmiePedidoCompra,
  client: OmieClient
): Promise<OmiePedidoCompra> {
  if (pedido.produtos_consulta?.length) return pedido;
  const codigo = extractPedCompraCodigo(pedido);
  if (codigo == null) return pedido;
  try {
    return await client.consultarPedCompra(codigo);
  } catch (err) {
    console.warn(
      `[omie compras] ConsultarPedCompra(${codigo}) falhou:`,
      err instanceof Error ? err.message : err
    );
    return pedido;
  }
}

async function propagatePcDeadline(
  supabase: SupabaseClient,
  purchaseOrderId: string,
  number: string,
  expectedDelivery: string | null
) {
  const { data: links } = await supabase
    .from("purchase_order_item_links")
    .select("order_item_id")
    .eq("purchase_order_id", purchaseOrderId);
  const ids = (links ?? []).map((l) => l.order_item_id as string);
  if (ids.length === 0) return;
  const { data: items } = await supabase
    .from("order_items")
    .select("id, pc_number")
    .in("id", ids);
  const matching = (items ?? [])
    .filter((it) => {
      const cur = String(it.pc_number ?? "").trim();
      return !cur || cur === number;
    })
    .map((it) => it.id as string);
  if (matching.length === 0) return;
  await supabase
    .from("order_items")
    .update({
      pc_number: number,
      pc_delivery_date: toDateOnly(expectedDelivery),
    })
    .in("id", matching);
}

async function upsertLines(
  supabase: SupabaseClient,
  purchaseOrderId: string,
  draft: PcpPurchaseImportDraft
): Promise<number> {
  if (draft.items.length === 0) return 0;
  const { data: existing } = await supabase
    .from("purchase_order_lines")
    .select("id, line_number")
    .eq("purchase_order_id", purchaseOrderId);
  const byNum = new Map(
    (existing ?? []).map((r) => [Number(r.line_number), r.id as string])
  );
  let written = 0;
  for (const item of draft.items) {
    const row = {
      purchase_order_id: purchaseOrderId,
      line_number: item.lineNumber,
      product_code: item.productCode,
      description: item.description,
      ncm: item.ncm,
      quantity: item.quantity,
      unit: item.unit,
      sort_order: item.lineNumber,
    };
    const id = byNum.get(item.lineNumber);
    if (id) {
      const { error } = await supabase
        .from("purchase_order_lines")
        .update(row)
        .eq("id", id);
      if (error && !/relation|does not exist|schema cache/i.test(error.message)) {
        throw new Error(`linha ${item.lineNumber}: ${error.message}`);
      }
      if (!error) written += 1;
    } else {
      const { error } = await supabase.from("purchase_order_lines").insert(row);
      if (error && !/relation|does not exist|schema cache/i.test(error.message)) {
        throw new Error(`linha ${item.lineNumber}: ${error.message}`);
      }
      if (!error) written += 1;
    }
  }
  return written;
}

async function processOne(
  supabase: SupabaseClient,
  draft: PcpPurchaseImportDraft,
  payloadOriginal: OmiePedidoCompra,
  modo: "shadow" | "active",
  report: OmiePurchaseImportReport
) {
  if (modo === "shadow") {
    report.shadow_logs = report.shadow_logs ?? [];
    report.shadow_logs.push(
      `Importaria PC ${draft.number} (Omie ${draft.omieCodigo}) · ${draft.items.length} item(ns) · prazo ${draft.expectedDelivery ?? "—"}`
    );
    report.pedidos_novos += 1;
    return;
  }

  const { data: existingLink, error: linkErr } = await supabase
    .from("omie_purchase_order_links")
    .select("id, purchase_order_id")
    .eq("omie_codigo_pedcompra", draft.omieCodigo)
    .maybeSingle();
  if (linkErr && /relation|does not exist|schema cache/i.test(linkErr.message)) {
    throw new Error(
      "Execute supabase-omie-purchase-links.sql no SQL Editor do Supabase."
    );
  }
  if (linkErr) throw new Error(linkErr.message);

  let poId = existingLink?.purchase_order_id as string | null | undefined;

  if (!poId) {
    const { data: byNumber } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("company_id", draft.companyId)
      .eq("number", draft.number)
      .maybeSingle();
    poId = byNumber?.id ?? null;
  }

  const header = {
    company_id: draft.companyId,
    number: draft.number,
    supplier_name: draft.supplierName,
    expected_delivery: draft.expectedDelivery,
    status: draft.status,
    notes: draft.notes,
    updated_at: new Date().toISOString(),
  };

  if (poId) {
    const { data: current } = await supabase
      .from("purchase_orders")
      .select("notes, supplier_name")
      .eq("id", poId)
      .maybeSingle();
    const keepNotes = String(current?.notes ?? "").trim();
    const keepSupplier = String(current?.supplier_name ?? "").trim();
    const { error } = await supabase
      .from("purchase_orders")
      .update({
        supplier_name: header.supplier_name || keepSupplier || null,
        expected_delivery: header.expected_delivery,
        status: header.status,
        notes: keepNotes || header.notes,
        updated_at: header.updated_at,
      })
      .eq("id", poId);
    if (error) throw new Error(error.message);
    report.pedidos_atualizados += 1;
  } else {
    const { data: ins, error } = await supabase
      .from("purchase_orders")
      .insert({
        ...header,
        status: draft.status,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505" || /unique|duplicate/i.test(error.message)) {
        const { data: again } = await supabase
          .from("purchase_orders")
          .select("id")
          .eq("company_id", draft.companyId)
          .eq("number", draft.number)
          .maybeSingle();
        if (!again?.id) throw new Error(error.message);
        poId = again.id as string;
        report.pedidos_atualizados += 1;
      } else {
        throw new Error(error.message);
      }
    } else {
      poId = ins.id as string;
      report.pedidos_novos += 1;
    }
  }

  if (!poId) {
    throw new Error("Falha ao gravar pedido de compra");
  }

  report.itens_gravados += await upsertLines(supabase, poId, draft);
  await propagatePcDeadline(
    supabase,
    poId,
    draft.number,
    draft.expectedDelivery
  );

  const linkRow = {
    purchase_order_id: poId,
    omie_codigo_pedcompra: draft.omieCodigo,
    omie_numero: draft.number,
    omie_etapa: draft.omieEtapa,
    omie_payload_original: payloadOriginal,
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
  };
  if (existingLink?.id) {
    const { error } = await supabase
      .from("omie_purchase_order_links")
      .update(linkRow)
      .eq("id", existingLink.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("omie_purchase_order_links")
      .insert(linkRow);
    if (error) throw new Error(error.message);
  }
}

export async function importarPedidosDeCompra(): Promise<OmiePurchaseImportReport> {
  const modo = getOmieIntegrationMode();
  const report: OmiePurchaseImportReport = {
    modo,
    encontrados: 0,
    pedidos_novos: 0,
    pedidos_atualizados: 0,
    itens_gravados: 0,
    skipped: 0,
    erros: [],
    shadow_logs: [],
  };

  const supabase = createSupabaseAdminClient();
  const locked = await acquireLock(supabase, "importarPedidosDeCompra");
  if (!locked) {
    report.skipped = 1;
    report.skipped_reason = "locked";
    return report;
  }

  try {
    const client = new OmieClient();
    client.assertConfigured();
    const companyId = getOmieCompanyId();

    const days = lookbackDays();
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const all: OmiePedidoCompra[] = [];
    let pagina = 1;
    let totalPaginas = 1;
    while (pagina <= totalPaginas && pagina <= 40) {
      const batch = await client.pesquisarPedCompra({
        pagina,
        registros_por_pagina: 50,
        dataInicial: formatBrDate(start),
        dataFinal: formatBrDate(end),
      });
      all.push(...batch.pedidos);
      totalPaginas = batch.total_de_paginas || 1;
      pagina += 1;
      if (!batch.pedidos.length) break;
    }

    report.encontrados = all.length;
    const supplierCache = new Map<number, string>();
    let consultas = 0;
    const MAX_CONSULTAS = 60;

    for (const raw of all) {
      const codigo = extractPedCompraCodigo(raw);
      try {
        let full = raw;
        if (!raw.produtos_consulta?.length && consultas < MAX_CONSULTAS) {
          full = await resolveFullPedCompra(raw, client);
          consultas += 1;
        }
        const supplierName = await resolveSupplierName(
          full,
          client,
          supplierCache
        );
        const draft = mapOmiePedCompraToPcp(full, companyId, { supplierName });
        await processOne(supabase, draft, full, modo, report);
      } catch (err) {
        report.erros.push({
          omie_codigo_pedcompra: codigo ?? undefined,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      await supabase.from("audit_log").insert({
        table_name: "omie_compras_import",
        action: "import",
        new_data: report,
        user_email: "system@omie-cron",
      });
    } catch {
      /* audit opcional */
    }
  } finally {
    await releaseLock(supabase);
  }

  return report;
}
