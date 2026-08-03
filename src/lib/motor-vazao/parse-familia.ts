/** Parser de família de filtro HEPA — puro, sem I/O. */

export type TipoMotor =
  | "plano"
  | "cunha"
  | "fino"
  | "bolsa"
  | "sem_calculo";

export type ClasseFiltro =
  | "H14"
  | "H13"
  | "H12"
  | "H11"
  | "H10"
  | "F9"
  | "F8"
  | "F7"
  | "M6"
  | "M5"
  | "G4"
  | "G3"
  | "H13/H14";

export type CampoFaltante =
  | "dimensoes"
  | "num_elementos"
  | "tipo"
  | "classe"
  | "espessura_papel_mm"
  | "material"
  | "tem_coroa";

export type FamiliaParseada = {
  tipo: TipoMotor;
  classe: ClasseFiltro | null;
  largura_mm: number | null;
  altura_mm: number | null;
  profundidade_mm: number | null;
  num_elementos: number | null;
  /** Prefixo/modelo detectado (ex.: ABSW6, BSF8, FFP). */
  modelo: string | null;
  falta: CampoFaltante[];
};

const CLASSES_TOKENS: ClasseFiltro[] = [
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
];

const DIMENSAO_RE =
  /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(?:mm|MM)?/;

/** Modelo comercial embutido na description (não o SKU HF-1579). */
const MODELO_RE =
  /\bHF-?(ABSPI|ABSP|ABSW\d*|FFP|FFW\d*|BSF\d*|BSM\d*|BSG\d*|PL|GP|HESP(?:-\d+)?)\b/i;

function toNum(s: string): number {
  return Number(String(s).replace(",", "."));
}

function detectarClasse(texto: string): ClasseFiltro | null {
  const t = texto.toUpperCase();
  if (/H13\s*\/\s*H14/.test(t)) return "H13/H14";

  const bsf = t.match(/\bBSF(\d)\b/);
  if (bsf) {
    const n = bsf[1];
    if (n === "7") return "F7";
    if (n === "8") return "F8";
    if (n === "9") return "F9";
  }
  const bsm = t.match(/\bBSM(\d)\b/);
  if (bsm && bsm[1] === "6") return "M6";
  const bsg = t.match(/\bBSG(\d)\b/);
  if (bsg && bsg[1] === "4") return "G4";

  for (const token of CLASSES_TOKENS) {
    if (t.includes(token)) return token;
  }
  return null;
}

function extrairDimensoes(description: string): {
  largura_mm: number | null;
  altura_mm: number | null;
  profundidade_mm: number | null;
} {
  const m = description.match(DIMENSAO_RE);
  if (!m) {
    return { largura_mm: null, altura_mm: null, profundidade_mm: null };
  }
  return {
    largura_mm: toNum(m[1]),
    altura_mm: toNum(m[2]),
    profundidade_mm: toNum(m[3]),
  };
}

function extrairNumBolsas(texto: string, modelo: string): number | null {
  // BSF8-8-AG / BSM6-4-AG → segundo número após o modelo
  const m = texto.toUpperCase().match(
    new RegExp(`\\bHF-?${modelo.toUpperCase()}-(\\d+)\\b`)
  );
  if (m) return Number(m[1]);
  return null;
}

/**
 * Lê product_code + description e devolve família/dims/classe para o motor.
 * product_code costuma ser SKU (HF-1579); o modelo (ABSW6…) está na description.
 */
export function parseFamilia(
  productCode: string | null | undefined,
  description: string | null | undefined
): FamiliaParseada {
  const code = (productCode ?? "").trim();
  const desc = (description ?? "").trim();
  const texto = `${code} ${desc}`;

  const dims = extrairDimensoes(desc || texto);
  const classe = detectarClasse(texto);

  const modeloMatch = texto.match(MODELO_RE);
  const modeloRaw = modeloMatch?.[1]?.toUpperCase() ?? null;

  let tipo: TipoMotor = "sem_calculo";
  let num_elementos: number | null = null;
  const falta: CampoFaltante[] = [];
  let modelo: string | null = modeloRaw;

  if (!modeloRaw) {
    tipo = "sem_calculo";
    falta.push("tipo");
  } else if (/^ABSPI?$/.test(modeloRaw)) {
    tipo = "plano";
    modelo = modeloRaw;
  } else if (/^ABSW(\d+)$/.test(modeloRaw)) {
    tipo = "cunha";
    num_elementos = Number(modeloRaw.replace("ABSW", ""));
    modelo = modeloRaw;
  } else if (modeloRaw === "ABSW") {
    tipo = "cunha";
    modelo = "ABSW";
    falta.push("num_elementos");
  } else if (modeloRaw === "FFP") {
    tipo = "fino";
    modelo = "FFP";
  } else if (/^FFW(\d*)$/.test(modeloRaw)) {
    tipo = "cunha";
    const dig = modeloRaw.replace("FFW", "");
    num_elementos = dig ? Number(dig) : null;
    modelo = modeloRaw;
    if (!num_elementos) falta.push("num_elementos");
  } else if (/^BS[FMG]\d+$/.test(modeloRaw)) {
    tipo = "bolsa";
    modelo = modeloRaw;
    num_elementos = extrairNumBolsas(texto, modeloRaw);
    if (!num_elementos) falta.push("num_elementos");
  } else if (modeloRaw === "PL" || modeloRaw === "GP") {
    tipo = "sem_calculo";
    modelo = modeloRaw;
  } else if (modeloRaw.startsWith("HESP")) {
    tipo = "sem_calculo";
    modelo = modeloRaw;
  } else {
    tipo = "sem_calculo";
    falta.push("tipo");
  }

  if (
    dims.largura_mm == null ||
    dims.altura_mm == null ||
    dims.profundidade_mm == null
  ) {
    falta.push("dimensoes");
  }

  if (!classe && tipo !== "sem_calculo") {
    falta.push("classe");
  }

  // Dedup falta
  const faltaUniq = [...new Set(falta)];

  return {
    tipo,
    classe,
    largura_mm: dims.largura_mm,
    altura_mm: dims.altura_mm,
    profundidade_mm: dims.profundidade_mm,
    num_elementos,
    modelo,
    falta: faltaUniq,
  };
}
