/** Templates de checklist — alinhados aos moldes HTML em docs/certificado/. */

export type TipoCertificado = "A" | "B" | "C" | "D";

export type ChecklistItem = {
  ordem: number;
  /** Coluna CARACTERÍSTICA CRÍTICA */
  caracteristica: string;
  /** Coluna DESCRIÇÃO */
  descricao: string;
  /** Coluna MEIO DE MEDIÇÃO */
  meio: string;
  /** Coluna TOLERÂNCIA (texto estático; vazão/eficiência dinâmicas via flags) */
  tolerancia: string;
  /** Coluna FREQ. */
  frequencia: string;
  /** Linha destacada (amarelo) — testes de bancada Tipo A */
  destaqueTeste?: boolean;
  toleranciaDinamicaVazao?: boolean;
  toleranciaDinamicaEficiencia?: boolean;
};

export type FamiliaCertificado = "absoluto" | "fino" | "bolsa" | "grosso";

/** Única fonte da norma impressa no certificado. Nunca usar 16401. */
export const NORMA_ABSOLUTO = "NBR ISO 29463-1:2013";
export const NORMA_FINO_BOLSA_GROSSO = "NBR 16101:2012";

export function normaDoTemplate(familia: FamiliaCertificado): string {
  return familia === "absoluto" ? NORMA_ABSOLUTO : NORMA_FINO_BOLSA_GROSSO;
}

/** Ex.: "F8 (NBR 16101:2012)" / "H14 (NBR ISO 29463-1:2013)" */
export function textoClasseComNorma(
  classe: string | null | undefined,
  familia: FamiliaCertificado
): string {
  const norma = normaDoTemplate(familia);
  const c = (classe ?? "").trim();
  return c ? `${c} (${norma})` : `- (${norma})`;
}

export type TemplateCertificado = {
  tipo: TipoCertificado;
  familia: FamiliaCertificado;
  titulo: string;
  norma: string;
  /** Cabeçalho da última coluna */
  colunaCertificacao: "CERTIFICAÇÃO" | "PLANO DE REAÇÃO";
  geraVerso: boolean;
  temTesteBancada: boolean;
  /** Vazão/pressão + gráficos. GP/PL = false (sem motor). */
  temCurvaDesempenho: boolean;
  checklist: ChecklistItem[];
};

const FREQ_100 = "100% do lote";
const FREQ_10 = "1 a cada 10";

