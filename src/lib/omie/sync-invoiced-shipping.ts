import type { SupabaseClient } from "@supabase/supabase-js";
import { OmieClient } from "./client";
import { extractOmieNfeNumber, isOmiePedidoFaturado } from "./invoiced-detect";
import { markShippingListInvoiced } from "@/lib/packaging/shipping-list";

/**
 * Limite por clique. O Omie tem throttle de 1 consulta/s; o prazo abaixo
 * deixa folga para o maxDuration (60s) da rota e para o timeout do navegador.
 */
const MAX_CONSULTAS = 30;
const SYNC_DEADLINE_MS = 40_000;
/** Lista já faturada sem nº de NF: só insiste por este tempo depois de faturar. */
const NFE_RETRY_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

export type OmieSyncOrderDetail = {
  orderNumber: string;
  /**
   * moved = foi para Faturado; pending = Omie ainda não faturou;
   * no_link = pedido sem vínculo Omie; error = falha na consulta;
   * not_checked = ficou para o próximo clique.
   */
  result: "moved" | "pending" | "no_link" | "error" | "not_checked";
  etapa?: string | null;
  message?: string;
};

export type SyncOmieInvoicedReport = {
  configured: boolean;
  checked: number;
  marked: number;
  nfeFilled: number;
  skippedNoOmie: number;
  remaining: number;
  errors: string[];
  details: OmieSyncOrderDetail[];
};

