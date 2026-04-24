import { addDays, eachDayOfInterval, format, isSameDay, isWeekend } from "date-fns";

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

/** Verifica se a data de fim já passou (hoje não conta como atrasado) */
export function isPastDeadline(dateStr: string | null): boolean {
  if (!dateStr) return false;
  try {
    const end = dateStr.includes("-")
      ? parseLocalDate(dateStr)
      : new Date(dateStr);
    if (isNaN(end.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return today > end;
  } catch {
    return false;
  }
}

/** Formata data no padrão d/M/yy (ex: 5/3/26). Aceita yyyy-MM-dd ou ISO. */
export function formatShortDate(value: string | null): string {
  if (!value) return "--";
  try {
    if (value.includes("-")) {
      const parts = value.split("-").map(Number);
      if (parts.length >= 3 && !parts.some(isNaN)) {
        return format(new Date(parts[0], parts[1] - 1, parts[2]), "d/M/yy");
      }
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : format(d, "d/M/yy");
  } catch {
    return value;
  }
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
