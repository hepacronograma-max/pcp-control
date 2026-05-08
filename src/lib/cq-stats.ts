import { subDays } from "date-fns";
import type { CQGravidade, CQRegistro } from "@/lib/types/cq";

export type CQFilterStatus = "" | "open" | "resolved";

export type CQDashboardFilterState = {
  lineId: string;
  category: string;
  gravidade: "" | CQGravidade;
  status: CQFilterStatus;
};

/** Mapa order_item.id → production_line.id */
export type ItemLineMap = Map<string, string>;

export function filterCQRegistros(
  rows: CQRegistro[],
  filters: CQDashboardFilterState,
  itemLineMap: ItemLineMap
): CQRegistro[] {
  return rows.filter((r) => {
    if (filters.status === "open" && r.resolvido_em) return false;
    if (filters.status === "resolved" && !r.resolvido_em) return false;
    if (filters.category && r.categoria !== filters.category) return false;
    if (filters.gravidade && r.gravidade !== filters.gravidade) return false;
    if (filters.lineId) {
      if (r.target_type !== "order_item") return false;
      const line = itemLineMap.get(r.target_id);
      if (line !== filters.lineId) return false;
    }
    return true;
  });
}

export function cqCountsByPeriod(rows: CQRegistro[], ref: Date): {
  last7: number;
  last30: number;
} {
  const ms7 = subDays(ref, 7).getTime();
  const ms30 = subDays(ref, 30).getTime();
  let last7 = 0;
  let last30 = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= ms30) last30 += 1;
    if (t >= ms7) last7 += 1;
  }
  return { last7, last30 };
}

export function cqAggByCategory(
  rows: CQRegistro[]
): { name: string; total: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = r.categoria?.trim() || "—";
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

const GRAV_LABEL: Record<CQGravidade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export function cqAggByGravidade(
  rows: CQRegistro[]
): { name: string; value: number }[] {
  const m = new Map<CQGravidade, number>();
  for (const r of rows) {
    const g = r.gravidade as CQGravidade;
    if (!g) continue;
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return (["baixa", "media", "alta", "critica"] as const)
    .map((g) => ({ name: GRAV_LABEL[g], value: m.get(g) ?? 0 }))
    .filter((x) => x.value > 0);
}

export function cqUniqueCategories(rows: CQRegistro[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.categoria?.trim()) s.add(r.categoria.trim());
  }
  return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function cqUnresolvedRecent(
  rows: CQRegistro[],
  limit = 50
): CQRegistro[] {
  return [...rows]
    .filter((r) => !r.resolvido_em)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, limit);
}

function startOfLocalMonthMs(ref: Date): number {
  const d = new Date(ref.getFullYear(), ref.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfLocalMonthMs(ref: Date): number {
  const d = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
  return d.getTime();
}

/** Ocorrências criadas no mês civil corrente (fuso local). */
export function cqTotalsCurrentMonth(rows: CQRegistro[], ref: Date = new Date()): {
  total: number;
  resolved: number;
  open: number;
} {
  const t0 = startOfLocalMonthMs(ref);
  const t1 = endOfLocalMonthMs(ref);
  let total = 0;
  let resolved = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (Number.isNaN(t) || t < t0 || t > t1) continue;
    total += 1;
    if (r.resolvido_em) resolved += 1;
  }
  return { total, resolved, open: total - resolved };
}

export function cqAveragePerDayInRange(
  rows: CQRegistro[],
  periodDays: number,
  ref: Date = new Date()
): number {
  if (periodDays <= 0) return 0;
  const cutoff = subDays(ref, periodDays).getTime();
  let n = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (!Number.isNaN(t) && t >= cutoff) n += 1;
  }
  return Math.round((n / periodDays) * 100) / 100;
}

/** Série diária (últimos `days` dias, inclusive hoje): chave yyyy-MM-dd → contagem */
export function cqDailySeries(
  rows: CQRegistro[],
  periodDays: number,
  ref: Date = new Date()
): { key: string; label: string; count: number }[] {
  const out: { key: string; label: string; count: number }[] = [];
  for (let i = periodDays - 1; i >= 0; i--) {
    const d = subDays(ref, i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      key,
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      count: 0,
    });
  }
  const idx = new Map(out.map((x, i) => [x.key, i]));
  const start = subDays(ref, periodDays - 1);
  start.setHours(0, 0, 0, 0);
  const endMs = ref.getTime();
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (Number.isNaN(t) || t < start.getTime() || t > endMs) continue;
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const j = idx.get(key);
    if (j !== undefined) out[j].count += 1;
  }
  return out;
}

export function cqTopCategories(rows: CQRegistro[], limit = 5) {
  return cqAggByCategory(rows).slice(0, limit);
}
