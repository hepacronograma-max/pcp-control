/**
 * Heurísticas para extrair cabeçalho de PDF de pedido de compra.
 * Modelo HEPA (Omie): título "Pedido de Compra Nº", bloco "Informações do Fornecedor", "Previsão de Entrega: dd/mm/aaaa", tabela "Itens do Pedido".
 */
export type ParsedPolLine = {
  line_number: number;
  product_code: string;
  description: string;
  ncm: string | null;
  quantity: number | null;
  unit: string | null;
  supplier_code: string | null;
};

export type ParsedPurchaseOrderHeader = {
  number: string;
  supplier_name: string | null;
  expected_delivery: string | null; // yyyy-MM-dd
  /** Linhas de itens, quando a tabela é legível. */
  items_summary: string | null;
  /** Itens estruturados (mesma ideia que order_items no PV). */
  lines: ParsedPolLine[];
};

function brDateToIso(m: RegExpMatchArray, g = 1): string | null {
  const d = parseInt(m[g], 10);
  const mo = parseInt(m[g + 1], 10);
  let y = parseInt(m[g + 2], 10);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function firstValidBrazilianDateInText(text: string): string | null {
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ctx = m.input.slice(Math.max(0, m.index - 45), m.index + 20);
    /** Evitar: NCM, IE, "incluído em" (não é previsão), "gerado em" (sistema), CNPJ. */
    if (
      /NCM|inscri[çc]ão estadual|às\s*$/i.test(ctx) ||
      /inclu[íi]do\s+em|gerado\s+em|CNPJ:\s*$/i.test(ctx)
    ) {
      continue;
    }
    const iso = brDateToIso(m, 1);
    if (iso) return iso;
  }
  return null;
}

/** "pedido_de_compra_26046" → 26046 */
function numberFromFileNameHeuristic(fileName: string): string | null {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  const m = base.match(/(\d{4,})/);
  if (m) return m[1].slice(0, 80);
  const cleaned = base.replace(/[<>:"/\\|?*]/g, "_").slice(0, 80);
  return cleaned || null;
}

function numberFromFileName(fileName: string): string {
  return numberFromFileNameHeuristic(fileName) || "PC-" + Date.now().toString(36);
}

/**
 * HEPA: primeira linha de empresa após o título "Informações do Fornecedor" (antes de CNPJ/Endereço no mesmo padrão).
 */
function supplierFromInformacoesFornecedor(t: string): string | null {
  const lines = t
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const idx = lines.findIndex((l) => /informa[çc]ões\s+do\s+fornecedor/i.test(l));
  if (idx < 0) return null;
  for (let j = idx + 1; j < Math.min(idx + 6, lines.length); j++) {
    const line = lines[j];
    if (/^cnpj\s*:/i.test(line)) break;
    if (/^inscri[çc]ão/i.test(line)) break;
    if (/^e-?mail\s*:/i.test(line)) break;
    if (/^telefone\s*:/i.test(line)) break;
    if (/^c[oó]d\.\s*fornecedor/i.test(line)) break;
    if (line.length >= 3 && line.length < 200) {
      const part = line.split(/\s*CNPJ\s*:/i)[0].trim();
      if (part.length >= 3) return part.slice(0, 255);
    }
  }
  return null;
}

function rawItemRowLines(t: string): string[] {
  const low = t.toLowerCase();
  const i0 = low.indexOf("itens do pedido");
  if (i0 < 0) return [];
  let block = t.slice(i0);
  const stopRe =
    /(?:\n|\r\n)(?:outras?\s+informa[çc]ões|ao emitir|previs[aã]o\s+de\s+entrega)/i;
  const endM = block.search(stopRe);
  if (endM > 0) block = block.slice(0, endM);
  const rowLines: string[] = [];
  for (const line of block.split(/\n/)) {
    const l = line.replace(/\s+/g, " ").trim();
    if (!l) continue;
    if (/^item\s+c[oó]digo\s+descri/i.test(l) && !/(?:PRD|PRU|PRO)\d{3,}/i.test(l)) {
      continue;
    }
    if (/^item\s+c[oó]digo\s+descri/i.test(l) && /(?:PRD|PRU|PRO)\d{3,}/i.test(l)) {
      const idx = l.search(/\b(\d{1,2})\s+((?:PRD|PRU|PRO)\d{3,})/i);
      if (idx >= 0) rowLines.push(l.slice(idx).trim());
      continue;
    }
    if (/^\d+\s+\S+/.test(l) || /^cod\.?\s*fornecedor/i.test(l)) {
      rowLines.push(l);
      continue;
    }
    if (/\b\d{1,2}\s+(?:PRD|PRU|PRO)\d{3,}/i.test(l)) {
      const idx2 = l.search(/\b(\d{1,2})\s+((?:PRD|PRU|PRO)\d{3,})/i);
      if (idx2 >= 0) rowLines.push(l.slice(idx2).trim());
    }
  }
  return rowLines;
}

/**
 * PDF Omie/HEPA: vários itens numa linha, ex. `1 PRD... NCM qtd UN 2 PRD...` ou tudo colado.
 */
function expandMergedItemLines(rowLines: string[]): string[] {
  const out: string[] = [];
  for (const line of rowLines) {
    const l = line.trim();
    if (!l) continue;
    const re = /\b(\d{1,2})\s+((?:PRD|PRU|PRO|PR0)\d{3,})/gi;
    const matches: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(l)) !== null) {
      if (m.index !== undefined) matches.push(m.index);
    }
    if (matches.length <= 1) {
      out.push(l);
      continue;
    }
    for (let i = 0; i < matches.length; i++) {
      const a = matches[i];
      const b = i + 1 < matches.length ? matches[i + 1] : l.length;
      const chunk = l.slice(a, b).trim();
      if (chunk) out.push(chunk);
    }
  }
  return out;
}

