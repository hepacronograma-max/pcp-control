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

    const UNIDADES = /^(UN|PÇ|PC|PCS|PCT|CX|KG|M|M2|M3|LT|L|HR|CJ|JG|PR|RL|SC|TB|FD|GL|TON|MIL|PAR|UNID|UND|PEÇA)$/i;
    // Regex: linha começando com quantidade decimal
    const reLinhaItem = /^(\d+[,.]\d{2})\s+(.+)$/;

    let i = start;
    while (i < end) {
      const linha = linhas[i];

      const m = linha.match(reLinhaItem);
      if (m) {
        const qtd = parseFloat(m[1].replace(".", "").replace(",", "."));
        const resto = m[2].trim();

        // Separar partes: pode ser "PÇ HF-27462 FILTRO..." ou "HF-27462 FILTRO..."
        const partes = resto.split(/\s+/);
        let startIdx = 0;

        // Pular unidade se for a primeira palavra
        if (partes.length > 1 && UNIDADES.test(partes[0])) {
          startIdx = 1;
        }

        const descPartes = partes.slice(startIdx).join(" ");

        // Coletar linhas de continuação da descrição
        let descCompleta = descPartes;
        while (
          i + 1 < end &&
          !reLinhaItem.test(linhas[i + 1]) &&
          !/^Outras\s+Informa/i.test(linhas[i + 1])
        ) {
          i++;
          descCompleta += " " + linhas[i];
        }

        if (!Number.isNaN(qtd) && qtd > 0 && descCompleta.length > 1) {
          items.push({
            description: descCompleta.trim(),
            quantity: qtd,
          });
        }
        i++;
        continue;
      }

      i++;
    }
  }

  // --- Fallbacks ---
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
    customerPO,
  };
}
