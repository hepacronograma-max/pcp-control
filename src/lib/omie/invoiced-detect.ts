import type { OmieListaNfe, OmiePedidoCompleto, OmiePedidoStatus } from "./types";

function isOmieYes(value: unknown): boolean {
  if (value === true) return true;
  const s = String(value ?? "")
    .trim()
    .toUpperCase();
  return s === "S" || s === "SIM" || s === "TRUE" || s === "1";
}

/** Etapas extras (além da flag faturado) — default vazio. Não usar 50 (Faturar). */
export function getOmieEtapasFaturado(): string[] {
  return (process.env.OMIE_ETAPAS_FATURADO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pedido já faturado no Omie (NF emitida).
 * Usa infoCadastro.faturado / dFat, NF-e na lista, ou etapa em OMIE_ETAPAS_FATURADO.
 */
export function isOmiePedidoFaturado(pedido: OmiePedidoCompleto | null | undefined): boolean {
  if (!pedido) return false;
  const info = pedido.infoCadastro;
  if (isOmieYes(info?.cancelado)) return false;
  if (isOmieYes(info?.faturado)) return true;
  if (String(info?.dFat ?? "").trim()) return true;
  if (extractOmieNfeNumber(pedido)) return true;

  const etapa = String(pedido.cabecalho?.etapa ?? "").trim();
  if (etapa && getOmieEtapasFaturado().includes(etapa)) return true;
  return false;
}

function nfeStatusCanceled(nf: OmieListaNfe): boolean {
  if (isOmieYes(nf.cancelada)) return true;
  return String(nf.status_nfe ?? "")
    .toLowerCase()
    .includes("cancel");
}

function nfeRowsFrom(source: {
  lista_nfe?: OmieListaNfe[] | OmieListaNfe;
  ListaNfe?: OmieListaNfe[] | OmieListaNfe;
} | null | undefined): OmieListaNfe[] {
  if (!source) return [];
  const bags = [source.lista_nfe, source.ListaNfe];
  const out: OmieListaNfe[] = [];
  for (const bag of bags) {
    if (Array.isArray(bag)) out.push(...bag);
    else if (bag && typeof bag === "object") out.push(bag);
  }
  return out;
}

function nfeNumero(nf: OmieListaNfe): string | null {
  const raw = nf.numero_nfe ?? nf.numeroNF ?? nf.nNF;
  if (raw == null || raw === "") return null;
  const numero = String(raw).trim();
  return numero || null;
}

/** Primeiro número de NF-e autorizado (ConsultarPedido ou StatusPedido). */
export function extractOmieNfeNumber(
  source: OmiePedidoCompleto | OmiePedidoStatus | null | undefined
): string | null {
  if (!source) return null;
  for (const nf of nfeRowsFrom(source)) {
    if (nfeStatusCanceled(nf)) continue;
    const numero = nfeNumero(nf);
    if (numero) return numero;
  }
  return null;
}
