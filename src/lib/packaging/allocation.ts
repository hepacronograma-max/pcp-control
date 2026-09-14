export type AllocationVolume = {
  piece_quantity: number;
  weight_kg: number | null;
};

export type AllocationSuggestion = {
  volumeCount: number;
  piecesPerVolume: number;
  piecesCovered: number;
  leftover: number;
};

export function remainingPieces(
  totalPieces: number,
  volumes: Pick<AllocationVolume, "piece_quantity">[]
): number {
  const allocated = volumes.reduce((sum, v) => sum + v.piece_quantity, 0);
  return Math.max(0, Math.floor(totalPieces) - allocated);
}

export function suggestAllocation(params: {
  remaining: number;
  piecesPerBox: number;
  repeatCount?: number;
}): AllocationSuggestion | { error: string } {
  const remaining = Math.floor(params.remaining);
  const piecesPerBox = Math.floor(params.piecesPerBox);

  if (remaining <= 0) {
    return { error: "Não há saldo pendente de peças para alocar." };
  }
  if (!Number.isInteger(piecesPerBox) || piecesPerBox < 1) {
    return { error: "Informe quantas peças cabem na caixa (inteiro ≥ 1)." };
  }
  if (piecesPerBox > remaining) {
    return {
      error: `O saldo do item é de ${remaining} peça(s). Informe um padrão que caiba nesse saldo (ex.: ${remaining}).`,
    };
  }

  const maxVolumes = Math.floor(remaining / piecesPerBox);
  if (maxVolumes < 1) {
    return { error: "Não foi possível gerar volumes com esse padrão." };
  }

  let volumeCount = maxVolumes;
  if (params.repeatCount != null && Number.isFinite(Number(params.repeatCount))) {
    const n = Math.floor(Number(params.repeatCount));
    if (!Number.isInteger(n) || n < 1) {
      return { error: "Informe quantos volumes iguais gerar (inteiro ≥ 1)." };
    }
    volumeCount = Math.min(n, maxVolumes);
  }

  const piecesCovered = volumeCount * piecesPerBox;
  return {
    volumeCount,
    piecesPerVolume: piecesPerBox,
    piecesCovered,
    leftover: remaining - piecesCovered,
  };
}

export function printReadiness(
  totalPieces: number,
  volumes: AllocationVolume[]
): { ok: true } | { ok: false; reason: string } {
  if (volumes.length === 0) {
    return { ok: false, reason: "Gere os volumes da embalagem antes de imprimir." };
  }
  const remaining = remainingPieces(totalPieces, volumes);
  if (remaining > 0) {
    return {
      ok: false,
      reason: `Ainda faltam alocar ${remaining} peça(s). A impressão só libera com 100% alocado.`,
    };
  }
  const missingWeight = volumes.filter(
    (v) => v.weight_kg == null || !(v.weight_kg > 0)
  ).length;
  if (missingWeight > 0) {
    return {
      ok: false,
      reason: `Informe o peso (kg) de ${missingWeight} volume(s) antes de imprimir.`,
    };
  }
  return { ok: true };
}

export function canChangePieceQuantity(params: {
  currentQuantity: number;
  nextQuantity: number;
  remaining: number;
}): { ok: true } | { ok: false; error: string } {
  const next = Math.floor(params.nextQuantity);
  if (!Number.isInteger(next) || next < 1) {
    return { ok: false, error: "Quantidade de peças deve ser um inteiro ≥ 1." };
  }
  const max = params.currentQuantity + params.remaining;
  if (next > max) {
    return {
      ok: false,
      error: `Máximo de ${max} peça(s) neste volume (saldo do item).`,
    };
  }
  return { ok: true };
}

export function sequenceLabel(sequence: number): string {
  return `Volume ${sequence}`;
}

export function parsePositiveWeightKg(
  value: unknown
): { ok: true; kg: number } | { ok: false; error: string } {
  if (value === "" || value === null || value === undefined) {
    return { ok: false, error: "Peso por volume é obrigatório." };
  }
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    return {
      ok: false,
      error: "Peso por volume deve ser um número maior que zero.",
    };
  }
  return { ok: true, kg: Math.round(n * 1000) / 1000 };
}
