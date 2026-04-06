/**
 * Parser para PDFs de Pedido de Venda do Omie.
 * Extração por regex e padrões de texto - sem uso de IA ou APIs pagas.
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

function parsearData(str: string): string | null {
  if (!str) return null;
  // DD/MM/YYYY ou DD-MM-YYYY
  const m1 = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) {
    const [, d, m, y] = m1;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD já formatado
  const m2 = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[0];
  return null;
}

export interface ParsedOmieItem {
  description: string;
  quantity: number;
}

export interface ParsedOmieResult {
  success: boolean;
  orderNumber: string;
  clientName: string;
  deliveryDate: string | null;
  items: ParsedOmieItem[];
  itemCount: number;
}

/**
 * Detecta se o texto parece ser de um PDF Omie ou pedido de venda genérico.
 * Omie nem sempre inclui a marca no PDF; detectamos por estrutura típica.
 */
export function isOmiePdf(text: string): boolean {
  const norm = normalizarTextoPdf(text).toLowerCase();
  const temPedido = norm.includes("pedido") || norm.includes("ordem");
  const temCliente = norm.includes("cliente") || norm.includes("razão social") || norm.includes("razao social");
  const temItens = norm.includes("itens") || norm.includes("produtos") || norm.includes("detalhamento");
  const temOmie = norm.includes("omie");
  return temOmie || (temPedido && (temCliente || temItens));
}

/**
 * Extrai número do pedido - várias variações do Omie.
 */
