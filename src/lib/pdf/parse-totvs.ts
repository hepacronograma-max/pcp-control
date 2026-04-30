/**
 * Parser para PDFs de orçamento no layout TOTVS (Hepa Filtros / similar).
 *
 * Formato esperado:
 *   Orçamento Nº XXXXX
 *   Informações do Cliente
 *   NOME DO CLIENTE
 *   ...
 *   Itens do Orçamento
 *   Quantidade Código Descrição
 *   2,00 PÇ HF-27462 FILTRO HF-FFP-F8-AG-S 590X590X80mm
 *   (linhas de descrição continuam até próximo item ou "Outras Informações")
 *   ...
 *   Outras Informações
 *   ...
 *   Previsão de Faturamento: DD/MM/YYYY
 *   Nº do Pedido do Cliente: XXXXX
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

/** Código na coluna "Código" do PDF TOTVS (ex.: HF-071, HF-25715). */
const RE_CODIGO_PRODUTO_TOTVS = /^[A-Z]{2,}-\d+[A-Z0-9.-]*$/i;

/**
 * Layout típico no PDF:
 * - Mesma linha: `3,00 PÇ HF-071 FILTRO ...` → código + início da descrição na mesma linha.
 * - Ou `3,00 PÇ HF-071` só código na linha da qtde e a linha seguinte é só o nome curto do item;
 *   linhas abaixo são observações (normas, texto promocional) — não importamos.
 */
function splitTotvsCodeFromQuantityTail(tailAfterUnit: string): {
  product_code: string | null;
  restSameLine: string;
} {
  const trimmed = tailAfterUnit.trim();
  if (!trimmed) return { product_code: null, restSameLine: "" };
  const tokens = trimmed.split(/\s+/);
  const first = tokens[0] ?? "";
  if (RE_CODIGO_PRODUTO_TOTVS.test(first)) {
    return {
      product_code: first,
      restSameLine: tokens.slice(1).join(" ").trim(),
    };
  }
  return { product_code: null, restSameLine: trimmed };
}

export interface ParsedTotvsItem {
  description: string;
  quantity: number;
  /** Coluna "Código" do PDF, quando reconhecida */
  product_code?: string | null;
}

export interface ParsedTotvsResult {
  success: boolean;
  orderNumber: string;
  clientName: string;
  deliveryDate: string | null;
  items: ParsedTotvsItem[];
  itemCount: number;
  customerPO: string | null;
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
  let customerPO: string | null = null;
  const items: ParsedTotvsItem[] = [];

  // --- Número do orçamento ---
  for (const l of linhas) {
    const m = l.match(/Or[çc]amento\s+N[ºo°]?\s*(\d+)/i);
    if (m) {
      orderNumber = m[1];
      break;
    }
  }

  // --- Cliente: linha após "Informações do Cliente" ---
  const idxInfo = linhas.findIndex((l) =>
    /^Informa[cç][oõ]es\s+do\s+Cliente/i.test(l)
  );
  if (idxInfo >= 0) {
    for (let i = idxInfo + 1; i < linhas.length && i <= idxInfo + 5; i++) {
      const candidato = linhas[i].trim();
      if (
        candidato.length > 2 &&
        !/^Contato:/i.test(candidato) &&
        !/^CNPJ:/i.test(candidato) &&
        !/^Telefone:/i.test(candidato) &&
        !/^Email:/i.test(candidato) &&
        !/^\d+$/.test(candidato)
      ) {
        clientName = candidato;
        break;
      }
    }
  }

