import { addDays, format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductionLine } from "@/lib/types/database";
import { PRODUCTION_LINES_ACTIVE_OR } from "@/lib/supabase/production-line-filters";
import { productionLineIsAlmoxarifado } from "@/lib/supabase/sync-almoxarifado-on-program";

/** Janela de datas a partir de hoje (inclusive), por `production_start` (YYYY-MM-DD). */
export type AlmoxPeriod = "all" | "7" | "15" | "30";

function almoxSupplyColumnProbablyMissing(errorMessage: string): boolean {
  return /almox_supplied_at|almox_supplied_by|almox_supplied_auto|schema cache|column|does not exist|Could not find|unknown column/i.test(
    errorMessage
  );
}

/** Linhas da empresa para filtro almox. (fallback se coluna `is_almoxarifado` inexistente). */
export async function fetchProductionLinesWithAlmoxFlag(
  supabase: SupabaseClient,
  companyId: string
): Promise<ProductionLine[]> {
  const res = await supabase
    .from("production_lines")
    .select("id, name, company_id, is_active, sort_order, is_almoxarifado")
    .eq("company_id", companyId)
    .or(PRODUCTION_LINES_ACTIVE_OR)
    .order("sort_order");

  if (
    res.error &&
    /is_almoxarifado|column|does not exist|schema cache/i.test(res.error.message)
  ) {
    const retry = await supabase
      .from("production_lines")
      .select("id, name, company_id, is_active, sort_order")
      .eq("company_id", companyId)
      .or(PRODUCTION_LINES_ACTIVE_OR)
      .order("sort_order");
    if (retry.error) return [];
    return (retry.data ?? []).map((row) => ({
      ...row,
      is_almoxarifado: false as const,
    })) as ProductionLine[];
  }
  return (res.data ?? []) as ProductionLine[];
}

/**
 * Lista itens Almox para **separação física antes do fim da produção**.
 * «Em aberto»: programados, sem abastecimento e **produção ainda não finalizada** (`production_end` nulo).
 * «Finalizados»: abastecidos manualmente com produção **em curso** (histórico de quem confirmou antes do fim do chão).
 * Itens com `production_end` preenchido saem das listagens (fecha na produção marca Almox por API).
 */
