import { toDateOnly, toQuantity, truncate } from "@/lib/utils/supabase-data";
import type {
  OmiePedidoCompra,
  OmiePedidoCompraCabecalho,
  OmiePedidoCompraProduto,
  PcpPurchaseImportDraft,
} from "./types";

const NUMBER_MAX = 80;
const SUPPLIER_MAX = 255;
const DESC_MAX = 500;
const CODE_MAX = 120;

export function brDateToIso(d?: string | null): string | null {
  if (!d || !String(d).trim()) return null;
  const t = String(d).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return toDateOnly(t);
}

export function extractPedCompraCabecalho(
  pedido: OmiePedidoCompra
): OmiePedidoCompraCabecalho {
  return {
    ...(pedido.cabecalho ?? {}),
    ...(pedido.cabecalho_consulta ?? {}),
  };
}

export function extractPedCompraCodigo(pedido: OmiePedidoCompra): number | null {
  const n = extractPedCompraCabecalho(pedido).nCodPed;
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n);
}

export function extractPedCompraNumber(pedido: OmiePedidoCompra): string {
  const cab = extractPedCompraCabecalho(pedido);
  const numero = String(cab.cNumero ?? "").trim();
  if (numero) return truncate(numero, NUMBER_MAX) ?? numero.slice(0, NUMBER_MAX);
  const integracao = String(cab.cCodIntPed ?? "").trim();
  if (integracao) {
    return truncate(integracao, NUMBER_MAX) ?? integracao.slice(0, NUMBER_MAX);
  }
  if (cab.nCodPed != null) return String(cab.nCodPed);
  throw new Error("Pedido de compra Omie sem número");
}

export function extractPedCompraSupplierName(
  pedido: OmiePedidoCompra
): string | null {
  const cab = extractPedCompraCabecalho(pedido);
  for (const raw of [
    cab.nome_fantasia,
    cab.cNomeFantasia,
    cab.cNomeFor,
    cab.cRazaoFor,
    cab.cRazaoSocial,
    cab.nome_fornecedor,
    cab.razao_social,
  ]) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s.length > 1) {
      return truncate(s, SUPPLIER_MAX) ?? s.slice(0, SUPPLIER_MAX);
    }
  }
  return null;
}

function isReceived(produtos: OmiePedidoCompraProduto[]): boolean {
  if (produtos.length === 0) return false;
  return produtos.every((p) => {
    const q = Number(p.nQtde ?? 0);
    const rec = Number(p.nQtdeRec ?? 0);
    if (!Number.isFinite(q) || q <= 0) return rec > 0;
    return rec >= q;
  });
}

export function mapOmiePedCompraToPcp(
  pedido: OmiePedidoCompra,
  companyId: string,
  opts?: { supplierName?: string | null }
): PcpPurchaseImportDraft {
  const cab = extractPedCompraCabecalho(pedido);
  const codigo = extractPedCompraCodigo(pedido);
  if (codigo == null) {
    throw new Error("Pedido de compra Omie sem nCodPed");
  }
  const produtos = Array.isArray(pedido.produtos_consulta)
    ? pedido.produtos_consulta
    : [];
  const notesParts = [cab.cObs, cab.cObsInt]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const supplier =
    opts?.supplierName?.trim() || extractPedCompraSupplierName(pedido);

  return {
    companyId,
    number: extractPedCompraNumber(pedido),
    supplierName: supplier,
    expectedDelivery: brDateToIso(cab.dDtPrevisao),
    status: isReceived(produtos) ? "received" : "open",
    notes: notesParts.length ? notesParts.join("\n") : null,
    omieCodigo: codigo,
    omieEtapa: cab.cEtapa ? String(cab.cEtapa) : null,
    items: produtos.map((p, idx) => {
      const code = String(p.cProduto ?? "").trim();
      const desc = String(p.cDescricao ?? "").trim();
      return {
        lineNumber: idx + 1,
        productCode: code
          ? (truncate(code, CODE_MAX) ?? code.slice(0, CODE_MAX))
          : p.nCodProd != null
            ? String(p.nCodProd)
            : null,
        description: desc
          ? (truncate(desc, DESC_MAX) ?? desc.slice(0, DESC_MAX))
          : null,
        ncm: String(p.cNCM ?? "").trim() || null,
        quantity:
          p.nQtde != null && Number.isFinite(Number(p.nQtde))
            ? toQuantity(Number(p.nQtde))
            : null,
        unit: String(p.cUnidade ?? "").trim() || null,
      };
    }),
  };
}
