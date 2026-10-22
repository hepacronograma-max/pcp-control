import { formatDayMonth, formatShortDate, parseLocalDate } from "@/lib/utils/date";

/**
 * Selo de abastecimento exibido nas telas do PCP (Pedidos e linhas de produção).
 * Mostra o que a logística (tela Abastecimento) programou/marcou:
 * - Abastecido (verde)
 * - Parcial (âmbar)
 * - Abast. dd/mm (cinza) — data programada, ainda não abastecido
 * Sem data e sem status → não mostra nada.
 */
export function SupplyBadge({
  plannedDate,
  status,
  className = "",
}: {
  plannedDate?: string | null;
  status?: "partial" | "full" | null;
  className?: string;
}) {
  const day = plannedDate ? String(plannedDate).slice(0, 10) : "";
  const parsed = day ? parseLocalDate(day) : null;
  const dm = parsed ? formatDayMonth(parsed) : "";
  const full = parsed ? formatShortDate(parsed) : "";

  if (!status && !dm) return null;

  let label: string;
  let tone: string;
  let title: string;
  if (status === "full") {
    label = dm ? `Abastecido ${dm}` : "Abastecido";
    tone = "border-emerald-300 bg-emerald-50 text-emerald-800";
    title = full ? `Abastecido — programado para ${full}` : "Abastecido";
  } else if (status === "partial") {
    label = dm ? `Parcial ${dm}` : "Parcial";
    tone = "border-amber-300 bg-amber-50 text-amber-900";
    title = full
      ? `Abastecido parcialmente — programado para ${full}`
      : "Abastecido parcialmente (faltando peça)";
  } else {
    label = `Abast. ${dm}`;
    tone = "border-slate-300 bg-slate-100 text-slate-700";
    title = `Abastecimento programado para ${full}`;
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-1.5 py-px text-[9px] font-medium leading-tight ${tone} ${className}`}
      title={title}
    >
      {label}
    </span>
  );
}
