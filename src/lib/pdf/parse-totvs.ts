/**
 * Parser para PDFs de orçamento no layout TOTVS.
 * Extraído do local-pdf-server.js para uso na API Next.js.
 */

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

export interface ParsedTotvsItem {
  description: string;
  quantity: number;
}

export interface ParsedTotvsResult {
  success: boolean;
  orderNumber: string;
  clientName: string;
  deliveryDate: string | null;
  items: ParsedTotvsItem[];
  itemCount: number;
}

export function parseTotvsOrcamento(
  text: string,
  fileName: string
): ParsedTotvsResult {
  const norm = normalizarTextoPdf(text);
  const linhas = norm.split(/\n/).map((l) => l.trim()).filter(Boolean);

  let orderNumber: string | null = null;
  let clientName: string | null = null;
  let deliveryDate: string | null = null;
  const items: ParsedTotvsItem[] = [];

  for (const l of linhas) {
    const m = l.match(/Orçamento\s+N[ºo]\s*(\d+)/i);
    if (m) {
      orderNumber = m[1];
      break;
    }
  }

  const idxInfo = linhas.findIndex((l) =>
    /^Informa[cç][oõ]es do Cliente/i.test(l)
  );
  if (idxInfo >= 0 && idxInfo + 1 < linhas.length) {
    clientName = linhas[idxInfo + 1].trim() || null;
  }

  for (const l of linhas) {
    const m = l.match(/Previs[aã]o de Faturamento:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (m) {
      const [d, mth, y] = m[1].split("/");
      deliveryDate = `${y}-${mth}-${d}`;
      break;
    }
  }

  const idxItens = linhas.findIndex((l) =>
    /^Itens do Or[cç]amento/i.test(l)
  );
  const idxOutras = linhas.findIndex((l) =>
    /^Outras Informa[cç][oõ]es/i.test(l)
  );

  if (idxItens >= 0) {
    const start = idxItens + 2;
    const end = idxOutras > start ? idxOutras : linhas.length;

    const linhasItens: string[] = [];
    for (let i = start; i < end; i++) {
      let linha = linhas[i];
      if (!linha) continue;
      while (
        i + 1 < end &&
        !/^\d+,\d{2}\s+\S+\s+\S+/.test(linhas[i + 1]) &&
        !/^Outras Informa[cç]/i.test(linhas[i + 1])
      ) {
        i++;
        linha = linha + " " + (linhas[i] || "");
      }
      linhasItens.push(linha);
    }

    for (const linha of linhasItens) {
      const m = linha.match(/^(\d+,\d{2})\s+\S+\s+(\S+)\s+(.+)$/);
      if (!m) continue;
      const qtd = parseFloat(m[1].replace(".", "").replace(",", "."));
      const codigo = m[2];
      const desc = m[3].trim();
      if (!Number.isNaN(qtd) && desc) {
        items.push({
          description: `${codigo} ${desc}`,
          quantity: qtd,
        });
      }
    }
  }

  if (!orderNumber) {
    const baseName = fileName.replace(/\.pdf$/i, "");
    const mNum = baseName.match(/\d+/);
    orderNumber = mNum ? mNum[0] : baseName;
  }

  if (!clientName) {
    clientName = "Cliente do PDF";
  }

  if (!items.length) {
    items.push({
      description: `Item importado de ${fileName}`,
      quantity: 1,
    });
  }

  return {
    success: true,
    orderNumber,
    clientName,
    deliveryDate,
    items,
    itemCount: items.length,
  };
}
