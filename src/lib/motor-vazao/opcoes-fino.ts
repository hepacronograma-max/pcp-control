/** Opções válidas do motor fino — só combinações existentes em TABELA_FINO. */

import { TABELA_FINO, type MaterialFino } from "./tabelas-referencia";

export function materiaisFinoDisponiveis(): MaterialFino[] {
  return [...new Set(TABELA_FINO.map((l) => l.material))];
}

/** Espessuras válidas dado material e/ou coroa (parcial). */
export function espessurasFinoDisponiveis(
  material?: MaterialFino | "",
  temCoroa?: boolean | null
): number[] {
  const rows = TABELA_FINO.filter((l) => {
    if (material && l.material !== material) return false;
    if (temCoroa === true || temCoroa === false) {
      if (l.coroa !== temCoroa) return false;
    }
    return true;
  });
  return [...new Set(rows.map((l) => l.espessura_mm))].sort((a, b) => a - b);
}

/** Opções de coroa válidas dado material e/ou espessura. */
export function coroasFinoDisponiveis(
  material?: MaterialFino | "",
  espessuraMm?: number | null
): { value: "sim" | "nao"; label: string }[] {
  const rows = TABELA_FINO.filter((l) => {
    if (material && l.material !== material) return false;
    if (espessuraMm != null && Number.isFinite(espessuraMm)) {
      if (l.espessura_mm !== espessuraMm) return false;
    }
    return true;
  });
  const temSim = rows.some((l) => l.coroa);
  const temNao = rows.some((l) => !l.coroa);
  const out: { value: "sim" | "nao"; label: string }[] = [];
  if (temSim) out.push({ value: "sim", label: "Com coroa (FPP)" });
  if (temNao) out.push({ value: "nao", label: "Sem coroa (IRP)" });
  return out;
}

export function espessurasPlanoDisponiveis(): number[] {
  return [50, 80, 100];
}
