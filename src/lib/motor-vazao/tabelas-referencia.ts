/** Tabelas de referência — catálogo Linter (valores exatos). */

export type LinhaCunha = {
  base: number;
  altura: number;
  cunhas: number;
  area_m2: number;
  vazao: number;
  dPi: number;
  dPf: number;
};

/** Cunha H13/H14, profundidade típica 292 mm. */
export const TABELA_CUNHA: readonly LinhaCunha[] = [
  { base: 610, altura: 610, cunhas: 2, area_m2: 11, vazao: 1500, dPi: 250, dPf: 600 },
  { base: 305, altura: 610, cunhas: 3, area_m2: 16.5, vazao: 1700, dPi: 250, dPf: 600 },
  { base: 610, altura: 610, cunhas: 3, area_m2: 16.5, vazao: 2200, dPi: 250, dPf: 600 },
  { base: 610, altura: 610, cunhas: 4, area_m2: 22, vazao: 2800, dPi: 250, dPf: 600 },
  { base: 610, altura: 610, cunhas: 5, area_m2: 27.5, vazao: 3000, dPi: 250, dPf: 600 },
  { base: 610, altura: 610, cunhas: 6, area_m2: 33, vazao: 3400, dPi: 250, dPf: 600 },
] as const;

export type MaterialFino = "celulosico" | "fibra_vidro";

export type LinhaFino = {
  material: MaterialFino;
  espessura_mm: number;
  coroa: boolean;
  vazao_ref: number;
  dPi: number;
  dim_ref_lado: number;
  dPf: number;
};

/** Fino FPP/IRP — dPf fixo 450. */
export const TABELA_FINO: readonly LinhaFino[] = [
  { material: "celulosico", espessura_mm: 45, coroa: false, vazao_ref: 2000, dPi: 150, dim_ref_lado: 595, dPf: 450 },
  { material: "celulosico", espessura_mm: 60, coroa: false, vazao_ref: 3000, dPi: 120, dim_ref_lado: 595, dPf: 450 },
  { material: "celulosico", espessura_mm: 60, coroa: true, vazao_ref: 2500, dPi: 190, dim_ref_lado: 592, dPf: 450 },
  { material: "fibra_vidro", espessura_mm: 45, coroa: false, vazao_ref: 2500, dPi: 130, dim_ref_lado: 595, dPf: 450 },
  { material: "fibra_vidro", espessura_mm: 60, coroa: false, vazao_ref: 3000, dPi: 150, dim_ref_lado: 595, dPf: 450 },
  { material: "fibra_vidro", espessura_mm: 80, coroa: true, vazao_ref: 3000, dPi: 150, dim_ref_lado: 592, dPf: 450 },
  { material: "fibra_vidro", espessura_mm: 100, coroa: true, vazao_ref: 3400, dPi: 170, dim_ref_lado: 592, dPf: 450 },
] as const;

export type ClasseBolsa = "F7" | "F8" | "F9";

export type LinhaBolsa = {
  classe: ClasseBolsa;
  base: number;
  altura: number;
  bolsas: number;
  area_m2: number;
  vazao: number;
  dPi: number;
  dPf: number;
};

/** Multibolsa MB. */
export const TABELA_BOLSA: readonly LinhaBolsa[] = [
  { classe: "F7", base: 592, altura: 592, bolsas: 8, area_m2: 6.0, vazao: 3400, dPi: 73, dPf: 450 },
  { classe: "F7", base: 592, altura: 592, bolsas: 7, area_m2: 5.25, vazao: 3000, dPi: 73, dPf: 450 },
  { classe: "F7", base: 288, altura: 592, bolsas: 4, area_m2: 3.0, vazao: 1700, dPi: 73, dPf: 450 },
  { classe: "F8", base: 592, altura: 592, bolsas: 8, area_m2: 6.0, vazao: 3400, dPi: 81, dPf: 450 },
  { classe: "F8", base: 592, altura: 592, bolsas: 7, area_m2: 5.25, vazao: 3000, dPi: 81, dPf: 450 },
  { classe: "F8", base: 288, altura: 592, bolsas: 4, area_m2: 3.0, vazao: 1700, dPi: 81, dPf: 450 },
  { classe: "F9", base: 592, altura: 592, bolsas: 8, area_m2: 6.0, vazao: 3400, dPi: 90, dPf: 450 },
  { classe: "F9", base: 592, altura: 592, bolsas: 7, area_m2: 5.25, vazao: 3000, dPi: 90, dPf: 450 },
  { classe: "F9", base: 288, altura: 592, bolsas: 4, area_m2: 3.0, vazao: 1700, dPi: 90, dPf: 450 },
] as const;
