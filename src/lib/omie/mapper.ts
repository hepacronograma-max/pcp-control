import { toDateOnly, toQuantity, truncate } from "@/lib/utils/supabase-data";
import type { OmiePedidoCompleto, PcpOrderImportDraft } from "./types";

const ORDER_NUMBER_MAX = 50;
const CLIENT_NAME_MAX = 255;
const DESCRIPTION_MAX = 500;
const PRODUCT_CODE_MAX = 120;

function brDateToIso(d?: string | null): string | null {
  if (!d || !String(d).trim()) return null;
  const t = String(d).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return toDateOnly(t);
}

/** "0001" → "1"; "0000" / "0" / vazio → sem sufixo. */
function normalizeSequencialSuffix(
  sequencial?: string | number | null
): string | null {
  const t = String(sequencial ?? "").trim();
  if (!t) return null;
  const withoutZeros = t.replace(/^0+/, "") || "0";
  if (withoutZeros === "0") return null;
  return withoutZeros;
}

function buildBusinessOrderNumber(
  base: string,
  sequencial?: string | number | null
): string {
  const b = base.trim();
  if (!b) return "";
  const suffix = normalizeSequencialSuffix(sequencial);
  return suffix ? `${b}/${suffix}` : b;
}

function finalizeOrderNumber(value: string): string {
  if (!value) {
    throw new Error("Pedido Omie sem numero_pedido");
  }
  return truncate(value, ORDER_NUMBER_MAX) ?? value.slice(0, ORDER_NUMBER_MAX);
}

/**
 * Número de negócio: numero_pedido + sequencial (kanban ex. 260161/1).
 * Fallback: codigo_pedido_integracao, codigo_pedido — com o mesmo sufixo se houver.
 */
export function normalizeOmieOrderNumber(omie: OmiePedidoCompleto): string {
  const cab = omie.cabecalho ?? {};
  const seq = cab.sequencial;

  const numero = String(cab.numero_pedido ?? "").trim();
  if (numero) {
    return finalizeOrderNumber(buildBusinessOrderNumber(numero, seq));
  }

  const integracao = String(cab.codigo_pedido_integracao ?? "").trim();
  if (integracao) {
    return finalizeOrderNumber(buildBusinessOrderNumber(integracao, seq));
  }

  if (cab.codigo_pedido != null) {
    return finalizeOrderNumber(
      buildBusinessOrderNumber(String(cab.codigo_pedido).trim(), seq)
    );
  }

  throw new Error("Pedido Omie sem numero_pedido");
}

/** Nº do pedido do cliente no Omie (`informacoes_adicionais.numero_pedido_cliente`). */
export function extractOmieClientOrderNumber(
  payload: unknown
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const nested =
    root.pedido_venda_produto && typeof root.pedido_venda_produto === "object"
      ? (root.pedido_venda_produto as Record<string, unknown>)
      : root;
  const inf =
    nested.informacoes_adicionais &&
    typeof nested.informacoes_adicionais === "object"
      ? (nested.informacoes_adicionais as Record<string, unknown>)
      : {};
  const cab =
    nested.cabecalho && typeof nested.cabecalho === "object"
      ? (nested.cabecalho as Record<string, unknown>)
      : {};
  for (const raw of [
    inf.numero_pedido_cliente,
    inf.codigo_pedido_cliente,
    inf.cNumPedCli,
    cab.numero_pedido_cliente,
    nested.numero_pedido_cliente,
  ]) {
    const s = String(raw ?? "").trim();
    if (s) return s;
  }
  return null;
}

export function extractClientNameFromPedido(omie: OmiePedidoCompleto): string {
  const cab = omie.cabecalho ?? {};
  const inf = omie.informacoes_adicionais ?? {};
  const candidates = [
    cab.nome_cliente,
    inf.nome_fantasia_cliente,
    inf.razao_social_cliente,
    inf.nome_cliente,
    inf.dados_adicionais_nf,
  ];

  for (const c of candidates) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s.length > 2 && s.length < 300) {
      return truncate(s, CLIENT_NAME_MAX) ?? s.slice(0, CLIENT_NAME_MAX);
    }
  }

  const cod = cab.codigo_cliente;
  return cod ? `Cliente Omie ${cod}` : "Cliente Omie";
}

function extractProductCode(
  produto:
    | {
        codigo?: string;
        codigo_produto?: string | number;
        descricao?: string;
      }
    | undefined
): string | null {
  if (!produto) return null;
  const business = String(produto.codigo ?? "").trim();
  if (business) {
    return truncate(business, PRODUCT_CODE_MAX) ?? business.slice(0, PRODUCT_CODE_MAX);
  }
  const internal = String(produto.codigo_produto ?? "").trim();
  if (!internal) return null;
  return truncate(internal, PRODUCT_CODE_MAX) ?? internal.slice(0, PRODUCT_CODE_MAX);
}

function extractOmieCodigoItem(
  row: { ide?: { codigo_item?: number } } | undefined
): number | null {
  const id = row?.ide?.codigo_item;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/**
 * Mapeia payload Omie (ConsultarPedido) para o mesmo shape do import-pdf.
 * line_id permanece NULL na persistência (atribuição manual depois).
 */
export function mapOmiePedidoToPcp(
  omie: OmiePedidoCompleto,
  companyId: string,
  opts?: { clientName?: string }
): PcpOrderImportDraft {
  const codigo = omie.cabecalho?.codigo_pedido;
  if (!codigo) {
    throw new Error("Pedido Omie sem codigo_pedido");
  }

  const orderNumber = normalizeOmieOrderNumber(omie);
  const clientName = opts?.clientName?.trim() || extractClientNameFromPedido(omie);
  const deliveryDeadline = brDateToIso(omie.cabecalho?.data_previsao);

  const det = omie.det ?? [];
  const items =
    det.length > 0
      ? det.map((row, idx) => {
          const p = row.produto ?? {};
          const description =
            truncate(String(p.descricao ?? `Item ${idx + 1}`).trim(), DESCRIPTION_MAX) ??
            `Item ${idx + 1}`;
          return {
            omieCodigoItem: extractOmieCodigoItem(row),
            description,
            quantity: toQuantity(p.quantidade),
            // Bruto para sync incremental — ver isOmieQuantityReliableForSync (pedido 260268).
            omieQuantidadeBruta:
              p.quantidade != null ? Number(p.quantidade) : null,
            productCode: extractProductCode(p),
          };
        })
      : [
          {
            omieCodigoItem: null,
            description: `Item Omie pedido ${orderNumber}`,
            quantity: 1,
            productCode: null,
          },
        ];

  return {
    companyId,
    orderNumber,
    clientName,
    deliveryDeadline,
    status: "imported",
    items,
  };
}