export async function syncOmieInvoicedShippingLists(
  admin: SupabaseClient,
  companyId: string
): Promise<SyncOmieInvoicedReport> {
  const report: SyncOmieInvoicedReport = {
    configured: false,
    checked: 0,
    marked: 0,
    nfeFilled: 0,
    skippedNoOmie: 0,
    remaining: 0,
    errors: [],
    details: [],
  };

  const client = new OmieClient();
  if (!client.isConfigured()) return report;
  report.configured = true;

  type ListRow = {
    id: string;
    order_id: string;
    status: string | null;
    finalized_at: string | null;
    invoiced_at: string | null;
    nfe_number?: string | null;
  };

  const withNfe = await admin
    .from("shipping_lists")
    .select("id, order_id, status, finalized_at, invoiced_at, nfe_number")
    .eq("company_id", companyId)
    .not("finalized_at", "is", null);

  let released: ListRow[] = [];
  if (withNfe.error && /nfe_number|schema cache|column|does not exist/i.test(withNfe.error.message)) {
    const legacy = await admin
      .from("shipping_lists")
      .select("id, order_id, status, finalized_at, invoiced_at")
      .eq("company_id", companyId)
      .is("invoiced_at", null)
      .not("finalized_at", "is", null);
    if (legacy.error) {
      report.errors.push(legacy.error.message);
      return report;
    }
    released = (legacy.data ?? []) as ListRow[];
  } else if (withNfe.error) {
    report.errors.push(withNfe.error.message);
    return report;
  } else {
    released = (withNfe.data ?? []) as ListRow[];
  }

  const now = Date.now();
  // Prioridade 1: ainda não faturado. Prioridade 2: faturado recente sem nº da NF.
  // (Antes, listas faturadas sem NF ficavam eternamente na fila e ocupavam as
  // poucas consultas por clique — alguns pedidos nunca chegavam a ser consultados.)
  const notInvoiced = released.filter((row) => !row.invoiced_at);
  const missingNfe = released.filter((row) => {
    if (!row.invoiced_at) return false;
    if (String(row.nfe_number ?? "").trim()) return false;
    const t = Date.parse(row.invoiced_at);
    return Number.isFinite(t) && now - t < NFE_RETRY_WINDOW_MS;
  });
  const allPending = [...notInvoiced, ...missingNfe];
  if (allPending.length === 0) return report;

  const candidateIds = [...new Set(allPending.map((r) => r.order_id))];
  const notInvoicedIds = new Set(notInvoiced.map((r) => r.order_id));

  const { data: orders } = await admin
    .from("orders")
    .select("id, order_number")
    .in("id", candidateIds);
  const orderNumberById = new Map(
    (orders ?? []).map((o) => [o.id as string, String(o.order_number ?? o.id)])
  );
  const numberOf = (id: string) => orderNumberById.get(id) ?? id.slice(0, 8);

  const { data: links, error: linkErr } = await admin
    .from("omie_order_links")
    .select("pcp_order_id, omie_codigo_pedido, omie_etapa, last_synced_at")
    .in("pcp_order_id", candidateIds);

  if (linkErr) {
    report.errors.push(linkErr.message);
    return report;
  }

  const linked = new Set(
    (links ?? [])
      .map((l) => l.pcp_order_id as string | null)
      .filter((id): id is string => Boolean(id))
  );
  for (const id of candidateIds) {
    if (linked.has(id)) continue;
    report.skippedNoOmie += 1;
    if (notInvoicedIds.has(id)) {
      report.details.push({
        orderNumber: numberOf(id),
        result: "no_link",
        message:
          "Sem vínculo com o Omie (provavelmente importado por PDF). Marque como Faturado em Ver.",
      });
    }
  }

  // Não faturados primeiro; dentro de cada grupo, o consultado há mais tempo primeiro
  // (rodízio — cada clique avança, em vez de repetir sempre os mesmos).
  const ordered = (links ?? [])
    .filter((l) => l.pcp_order_id && l.omie_codigo_pedido != null)
    .sort((a, b) => {
      const pa = notInvoicedIds.has(String(a.pcp_order_id)) ? 0 : 1;
      const pb = notInvoicedIds.has(String(b.pcp_order_id)) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ta = a.last_synced_at ? Date.parse(String(a.last_synced_at)) : 0;
      const tb = b.last_synced_at ? Date.parse(String(b.last_synced_at)) : 0;
      return ta - tb;
    });

  const pendingByOrder = new Map(allPending.map((row) => [row.order_id, row]));
  const deadline = Date.now() + SYNC_DEADLINE_MS;
  const doneOrders = new Set<string>();
  let consultas = 0;

  for (const link of ordered) {
    const orderId = String(link.pcp_order_id);
    if (doneOrders.has(orderId)) continue;
    const codigo = Number(link.omie_codigo_pedido);
    if (!Number.isFinite(codigo) || codigo <= 0) {
      if (notInvoicedIds.has(orderId)) {
        report.details.push({
          orderNumber: numberOf(orderId),
          result: "error",
          message: `Código Omie inválido no vínculo (${String(link.omie_codigo_pedido)}).`,
        });
      }
      continue;
    }
    if (consultas >= MAX_CONSULTAS || Date.now() > deadline) {
      report.remaining += 1;
      if (notInvoicedIds.has(orderId)) {
        report.details.push({ orderNumber: numberOf(orderId), result: "not_checked" });
      }
      continue;
    }
    consultas += 1;
    report.checked += 1;
    try {
      const status = await client.statusPedido(codigo);
      const etapa = status.etapa ? String(status.etapa) : null;
      await admin
        .from("omie_order_links")
        .update({
          ...(etapa ? { omie_etapa: etapa } : {}),
          last_synced_at: new Date().toISOString(),
        })
        .eq("pcp_order_id", orderId)
        .eq("omie_codigo_pedido", link.omie_codigo_pedido);

      const faturado =
        String(status.faturada ?? "").trim().toUpperCase() === "S" ||
        isOmiePedidoFaturado({
          cabecalho: { etapa: status.etapa },
          lista_nfe: status.lista_nfe ?? status.ListaNfe,
        });
      if (!faturado) {
        if (notInvoicedIds.has(orderId)) {
          report.details.push({
            orderNumber: numberOf(orderId),
            result: "pending",
            etapa,
            message: `Omie ainda sem NF emitida${etapa ? ` (etapa ${etapa})` : ""}.`,
          });
        }
        continue;
      }
      const nfeNumber = extractOmieNfeNumber(status);
      const before = pendingByOrder.get(orderId);
      const wasInvoiced = Boolean(before?.invoiced_at);
      const marked = await markShippingListInvoiced(admin, orderId, { nfeNumber });
      if (!marked.ok) {
        report.errors.push(`${numberOf(orderId)}: ${marked.error}`);
        report.details.push({
          orderNumber: numberOf(orderId),
          result: "error",
          message: marked.error,
        });
        continue;
      }
      doneOrders.add(orderId);
      if (!wasInvoiced) {
        report.marked += 1;
        report.details.push({
          orderNumber: numberOf(orderId),
          result: "moved",
          message: nfeNumber ? `NF ${nfeNumber}` : undefined,
        });
      } else if (nfeNumber) {
        report.nfeFilled += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`${numberOf(orderId)}: ${msg}`);
      if (notInvoicedIds.has(orderId)) {
        report.details.push({
          orderNumber: numberOf(orderId),
          result: "error",
          message: msg,
        });
      }
    }
  }

  report.details.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, "pt-BR"));
  return report;
}