function extractItemsBlock(t: string): string | null {
  const rowLines = rawItemRowLines(t);
  if (rowLines.length === 0) return null;
  return rowLines.slice(0, 30).join("\n").slice(0, 1800) || null;
}

function parseBrDecimal(s: string): number | null {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && !Number.isNaN(n) ? n : null;
}

/**
 * Uma linha de item: `1 PRD02317 ... 7308.90.10 5,00 PÇ` ou só até `7308.90.10` (sem qtd. na mesma linha).
 * NCM: xxxx.xx.xx ou xxxx.xx.xx.xx (8 dígitos)
 */
function parseOneItemLine(l: string): ParsedPolLine | null {
  const ncmRe = /(\d{4}\.\d{2}\.\d{2}(?:\.\d{2})?)/;
  const ncmM = l.match(ncmRe);
  if (!ncmM || ncmM.index === undefined) return null;
  const ncm = ncmM[1];
  const iNcm = ncmM.index;
  const afterNcm = l.slice(iNcm + ncmM[0].length).trim();
  let qty: number | null = null;
  let unit: string | null = null;
  const strict = afterNcm.match(/^([\d.,\s]+)\s+(\S{1,20})\s*$/);
  if (strict) {
    qty = parseBrDecimal(strict[1].replace(/\s/g, ""));
    unit = strict[2] || null;
  } else if (afterNcm) {
    const loose = afterNcm.match(/^([\d.,]+)(?:\s+([A-Za-zÀ-ÿ°º]{1,10}))?/);
    if (loose) {
      qty = parseBrDecimal(loose[1]);
      unit = loose[2] || null;
    }
  }
  const head = l.slice(0, iNcm).trim();
  const headM = head.match(/^(\d+)\s+(\S+)\s*(.*)$/);
  if (!headM) return null;
  const line_number = parseInt(headM[1], 10);
  if (!Number.isFinite(line_number) || line_number < 0) return null;
  return {
    line_number,
    product_code: headM[2].slice(0, 80),
    description: (headM[3] || "").trim().slice(0, 500),
    ncm: ncm.slice(0, 24),
    quantity: qty,
    unit: unit && unit.length > 0 ? unit : null,
    supplier_code: null,
  };
}

