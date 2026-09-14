export type VolumeItemLine = {
  volume_id: string;
  order_item_id: string;
  piece_quantity: number;
};

export type AllocateMixLine = {
  orderItemId: string;
  pieceQuantity: number;
};

export type GroupableItem = {
  id: string;
  product_code: string | null;
  description: string;
  quantity: number;
  remaining: number;
  item_number: number | null;
};

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function allocatedQtyForItem(
  itemId: string,
  volumes: { id: string; order_item_id: string; piece_quantity: number }[],
  lines: VolumeItemLine[] | null
): number {
  if (lines && lines.length > 0) {
    return lines
      .filter((l) => l.order_item_id === itemId)
      .reduce((sum, l) => sum + l.piece_quantity, 0);
  }
  return volumes
    .filter((v) => v.order_item_id === itemId)
    .reduce((sum, v) => sum + v.piece_quantity, 0);
}

export function qtyOfItemInVolume(
  volumeId: string,
  itemId: string,
  volume: { order_item_id: string; piece_quantity: number },
  lines: VolumeItemLine[] | null
): number {
  if (lines && lines.length > 0) {
    return lines
      .filter((l) => l.volume_id === volumeId && l.order_item_id === itemId)
      .reduce((sum, l) => sum + l.piece_quantity, 0);
  }
  return volume.order_item_id === itemId ? volume.piece_quantity : 0;
}

export function volumeIdsForItem(
  itemId: string,
  volumes: { id: string; order_item_id: string }[],
  lines: VolumeItemLine[] | null
): string[] {
  const ids = new Set<string>();
  if (lines) {
    for (const line of lines) {
      if (line.order_item_id === itemId) ids.add(line.volume_id);
    }
  }
  for (const volume of volumes) {
    if (volume.order_item_id === itemId) ids.add(volume.id);
  }
  return [...ids];
}

export function linesForVolume(
  volumeId: string,
  lines: VolumeItemLine[] | null,
  fallback: { order_item_id: string; piece_quantity: number }
): VolumeItemLine[] {
  const own = (lines ?? []).filter((l) => l.volume_id === volumeId);
  if (own.length > 0) return own;
  return [
    {
      volume_id: volumeId,
      order_item_id: fallback.order_item_id,
      piece_quantity: fallback.piece_quantity,
    },
  ];
}

export function maxEqualVolumeCount(
  mix: { pieceQuantity: number; remaining: number }[]
): number {
  if (mix.length === 0) return 0;
  let max = Number.POSITIVE_INFINITY;
  for (const line of mix) {
    const pieces = Math.floor(line.pieceQuantity);
    const remaining = Math.floor(line.remaining);
    if (!Number.isInteger(pieces) || pieces < 1) return 0;
    if (remaining < pieces) return 0;
    max = Math.min(max, Math.floor(remaining / pieces));
  }
  return Number.isFinite(max) ? max : 0;
}

export function parseAllocateMix(params: {
  hostItemId: string;
  hostPieces: unknown;
  groupedItems: unknown;
}): { ok: true; lines: AllocateMixLine[] } | { ok: false; error: string } {
  const hostPieces = Math.floor(Number(params.hostPieces));
  if (!Number.isInteger(hostPieces) || hostPieces < 1) {
    return {
      ok: false,
      error: "Informe quantas peças deste item cabem na caixa (inteiro ≥ 1).",
    };
  }
  if (!isUuidLike(params.hostItemId)) {
    return { ok: false, error: "orderItemId inválido" };
  }

  const lines: AllocateMixLine[] = [
    { orderItemId: params.hostItemId, pieceQuantity: hostPieces },
  ];
  const seen = new Set<string>([params.hostItemId]);

  const raw = Array.isArray(params.groupedItems) ? params.groupedItems : [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const id =
      typeof rec.orderItemId === "string"
        ? rec.orderItemId
        : typeof rec.order_item_id === "string"
          ? rec.order_item_id
          : "";
    if (!id) continue;
    if (!isUuidLike(id)) {
      return { ok: false, error: "Item agrupado inválido." };
    }
    if (seen.has(id)) {
      return { ok: false, error: "O mesmo item não pode entrar duas vezes na caixa." };
    }
    const qty = Math.floor(Number(rec.pieceQuantity ?? rec.piece_quantity));
    if (!Number.isInteger(qty) || qty < 1) {
      return {
        ok: false,
        error: "Informe as peças de cada item agrupado (inteiro ≥ 1).",
      };
    }
    seen.add(id);
    lines.push({ orderItemId: id, pieceQuantity: qty });
  }

  return { ok: true, lines };
}

export function mixPieceTotal(lines: AllocateMixLine[]): number {
  return lines.reduce((sum, l) => sum + l.pieceQuantity, 0);
}

export function itemQtyFromVolume(
  volume: {
    order_item_id: string;
    piece_quantity: number;
    items?: { order_item_id: string; piece_quantity: number }[];
  },
  itemId: string
): number {
  if (volume.items && volume.items.length > 0) {
    return volume.items
      .filter((line) => line.order_item_id === itemId)
      .reduce((sum, line) => sum + line.piece_quantity, 0);
  }
  return volume.order_item_id === itemId ? volume.piece_quantity : 0;
}

export function isVolumeItemsTableMissing(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("packaging_volume_items") &&
    (m.includes("does not exist") || m.includes("schema cache"))
  );
}
