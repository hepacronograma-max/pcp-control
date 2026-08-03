/** Motores de vazão/pressão — funções puras. */

import {
  TABELA_BOLSA,
  TABELA_CUNHA,
  TABELA_FINO,
  type ClasseBolsa,
  type LinhaBolsa,
  type LinhaCunha,
  type LinhaFino,
  type MaterialFino,
} from "./tabelas-referencia";

export type ResultadoMotor = {
  vazao: number;
  dPi: number;
  dPf: number;
  memoria: string[];
};

function roundVazao(n: number): number {
  return Math.round(n);
}

/** Menor |a-b|; empate → primeira encontrada. */
export function escolherMaisProxima<T>(
  itens: readonly T[],
  valor: number,
  chave: (item: T) => number
): T {
  if (itens.length === 0) {
    throw new Error("escolherMaisProxima: lista vazia");
  }
  let best = itens[0];
  let bestDiff = Math.abs(chave(best) - valor);
  for (let i = 1; i < itens.length; i++) {
    const diff = Math.abs(chave(itens[i]) - valor);
    if (diff < bestDiff) {
      best = itens[i];
      bestDiff = diff;
    }
  }
  return best;
}

/** Motor PLANO (H13/H14). Validação: 610×610 papel 50 → ~1072 m³/h. */
export function motorPlano(params: {
  largura_mm: number;
  altura_mm: number;
  espessura_papel_mm: number;
}): ResultadoMotor {
  const { largura_mm, altura_mm, espessura_papel_mm } = params;
  let velocidade = 0.8 * (espessura_papel_mm / 50);
  const memoria: string[] = [
    `velocidade = 0.8 × (${espessura_papel_mm}/50) = ${velocidade.toFixed(4)} m/s`,
  ];
  if (espessura_papel_mm > 50) {
    velocidade *= 0.9;
    memoria.push(`espessura > 50 → velocidade × 0.90 = ${velocidade.toFixed(4)} m/s`);
  }
  const area_frontal_m2 = (largura_mm / 1000) * (altura_mm / 1000);
  memoria.push(
    `área frontal = (${largura_mm}/1000)×(${altura_mm}/1000) = ${area_frontal_m2.toFixed(6)} m²`
  );
  const vazaoBruta = velocidade * area_frontal_m2 * 3600;
  const vazao = roundVazao(vazaoBruta);
  memoria.push(
    `vazão = ${velocidade.toFixed(4)} × ${area_frontal_m2.toFixed(6)} × 3600 = ${vazaoBruta.toFixed(2)} → ${vazao} m³/h`
  );
  memoria.push(`ΔPi = 250 Pa · ΔPf = 600 Pa (padrão absoluto plano)`);
  return { vazao, dPi: 250, dPf: 600, memoria };
}

/** Motor CUNHA (H13/H14 / FFW). Validação: 3 cunhas 450×450 → ~1548 m³/h. */
export function motorCunha(params: {
  base_mm: number;
  altura_mm: number;
  num_cunhas: number;
}): ResultadoMotor {
  const { base_mm, altura_mm, num_cunhas } = params;
  const abertura = base_mm / num_cunhas;
  const ref = escolherMaisProxima(TABELA_CUNHA, abertura, (r) => r.base / r.cunhas);
  const aberturaRef = ref.base / ref.cunhas;
  const memoria: string[] = [
    `abertura = ${base_mm}/${num_cunhas} = ${abertura.toFixed(3)} mm`,
    `ref catálogo: base=${ref.base} altura=${ref.altura} cunhas=${ref.cunhas} abertura_ref=${aberturaRef.toFixed(3)} mm área=${ref.area_m2} m² vazão=${ref.vazao}`,
  ];
  const area_1_placa = ref.area_m2 / (ref.cunhas * 2);
  const area_altura_ref = num_cunhas * 2 * area_1_placa;
  const area_efetiva = area_altura_ref * (altura_mm / ref.altura);
  memoria.push(`área 1 placa = ${ref.area_m2}/(${ref.cunhas}×2) = ${area_1_placa.toFixed(4)} m²`);
  memoria.push(
    `área altura ref = (${num_cunhas}×2)×${area_1_placa.toFixed(4)} = ${area_altura_ref.toFixed(4)} m²`
  );
  memoria.push(
    `área efetiva = ${area_altura_ref.toFixed(4)} × (${altura_mm}/${ref.altura}) = ${area_efetiva.toFixed(4)} m²`
  );
  const vazaoBruta = area_efetiva * (ref.vazao / ref.area_m2);
  const vazao = roundVazao(vazaoBruta);
  memoria.push(
    `vazão = ${area_efetiva.toFixed(4)} × (${ref.vazao}/${ref.area_m2}) = ${vazaoBruta.toFixed(2)} → ${vazao} m³/h`
  );
  memoria.push(`ΔPi = ${ref.dPi} Pa · ΔPf = ${ref.dPf} Pa`);
  return { vazao, dPi: ref.dPi, dPf: ref.dPf, memoria };
}

