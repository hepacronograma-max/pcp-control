import type { ParsedPolLine } from "@/lib/pdf/parse-purchase-order-pdf";

const MARKER = "[[PC_LINES_JSON]]";

/**
 * Anexa JSON das linhas quando a tabela `purchase_order_lines` ainda não existe no Supabase
 * (o ecrã consegue mostrar itens; após o SQL, reimportar gera linhas reais e vínculos).
 */
export function appendLineFallbackToNotes(
  headNotes: string,
  lines: ParsedPolLine[]
): string {
  if (lines.length === 0) return headNotes;
  const payload = JSON.stringify({ v: 1 as const, lines });
  return `${headNotes.trim()}\n\n${MARKER}\n${payload}`;
}

export type FallbackPolLine = ParsedPolLine & {
  id: string;
  is_fallback: true;
};

/**
 * Lê o bloco JSON do campo `notes` (GET) para mostrar itens sem tabela.
 */
export function parsePcLineFallbackFromNotes(
  notes: string | null | undefined
): FallbackPolLine[] {
  if (!notes?.includes(MARKER)) return [];
  const rest = notes.split(MARKER)[1];
  if (!rest) return [];
  const jsonPart = rest.trim();
  try {
    const o = JSON.parse(jsonPart) as { v?: number; lines?: ParsedPolLine[] };
    if (!o.lines || !Array.isArray(o.lines)) return [];
    return o.lines.map((l, i) => ({
      ...l,
      id: `fb-${l.line_number}-${i}`,
      is_fallback: true as const,
    }));
  } catch {
    return [];
  }
}

/** Notas sem o bloco JSON (evita poluir o ecrã). */
export function stripLineFallbackForDisplay(notes: string | null | undefined): string {
  if (!notes?.includes(MARKER)) return notes?.trim() ?? "";
  return notes.split(MARKER)[0].trim();
}
