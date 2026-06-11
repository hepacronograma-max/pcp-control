import type { OrderItem } from "@/lib/types/database";
import {
  itemHasOmieSyncAlert,
  omieSyncAlertDetail,
  omieSyncAlertShortLabel,
} from "@/lib/utils/omie-sync-alerts";

type OmieSyncItemAlertProps = {
  item: Pick<OrderItem, "omie_sync_flag" | "omie_sync_detail">;
  compact?: boolean;
};

export function OmieSyncItemAlert({
  item,
  compact = false,
}: OmieSyncItemAlertProps) {
  if (!itemHasOmieSyncAlert(item)) return null;

  const label = omieSyncAlertShortLabel(item.omie_sync_flag);
  const detail = omieSyncAlertDetail(item);
  const isRemoval = item.omie_sync_flag === "removido_no_omie";

  return (
    <span
      className={`inline-flex max-w-full items-start gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold leading-tight ${
        isRemoval
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-amber-400 bg-amber-50 text-amber-950"
      } ${compact ? "truncate" : "whitespace-normal break-words"}`}
      title={detail}
    >
      <span className="shrink-0">Omie:</span>
      <span className="min-w-0">{compact ? label : detail}</span>
    </span>
  );
}
