/**
 * Regras da importação manual por PDF (sem Omie).
 * A API do Omie não usa estas funções.
 */

export type ManualImportKind = "pedido" | "estoque";

export const MANUAL_ORIGIN_PEDIDO = "Origem: PDF manual (CNPJ sem Omie)";
export const MANUAL_ORIGIN_ESTOQUE = "Origem: estoque (PDF, sem Omie)";

export function parseManualImportKind(raw: string | null | undefined): ManualImportKind {
  return String(raw ?? "").trim().toLowerCase() === "estoque" ? "estoque" : "pedido";
}

export function originNotesForKind(kind: ManualImportKind): string {
  return kind === "estoque" ? MANUAL_ORIGIN_ESTOQUE : MANUAL_ORIGIN_PEDIDO;
}

export function isManualPdfOrigin(notes: string | null | undefined): boolean {
  const n = (notes ?? "").toLowerCase();
  return n.includes("origem: pdf manual") || n.includes("origem: estoque");
}

export function resolveManualImportKind(
  uiKind: ManualImportKind,
  pdfTipo: ManualImportKind | null | undefined
): ManualImportKind {
  if (pdfTipo === "estoque" || uiKind === "estoque") return "estoque";
  return "pedido";
}

export function applyManualImportDefaults(input: {
  orderNumber: string;
  clientName: string;
  kind: ManualImportKind;
}): { orderNumber: string; clientName: string; notes: string } {
  let orderNumber = String(input.orderNumber ?? "").trim().slice(0, 50);
  let clientName = String(input.clientName ?? "").trim().slice(0, 255);

  if (input.kind === "estoque") {
    if (!/^EST[-/]/i.test(orderNumber)) {
      orderNumber = `EST-${orderNumber}`.slice(0, 50);
    }
    if (
      !clientName ||
      /^cliente do pdf$/i.test(clientName) ||
      /^cliente$/i.test(clientName)
    ) {
      clientName = "ESTOQUE HEPA";
    }
  }

  return {
    orderNumber,
    clientName,
    notes: originNotesForKind(input.kind),
  };
}

/**
 * Se o número já existe e NÃO é importação PDF, não sobrescreve o Omie:
 * grava um número novo com prefixo PDF-.
 */
export function resolveManualOrderCollision(input: {
  orderNumber: string;
  kind: ManualImportKind;
  existingNotes: string | null | undefined;
  existingFound: boolean;
}): { action: "update" | "insert"; orderNumber: string } {
  if (!input.existingFound) {
    return { action: "insert", orderNumber: input.orderNumber };
  }
  if (isManualPdfOrigin(input.existingNotes)) {
    return { action: "update", orderNumber: input.orderNumber };
  }
  const prefixed = /^PDF-/i.test(input.orderNumber)
    ? `${input.orderNumber}-2`.slice(0, 50)
    : `PDF-${input.orderNumber}`.slice(0, 50);
  return { action: "insert", orderNumber: prefixed };
}
