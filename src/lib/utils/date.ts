import { format } from "date-fns";

/** Converte string yyyy-MM-dd para Date em horário local (evita bug de fuso) */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
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
