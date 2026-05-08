import type { ProductionLine } from "@/lib/types/database";
import { productionLineIsAlmoxarifado } from "@/lib/supabase/sync-almoxarifado-on-program";

/** Menu lateral Produção ↔ Logística quando `sort_order` está padronizado (ver scripts/sql/production-lines-consolidate-almox-sort.sql). */
export const SIDEBAR_PROD_SORT_MIN = 1;
export const SIDEBAR_PROD_SORT_MAX = 4;
export const SIDEBAR_LOG_SORT_MIN = 5;
export const SIDEBAR_LOG_SORT_MAX = 6;

function normLineName(name: string | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Fallback: texto sugere Almox/expedição (não depende apenas de `is_almoxarifado`). */
export function navLineLooksLogisticaFallback(line: ProductionLine): boolean {
  if (productionLineIsAlmoxarifado(line)) return true;
  const n = normLineName(line.name);
  return /\b(almox|almoxarifado|logistica|expedi|expedicao|transporte)\b/.test(
    n
  );
}

/** Banda prioritária: sort_order definido pela migração (1–4 produção, 5–6 logística). */
function navLineSidebarBand(line: ProductionLine): "prod" | "log" | "unset" {
  const so =
    typeof line.sort_order === "number" ? line.sort_order : Number.NaN;
  if (!Number.isFinite(so)) return "unset";
  if (
    so >= SIDEBAR_LOG_SORT_MIN &&
    so <= SIDEBAR_LOG_SORT_MAX
  )
    return "log";
  if (
    so >= SIDEBAR_PROD_SORT_MIN &&
    so <= SIDEBAR_PROD_SORT_MAX
  )
    return "prod";
  return "unset";
}

/** Ordenação dentro do submenu (nome como desempate). */
function cmpLinesForSidebar(a: ProductionLine, b: ProductionLine): number {
  const sa = typeof a.sort_order === "number" ? a.sort_order : 9999;
  const sb = typeof b.sort_order === "number" ? b.sort_order : 9999;
  if (sa !== sb) return sa - sb;
  return (a.name ?? "").localeCompare(b.name ?? "", "pt", {
    sensitivity: "base",
  });
}

/**
 * Sidebar: Produção principalmente pelas faixas `sort_order` 1–4; Logística 5–6.
 * Linhas antigas (`sort_order` 0 ou fora 1–6) usam fallback por nome/`is_almoxarifado`.
 */
export function bucketLinesForSidebar(lines: ProductionLine[]): {
  producao: ProductionLine[];
  logistica: ProductionLine[];
} {
  const producao: ProductionLine[] = [];
  const logistica: ProductionLine[] = [];
  for (const l of lines) {
    const band = navLineSidebarBand(l);
    if (band === "log") {
      logistica.push(l);
    } else if (band === "prod") {
      producao.push(l);
    } else if (navLineLooksLogisticaFallback(l)) {
      logistica.push(l);
    } else {
      producao.push(l);
    }
  }
  producao.sort(cmpLinesForSidebar);
  logistica.sort(cmpLinesForSidebar);
  return { producao, logistica };
}

/** Agrega pulso/badge dos subitens aos grupos Produção | Logística. */
export function rollupSidebarGroupAttention(
  producao: ProductionLine[],
  logistica: ProductionLine[],
  /** Contagem “efetiva” por linha (já mistura API + fallback unprogrammed no shell). */
  signalByLineId: Record<string, number>
): {
  producao: { pulse: boolean; badge: number };
  logistica: { pulse: boolean; badge: number };
} {
  const pulseFor = (id: string) => (signalByLineId[id] ?? 0) > 0;
  const sumLines = (lines: ProductionLine[]) =>
    lines.reduce((s, l) => s + (signalByLineId[l.id] ?? 0), 0);
  return {
    producao: {
      pulse: producao.some((l) => pulseFor(l.id)),
      badge: sumLines(producao),
    },
    logistica: {
      pulse: logistica.some((l) => pulseFor(l.id)),
      badge: sumLines(logistica),
    },
  };
}
