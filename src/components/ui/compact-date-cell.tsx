"use client";

import { useRef } from "react";
import { formatShortDate } from "@/lib/utils/date";
import { toDateOnly } from "@/lib/utils/supabase-data";

interface CompactDateCellProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** data mínima (YYYY-MM-DD), ex.: entrega do PC */
  min?: string | null;
  /** desativa edição */
  disabled?: boolean;
}

export function CompactDateCell({
  value,
  onChange,
  min,
  disabled,
}: CompactDateCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = value ? toDateOnly(value) ?? "" : "";
  const label = normalized ? formatShortDate(normalized) : "--";

  function openPicker() {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      el.click();
    }
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Alterar data"
      onClick={(e) => {
        e.stopPropagation();
        openPicker();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
      className={`relative w-full min-h-[30px] min-w-[96px] rounded-md border border-slate-300 bg-white overflow-hidden box-border ${
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-slate-400"
      }`}
    >
      <span className="absolute inset-0 z-0 flex items-center justify-center text-[10px] pointer-events-none tabular-nums select-none">
        {label}
      </span>
      <input
        ref={inputRef}
        type="date"
        disabled={disabled}
        className="absolute inset-0 z-[2] h-full w-full min-w-[96px] cursor-pointer opacity-[0.02] sm:opacity-[0.02]"
        style={{ colorScheme: "light" }}
        value={normalized}
        min={min && String(min).trim() ? String(min).slice(0, 10) : undefined}
        onChange={(e) => onChange(e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