export async function fetchAlmoxScheduledOrderItems(
  supabase: SupabaseClient,
  allProductionLines: ProductionLine[],
  opts: {
    tab: string;
    period: AlmoxPeriod;
    /** Limite de linhas (performance). Default: sem limite no caller. */
    limit?: number;
    offset?: number;
  }
): Promise<{
  data: unknown[];
  error: { message: string } | null;
  /** Lista retornada sem filtro almox_supplied_* (banco sem migração). */
  fallbackNoSupplyColumns?: boolean;
}> {
  try {
  const realLineIds = allProductionLines
    .filter((l) => !productionLineIsAlmoxarifado(l))
    .map((l) => l.id);

  if (realLineIds.length === 0) {
    console.warn("[fetch-almox] realLineIds vazio — todas as linhas são Almox?");
    return { data: [], error: null };
  }

  /** Finalizados = abasteceu antes do chão terminar (`almox_supplied_at` definido); em aberto = sem abastecer. */
  const almoxSuppliedDone = opts.tab === "finished";

  const describe = (): string =>
    JSON.stringify({
      tab: opts.tab,
      period: opts.period,
      suppliedDone: almoxSuppliedDone,
      realLineCount: realLineIds.length,
      prodEndNullScope: true,
    });

  const buildQuery = (
    scope: "with_supply_cols" | "legacy_no_supply_cols"
  ) => {
    let q = supabase
      .from("order_items")
      .select(
        `
      *,
      order:orders(id, order_number, client_name, delivery_deadline, pcp_deadline, status)
    `
      )
      .in("line_id", realLineIds)
      .not("production_start", "is", null)
      .is("production_end", null);

    const period = opts.period;
    if (period !== "all") {
      const days = Number(period) as 7 | 15 | 30;
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const maxStr = format(addDays(new Date(), days), "yyyy-MM-dd");
      q = q.gte("production_start", todayStr).lte("production_start", maxStr);
    }

    if (scope === "with_supply_cols") {
      if (almoxSuppliedDone) {
        q = q.not("almox_supplied_at", "is", null);
        q = q.order("almox_supplied_at", { ascending: false });
      } else {
        q = q.is("almox_supplied_at", null);
        q = q.order("production_start", { ascending: true, nullsFirst: false });
        q = q.order("production_end", { ascending: true });
      }
    } else {
      /** Migração ainda não aplicada: comportamento próximo ao antigo (só programa + período). */
      if (almoxSuppliedDone) {
        return null;
      }
      q = q.order("production_start", { ascending: true, nullsFirst: false });
      q = q.order("production_end", { ascending: true });
    }
    return q;
  };

  let qPrimary = buildQuery("with_supply_cols")!;
  if (opts.limit != null && opts.limit > 0) {
    const off = Math.max(0, opts.offset ?? 0);
    qPrimary = qPrimary.range(off, off + opts.limit - 1);
  }
  const { data, error } = await qPrimary;

  if (
    error &&
    almoxSupplyColumnProbablyMissing(error.message) &&
    !almoxSuppliedDone
  ) {
    console.warn(
      "[fetch-almox] erro coluna almox — retry SEM almox_supplied_at:",
      describe(),
      error.message
    );
    const qFallback = buildQuery("legacy_no_supply_cols");
    if (!qFallback) {
      return { data: [], error: null };
    }
    let qFb = qFallback;
    if (opts.limit != null && opts.limit > 0) {
      const off = Math.max(0, opts.offset ?? 0);
      qFb = qFb.range(off, off + opts.limit - 1);
    }
    const res2 = await qFb;
    if (res2.error) {
      console.error("[fetch-almox] fallback falhou:", res2.error.message);
      return { data: [], error: { message: res2.error.message }, fallbackNoSupplyColumns: true };
    }
    console.warn(
      "[fetch-almox] fallback OK, devolvendo",
      (res2.data ?? []).length,
      "itens (execute supabase-add-columns.sql para filtros por abastecimento)"
    );
    return {
      data: res2.data ?? [],
      error: null,
      fallbackNoSupplyColumns: true,
    };
  }

  if (
    error &&
    almoxSupplyColumnProbablyMissing(error.message) &&
    almoxSuppliedDone
  ) {
    console.warn(
      "[fetch-almox] aba Finalizados indisponível sem colunas almox_supplied_*:",
      describe(),
      error.message
    );
    return { data: [], error: null, fallbackNoSupplyColumns: true };
  }

  if (error) {
    console.error("[fetch-almox] query:", describe(), error.message);
    return { data: [], error: { message: error.message } };
  }

  console.log("[fetch-almox] itens=", (data ?? []).length, describe());
  return { data: data ?? [], error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[fetch-almox] exceção:", msg);
    return { data: [], error: { message: msg } };
  }
}

/**
 * Itens «Em aberto» no Almox: programados (`production_start` no período), produção não finalizada,
 * ainda não abastecidos (`almox_supplied_at` nulo).
 */
export async function countAlmoxSupplyPending(
  supabase: SupabaseClient,
  allProductionLines: ProductionLine[],
  opts: { period: AlmoxPeriod }
): Promise<{
  count: number;
  error: { message: string } | null;
  fallbackNoSupplyColumns?: boolean;
}> {
  try {
  const realLineIds = allProductionLines
    .filter((l) => !productionLineIsAlmoxarifado(l))
    .map((l) => l.id);

  if (realLineIds.length === 0) {
    console.warn("[fetch-almox count] realLineIds vazio");
    return { count: 0, error: null };
  }

  let q = supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .in("line_id", realLineIds)
    .not("production_start", "is", null)
    .is("production_end", null)
    .is("almox_supplied_at", null);

  const period = opts.period;
  if (period !== "all") {
    const days = Number(period) as 7 | 15 | 30;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const maxStr = format(addDays(new Date(), days), "yyyy-MM-dd");
    q = q.gte("production_start", todayStr).lte("production_start", maxStr);
  }

  const { count, error } = await q;
  if (error && almoxSupplyColumnProbablyMissing(error.message)) {
    console.warn(
      "[fetch-almox count] coluna ausente — contando sem filtro almox_supplied_at:",
      opts.period,
      error.message
    );
    let q2 = supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("line_id", realLineIds)
      .not("production_start", "is", null)
      .is("production_end", null);
    if (period !== "all") {
      const days = Number(period) as 7 | 15 | 30;
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const maxStr = format(addDays(new Date(), days), "yyyy-MM-dd");
      q2 = q2.gte("production_start", todayStr).lte("production_start", maxStr);
    }
    const res2 = await q2;
    if (res2.error) {
      console.error("[fetch-almox count] fallback erro:", res2.error.message);
      return { count: 0, error: { message: res2.error.message }, fallbackNoSupplyColumns: true };
    }
    const c = res2.count ?? 0;
    console.log("[fetch-almox count] fallback exact count=", c);
    return { count: c, error: null, fallbackNoSupplyColumns: true };
  }

  if (error) {
    console.error("[fetch-almox count] erro:", error.message);
    return { count: 0, error: { message: error.message } };
  }

  console.log("[fetch-almox count] pending=", count ?? 0, "period=", period);
  return { count: count ?? 0, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[fetch-almox count] exceção:", msg);
    return { count: 0, error: { message: msg } };
  }
}