function parseStructuredLines(t: string): ParsedPolLine[] {
  const rowLines = expandMergedItemLines(rawItemRowLines(t));
  if (rowLines.length === 0) return [];
  const out: ParsedPolLine[] = [];
  let pendingSup: string | null = null;
  for (const raw of rowLines) {
    const l = raw.trim();
    if (/^cod\.?\s*fornecedor/i.test(l)) {
      const m = l.match(/fornecedor\s*:\s*(\S+)/i);
      if (m?.[1]) pendingSup = m[1].trim().slice(0, 80);
      continue;
    }
    const p = parseOneItemLine(l);
    if (p) {
      if (pendingSup) {
        p.supplier_code = pendingSup;
        pendingSup = null;
      }
      out.push(p);
    }
  }
  if (pendingSup && out.length > 0) {
    out[out.length - 1].supplier_code = out[out.length - 1].supplier_code ?? pendingSup;
  }
  return out;
}

export function parsePurchaseOrderPdf(
  text: string,
  fileName: string
): ParsedPurchaseOrderHeader {
  const t = text.replace(/\r/g, "\n");
  const fromFile = numberFromFileNameHeuristic(fileName);
  let number = fromFile ?? numberFromFileName(fileName);

  /** "Pedido de Compra Nº 26046" (modelo HEPA) */
  const hepaNum = t.match(/pedido\s+de\s+compra\s+n[.º°\s]*\s*(\d{2,})/i);
  if (hepaNum?.[1]) number = hepaNum[1].trim().slice(0, 80);
  else {
    const nM =
      t.match(
        /pedido\s+de\s+compras?[^\n]*?n[.º°o]?\s*(\d[\d\-./A-Za-z]{0,30})/i
      ) || t.match(/n[.ºo°]?\s*[:.]?\s*(\d[\d\-./A-Za-z]{1,30})/i);
    if (nM?.[1]) {
      const cand = nM[1].trim();
      if (cand.length >= 1 && cand.length <= 80) number = cand.slice(0, 80);
    }
  }

  let supplier_name = supplierFromInformacoesFornecedor(t);
  if (!supplier_name) {
    const fM = t.match(
      /(?:fornecedor|fornecedora|raz[aã]o\s+social|nome\s+fantasia)\s*[:.]\s*([^\n]+)/i
    );
    if (fM?.[1]) {
      supplier_name = fM[1].split(/\s{2,}/)[0].trim().slice(0, 255) || null;
    }
  }

  /** Sempre priorizar a linha explícita (evita pegar 06/04/2026 de "incluído em" antes de 09/04/2026 de entrega). */
  let expected_delivery: string | null = null;
  const previsEntrega = t.match(
    /previs[aã]o\s+de\s+entrega\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i
  );
  if (previsEntrega) expected_delivery = brDateToIso(previsEntrega, 1);
  if (!expected_delivery) {
    const p2 = t.match(/previs[aã]o[^:\n]*:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
    if (p2) expected_delivery = brDateToIso(p2, 1);
  }
  if (!expected_delivery) {
    const entF = t.match(
      /entrega\s*[^/:\n]{0,24}:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i
    );
    if (entF) expected_delivery = brDateToIso(entF, 1);
  }
  if (!expected_delivery) {
    expected_delivery = firstValidBrazilianDateInText(t);
  }

  const items_summary = extractItemsBlock(t);
  let lines = parseStructuredLines(t);
  /** Re-tenta a partir do bloco de texto bruto, se a extração global falhou no item. */
  if (lines.length === 0 && items_summary) {
    const retry = parseStructuredLines(`Itens do pedido\n${items_summary}`);
    if (retry.length > 0) {
      lines = retry;
    }
  }

  return { number, supplier_name, expected_delivery, items_summary, lines };
}
