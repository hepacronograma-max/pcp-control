import type { ItemStatus } from "@/lib/types/database";
import type { GanttDay } from "./gantt-calendar";

export interface GanttBarProps {
  day: GanttDay;
  productionStart: string | null;
  productionEnd: string | null;
  status: ItemStatus;
  isFirst: boolean;
  isLast: boolean;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isInRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  return day >= start && day <= end;
}

export function GanttBar({
  day,
  productionStart,
  productionEnd,
  status,
  isFirst,
  isLast,
}: GanttBarProps) {
  const start = productionStart ? parseLocalDate(productionStart) : null;
  const end = productionEnd ? parseLocalDate(productionEnd) : null;

  if (!isInRange(day.date, start, end)) return null;

  const isCompleted = status === "completed";

  const radiusClass = isFirst && isLast
    ? "rounded-sm"
    : isFirst
    ? "rounded-l-sm"
    : isLast
    ? "rounded-r-sm"
    : "";

  return (
    <div
      className={`h-4 w-full max-h-[16px] ${radiusClass} ${
        isCompleted ? "bg-green-600" : "bg-green-300"
      }`}
    />
  );
}

