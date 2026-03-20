/**
 * Item alocado em linha ainda precisa de programação no Gantt (datas de produção).
 * Mantém o sinalizador na sidebar até início e fim estarem definidos.
 */
export function itemNeedsProductionProgram(item: {
  line_id: string | null;
  status: string;
  production_start: string | null;
  production_end?: string | null;
}): boolean {
  if (!item.line_id) return false;
  if (item.status === "completed") return false;
  const startOk =
    item.production_start != null &&
    String(item.production_start).trim() !== "";
  const endOk =
    item.production_end != null && String(item.production_end).trim() !== "";
  return !startOk || !endOk;
}