export const TEMPLATE_A: TemplateCertificado = {
  tipo: "A",
  familia: "absoluto",
  titulo: "ABSOLUTO (ABSW, ABSP)",
  norma: NORMA_ABSOLUTO,
  colunaCertificacao: "CERTIFICAÇÃO",
  geraVerso: false,
  temTesteBancada: true,
  temCurvaDesempenho: true,
  checklist: [
    {
      ordem: 1,
      caracteristica: "Dimensional cotas A,B,C",
      descricao: "Verificar altura, largura e espessura conforme pedido",
      meio: "Trena convencional",
      tolerancia: "(+/-) 5mm",
      frequencia: FREQ_100,
    },
    {
      ordem: 2,
      caracteristica: "Moldura do filtro",
      descricao: "Integridade: amassados, oxidações, rebarba",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 3,
      caracteristica: "Meio filtrante",
      descricao: "Plissas isentas de furos/amassados; distribuição das cunhas",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 4,
      caracteristica: "Colagem",
      descricao: "Colagem do meio filtrante junto à moldura",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 5,
      caracteristica: "Guarnição",
      descricao: "Tipo de guarnição, colagem e lado de saída do ar",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 6,
      caracteristica: "Identificação",
      descricao: "Dados da etiqueta junto ao pedido de fabricação",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 7,
      caracteristica: "Limpeza",
      descricao: "Produto isento de resíduos",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 8,
      caracteristica: "Rastreabilidade",
      descricao: "Dados na ficha de fabricação",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 9,
      caracteristica: "Teste de aerossol (DOP)",
      descricao: "Inexistência de vazamento. TI ABS 01",
      meio: "Bancada de Teste",
      tolerancia: "Sem vazamento",
      frequencia: FREQ_100,
      destaqueTeste: true,
    },
    {
      ordem: 10,
      caracteristica: "Teste de vazão (balômetro TSI)",
      descricao: "Vazao e pressao (Pi/Pf) iguais a etiqueta",
      meio: "Bancada de Teste",
      tolerancia: "",
      frequencia: FREQ_100,
      destaqueTeste: true,
      toleranciaDinamicaVazao: true,
    },
    {
      ordem: 11,
      caracteristica: "Teste de eficiência",
      descricao: "Contador de partícula (ATI)",
      meio: "Bancada de Teste",
      tolerancia: "H14 >= 99,995% (H13 >= 99,95%)",
      frequencia: FREQ_100,
      destaqueTeste: true,
    },
    {
      ordem: 12,
      caracteristica: "Embalagem",
      descricao: "Proteções laterais e saco plástico",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
  ],
};

export const TEMPLATE_B: TemplateCertificado = {
  tipo: "B",
  familia: "fino",
  titulo: "FINO (FFP, FFW)",
  norma: NORMA_FINO_BOLSA_GROSSO,
  colunaCertificacao: "CERTIFICAÇÃO",
  geraVerso: false,
  temTesteBancada: false,
  temCurvaDesempenho: true,
  checklist: [
    {
      ordem: 1,
      caracteristica: "Dimensional cotas A,B,C",
      descricao: "Altura, largura e espessura conforme pedido",
      meio: "Trena convencional",
      tolerancia: "(+/-) 5mm",
      frequencia: FREQ_100,
    },
    {
      ordem: 2,
      caracteristica: "Esquadro",
      descricao: "Dimensão externa das diagonais",
      meio: "Trena",
      tolerancia: "(+/-) 5mm",
      frequencia: FREQ_100,
    },
    {
      ordem: 3,
      caracteristica: "Moldura do filtro",
      descricao: "Integridade: amassados",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 4,
      caracteristica: "Meio filtrante",
      descricao: "Distribuição das plissas e isenção de furos/amassados",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 5,
      caracteristica: "Colagem",
      descricao: "Colagem do meio filtrante junto à moldura",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 6,
      caracteristica: "Guarnição",
      descricao: "Tipo de guarnição, colagem na moldura",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 7,
      caracteristica: "Identificação",
      descricao: "Dados da etiqueta junto ao pedido",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 8,
      caracteristica: "Limpeza",
      descricao: "Produto isento de resíduos",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
    {
      ordem: 9,
      caracteristica: "Embalagem",
      descricao: "Proteções laterais e saco plástico",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_100,
    },
  ],
};

export const TEMPLATE_C: TemplateCertificado = {
  tipo: "C",
  familia: "bolsa",
  titulo: "BOLSA (BSF)",
  norma: NORMA_FINO_BOLSA_GROSSO,
  colunaCertificacao: "PLANO DE REAÇÃO",
  geraVerso: false,
  temTesteBancada: false,
  temCurvaDesempenho: true,
  checklist: [
    {
      ordem: 1,
      caracteristica: "Meio filtrante (tipo bolsa, costuras)",
      descricao: "Tipo de bolsa, costuras e integridade do meio",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 2,
      caracteristica: "Dimensão produto",
      descricao: "Dimensões externas conforme pedido",
      meio: "Trena",
      tolerancia: "(+/-) 1mm",
      frequencia: FREQ_10,
    },
    {
      ordem: 3,
      caracteristica: "Dimensão espessura moldura",
      descricao: "Espessura da moldura conforme especificação",
      meio: "Trena",
      tolerancia: "(+/-) 0,5mm",
      frequencia: FREQ_10,
    },
    {
      ordem: 4,
      caracteristica: "Bolsas (quantidade)",
      descricao: "Quantidade de bolsas conforme pedido",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 5,
      caracteristica: "Guarnição",
      descricao: "Tipo de guarnição e colagem na moldura",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 6,
      caracteristica: "Acabamento",
      descricao: "Acabamento geral do produto",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 7,
      caracteristica: "Identificação",
      descricao: "Dados da etiqueta junto ao pedido",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 8,
      caracteristica: "Embalagem",
      descricao: "Proteções laterais e saco plástico",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
  ],
};

export const TEMPLATE_D: TemplateCertificado = {
  tipo: "D",
  familia: "grosso",
  titulo: "GROSSO / PLISSADO (GP, PL)",
  norma: NORMA_FINO_BOLSA_GROSSO,
  colunaCertificacao: "PLANO DE REAÇÃO",
  geraVerso: false,
  temTesteBancada: false,
  temCurvaDesempenho: false,
  checklist: [
    {
      ordem: 1,
      caracteristica: "Meio filtrante",
      descricao: "Integridade do meio filtrante",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 2,
      caracteristica: "Dimensão",
      descricao: "Dimensões externas conforme pedido",
      meio: "Trena",
      tolerancia: "(+/-) 5mm",
      frequencia: FREQ_10,
    },
    {
      ordem: 3,
      caracteristica: "Esquadro",
      descricao: "Dimensão externa das diagonais",
      meio: "Trena",
      tolerancia: "(+/-) 5mm",
      frequencia: FREQ_10,
    },
    {
      ordem: 4,
      caracteristica: "Reforço",
      descricao: "Reforço / tela conforme especificação",
      meio: "Trena",
      tolerancia: "(+/-) 5mm",
      frequencia: FREQ_10,
    },
    {
      ordem: 5,
      caracteristica: "Moldura",
      descricao: "Integridade da moldura",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 6,
      caracteristica: "Cola",
      descricao: "Colagem do meio filtrante",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 7,
      caracteristica: "Acabamento",
      descricao: "Acabamento geral do produto",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 8,
      caracteristica: "Identificação",
      descricao: "Dados da etiqueta junto ao pedido",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
    {
      ordem: 9,
      caracteristica: "Embalagem",
      descricao: "Proteções laterais e saco plástico",
      meio: "Visual",
      tolerancia: "N.A",
      frequencia: FREQ_10,
    },
  ],
};

export function templatePorTipo(tipo: TipoCertificado): TemplateCertificado {
  switch (tipo) {
    case "A":
      return TEMPLATE_A;
    case "B":
      return TEMPLATE_B;
    case "C":
      return TEMPLATE_C;
    case "D":
      return TEMPLATE_D;
  }
}

/** Texto de eficiência (absoluto): sempre as duas classes. */
export function textoEficiencia(_classe?: string | null): string {
  return "H14 >= 99,995% (H13 >= 99,95%)";
}

/** Mesmos valores da etiqueta (motor_vazao / motor_dpi / motor_dpf). */
export function textoVazaoPressaoCertificado(
  vazao: number | null | undefined,
  dPi: number | null | undefined,
  dPf: number | null | undefined
): string {
  const v = vazao != null && Number.isFinite(vazao) ? String(vazao) : "-";
  const pi = dPi != null && Number.isFinite(dPi) ? String(dPi) : "-";
  const pf = dPf != null && Number.isFinite(dPf) ? String(dPf) : "-";
  return `${v} m3/h | Pi ${pi} Pa | Pf ${pf} Pa`;
}

export function toleranciaChecklist(
  item: ChecklistItem,
  vazao: number | null | undefined,
  classe: string | null | undefined,
  dPi?: number | null,
  dPf?: number | null
): string {
  if (item.toleranciaDinamicaVazao) {
    return textoVazaoPressaoCertificado(vazao, dPi, dPf);
  }
  if (item.toleranciaDinamicaEficiencia) {
    return textoEficiencia(classe);
  }
  return item.tolerancia;
}

/** @deprecated use toleranciaChecklist */
export function criterioChecklist(
  item: ChecklistItem,
  vazao: number | null | undefined
): string {
  return toleranciaChecklist(item, vazao, null);
}
