/**
 * Parser da cotação Zenith HVAC (outro CNPJ, sem Omie).
 * Modelo: "Cotação # ZH-260026" com tabela ITEM / QTD / Modelo / Dimensão (mm).
 */

export interface ParsedZenithItem {
  description: string;
  quantity: number;
  product_code?: string | null;
}

export interface ParsedZenithResult {
  orderNumber: string;
  clientName: string;
  deliveryDate: string | null;
  items: ParsedZenithItem[];
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

function parseQuantity(raw: string): number | null {
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Soma dias úteis (seg–sex), a partir do dia seguinte à data base. */
export function addBusinessDays(isoDate: string, days: number): string | null {
  if (!isoDate || days <= 0) return null;
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime())) return null;
  let added = 0;
  while (added < days) {
    date.setUTCDate(date.getUTCDate() + 1);
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

export function isZenithQuotePdf(text: string): boolean {
  const t = normalizarTextoPdf(text);
  if (!t) return false;
  if (/Cota[cç][aã]o\s*#\s*ZH-/i.test(t)) return true;
  if (/zenith-hvac/i.test(t) && /Dimens[aã]o\s*\(mm\)/i.test(t)) return true;
  if (/ZENITH HVAC/i.test(t) && /\bITEM\b.*\bQTD\b.*Modelo/i.test(t)) return true;
  return false;
}

export function clientNameFromZenithFileName(fileName: string): string | null {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  const m = base.match(/^ZH-\d+\s*[-–—]\s*(.+)$/i);
  const name = m?.[1]?.trim();
  return name && name.length > 1 ? name.slice(0, 255) : null;
}

const RE_ITEM =
  /^(\d{1,3})\s+(\d+(?:[.,]\d+)?)\s+([A-Z0-9][A-Z0-9._/-]{1,40})\s+(\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?)(?:\s|$)/;

function parseZenithItems(linhas: string[]): ParsedZenithItem[] {
  const items: ParsedZenithItem[] = [];
  const headerIdx = linhas.findIndex((l) =>
    /\bITEM\b/i.test(l) && /\bQTD\b/i.test(l) && /Modelo/i.test(l)
  );
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;

  for (let i = start; i < linhas.length; i++) {
    const l = linhas[i];
    if (/^SUBTOTAL\b/i.test(l) || /^TOTAL\b/i.test(l) || /^FRETE\b/i.test(l)) break;
    if (/^Condi[cç][oõ]es gerais/i.test(l) || /^Or[cç]amento para/i.test(l)) break;
    const m = l.match(RE_ITEM);
    if (!m) continue;
    const quantity = parseQuantity(m[2]);
    const product_code = m[3].trim();
    const dim = m[4].replace(/\s+/g, "").toLowerCase();
    if (!quantity || !product_code) continue;
    items.push({
      product_code: product_code.slice(0, 120),
      quantity,
      description: `${product_code} ${dim}mm`.slice(0, 500),
    });
  }
  return items;
}

export function parseZenithQuote(text: string, fileName: string): ParsedZenithResult {
  const norm = normalizarTextoPdf(text);
  const linhas = norm.split(/\n/).map((l) => l.trim()).filter(Boolean);

  let orderNumber: string | null = null;
  for (const l of linhas) {
    const m = l.match(/Cota[cç][aã]o\s*#\s*(ZH-\d+)/i);
    if (m) {
      orderNumber = m[1].toUpperCase();
      break;
    }
  }
  if (!orderNumber) {
    const fromFile = fileName.match(/ZH-\d+/i);
    orderNumber = fromFile ? fromFile[0].toUpperCase() : fileName.replace(/\.pdf$/i, "").slice(0, 50);
  }

  let clientFromPdf: string | null = null;
  for (const l of linhas) {
    const m = l.match(/^Nome da empresa\s+(.+)$/i);
    if (m?.[1]?.trim()) {
      clientFromPdf = m[1].trim();
      break;
    }
  }

  const fromFile = clientNameFromZenithFileName(fileName);
  let clientName = "Cliente do PDF";
  if (fromFile && clientFromPdf) {
    clientName =
      fromFile.toLowerCase().includes(clientFromPdf.toLowerCase()) ||
      clientFromPdf.length < 8
        ? fromFile
        : clientFromPdf;
  } else if (fromFile) {
    clientName = fromFile;
  } else if (clientFromPdf) {
    clientName = clientFromPdf;
  }

  let quoteDate: string | null = null;
  for (const l of linhas) {
    const m = l.match(/^DATA\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i);
    if (m) {
      quoteDate = parsearData(m[1]);
      break;
    }
  }

  let leadDays: number | null = null;
  for (const l of linhas) {
    const m = l.match(
      /Prazo de entrega:\s*(\d+)\s*dias\s*[uú]teis/i
    );
    if (m) {
      leadDays = Number(m[1]);
      break;
    }
  }

  const deliveryDate =
    quoteDate && leadDays ? addBusinessDays(quoteDate, leadDays) : null;

  const items = parseZenithItems(linhas);
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
    items,
  };
}
