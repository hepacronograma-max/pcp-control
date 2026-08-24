import { addDays, eachDayOfInterval, format, isSameDay, isWeekend } from "date-fns";
import { toDateOnly } from "@/lib/utils/supabase-data";

/** Converte string yyyy-MM-dd para Date em horário local (evita bug de fuso) */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Soma dias corridos a uma data `yyyy-MM-dd` e devolve o mesmo formato. */
export function addLocalCalendarDays(yyyyMmDd: string, dayCount: number): string {
  const d = addDays(parseLocalDate(yyyyMmDd), dayCount);
  return format(d, "yyyy-MM-dd");
}

/** Data de hoje no fuso local, formato YYYY-MM-DD. */
export function todayLocalYyyyMmDd(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export type DeadlineDayStatus = "past" | "today" | "future" | "invalid";

/** Compara prazo com o dia de hoje (calendário local, sem hora/fuso). */
export function deadlineDayStatus(
  dateStr: string | null | undefined
): DeadlineDayStatus {
  const ymd = toDateOnly(dateStr ?? null);
  if (!ymd) return "invalid";
  const today = todayLocalYyyyMmDd();
  if (ymd < today) return "past";
  if (ymd === today) return "today";
  return "future";
}

/** Verifica se a data de fim já passou (hoje não conta como atrasado) */
export function isPastDeadline(dateStr: string | null | undefined): boolean {
  return deadlineDayStatus(dateStr) === "past";
}

/** Prazo cai no dia de hoje (horário local; hoje não é “atrasado”). */
export function isTodayDeadline(dateStr: string | null | undefined): boolean {
  return deadlineDayStatus(dateStr) === "today";
}

/**
 * Classes Tailwind para destacar prazo vencido (aberto).
 * Use em células de data em todo o sistema.
 */
export function pastDeadlineTextClass(
  dateStr: string | null | undefined,
  opts?: { open?: boolean }
): string {
  const open = opts?.open !== false;
  if (!open || !isPastDeadline(dateStr)) return "";
  return "text-red-700 font-semibold";
}

/** Mensagem padrão pedindo reprogramação de prazo vencido. */
export const REPROGRAM_OVERDUE_HINT =
  "Atrasado em relação a hoje — reprogramar o prazo.";

export function overdueRescheduleMessage(
  labels: string[]
): string {
  if (labels.length === 0) return REPROGRAM_OVERDUE_HINT;
  if (labels.length === 1) {
    return `${labels[0]} vencido em relação a hoje — reprogramar.`;
  }
  return `Prazos vencidos (${labels.join(", ")}) — reprogramar.`;
}

/**
 * Padrão brasileiro de exibição no app: **d/M/yy** (ex.: 27/4/26), sem zero à esquerda em dia/mês.
 * Use em toda tela, export, PDF, etc. — evite `toLocaleDateString` solto.
 */
export const BRAZIL_DATE_DISPLAY_FORMAT = "d/M/yy" as const;
/** Data curta sem ano (linha de produção): `21/7`. */
export const BRAZIL_DAY_MONTH_FORMAT = "d/M" as const;

/**
 * Data curta (BR): aceita `yyyy-MM-dd`, ISO com hora, ou `Date`.
 * Valores vazios → `--`.
 */
export function formatShortDate(
  value: string | Date | null | undefined
): string {
  if (value === null || value === undefined || value === "") return "--";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "--" : format(value, BRAZIL_DATE_DISPLAY_FORMAT);
  }
  try {
    if (value.includes("-")) {
      const ymd =
        value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value)
          ? value.slice(0, 10)
          : value;
      const partStr = ymd.split("T")[0] ?? ymd;
      const parts = partStr.split("-").map(Number);
      if (parts.length >= 3 && !parts.slice(0, 3).some((n) => Number.isNaN(n))) {
        return format(
          new Date(parts[0], parts[1] - 1, parts[2]),
          BRAZIL_DATE_DISPLAY_FORMAT
        );
      }
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : format(d, BRAZIL_DATE_DISPLAY_FORMAT);
  } catch {
    return typeof value === "string" ? value : "--";
  }
}

/** Dia/mês sem ano (`21/7`). Tooltip pode usar `formatShortDate` com o ano. */
export function formatDayMonth(
  value: string | Date | null | undefined
): string {
  if (value === null || value === undefined || value === "") return "--";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? "--"
      : format(value, BRAZIL_DAY_MONTH_FORMAT);
  }
  try {
    if (value.includes("-")) {
      const ymd =
        value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value)
          ? value.slice(0, 10)
          : value;
      const partStr = ymd.split("T")[0] ?? ymd;
      const parts = partStr.split("-").map(Number);
      if (parts.length >= 3 && !parts.slice(0, 3).some((n) => Number.isNaN(n))) {
        return format(
          new Date(parts[0], parts[1] - 1, parts[2]),
          BRAZIL_DAY_MONTH_FORMAT
        );
      }
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : format(d, BRAZIL_DAY_MONTH_FORMAT);
  } catch {
    return typeof value === "string" ? value : "--";
  }
}

/** Data e hora no padrão BR: `27/4/26 14:35` (24h). */
export function formatBrazilianDateTime(
  value: string | Date | null | undefined
): string {
  if (value === null || value === undefined) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${format(d, BRAZIL_DATE_DISPLAY_FORMAT)} ${format(d, "HH:mm")}`;
}

/** Feriado da empresa: data `yyyy-MM-dd` e, se recorrente, aplica a cada ano (mês/dia). */
export type CompanyHolidayForBusiness = {
  date: string;
  is_recurring: boolean;
};

function isCompanyHolidayDate(
  d: Date,
  holidays: CompanyHolidayForBusiness[]
): boolean {
  return holidays.some((h) => {
    const ymd = h.date.length >= 10 ? h.date.slice(0, 10) : h.date;
    if (h.is_recurring) {
      const ref = parseLocalDate(ymd);
      return d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
    }
    return isSameDay(parseLocalDate(ymd), d);
  });
}

function isBusinessDay(
  d: Date,
  holidays: CompanyHolidayForBusiness[]
): boolean {
  if (isWeekend(d)) return false;
  return !isCompanyHolidayDate(d, holidays);
}

/**
 * Conta dias úteis (seg–sex, excl. feriados) no intervalo [startYmd, endYmd] (inclusivo, calendário local).
 * Se end &lt; start, devolve 0.
 */
export function countBusinessDaysInclusive(
  startYmd: string,
  endYmd: string,
  holidays: CompanyHolidayForBusiness[]
): number {
  const start = parseLocalDate(startYmd);
  const end = parseLocalDate(endYmd);
  if (end < start) return 0;
  return eachDayOfInterval({ start, end }).filter((d) =>
    isBusinessDay(d, holidays)
  ).length;
}

/**
 * Ajuste de exibição: o cálculo é sempre “data base + 2 corridos”, logo a margem
 * mínima em dias úteis não deve ser apresentada como 1.
 */
export function normalizePrazoSugeridoDiasUteisDisplay(n: number): number {
  if (n === 1) return 2;
  return n;
}

export function formatPrazoSugeridoDiasUteis(n: number): string {
  if (n === 1) return "1 dia útil";
  return `${n} dias úteis`;
}
