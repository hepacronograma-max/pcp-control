import type { PackagingVolume, ShippingList } from "@/lib/types/database";

export type ShippingStation =
  | "packing"
  | "ready_to_invoice"
  | "invoiced"
  | "collected";

export const SHIPPING_STATIONS: Array<{
  id: Exclude<ShippingStation, "packing">;
  label: string;
}> = [
  { id: "ready_to_invoice", label: "Liberado para faturar" },
  { id: "invoiced", label: "Faturado" },
  { id: "collected", label: "Coletado" },
];

export function shippingStationOf(
  list: Pick<ShippingList, "status" | "finalized_at" | "invoiced_at" | "collected_at"> | null,
  orderFinished: boolean
): ShippingStation {
  if (list?.collected_at) return "collected";
  if (list?.invoiced_at) return "invoiced";
  /** Só o pedido finalizado pelo PCP (não basta a lista de embarque). */
  if (orderFinished) return "ready_to_invoice";
  return "packing";
}

export function shippingStationLabel(station: ShippingStation): string {
  if (station === "ready_to_invoice") return "Liberado para faturar";
  if (station === "invoiced") return "Faturado";
  if (station === "collected") return "Coletado";
  return "Em embalagem";
}

export function scannedVolumeCount(
  volumes: Pick<PackagingVolume, "status">[]
): { scanned: number; total: number; allScanned: boolean } {
  const total = volumes.length;
  const scanned = volumes.filter((v) => v.status === "scanned").length;
  return { scanned, total, allScanned: total > 0 && scanned === total };
}
