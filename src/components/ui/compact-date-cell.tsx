"use client";

import { useRef } from "react";
import {
  formatDayMonth,
  formatShortDate,
  isPastDeadline,
  REPROGRAM_OVERDUE_HINT,
} from "@/lib/utils/date";
import { toDateOnly } from "@/lib/utils/supabase-data";

interface CompactDateCellProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** data mínima (YYYY-MM-DD), ex.: entrega do PC */
  min?: string | null;
  /** desativa edição */
  disabled?: boolean;
  /** Exibe só dia/mês (`21/7`) — coluna mais estreita na linha de produção */
  dayMonthOnly?: boolean;
  /**
   * Se true e a data for anterior a hoje, destaca em vermelho
   * (item/pedido ainda em aberto).
   */
  warnIfPast?: boolean;
}

export function CompactDateCell({
  value,
  onChange,
  min,
  disabled,
  dayMonthOnly = false,
  warnIfPast = false,
}: CompactDateCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = value ? toDateOnly(value) ?? "" : "";
  const past = warnIfPast && !!normalized && isPastDeadline(normalized);
  const label = normalized
    ? dayMonthOnly
      ? formatDayMonth(normalized)
      : formatShortDate(normalized)
    : "--";
  const fullLabel = normalized
    ? past
      ? `${formatShortDate(normalized)} — ${REPROGRAM_OVERDUE_HINT}`
      : formatShortDate(normalized)
    : undefined;

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
      aria-label={past ? "Data atrasada — alterar / reprogramar" : "Alterar data"}
      title={fullLabel}
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
      className={`relative w-full rounded-md border bg-white overflow-hidden box-border ${
        dayMonthOnly
          ? "min-h-[24px] min-w-0"
          : "min-h-[30px] min-w-[96px]"
      } ${
        past
          ? "border-red-400 bg-red-50"
          : "border-slate-300"
      } ${
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-slate-400"
      }`}
    >
      <span
        className={`absolute inset-0 z-0 flex items-center justify-center text-[10px] pointer-events-none tabular-nums select-none ${
          past ? "text-red-700 font-semibold" : ""
        }`}
      >
        {label}
      </span>
      <input
        ref={inputRef}
        type="date"
        disabled={disabled}
        className={`absolute inset-0 z-[2] h-full w-full cursor-pointer opacity-[0.02] sm:opacity-[0.02] ${
          dayMonthOnly ? "min-w-0" : "min-w-[96px]"
        }`}
        style={{ colorScheme: "light" }}
        value={normalized}
        min={min && String(min).trim() ? String(min).slice(0, 10) : undefined}
        onChange={(e) => onChange(e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
