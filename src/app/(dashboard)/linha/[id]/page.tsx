'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import type {
  Holiday,
  OrderItem,
  OrderWithItems,
  ProductionLine,
} from "@/lib/types/database";
import { toDateOnly } from "@/lib/utils/supabase-data";
import {
  LineTable,
  sortLineItemsByKeys,
  type LineSortKey,
} from "@/components/linha/line-table";
import {
  GanttCalendar,
  type LineItemWithOrder,
} from "@/components/linha/gantt-calendar";

type TabKey = "all" | "in_progress" | "finished";

export default function LinePage() {
  const params = useParams<{ id: string }>();
  const lineId = params.id;
  const supabase = createClient();
  const { profile, loading } = useUser();
  const effectiveCompanyId = useEffectiveCompanyId(profile);
  const router = useRouter();

  const [line, setLine] = useState<ProductionLine | null>(null);
  const [items, setItems] = useState<LineItemWithOrder[]>([]);
  const [allLines, setAllLines] = useState<ProductionLine[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  const [loadingData, setLoadingData] = useState(false);
  const [sortKeys, setSortKeys] = useState<LineSortKey[]>([
    "production_start",
    "production_end",
    "order_number",
  ]);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    function onFocus() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const fixedRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profile || !lineId) return;
    const currentProfile = profile;
    const companyId = effectiveCompanyId ?? profile.company_id;

    async function checkAccessAndLoad() {
      if (!supabase) {
        setLine(null);
        setItems([]);
        setAllLines([]);
        setHolidays([]);
        setLoadingData(false);
        return;
      }

      setLoadingData(true);
      if (currentProfile.role === "operator") {
        const { data: access } = await supabase
          .from("operator_lines")
          .select("id")
          .eq("user_id", currentProfile.id)
          .eq("line_id", lineId)
          .maybeSingle();

        if (!access) {
          router.push("/");
          return;
        }
      }

      setLoadingData(true);

      const { data: lineData } = await supabase
        .from("production_lines")
        .select("*")
        .eq("id", lineId)
        .single();
      setLine((lineData as ProductionLine) ?? null);

      const baseItemsQuery = supabase
        .from("order_items")
        .select(
          `
          *,
          order:orders(id, order_number, client_name, delivery_deadline, pcp_deadline, status)
        `
        )
        .eq("line_id", lineId)
        .order("production_start", { ascending: true, nullsFirst: false })
        .order("production_end", { ascending: true });

      const query =
        tab === "in_progress"
          ? baseItemsQuery.neq("status", "completed")
          : baseItemsQuery.eq("status", "completed");

      const { data: itemsData } = await query;
      setItems((itemsData as unknown as LineItemWithOrder[]) ?? []);

      const { data: holidaysData } = await supabase
        .from("holidays")
        .select("id, company_id, date, description, is_recurring, created_at")
        .eq("company_id", companyId ?? currentProfile.company_id);
      setHolidays((holidaysData as Holiday[]) ?? []);

      setLoadingData(false);
    }

    checkAccessAndLoad();
  }, [profile, effectiveCompanyId, lineId, tab, supabase, router, refreshKey]);

  function syncScroll(source: "fixed" | "gantt") {
    if (source === "fixed" && fixedRef.current && ganttRef.current) {
      ganttRef.current.scrollTop = fixedRef.current.scrollTop;
    }
    if (source === "gantt" && fixedRef.current && ganttRef.current) {
      fixedRef.current.scrollTop = ganttRef.current.scrollTop;
    }
  }

  async function handleChangeDate(
    itemId: string,
    field: "production_start" | "production_end",
    value: string | null
  ) {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    if (
      field === "production_end" &&
      targetItem.production_start &&
      value &&
      new Date(value) < new Date(targetItem.production_start)
    ) {
      alert("Data de fim não pode ser antes do início.");
      return;
    }

    if (!supabase) return;
    const dateVal = toDateOnly(value);
    await supabase
      .from("order_items")
      .update({
        [field]: dateVal,
        status: "scheduled" as OrderItem["status"],
      })
      .eq("id", itemId);

    const finalVal = dateVal ?? value;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, [field]: finalVal, status: "scheduled" } : item
      )
    );
  }

  async function handleChangeNotes(itemId: string, value: string) {
    if (!supabase) return;
    const notesVal = value.trim().slice(0, 2000);
    await supabase
      .from("order_items")
      .update({ notes: notesVal })
      .eq("id", itemId);
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, notes: notesVal } : item))
    );
  }

  async function handleComplete(itemId: string) {
    if (!profile) return;

    const nowIso = new Date().toISOString();
    const todayStr = new Date().toISOString().slice(0, 10);
    const targetItem = items.find((i) => i.id === itemId);

    const fillStart = !targetItem?.production_start ? todayStr : undefined;
    const fillEnd = !targetItem?.production_end ? todayStr : undefined;

    if (!supabase) return;
    const updateData: Record<string, unknown> = {
      status: "completed",
      completed_at: nowIso,
      completed_by: profile.id,
    };
    if (fillStart) updateData.production_start = toDateOnly(todayStr) ?? todayStr;
    if (fillEnd) updateData.production_end = toDateOnly(todayStr) ?? todayStr;

    await supabase
      .from("order_items")
      .update(updateData)
      .eq("id", itemId);

    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  const isAlmoxarifado = line?.is_almoxarifado === true;

  async function handleSupply(itemId: string) {
    const nowIso = new Date().toISOString();
    if (!supabase) return;
    await supabase
      .from("order_items")
      .update({ supplied_at: nowIso })
      .eq("id", itemId);
    setItems((prev) =>
      tab === "finished"
        ? prev.map((item) =>
            item.id === itemId ? { ...item, supplied_at: nowIso } : item
          )
        : prev.filter((item) => item.id !== itemId)
    );
  }

  const title = useMemo(
    () => (line ? `Linha de Produção - ${line.name}` : "Linha de Produção"),
    [line]
  );

  const sortedItems = useMemo(
    () => sortLineItemsByKeys(items, sortKeys),
    [items, sortKeys]
  );

  const needsEffectiveCompany =
    supabase && profile?.company_id === "local-company";
  const effectiveReady = !needsEffectiveCompany || effectiveCompanyId !== null;

  if (loading || !profile || !effectiveReady) {
    return (
      <div className="text-sm text-slate-500">Carregando linha de produção...</div>
    );
  }

  if (!supabase) {
    return (
      <div className="text-sm text-amber-700">
        Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e
        NEXT_PUBLIC_SUPABASE_ANON_KEY para usar o sistema.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-[11px] text-slate-500">
            Visualização dos itens alocados nesta linha com calendário Gantt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
              tab === "all"
                ? "bg-white border-slate-300 text-slate-900"
                : "bg-slate-100 border-transparent text-slate-600"
            }`}
            onClick={() => setTab("all")}
          >
            Todos
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
              tab === "in_progress"
                ? "bg-white border-slate-300 text-slate-900"
                : "bg-slate-100 border-transparent text-slate-600"
            }`}
            onClick={() => setTab("in_progress")}
          >
            Em Produção
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
              tab === "finished"
                ? "bg-white border-slate-300 text-slate-900"
                : "bg-slate-100 border-transparent text-slate-600"
            }`}
            onClick={() => setTab("finished")}
          >
            Finalizados
          </button>
        </div>
      </div>

      {loadingData ? (
        <div className="text-sm text-slate-500">Carregando itens...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500">
          Nenhum item encontrado para esta linha.
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden border border-slate-200 rounded-md bg-white">
          {/* Colunas fixas */}
          <div
            ref={fixedRef}
            onScroll={() => syncScroll("fixed")}
            className="flex-shrink-0 overflow-y-auto sticky left-0 z-10 bg-white shadow-[4px_0_6px_-1px_rgba(0,0,0,0.1)]"
          >
            <LineTable
              items={sortedItems}
              profile={profile}
              sortKeys={sortKeys}
              onChangeSort={setSortKeys}
              onChangeDate={handleChangeDate}
              onChangeNotes={handleChangeNotes}
              onComplete={handleComplete}
              isAlmoxarifado={isAlmoxarifado}
              allLines={allLines}
              onSupply={handleSupply}
            />
          </div>

          {/* Área do Gantt */}
          <div
            ref={ganttRef}
            onScroll={() => syncScroll("gantt")}
            className="flex-1 overflow-x-auto overflow-y-auto"
          >
            {tab === "in_progress" ? (
              <GanttCalendar items={sortedItems} holidays={holidays} />
            ) : (
              <div className="flex flex-col h-full">
                <div className="px-2 pt-1 pb-1 text-[11px] text-slate-600">
                  Itens finalizados - Gantt estático.
                </div>
                <div className="flex-1">
                  <GanttCalendar items={sortedItems} holidays={holidays} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

