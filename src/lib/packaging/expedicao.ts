import type { PackagingVolume, ShippingList } from "@/lib/types/database";
import { scannedVolumeCount } from "@/lib/packaging/shipping-stations";

export type ExpedicaoStation = "ready" | "invoiced" | "finished";

export const EXPEDICAO_STATIONS: Array<{ id: ExpedicaoStation; label: string }> = [
  { id: "ready", label: "Material pronto" },
  { id: "invoiced", label: "Nota emitida" },
  { id: "finished", label: "Coletado" },
];

export function expedicaoStationOf(
  list: Pick<ShippingList, "invoiced_at" | "collected_at"> | null
): ExpedicaoStation {
  if (list?.collected_at) return "finished";
  if (list?.invoiced_at) return "invoiced";
  return "ready";
}

export function canFinishLoading(
  list: Pick<ShippingList, "cargo_photo_url" | "collected_at"> | null,
  volumes: Pick<PackagingVolume, "status">[]
): { ok: true } | { ok: false; reason: string } {
  if (list?.collected_at) {
    return { ok: false, reason: "Carregamento já finalizado." };
  }
  const scan = scannedVolumeCount(volumes);
  if (!scan.allScanned) {
    return {
      ok: false,
      reason: `Bipe os volumes restantes (${scan.scanned}/${scan.total}).`,
    };
  }
  if (!list?.cargo_photo_url) {
    return { ok: false, reason: "Tire a foto da carga antes de finalizar." };
  }
  return { ok: true };
}
