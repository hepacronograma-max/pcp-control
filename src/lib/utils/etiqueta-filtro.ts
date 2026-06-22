/** Classes de filtragem reconhecidas (ordem: tokens mais longos primeiro). */
export const CLASSES_FILTRAGEM = [
  "H14",
  "H13",
  "H12",
  "H11",
  "H10",
  "F9",
  "F8",
  "F7",
  "M6",
  "M5",
  "G4",
  "G3",
] as const;

export type ClasseFiltragem = (typeof CLASSES_FILTRAGEM)[number] | "H13/H14";

export type ModeloEtiqueta = "completa" | "simples";

/**
 * Detecta a classe de filtragem a partir da descrição e/ou código HF.
 * Ex.: HF-BSF8 → F8, HF-GP-G4 → G4, HF-HESP-007 → null.
 */
export function detectarClasseFiltragem(
  descricao: string,
  codigo?: string | null
): string | null {
  const texto = `${codigo ?? ""} ${descricao}`.toUpperCase();

  if (/H13\s*\/\s*H14/.test(texto)) {
    return "H13/H14";
  }

  for (const token of CLASSES_FILTRAGEM) {
    if (texto.includes(token)) {
      return token;
    }
  }

  return null;
}

/** F/H → completa; G/M ou ausente → simples. */
export function decidirModeloEtiqueta(classe: string | null): ModeloEtiqueta {
  if (!classe) return "simples";
  const c = classe.toUpperCase();
  if (c.startsWith("F") || c.startsWith("H")) return "completa";
  if (c.startsWith("G") || c.startsWith("M")) return "simples";
  return "simples";
}

const DIMENSAO_RE =
  /(\d+)\s*[xX×]\s*(\d+)\s*[xX×]\s*(\d+)\s*(?:mm|MM)?/i;

/** Extrai dimensões tipo 305X610X75mm ou 592x592x292 mm da descrição. */
export function extrairDimensoes(descricao: string): string | null {
  const m = descricao.match(DIMENSAO_RE);
  if (!m) return null;
  return `${m[1]}X${m[2]}X${m[3]}mm`;
}

/** Medida para exibição na etiqueta (MM em maiúsculas). */
export function medidaEtiquetaFromDescricao(descricao: string): string | null {
  const m = descricao.match(DIMENSAO_RE);
  if (!m) return null;
  return `${m[1]}X${m[2]}X${m[3]}MM`;
}

/** Descrição do item sem a medida no final (para linha "Descrição" da etiqueta). */
export function descricaoSemMedida(descricao: string): string {
  return descricao.replace(DIMENSAO_RE, "").replace(/\s+/g, " ").trim();
}

/** Código HF exibido na etiqueta (product_code ou fallback parseado da descrição). */
export function codigoEtiquetaFromItem(
  productCode: string | null | undefined,
  descricao: string
): string {
  const code = (productCode ?? "").trim();
  if (code) return code.toUpperCase();
  const m = descricao.match(/\bHF-[A-Z0-9\-/]+\b/i);
  return m ? m[0].toUpperCase() : "—";
}

