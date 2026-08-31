/**
 * Parser do PDF gerado pela HEPA para pedidos sem Omie
 * (outro CNPJ) e para filtros de estoque.
 *
 * Layout esperado (texto selecionável, não imagem):
 *
 *   PCP HEPA
 *   Tipo: ESTOQUE
 *   Pedido: EST-001
 *   Cliente: ESTOQUE HEPA
 *   Prazo: 15/09/2026
 *
 *   Código: FAPAGNH1400001
 *   Descrição: FILTRO HF-A8SPAGH14 305x305x75mm
 *   Quantidade: 50
 */

export type PcpManualTipo = "estoque" | "pedido";

export interface ParsedPcpManualItem {
  description: string;
  quantity: number;
  product_code?: string | null;
}

export interface ParsedPcpManualResult {
  orderNumber: string;
  clientName: string;
  deliveryDate: string | null;
  tipo: PcpManualTipo | null;
  items: ParsedPcpManualItem[];
}

function normalizarTextoPdf(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\uFEFF/g, "")
    .replace(/\uFFFD/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t]+/g, " ")
    .replace(/ [ \u00A0]+/g, " ")
    .trim();
}

function parsearData(str: string): string | null {
  if (!str) return null;
  const m1 = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) {
    const [, d, m, y] = m1;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const m2 = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m2 ? m2[0] : null;
}

function valueAfterLabel(linhas: string[], labels: RegExp): string | null {
  for (const l of linhas) {
    const m = l.match(labels);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function parseQuantity(raw: string): number | null {
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function isPcpManualPdf(text: string): boolean {
  const t = normalizarTextoPdf(text);
  if (!t) return false;
  if (/PCP\s*HEPA/i.test(t)) return true;
  if (/Importa[cç][aã]o\s+manual/i.test(t)) return true;
  if (/Tipo\s*:\s*(ESTOQUE|PEDIDO)/i.test(t) && /C[oó]digo\s*:/i.test(t)) {
    return true;
  }
  return false;
}

function parseLabeledItems(linhas: string[]): ParsedPcpManualItem[] {
  const items: ParsedPcpManualItem[] = [];
  let code: string | null = null;
  let description: string | null = null;
  let quantity: number | null = null;

  const flush = () => {
    if (description && quantity) {
      items.push({
        description: description.slice(0, 500),
        quantity,
        product_code: code,
      });
    }
    code = null;
    description = null;
    quantity = null;
  };

  for (const l of linhas) {
    const mCode = l.match(/^C[oó]digo\s*:\s*(.+)$/i);
    if (mCode) {
      if (description && quantity) flush();
      code = mCode[1].trim().slice(0, 120);
      continue;
    }
    const mDesc = l.match(/^Descri[cç][aã]o\s*:\s*(.+)$/i);
    if (mDesc) {
      if (description && quantity) flush();
      description = mDesc[1].trim();
      continue;
    }
    const mQty = l.match(/^Quantidade\s*:\s*([\d.,]+)/i);
    if (mQty) {
      quantity = parseQuantity(mQty[1]);
      if (description && quantity) flush();
      continue;
    }
  }
  flush();
  return items;
}

function parsePipeItems(linhas: string[]): ParsedPcpManualItem[] {
  const items: ParsedPcpManualItem[] = [];
  const start = linhas.findIndex((l) => /^Itens\s*:?$/i.test(l) || /C[oó]digo\s*\|/i.test(l));
  const slice = start >= 0 ? linhas.slice(start + 1) : linhas;
  for (const l of slice) {
    if (!l.includes("|")) continue;
    if (/c[oó]digo/i.test(l) && /descri/i.test(l)) continue;
    const parts = l.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    let code = "";
    let description = "";
    let qtyRaw = "";
    if (parts.length >= 3) {
      const maybeIdx = /^\d+$/.test(parts[0]) ? 1 : 0;
      code = parts[maybeIdx] ?? "";
      description = parts[maybeIdx + 1] ?? "";
      qtyRaw = parts[parts.length - 1] ?? "";
    }
    const quantity = parseQuantity(qtyRaw);
    if (!description || !quantity) continue;
    items.push({
      description: description.slice(0, 500),
      quantity,
      product_code: code ? code.slice(0, 120) : null,
    });
  }
  return items;
}

export function parsePcpManualPdf(text: string, fileName: string): ParsedPcpManualResult {
  const norm = normalizarTextoPdf(text);
  const linhas = norm.split(/\n/).map((l) => l.trim()).filter(Boolean);

  const tipoRaw = valueAfterLabel(linhas, /^Tipo\s*:\s*(ESTOQUE|PEDIDO)\b/i);
  const tipo: PcpManualTipo | null = tipoRaw
    ? tipoRaw.toLowerCase() === "estoque"
      ? "estoque"
      : "pedido"
    : null;

  let orderNumber =
    valueAfterLabel(linhas, /^(?:Pedido|N[ºo°]?\s*Pedido|Or[çc]amento)\s*:\s*(.+)$/i);

  const clientName =
    valueAfterLabel(linhas, /^(?:Cliente|Nome\s+do\s+cliente)\s*:\s*(.+)$/i) ??
    (tipo === "estoque" ? "ESTOQUE HEPA" : "Cliente do PDF");

  const prazoRaw =
    valueAfterLabel(linhas, /^(?:Prazo|Data\s+de\s+entrega|Previs[aã]o)\s*:\s*(.+)$/i);
  const deliveryDate = prazoRaw ? parsearData(prazoRaw) : null;

  if (!orderNumber) {
    const baseName = fileName.replace(/\.pdf$/i, "");
    const mNum = baseName.match(/\d+/);
    orderNumber = mNum ? mNum[0] : baseName;
  }

  let items = parseLabeledItems(linhas);
  if (items.length === 0) items = parsePipeItems(linhas);

  if (items.length === 0) {
    items.push({
      description: `Item importado de ${fileName}`,
      quantity: 1,
    });
  }

  return {
    orderNumber: orderNumber.slice(0, 50),
    clientName: clientName.slice(0, 255),
    deliveryDate,
    tipo,
    items,
  };
}