function extrairNumeroPedido(linhas: string[]): string | null {
  const padroes = [
    /N[ºo°]?\s*(?:do\s+)?[Pp]edido\s*[:\s]*(\d+)/i,
    /[Pp]edido\s*[#Nnºo°]?\s*[:\s]*(\d+)/i,
    /(?:Número|Numero)\s*(?:do\s+)?[Pp]edido\s*[:\s]*(\d+)/i,
    /[Pp]edido\s+(\d+)/,
    /Ordem\s*[:\s]*(\d+)/i,
    /OS\s*[:\s]*(\d+)/i,
  ];
  for (const linha of linhas) {
    for (const re of padroes) {
      const m = linha.match(re);
      if (m) return m[1].trim();
    }
  }
  return null;
}

/**
 * Extrai nome do cliente.
 */
function extrairCliente(linhas: string[]): string | null {
  const padroes = [
    /(?:Raz[aã]o\s+Social|Cliente|Nome\s+do\s+Cliente)\s*[:\s]+(.+)/i,
    /Cliente\s*[:\s]+(.+)/i,
  ];
  for (const linha of linhas) {
    for (const re of padroes) {
      const m = linha.match(re);
      if (m) {
        const nome = m[1].trim();
        if (nome.length > 2 && nome.length < 200) return nome;
      }
    }
  }
  // Buscar linha após "Cliente" ou "Razão Social"
  for (let i = 0; i < linhas.length - 1; i++) {
    if (/^(?:Raz[aã]o\s+Social|Cliente)\s*[:\s]*$/i.test(linhas[i])) {
      const next = linhas[i + 1].trim();
      if (next && next.length > 2 && !/^\d+$/.test(next)) return next;
    }
  }
  return null;
}

/**
 * Extrai data de entrega.
 */
function extrairDataEntrega(linhas: string[]): string | null {
  const padroes = [
    /(?:Data\s+de\s+Entrega|Prazo\s+de\s+Entrega|Data\s+Prevista|Previs[aã]o)\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /(?:Entrega|Prazo)\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
  ];
  for (const linha of linhas) {
    for (const re of padroes) {
      const m = linha.match(re);
      if (m) {
        const parsed = parsearData(m[1]);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

/**
 * Extrai itens do pedido. O Omie pode ter tabelas com:
 * - Qtd | Código | Descrição | ...
 * - Quantidade no início da linha
 * - Linhas que começam com número (quantidade)
 */
function extrairItens(linhas: string[], textoCompleto: string): ParsedOmieItem[] {
  const items: ParsedOmieItem[] = [];

  // Encontrar seção de itens
  const idxItens = linhas.findIndex(
    (l) =>
      /^Itens?\s+(?:do\s+)?[Pp]edido/i.test(l) ||
      /^Produtos?/i.test(l) ||
      /^Detalhamento\s+dos\s+Itens/i.test(l) ||
      /^Descri[cç][aã]o\s+Qtd|Qtd\s+Descri[cç][aã]o/i.test(l) ||
      /Qtd\s+.*Descri[cç][aã]o|Descri[cç][aã]o\s+.*Qtd/i.test(l) ||
      /C[oó]digo\s+Descri[cç][aã]o\s+Quantidade|Quantidade\s+.*Descri[cç][aã]o/i.test(l) ||
      /^Item\s+C[oó]digo\s+Descri[cç][aã]o/i.test(l)
  );

  const start = idxItens >= 0 ? idxItens + 1 : 0;
  const idxFim = linhas.findIndex(
    (l, i) =>
      i > start &&
      (/^Subtotal|^Total|^Valor\s+Total|^Observa[cç]/i.test(l) ||
        /^Resumo\s+do\s+Pedido/i.test(l) ||
        /^Condi[cç][oõ]es\s+de\s+Pagamento/i.test(l))
  );
  const end = idxFim > start ? idxFim : linhas.length;

  // Padrão 1: Linha com quantidade no início (ex: "2,00 12345 Descrição do produto")
  const reQtdInicio = /^(\d+[,.]?\d*)\s+(\S+)\s+(.+)$/;
  // Padrão 2: Quantidade no meio ou fim
  const reQtdDecimal = /(\d+[,.]\d{2})\s*(?:un|und|unid|pç|pc)?\s*(.+)/i;
  // Padrão 3: Tabela com colunas - quantidade, código, descrição
  const reTabela = /^[\d\s,.]+\s+[\w\-]+\s+.+/;

  const linhasSecao = linhas.slice(start, end);

  for (let i = 0; i < linhasSecao.length; i++) {
    let linha = linhasSecao[i];

    // Juntar linhas quebradas (descrição em múltiplas linhas)
    while (
      i + 1 < linhasSecao.length &&
      !/^\d+[,.]?\d*\s+\S+/.test(linhasSecao[i + 1]) &&
      !/^[A-Z]{2,}\d+/.test(linhasSecao[i + 1]) &&
      linhasSecao[i + 1].trim().length > 0 &&
      !/^Subtotal|^Total|^---/.test(linhasSecao[i + 1])
    ) {
      i++;
      linha = linha + " " + linhasSecao[i];
    }

    // Tentar padrão quantidade no início
    let m = linha.match(reQtdInicio);
    if (m) {
      const qtdStr = m[1].replace(",", ".");
      const qtd = parseFloat(qtdStr);
      const codigo = m[2];
      const desc = m[3].trim();
      if (!Number.isNaN(qtd) && qtd > 0 && desc.length > 1) {
        items.push({
          description: codigo ? `${codigo} ${desc}` : desc,
          quantity: qtd,
        });
        continue;
      }
    }

    // Tentar padrão com quantidade decimal
    m = linha.match(reQtdDecimal);
    if (m) {
      const qtd = parseFloat(m[1].replace(",", "."));
      const desc = m[2].trim();
      if (!Number.isNaN(qtd) && qtd > 0 && desc.length > 2) {
        items.push({ description: desc, quantity: qtd });
        continue;
      }
    }

    // Padrão alternativo: "Código - Descrição - Qtd" ou similar
    const partes = linha.split(/\s{2,}|\t/);
    if (partes.length >= 3) {
      const ultima = partes[partes.length - 1];
      const qtd = parseFloat(ultima.replace(",", "."));
      if (!Number.isNaN(qtd) && qtd > 0) {
        const desc = partes.slice(0, -1).join(" ").trim();
        if (desc.length > 2) {
          items.push({ description: desc, quantity: qtd });
        }
      }
    }
  }

  // Fallback: buscar linhas com padrão "número espaço texto" no documento todo
  if (items.length === 0) {
    const todasLinhas = textoCompleto.split(/\n/);
    for (const l of todasLinhas) {
      const m = l.match(/^(\d+[,.]?\d*)\s+(.+)$/);
      if (m) {
        const qtd = parseFloat(m[1].replace(",", "."));
        const desc = m[2].trim();
        if (
          !Number.isNaN(qtd) &&
          qtd > 0 &&
          qtd < 10000 &&
          desc.length > 3 &&
          !/^\d+$/.test(desc) &&
          !/subtotal|total|valor/i.test(desc)
        ) {
          items.push({ description: desc, quantity: qtd });
        }
      }
    }
  }

  return items;
}

export function parseOmiePedido(
  text: string,
  fileName: string
): ParsedOmieResult {
  const norm = normalizarTextoPdf(text);
  const linhas = norm.split(/\n/).map((l) => l.trim()).filter(Boolean);

  let orderNumber = extrairNumeroPedido(linhas);
  let clientName = extrairCliente(linhas);
  const deliveryDate = extrairDataEntrega(linhas);
  const items = extrairItens(linhas, norm);

  if (!orderNumber) {
    const baseName = fileName.replace(/\.pdf$/i, "");
    const partial = baseName.match(/^(\d+)[_\-](\d+)$/);
    if (partial) {
      orderNumber = `${partial[1]}/${partial[2]}`.slice(0, 50);
    } else {
      const mNum = baseName.match(/\d+/);
      orderNumber = mNum ? mNum[0] : baseName || "PDF";
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
  };
}
