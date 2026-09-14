import type { SupabaseClient } from "@supabase/supabase-js";
import { OmieClient } from "./client";
import { extractOmieNfeNumber, isOmiePedidoFaturado } from "./invoiced-detect";
import { markShippingListInvoiced } from "@/lib/packaging/shipping-list";

const MAX_CONSULTAS = 8;
const SYNC_DEADLINE_MS = 16_000;

export type SyncOmieInvoicedReport = {
  configured: boolean;
  checked: number;
  marked: number;
  nfeFilled: number;
  skippedNoOmie: number;
  errors: string[];
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
    errors: [],
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

  const allPending = released.filter((row) => {
    const invoiced = Boolean(row.invoiced_at);
    const hasNfe = Boolean(String(row.nfe_number ?? "").trim());
    if (invoiced && hasNfe) return false;
    return (
      row.status === "finalized" ||
      row.status === "ready_to_invoice" ||
      Boolean(row.finalized_at)
    );
  });
  if (allPending.length === 0) return report;

  const candidateIds = [...new Set(allPending.map((r) => r.order_id as string))];

  const { data: links, error: linkErr } = await admin
    .from("omie_order_links")
    .select("pcp_order_id, omie_codigo_pedido, omie_etapa")
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
  report.skippedNoOmie = candidateIds.filter((id) => !linked.has(id)).length;

  const toCheck = (links ?? [])
    .filter((l) => l.pcp_order_id && l.omie_codigo_pedido != null)
    .slice(0, MAX_CONSULTAS);

  const pendingByOrder = new Map(
    allPending.map((row) => [row.order_id as string, row])
  );

  const deadline = Date.now() + SYNC_DEADLINE_MS;

  for (const link of toCheck) {
    if (Date.now() > deadline) break;
    const orderId = String(link.pcp_order_id);
    const codigo = Number(link.omie_codigo_pedido);
    if (!Number.isFinite(codigo) || codigo <= 0) continue;
    report.checked += 1;
    try {
      const status = await client.statusPedido(codigo);
      const etapa = status.etapa;
      if (etapa && etapa !== link.omie_etapa) {
        await admin
          .from("omie_order_links")
          .update({
            omie_etapa: String(etapa),
            last_synced_at: new Date().toISOString(),
          })
          .eq("pcp_order_id", orderId)
          .eq("omie_codigo_pedido", link.omie_codigo_pedido);
      }
      const faturado =
        String(status.faturada ?? "")
          .trim()
          .toUpperCase() === "S" ||
        isOmiePedidoFaturado({
          cabecalho: { etapa: status.etapa },
          lista_nfe: status.lista_nfe ?? status.ListaNfe,
        });
      if (!faturado) continue;
      const nfeNumber = extractOmieNfeNumber(status);
      const before = pendingByOrder.get(orderId);
      const wasInvoiced = Boolean(before?.invoiced_at);
      const marked = await markShippingListInvoiced(admin, orderId, {
        nfeNumber,
      });
      if (!marked.ok) {
        report.errors.push(`${orderId}: ${marked.error}`);
        continue;
      }
      if (!wasInvoiced) report.marked += 1;
      else if (nfeNumber) report.nfeFilled += 1;
    } catch (err) {
      report.errors.push(
        `${codigo}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return report;
}