  // --- Previsão de Faturamento (prazo de entrega de vendas) ---
  const padroesData = [
    /Previs[aã]o\s+de\s+Faturamento\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Previsao\s+de\s+Faturamento\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Prazo\s+de\s+[Ee]ntrega\s*(?:\([^)]*\))?\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Data\s+(?:de\s+)?[Ee]ntrega\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Data\s+Prevista\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ];
  for (const l of linhas) {
    for (const re of padroesData) {
      const m = l.match(re);
      if (m) {
        const parts = m[1].split("/");
        const d = parts[0].padStart(2, "0");
        const mth = parts[1].padStart(2, "0");
        const y = parts[2];
        deliveryDate = `${y}-${mth}-${d}`;
        break;
      }
    }
    if (deliveryDate) break;
  }

  // --- Nº do Pedido do Cliente ---
  for (const l of linhas) {
    const m = l.match(/N[ºo°]?\s*do\s+Pedido\s+do\s+Cliente\s*:\s*(.+)/i);
    if (m) {
      customerPO = m[1].trim();
      break;
    }
  }

  // --- Itens do Orçamento ---
  const idxItens = linhas.findIndex((l) =>
    /^Itens\s+do\s+Or[çc]amento/i.test(l)
  );
  const idxOutras = linhas.findIndex((l) =>
    /^Outras\s+Informa[cç][oõ]es/i.test(l)
  );

  if (idxItens >= 0) {
    // Pular cabeçalho "Quantidade Código Descrição"
    let start = idxItens + 1;
    if (start < linhas.length && /Quantidade\s+C[oó]digo\s+Descri[cç][aã]o/i.test(linhas[start])) {
      start++;
    }
    const end = idxOutras > start ? idxOutras : linhas.length;

    const UNIDADES =
      /^(UN|PÇ|PC|PCS|PCT|CX|KG|M|M2|M3|LT|L|HR|CJ|JG|PR|RL|SC|TB|FD|GL|TON|MIL|PAR|UNID|UND|PEÇA)$/i;
    const reLinhaItem = /^(\d+[,.]\d{2})\s+(.+)$/;

    let lineIdx = start;
    while (lineIdx < end) {
      const linha = linhas[lineIdx];
      const m = linha.match(reLinhaItem);
      if (!m) {
        lineIdx++;
        continue;
      }

      const qtd = parseFloat(m[1].replace(".", "").replace(",", "."));
      let resto = m[2].trim();
      const partes = resto.split(/\s+/);
      let startIdx = 0;
      if (partes.length > 1 && UNIDADES.test(partes[0])) {
        startIdx = 1;
      }
      const tailTokens = partes.slice(startIdx);
      const tailJoined = tailTokens.join(" ");

      const { product_code, restSameLine } =
        splitTotvsCodeFromQuantityTail(tailJoined);

      let description = "";
      let blockEnd = lineIdx;

      if (
        product_code &&
        !restSameLine &&
        lineIdx + 1 < end &&
        !reLinhaItem.test(linhas[lineIdx + 1]) &&
        !/^Outras\s+Informa/i.test(linhas[lineIdx + 1])
      ) {
        /** Código só na linha da quantidade; descrição curta na linha seguinte. */
        description = linhas[lineIdx + 1].trim();
        blockEnd = lineIdx + 1;
      } else {
        description = restSameLine.trim();
        blockEnd = lineIdx;
      }

      while (
        blockEnd + 1 < end &&
        !reLinhaItem.test(linhas[blockEnd + 1]) &&
        !/^Outras\s+Informa/i.test(linhas[blockEnd + 1])
      ) {
        blockEnd++;
      }

      if (!Number.isNaN(qtd) && qtd > 0 && description.length > 0) {
        items.push({
          quantity: qtd,
          description: description.slice(0, 500),
          product_code: product_code ?? null,
        });
      }

      lineIdx = blockEnd + 1;
    }
  }

  // --- Fallbacks ---
  if (!orderNumber) {
    const baseName = fileName.replace(/\.pdf$/i, "");
    const partial = baseName.match(/^(\d+)[_\-](\d+)$/);
    if (partial) {
      orderNumber = `${partial[1]}/${partial[2]}`.slice(0, 50);
    } else {
      const mNum = baseName.match(/\d+/);
      orderNumber = mNum ? mNum[0] : baseName;
    }
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
    customerPO,
  };
}
