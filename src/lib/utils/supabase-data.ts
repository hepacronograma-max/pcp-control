/**
 * Utilitários para garantir dados otimizados no Supabase:
 * - Tipos corretos (integer, date, boolean)
 * - Sem campos desnecessários
 * - Sem duplicatas
 */

/** Garante string no formato YYYY-MM-DD (date only, sem hora) */
export function toDateOnly(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Garante integer >= 0 */
export function toInt(value: unknown, defaultValue = 0): number {
  const n = Number(value);
  if (Number.isNaN(n)) return defaultValue;
  return Math.max(0, Math.floor(n));
}

/** Garante quantity: integer >= 1 */
export function toQuantity(value: unknown): number {
  return Math.max(1, toInt(value, 1));
}

/** Garante sort_order: integer >= 0 */
export function toSortOrder(value: unknown): number {
  return toInt(value, 0);
}

/** Garante boolean */
export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  return false;
}

/** Trunca string para limite (evita campos gigantes) */
export function truncate(str: string | null | undefined, maxLen: number): string | null {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}