/** Data no formato AAMMDD (ano 2 dígitos, mês, dia). Ex.: 15/06/2026 → "260615". */
export function formatDataLote(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Lote da etiqueta: AAMMDD-numero_pedido_visivel (igual para todo o pedido). */
export function gerarLoteEtiqueta(params: {
  data?: Date;
  numeroPedidoVisivel: string;
}): string {
  const { data = new Date(), numeroPedidoVisivel } = params;
  const pedido = numeroPedidoVisivel.trim();
  return `${formatDataLote(data)}-${pedido}`;
}

/** Ex.: série 5 de 20 → "5/20" */
export function formatSerieEtiqueta(serie: number, total: number): string {
  return `${serie}/${total}`;
}

export type LayoutFaixaTecnica = "uma-linha" | "duas-linhas";

/** Rótulos da faixa técnica (modelo completa). Δ = U+0394. */
export const ROTULO_DPI_FAIXA = "ΔPi";
export const ROTULO_DPF_FAIXA = "ΔPf";

/** ~11 mm por coluna a 7,5 pt (46 mm ÷ 4); acima disso legibilidade cai na térmica. */
const LARGURA_MAX_CAMPO_FAIXA_UMA_LINHA = 11;

function textoCampoFaixaTecnica(
  rotulo: string,
  valor: string,
  sufixo = ""
): string {
  return `${rotulo}: ${valor || "—"}${sufixo}`;
}

export function textosCamposFaixaTecnica(params: {
  vazao?: string;
  perdaInicial?: string;
  perdaFinal?: string;
  classe?: string | null;
}): [string, string, string, string] {
  return [
    textoCampoFaixaTecnica("Vazão", params.vazao?.trim() ?? "", " m³/h"),
    textoCampoFaixaTecnica("Classe", params.classe?.trim() ?? ""),
    textoCampoFaixaTecnica(ROTULO_DPI_FAIXA, params.perdaInicial?.trim() ?? "", " Pa"),
    textoCampoFaixaTecnica(ROTULO_DPF_FAIXA, params.perdaFinal?.trim() ?? "", " Pa"),
  ];
}

/**
 * Completa: 1 linha só com placeholders (campos vazios); com valores reais,
 * 2 linhas se algum campo exceder ~11 chars/coluna a 7,5 pt (ex.: Vazão: 280 m³/h).
 */
export function decidirLayoutFaixaTecnica(params: {
  vazao?: string;
  perdaInicial?: string;
  perdaFinal?: string;
  classe?: string | null;
}): LayoutFaixaTecnica {
  const vazao = params.vazao?.trim() ?? "";
  const perdaInicial = params.perdaInicial?.trim() ?? "";
  const perdaFinal = params.perdaFinal?.trim() ?? "";
  const temValores =
    vazao.length > 0 || perdaInicial.length > 0 || perdaFinal.length > 0;
  if (!temValores) return "uma-linha";

  const campos = textosCamposFaixaTecnica(params);
  const maxCol = Math.max(...campos.map((c) => c.length));
  return maxCol > LARGURA_MAX_CAMPO_FAIXA_UMA_LINHA ? "duas-linhas" : "uma-linha";
}

/** Gera N entradas com série sequencial 1..N (lote e demais campos iguais). */
export function gerarEtiquetasComSeries<T extends Record<string, unknown>>(
  base: T,
  quantidade: number
): (T & { serie: number; serieTotal: number })[] {
  const total = Math.max(1, Math.floor(quantidade));
  return Array.from({ length: total }, (_, i) => ({
    ...base,
    serie: i + 1,
    serieTotal: total,
  }));
}

export type ParseSeriesReimpressaoResult =
  | { ok: true; numeros: number[] }
  | { ok: false; error: string };

/**
 * Interpreta campo "reimprimir série específica".
 * Vazio → numeros [] (imprimir todas). Ex.: "7" ou "7, 12, 15".
 */
export function parseSeriesReimpressao(
  input: string,
  serieTotal: number
): ParseSeriesReimpressaoResult {
  const trimmed = input.trim();
  const total = Math.max(1, Math.floor(serieTotal));

  if (!trimmed) {
    return { ok: true, numeros: [] };
  }

  const partes = trimmed
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (partes.length === 0) {
    return { ok: true, numeros: [] };
  }

  const numeros: number[] = [];
  for (const parte of partes) {
    if (!/^\d+$/.test(parte)) {
      return {
        ok: false,
        error: `"${parte}" não é válido. Use números entre 1 e ${total}, separados por vírgula (ex: 7 ou 7,12).`,
      };
    }
    const n = Number(parte);
    if (n < 1 || n > total) {
      return {
        ok: false,
        error: `Série ${n} inválida: informe um número entre 1 e ${total}.`,
      };
    }
    numeros.push(n);
  }

  return { ok: true, numeros: [...new Set(numeros)].sort((a, b) => a - b) };
}

/** Gera etiquetas só para as séries indicadas (reimpressão parcial). */
export function gerarEtiquetasSeriesEspecificas<T extends Record<string, unknown>>(
  base: T,
  numerosSerie: number[],
  serieTotal: number
): (T & { serie: number; serieTotal: number })[] {
  const total = Math.max(1, Math.floor(serieTotal));
  return numerosSerie.map((serie) => ({
    ...base,
    serie,
    serieTotal: total,
  }));
}