export function encontrarLinhaFino(
  material: MaterialFino,
  espessura_mm: number,
  tem_coroa: boolean
): LinhaFino | null {
  return (
    TABELA_FINO.find(
      (r) =>
        r.material === material &&
        r.espessura_mm === espessura_mm &&
        r.coroa === tem_coroa
    ) ?? null
  );
}

/** Motor FINO (FPP/IRP). */
export function motorFino(params: {
  largura_mm: number;
  altura_mm: number;
  material: MaterialFino;
  espessura_papel_mm: number;
  tem_coroa: boolean;
}): ResultadoMotor {
  const { largura_mm, altura_mm, material, espessura_papel_mm, tem_coroa } = params;
  const ref = encontrarLinhaFino(material, espessura_papel_mm, tem_coroa);
  if (!ref) {
    throw new Error(
      `Sem linha na tabela fino para material=${material} espessura=${espessura_papel_mm} coroa=${tem_coroa}`
    );
  }
  const desconto = tem_coroa ? 40 : 0;
  const area_efetiva_ref = Math.pow((ref.dim_ref_lado - desconto) / 1000, 2);
  const area_efetiva_real =
    ((largura_mm - desconto) / 1000) * ((altura_mm - desconto) / 1000);
  const memoria: string[] = [
    `ref: ${material} ${espessura_papel_mm} mm coroa=${tem_coroa} vazão_ref=${ref.vazao_ref} dim_ref=${ref.dim_ref_lado} ΔPi=${ref.dPi}`,
    `desconto coroa = ${desconto} mm`,
    `área efetiva ref = ((${ref.dim_ref_lado}-${desconto})/1000)² = ${area_efetiva_ref.toFixed(6)} m²`,
    `área efetiva real = ((${largura_mm}-${desconto})/1000)×((${altura_mm}-${desconto})/1000) = ${area_efetiva_real.toFixed(6)} m²`,
  ];
  const vazaoBruta = ref.vazao_ref * (area_efetiva_real / area_efetiva_ref);
  const vazao = roundVazao(vazaoBruta);
  memoria.push(
    `vazão = ${ref.vazao_ref} × (${area_efetiva_real.toFixed(6)}/${area_efetiva_ref.toFixed(6)}) = ${vazaoBruta.toFixed(2)} → ${vazao} m³/h`
  );
  memoria.push(`ΔPi = ${ref.dPi} Pa · ΔPf = ${ref.dPf} Pa`);
  return { vazao, dPi: ref.dPi, dPf: ref.dPf, memoria };
}

function isClasseBolsa(c: string): c is ClasseBolsa {
  return c === "F7" || c === "F8" || c === "F9";
}

/** Motor BOLSA (MB). */
export function motorBolsa(params: {
  base_mm: number;
  altura_mm: number;
  num_bolsas: number;
  classe: string;
}): ResultadoMotor {
  const { base_mm, altura_mm, num_bolsas, classe } = params;
  if (!isClasseBolsa(classe)) {
    throw new Error(`Classe bolsa inválida: ${classe} (use F7, F8 ou F9)`);
  }
  const daClasse = TABELA_BOLSA.filter((r) => r.classe === classe);
  if (daClasse.length === 0) {
    throw new Error(`Sem linhas na tabela bolsa para classe ${classe}`);
  }
  const abertura = base_mm / num_bolsas;
  const ref = escolherMaisProxima(daClasse, abertura, (r) => r.base / r.bolsas);
  const aberturaRef = ref.base / ref.bolsas;
  const memoria: string[] = [
    `classe ${classe} · abertura = ${base_mm}/${num_bolsas} = ${abertura.toFixed(3)} mm`,
    `ref: base=${ref.base} altura=${ref.altura} bolsas=${ref.bolsas} abertura_ref=${aberturaRef.toFixed(3)} área=${ref.area_m2} vazão=${ref.vazao}`,
  ];
  const area_1_bolsa = ref.area_m2 / ref.bolsas;
  const area_altura_ref = num_bolsas * area_1_bolsa;
  const area_efetiva = area_altura_ref * (altura_mm / ref.altura);
  memoria.push(`área 1 bolsa = ${ref.area_m2}/${ref.bolsas} = ${area_1_bolsa.toFixed(4)} m²`);
  memoria.push(
    `área altura ref = ${num_bolsas}×${area_1_bolsa.toFixed(4)} = ${area_altura_ref.toFixed(4)} m²`
  );
  memoria.push(
    `área efetiva = ${area_altura_ref.toFixed(4)} × (${altura_mm}/${ref.altura}) = ${area_efetiva.toFixed(4)} m²`
  );
  const vazaoBruta = area_efetiva * (ref.vazao / ref.area_m2);
  const vazao = roundVazao(vazaoBruta);
  memoria.push(
    `vazão = ${area_efetiva.toFixed(4)} × (${ref.vazao}/${ref.area_m2}) = ${vazaoBruta.toFixed(2)} → ${vazao} m³/h`
  );
  memoria.push(`ΔPi = ${ref.dPi} Pa · ΔPf = ${ref.dPf} Pa`);
  return { vazao, dPi: ref.dPi, dPf: ref.dPf, memoria };
}

export type { LinhaBolsa, LinhaCunha, LinhaFino };
