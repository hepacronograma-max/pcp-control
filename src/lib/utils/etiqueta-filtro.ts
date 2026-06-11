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

/** Extrai dimensões tipo 305X610X75mm ou 592x592x292 mm da descrição. */
export function extrairDimensoes(descricao: string): string | null {
  const m = descricao.match(
    /(\d+)\s*[xX×]\s*(\d+)\s*[xX×]\s*(\d+)\s*(?:mm|MM)?/
  );
  if (!m) return null;
  return `${m[1]}X${m[2]}X${m[3]}mm`;
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
