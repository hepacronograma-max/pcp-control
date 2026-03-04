"use client";

import { format } from "date-fns";
import { parseLocalDate } from "@/lib/utils/date";

interface CompactDateCellProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function CompactDateCell({ value, onChange }: CompactDateCellProps) {
  const label = value ? format(parseLocalDate(value), "d/M/yy") : "--";

  return (
    <div className="relative w-full h-full min-h-[24px] flex-1 min-w-0 rounded-md border border-slate-300 bg-white overflow-hidden">
      <span className="absolute inset-0 flex items-center justify-center text-[11px] pointer-events-none">
        {label}
      </span>
      <input
        type="date"
        className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}
