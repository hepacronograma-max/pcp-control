'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
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
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { shouldUseLocalServiceApi } from "@/lib/local-service-api";
import { toast } from "sonner";

type TabKey = "all" | "in_progress" | "finished";

export default function LinePage() {
  const params = useParams<{ id: string }>();
  const lineId = params.id;
  const supabase = createClient();
  const { profile, loading } = useUser();
  const { companyId: effectiveCompanyId, loaded: effectiveLoaded } =
    useEffectiveCompanyId(profile);
  const router = useRouter();
  const pathname = usePathname();
  /** Ao sair da tela da linha e voltar (ou trocar de linha), sempre reabre em "Em Produção". */
  const prevPathnameRef = useRef<string | null>(null);

  const [line, setLine] = useState<ProductionLine | null>(null);
  const [items, setItems] = useState<LineItemWithOrder[]>([]);
  const [allLines, setAllLines] = useState<ProductionLine[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [tab, setTab] = useState<TabKey>("in_progress");
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

  useEffect(() => {
    setTab("in_progress");
  }, [lineId]);

  useEffect(() => {
    const path = pathname ?? "";
    const onLinePage = path.startsWith("/linha/");
    const wasOnLinePage = prevPathnameRef.current?.startsWith("/linha/") ?? false;
    if (onLinePage && !wasOnLinePage) {
      setTab("in_progress");
    }
    prevPathnameRef.current = path;
  }, [pathname]);

  const fixedRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<HTMLDivElement | null>(null);

  const useApi = shouldUseLocalServiceApi(profile);

  useEffect(() => {
    if (!profile || !lineId) return;
    const currentProfile = profile;
    const companyId = effectiveCompanyId ?? profile.company_id;

    async function checkAccessAndLoad() {
      setLoadingData(true);

      if (useApi) {
        try {
          const res = await fetch(
            `/api/line-data?lineId=${encodeURIComponent(lineId)}&tab=${encodeURIComponent(tab)}`,
            { credentials: "include" }
          );
          const json = await res.json();
          setLine((json.line as ProductionLine) ?? null);
          setItems((json.items as LineItemWithOrder[]) ?? []);
          setHolidays((json.holidays as Holiday[]) ?? []);
          setAllLines((json.allLines as ProductionLine[]) ?? []);
        } catch {
          setLine(null);
          setItems([]);
          setAllLines([]);
          setHolidays([]);
        }
        setLoadingData(false);
        return;
      }

      if (!supabase) {
        setLine(null);
        setItems([]);
        setAllLines([]);
        setHolidays([]);
        setLoadingData(false);
        return;
      }

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

      let itemsQuery = baseItemsQuery;
      if (tab === "in_progress") {
        itemsQuery = baseItemsQuery.neq("status", "completed");
      } else if (tab === "finished") {
        itemsQuery = baseItemsQuery.eq("status", "completed");
      }
      const { data: itemsData } = await itemsQuery;
      setItems((itemsData as unknown as LineItemWithOrder[]) ?? []);

      const { data: holidaysData } = await supabase
        .from("holidays")
        .select("id, company_id, date, description, is_recurring, created_at")
        .eq("company_id", companyId ?? currentProfile.company_id);
      setHolidays((holidaysData as Holiday[]) ?? []);

      const { data: allLinesData } = await supabase
        .from("production_lines")
        .select("id, name, company_id, is_active, sort_order")
        .eq("company_id", companyId ?? currentProfile.company_id)
        .eq("is_active", true)
        .order("sort_order");
      setAllLines((allLinesData as ProductionLine[]) ?? []);

      setLoadingData(false);
    }

    checkAccessAndLoad();
  }, [profile, effectiveCompanyId, lineId, tab, supabase, router, refreshKey, useApi]);

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

    const pcDelivery = targetItem.pc_delivery_date
      ? toDateOnly(targetItem.pc_delivery_date)
      : null;
    const valueNorm = toDateOnly(value);
    if (pcDelivery && valueNorm && valueNorm < pcDelivery) {
      alert(
        "A data não pode ser antes da entrega do pedido de compras (chegada da matéria-prima)."
      );
      return;
    }

    if (
      field === "production_end" &&
      targetItem.production_start &&
      value &&
      new Date(value) < new Date(targetItem.production_start)
    ) {
      alert("Data de fim não pode ser antes do início.");
      return;
    }

    const dateVal = toDateOnly(value);
    /** Só envia o campo alterado — senão a API gravava null no outro e apagava a data */
    const payload: Record<string, unknown> = {
      action: "program",
      itemId,
      [field]: value,
    };
    if (useApi) {
      const res = await fetch("/api/order-items/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      let errMsg = "";
      try {
        const j = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || j.success === false) {
          errMsg = j.error || `Erro ao salvar (${res.status})`;
        }
      } catch {
        if (!res.ok) errMsg = `Erro ao salvar (${res.status})`;
      }
      if (errMsg) {
        toast.error(errMsg);
        return;
      }
    } else if (supabase) {
      await supabase
        .from("order_items")
        .update({
          [field]: dateVal,
          status: "scheduled" as OrderItem["status"],
        })
        .eq("id", itemId);
    } else return;

    const finalVal = dateVal ?? value;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, [field]: finalVal, status: "scheduled" } : item
      )
    );
  }

  async function handleChangeNotes(itemId: string, value: string) {
    const notesVal = value.trim().slice(0, 2000);
    if (useApi) {
      const res = await fetch("/api/order-items/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "notes", itemId, notes: notesVal }),
      });
      if (!res.ok) return;
    } else if (supabase) {
      await supabase.from("order_items").update({ notes: notesVal }).eq("id", itemId);
    } else return;
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

    const payload = {
      action: "complete",
      itemId,
      completed_by: profile.id,
      production_start: fillStart ?? targetItem?.production_start,
      production_end: fillEnd ?? targetItem?.production_end,
    };
    if (useApi) {
      const res = await fetch("/api/order-items/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = "";
        try {
          const j = (await res.json()) as { error?: string };
          msg = j.error ?? "";
        } catch {
          // ignore
        }
        toast.error(msg || "Não foi possível finalizar o item.");
        return;
      }
    } else if (supabase) {
      const updateData: Record<string, unknown> = {
        status: "completed",
        completed_at: nowIso,
        completed_by: profile.id,
      };
      if (fillStart) updateData.production_start = toDateOnly(todayStr) ?? todayStr;
      if (fillEnd) updateData.production_end = toDateOnly(todayStr) ?? todayStr;
      const { error } = await supabase.from("order_items").update(updateData).eq("id", itemId);
      if (error) {
        toast.error(error.message || "Erro ao finalizar.");
        return;
      }
    } else return;

    toast.success("Item finalizado.");
    /** Igual Pedidos: leva o usuário à aba só com itens concluídos nesta linha */
    setTab("finished");
    setRefreshKey((k) => k + 1);
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
  const effectiveReady = !needsEffectiveCompany || effectiveLoaded;

  if (loading || !profile || !effectiveReady) {
    return (
      <div className="text-sm text-slate-500">Carregando linha de produção...</div>
    );
  }

  if (needsEffectiveCompany && !effectiveCompanyId) {
    return (
      <div className="text-sm text-amber-700">
        Nenhuma empresa cadastrada. Configure em Configurações → Empresa.
      </div>
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <PageExportMenu
            fileNameBase={`linha-${line?.id?.slice(0, 8) ?? "export"}-${tab}`}
            sheetTitle={title}
            getData={() => ({
              headers: [
                "Pedido",
                "Cliente",
                "Descrição",
                "Qtd",
                "Prazo PCP",
                "PC nº",
                "PC entrega",
                "Início prod.",
                "Fim prod.",
                "Status",
              ],
              rows: sortedItems.map((it) => {
                const pcp =
                  it.pcp_deadline ??
                  it.order.pcp_deadline ??
                  it.order.delivery_deadline ??
                  "";
                return [
                  it.order.order_number,
                  it.order.client_name,
                  it.description,
                  it.quantity,
                  pcp,
                  it.pc_number ?? "",
                  it.pc_delivery_date ?? "",
                  it.production_start ?? "",
                  it.production_end ?? "",
                  it.status,
                ];
              }),
            })}
          />
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
            {tab === "finished" ? (
              <div className="flex flex-col h-full">
                <div className="px-2 pt-1 pb-1 text-[11px] text-slate-600">
                  Itens finalizados nesta linha.
                </div>
                <div className="flex-1">
                  <GanttCalendar items={sortedItems} holidays={holidays} />
                </div>
              </div>
            ) : (
              <GanttCalendar items={sortedItems} holidays={holidays} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

