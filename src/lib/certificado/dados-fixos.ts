/** Dados fixos do Certificado de Qualidade HEPA. */

export const INSTRUMENTO_TESTE = {
  instrumento: "Fotometro de Aerossol",
  fabricante: "ATI (Air Techniques Inc.)",
  modelo: "2H-N",
  numeroSerie: "16462",
  certificadoCalibracao: "2602-074",
  calibradoPor: "PWM",
  dataCalibracao: "10/02/2026",
  validadeCalibracao: "10/02/2027",
} as const;

export const GERADOR_AEROSSOL = {
  modelo: "HF-GA-01 (fabricacao HEPA)",
  aerossol: "P.A.O",
} as const;

export const APROVADORES = [
  "Fernanda Miranda da Silva",
  "Norma Manuel",
  "Eliane Carvalho",
  "Gabriela Baldan dos Santos",
] as const;

export const ELABORADOR_PADRAO = "Leonardo Silva Alves";

/** Elaborador no dropdown: padrao + aprovadores (todos com PNG quando existir). */
export const ELABORADORES = [
  ELABORADOR_PADRAO,
  ...APROVADORES,
] as const;

const ASSINATURAS_DIR = "/certificados/assinaturas";

const ASSINATURA_POR_NOME: Record<string, string> = {
  "Leonardo Silva Alves": "assinatura-leonardo.png",
  "Fernanda Miranda da Silva": "assinatura-fernanda.png",
  "Norma Manuel": "assinatura-norma.png",
  "Eliane Carvalho": "assinatura-eliane.png",
  "Gabriela Baldan dos Santos": "assinatura-gabriela.png",
};

function normalizarNome(nome: string): string {
  return nome.trim().replace(/\s+/g, " ");
}

/** Caminho publico do PNG, ou null se a pessoa nao tem imagem. */
export function pathAssinatura(
  nome: string | null | undefined
): string | null {
  if (!nome) return null;
  const n = normalizarNome(nome);
  if (!n) return null;
  const exact = ASSINATURA_POR_NOME[n];
  if (exact) return `${ASSINATURAS_DIR}/${exact}`;
  const lower = n.toLowerCase();
  for (const [k, file] of Object.entries(ASSINATURA_POR_NOME)) {
    if (k.toLowerCase() === lower) return `${ASSINATURAS_DIR}/${file}`;
  }
  /** Nome antigo da Gabriela (com Araujo) ainda aponta para o mesmo PNG. */
  if (lower.startsWith("gabriela baldan dos santos")) {
    return `${ASSINATURAS_DIR}/assinatura-gabriela.png`;
  }
  return null;
}
