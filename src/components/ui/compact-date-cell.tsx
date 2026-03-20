"use client";

import { format } from "date-fns";
import { parseLocalDate } from "@/lib/utils/date";
import { toDateOnly } from "@/lib/utils/supabase-data";

interface CompactDateCellProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** data mínima (YYYY-MM-DD), ex.: entrega do PC */
  min?: string | null;
}

export function CompactDateCell({ value, onChange, min }: CompactDateCellProps) {
  const normalized = value ? toDateOnly(value) ?? "" : "";
  const label = normalized ? format(parseLocalDate(normalized), "d/M/yy") : "--";

  return (
    <div className="relative w-full h-full min-h-[28px] flex-1 min-w-0 rounded-md border border-slate-300 bg-white overflow-hidden">
      <span className="absolute inset-0 flex items-center justify-center text-[11px] pointer-events-none">
        {label}
      </span>
      <input
        type="date"
        className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
        value={normalized}
        min={min && String(min).trim() ? String(min).slice(0, 10) : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}
