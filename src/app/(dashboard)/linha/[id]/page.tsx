'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import type {
  Holiday,
  OrderItem,
  ProductionLine,
} from "@/lib/types/database";
import { toDateOnly } from "@/lib/utils/supabase-data";
import { itemStatusAfterReopenCompleted } from "@/lib/utils/order-aggregates";
import {
  attachPoDatesToLineItems,
  itemPcArrivalForProduction,
} from "@/lib/utils/pc-purchase-dates";
import {
  LineTable,
  sortLineItemsByKeys,
  type LineSortKey,
} from "@/components/linha/line-table";
import {
  type LineItemWithOrder,
} from "@/components/linha/gantt-calendar";
import { GerarEtiquetaModal } from "@/components/linha/gerar-etiqueta-modal";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { fetchLineDataRequest } from "@/lib/api/fetch-line-data";
import { shouldUseLocalServiceApi } from "@/lib/local-service-api";
import {
  fetchAlmoxScheduledOrderItems,
  countAlmoxSupplyPending,
  fetchProductionLinesWithAlmoxFlag,
  type AlmoxPeriod,
} from "@/lib/supabase/fetch-almox-scheduled-items";
import { productionLineIsAlmoxarifado } from "@/lib/supabase/sync-almoxarifado-on-program";
import { syncAlmoxOnProductionEndChange } from "@/lib/supabase/sync-almox-on-production-end";
import { isUuid } from "@/lib/utils/is-uuid";
import { toast } from "sonner";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import {
  canViewProductionLineMenu,
  defaultAppPathForRole,
  hasPermission,
} from "@/lib/utils/permissions";

/** Paginação server-side da lista agregada Almox (performance). */
const ALMOX_LIST_PAGE_SIZE = "50";

const GanttCalendarLazy = dynamic(
  () =>
    import("@/components/linha/gantt-calendar").then((m) => ({
      default: m.GanttCalendar,
    })),
  {
    ssr: false,
    loading: () => <div className="w-24 shrink-0 bg-slate-50/80" aria-hidden />,
  }
);

type TabKey = "all" | "in_progress" | "finished";

interface LinePreferences {
  sortKeys: LineSortKey[];
  columnWidths: number[];
}

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

  useEffect(() => {
    if (loading) return;
    if (profile && !canViewProductionLineMenu(profile.role)) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [loading, profile, router]);

  const [line, setLine] = useState<ProductionLine | null>(null);
  const [items, setItems] = useState<LineItemWithOrder[]>([]);
  const [allLines, setAllLines] = useState<ProductionLine[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [tab, setTab] = useState<TabKey>("in_progress");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingData, setLoadingData] = useState(false);
  const [almoxPeriod, setAlmoxPeriod] = useState<AlmoxPeriod>("all");
  const [almoxGroupByDay, setAlmoxGroupByDay] = useState(false);
  /** Itens Almox sem abastecer (filtro período igual à lista «Em aberto»). Null = não é tela Almox. */
  const [almoxPendingCount, setAlmoxPendingCount] = useState<number | null>(null);

  const defaultLinePrefs: LinePreferences = {
    sortKeys: ["production_start", "production_end", "order_number"],
    columnWidths: [],
  };

  const { preferences: linePrefs, setPreferences: setLinePrefs } =
    useUserPreferences<LinePreferences>(`linha-${lineId}`, defaultLinePrefs);

  const sortKeys = linePrefs.sortKeys;
  const setSortKeys = (next: LineSortKey[]) => {
    setLinePrefs((prev) => ({ ...prev, sortKeys: next }));
  };

  /** Linha do menu Almoxarifado (UUID) — enviada na API para gravar o espelho no lugar certo. */
  const preferredAlmoxLineId = useMemo(() => {
    const almox = allLines.find((l) => productionLineIsAlmoxarifado(l));
    return almox?.id ?? null;
  }, [allLines]);

  const [refreshKey, setRefreshKey] = useState(0);
  const [etiquetaItem, setEtiquetaItem] = useState<LineItemWithOrder | null>(
    null
  );

  useEffect(() => {
    function onFocus() {
      setRefreshKey((k) => k + 1);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    setTab("in_progress");
    setSearch("");
    setSelectedIds(new Set());
    setAlmoxPendingCount(null);
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

  /** Um único scroll (X+Y) para tabela + Gantt — evita o Gantt com largura 0 em telemóveis. */
  const lineGanttScrollRef = useRef<HTMLDivElement | null>(null);

  /** Debounce de gravação de observações (evita request por tecla + corrige input controlado). */
  const notesDebounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  const pendingNotesRef = useRef<Record<string, string>>({});

  const useApi = shouldUseLocalServiceApi(profile);

  useEffect(() => {
    if (!profile || !lineId) return;

    const currentProfile = profile;
    const companyId = effectiveCompanyId ?? profile.company_id;
    let cancelled = false;

    async function resolveOperatorAllowsLine(): Promise<boolean> {
      if (
        currentProfile.role !== "operator" &&
        currentProfile.role !== "logistica"
      ) {
        return true;
      }
      const ac = new AbortController();
      const to = window.setTimeout(() => ac.abort(), 22_000);
      let allowed = false;
      try {
        const meRes = await fetch("/api/me", {
          credentials: "include",
          signal: ac.signal,
        });
        if (meRes.ok) {
          const meJson = (await meRes.json()) as {
            operatorLineIds?: string[];
          };
          allowed = (meJson.operatorLineIds ?? []).includes(lineId);
        }
      } catch {
        /* fallback abaixo */
      } finally {
        clearTimeout(to);
      }
      if (!allowed && supabase) {
        try {
          const { data: access } = await supabase
            .from("operator_lines")
            .select("line_id")
            .eq("user_id", currentProfile.id)
            .eq("line_id", lineId)
            .maybeSingle();
          allowed = !!access;
        } catch {
          /* ignore */
        }
      }
      return allowed;
    }

    async function checkAccessAndLoad() {
      try {
        setLoadingData(true);

        const allowedOp = await resolveOperatorAllowsLine();
        if (cancelled) return;
        if (!allowedOp) {
          router.push("/");
          return;
        }

        if (useApi) {
          try {
            const jsonUnknown = await fetchLineDataRequest(
              {
                lineId,
                tab,
                almoxPeriod,
                almoxLimit: ALMOX_LIST_PAGE_SIZE,
                almoxOffset: "0",
              },
              { timeoutMs: 55_000 }
            );
            if (cancelled) return;
            const json = jsonUnknown as Record<string, unknown>;
            const loadedLine = (json.line as ProductionLine) ?? null;
            setLine(loadedLine);
            setItems((json.items as LineItemWithOrder[]) ?? []);
            setHolidays((json.holidays as Holiday[]) ?? []);
            setAllLines((json.allLines as ProductionLine[]) ?? []);
            setAlmoxPendingCount(
              loadedLine && productionLineIsAlmoxarifado(loadedLine)
                ? Number(
                    (json as { almoxPendingCount?: number }).almoxPendingCount ??
                      0
                  )
                : null
            );
          } catch (err) {
            if (!cancelled) {
              const m =
                err instanceof Error
                  ? err.message
                  : "Falha ao carregar dados da linha.";
              console.error("[linha] line-data:", m);
              toast.error(m);
              setLine(null);
              setItems([]);
              setAllLines([]);
              setHolidays([]);
              setAlmoxPendingCount(null);
            }
          }
          return;
        }

        if (!supabase) {
          setLine(null);
          setItems([]);
          setAllLines([]);
          setHolidays([]);
          setAlmoxPendingCount(null);
          return;
        }

        const cid = companyId ?? currentProfile.company_id;
        if (!cid) {
          setLine(null);
          setItems([]);
          setAllLines([]);
          setHolidays([]);
          setAlmoxPendingCount(null);
          return;
        }

        const lineRes = await supabase
          .from("production_lines")
          .select("*")
          .eq("id", lineId)
          .single();
        if (cancelled) return;
        const lineCurrent = (lineRes.data as ProductionLine) ?? null;
        setLine(lineCurrent);

        const [allLinesData, holidaysRes] = await Promise.all([
          fetchProductionLinesWithAlmoxFlag(supabase, cid),
          supabase
            .from("holidays")
            .select(
              "id, company_id, date, description, is_recurring, created_at"
            )
            .eq("company_id", cid),
        ]);
        if (cancelled) return;

        setAllLines(allLinesData);
        setHolidays((holidaysRes.data as Holiday[]) ?? []);

        let nextItems: LineItemWithOrder[] = [];

        if (lineCurrent && productionLineIsAlmoxarifado(lineCurrent)) {
          const lm = Number(ALMOX_LIST_PAGE_SIZE);
          const [agg, pend] = await Promise.all([
            fetchAlmoxScheduledOrderItems(supabase, allLinesData, {
              tab,
              period: almoxPeriod,
              limit: Number.isFinite(lm) ? lm : 50,
              offset: 0,
            }),
            countAlmoxSupplyPending(supabase, allLinesData, {
              period: almoxPeriod,
            }),
          ]);
          if (cancelled) return;
          if (agg.error) {
            console.warn("[linha/almos] agregação:", agg.error.message);
          }
          if (pend.error) {
            console.warn("[linha/almos] contagem pendente:", pend.error.message);
          }
          setAlmoxPendingCount(pend.error ? 0 : pend.count);
          nextItems = (agg.data ?? []) as LineItemWithOrder[];
        } else {
          setAlmoxPendingCount(null);
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

          const itemsRes = await itemsQuery;
          if (cancelled) return;
          nextItems =
            (itemsRes.data as unknown as LineItemWithOrder[]) ?? [];
        }

        if (cid && nextItems.length > 0) {
          try {
            nextItems = await attachPoDatesToLineItems(
              supabase,
              cid,
              nextItems
            );
          } catch (e) {
            console.warn("[linha] attachPoDatesToLineItems", e);
          }
        }

        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (e) {
        if (!cancelled) {
          const m =
            e instanceof Error
              ? e.message
              : "Erro inesperado ao carregar a linha.";
          console.error("[linha]", m);
          toast.error(m);
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    }

    void checkAccessAndLoad();
    return () => {
      cancelled = true;
    };
  }, [
    profile,
    effectiveCompanyId,
    lineId,
    tab,
    almoxPeriod,
    supabase,
    router,
    refreshKey,
    useApi,
  ]);

  async function handleChangeDate(
    itemId: string,
    field: "production_start" | "production_end",
    value: string | null
  ) {
    if (line && productionLineIsAlmoxarifado(line)) return;
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const pcArrivalMin = itemPcArrivalForProduction(
      targetItem.po_expected_delivery,
      targetItem.po_follow_up_date,
      targetItem.pc_delivery_date
    );
    const pcDelivery = pcArrivalMin ? toDateOnly(pcArrivalMin) : null;
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
    if (preferredAlmoxLineId) {
      payload.target_almox_line_id = preferredAlmoxLineId;
    }
    if (profile?.id && field === "production_end" && value) {
      payload.completed_by = profile.id;
    }
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
      const { error } = await supabase
        .from("order_items")
        .update({
          [field]: dateVal,
          status: "scheduled" as OrderItem["status"],
        })
        .eq("id", itemId);
      if (error) {
        toast.error(error.message || "Erro ao salvar.");
        return;
      }

      const prevEndNorm = targetItem.production_end
        ? toDateOnly(targetItem.production_end)
        : null;
      const nextEndNorm =
        field === "production_end"
          ? dateVal
          : targetItem.production_end
            ? toDateOnly(targetItem.production_end)
            : null;
      await syncAlmoxOnProductionEndChange(supabase, itemId, {
        nextProductionEnd: nextEndNorm,
        previousProductionEnd: prevEndNorm,
        actorUserId: profile?.id && isUuid(profile.id) ? profile.id : null,
      });
    } else return;

    const finalVal = dateVal ?? value;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, [field]: finalVal, status: "scheduled" } : item
      )
    );
  }

  function handleChangeNotes(itemId: string, value: string) {
    if (line && productionLineIsAlmoxarifado(line)) return;
    const notesVal = value.slice(0, 2000);
    pendingNotesRef.current[itemId] = notesVal;
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, notes: notesVal } : item))
    );

    const prevTimer = notesDebounceTimersRef.current[itemId];
    if (prevTimer) clearTimeout(prevTimer);
    notesDebounceTimersRef.current[itemId] = setTimeout(() => {
      delete notesDebounceTimersRef.current[itemId];
      void persistNotes(itemId);
    }, 450);
  }

  async function persistNotes(itemId: string) {
    if (line && productionLineIsAlmoxarifado(line)) return;
    const rawAtSave = pendingNotesRef.current[itemId];
    if (rawAtSave === undefined) return;
    const notesVal = rawAtSave.trim().slice(0, 2000);
    if (useApi) {
      const res = await fetch("/api/order-items/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "notes", itemId, notes: notesVal }),
      });
      if (!res.ok) {
        toast.error("Não foi possível salvar as observações.");
        return;
      }
    } else if (supabase) {
      const { error } = await supabase
        .from("order_items")
        .update({ notes: notesVal })
        .eq("id", itemId);
      if (error) {
        toast.error(error.message || "Não foi possível salvar as observações.");
        return;
      }
    } else return;
    if (pendingNotesRef.current[itemId] === rawAtSave) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, notes: notesVal } : item
        )
      );
    }
  }

  async function runCompleteItems(itemIds: string[]) {
    if (!profile || itemIds.length === 0) return;
    if (line && productionLineIsAlmoxarifado(line)) return;

    const nowIso = new Date().toISOString();
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const itemId of itemIds) {
      const targetItem = items.find((i) => i.id === itemId);
      if (!targetItem) continue;

      const fillStart = !targetItem.production_start ? todayStr : undefined;
      const fillEnd = !targetItem.production_end ? todayStr : undefined;

      const payload = {
        action: "complete",
        itemId,
        completed_by: profile.id,
        production_start: fillStart ?? targetItem.production_start,
        production_end: fillEnd ?? targetItem.production_end,
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
        const prevPeNorm = targetItem.production_end
          ? toDateOnly(targetItem.production_end)
          : null;
        const nextEndRaw = fillEnd ? todayStr : targetItem.production_end ?? todayStr;
        const nextPeNorm = toDateOnly(nextEndRaw) ?? todayStr;
        const { error } = await supabase.from("order_items").update(updateData).eq("id", itemId);
        if (error) {
          toast.error(error.message || "Erro ao finalizar.");
          return;
        }
        await syncAlmoxOnProductionEndChange(supabase, itemId, {
          nextProductionEnd: nextPeNorm,
          previousProductionEnd: prevPeNorm,
          actorUserId: profile?.id && isUuid(profile.id) ? profile.id : null,
        });
      } else return;
    }

    toast.success(
      itemIds.length === 1 ? "Item finalizado." : `${itemIds.length} itens finalizados.`
    );
    setSelectedIds(new Set());
    setRefreshKey((k) => k + 1);
  }

  async function handleComplete(itemId: string) {
    if (line && productionLineIsAlmoxarifado(line)) return;
    if (!window.confirm("Marcar item como concluído?")) return;
    await runCompleteItems([itemId]);
  }

  async function handleBulkComplete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Marcar ${ids.length} item(ns) como concluído(s)?`
      )
    ) {
      return;
    }
    await runCompleteItems(ids);
  }

  async function handleReopenCompleted(itemId: string) {
    if (line && productionLineIsAlmoxarifado(line)) return;
    if (
      !window.confirm(
        "Reabrir este item? Ele volta para programação ou aguardando."
      )
    ) {
      return;
    }
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem || targetItem.status !== "completed") return;

    if (useApi) {
      const res = await fetch("/api/order-items/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "uncomplete", itemId }),
      });
      let msg = "";
      try {
        const j = (await res.json()) as { error?: string };
        msg = j.error ?? "";
      } catch {
        // ignore
      }
      if (!res.ok) {
        toast.error(msg || "Não foi possível reabrir o item.");
        return;
      }
    } else if (supabase) {
      const nextStatus = itemStatusAfterReopenCompleted(targetItem);
      let patch: Record<string, unknown> = {
        status: nextStatus,
        completed_at: null,
        completed_by: null,
      };
      let { error } = await supabase.from("order_items").update(patch).eq("id", itemId);
      if (
        error &&
        /completed_by|schema cache|column|does not exist/i.test(error.message)
      ) {
        patch = { status: nextStatus, completed_at: null };
        ({ error } = await supabase.from("order_items").update(patch).eq("id", itemId));
      }
      if (error) {
        toast.error(error.message || "Erro ao reabrir.");
        return;
      }

      const oid = targetItem.order?.id;
      if (oid && targetItem.order?.status === "finished") {
        let { error: oe } = await supabase
          .from("orders")
          .update({ status: "planning", finished_at: null })
          .eq("id", oid);
        if (
          oe &&
          /finished_at|schema cache|column|does not exist/i.test(oe.message)
        ) {
          ({ error: oe } = await supabase
            .from("orders")
            .update({ status: "planning" })
            .eq("id", oid));
        }
        if (oe) {
          toast.error(oe.message || "Erro ao reabrir o pedido.");
          return;
        }
      }
    } else return;

    toast.success("Item reaberto.");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    setRefreshKey((k) => k + 1);
  }

  async function handleAlmoxSupply(itemId: string) {
    if (!line || !productionLineIsAlmoxarifado(line)) return;
    if (!profile) return;

    const aggItem = items.find((i) => i.id === itemId);
    if (aggItem?.production_end) {
      toast.error(
        "Produção já finalizada: o Almox foi encerrado automaticamente."
      );
      return;
    }

    const cid = effectiveCompanyId ?? profile.company_id;
    if (!cid) {
      toast.error("Defina uma empresa antes de registrar o abastecimento.");
      return;
    }

    if (!window.confirm("Marcar este item como abastecido/separado?")) return;

    const reload = () => {
      setRefreshKey((k) => k + 1);
    };

    try {
      if (useApi) {
        const res = await fetch("/api/order-items/supply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            item_id: itemId,
            company_id: cid,
            supplied_by: profile.id,
          }),
        });
        let msg = "";
        try {
          const j = (await res.json()) as { success?: boolean; error?: string };
          if (!res.ok || j.success === false) {
            msg = j.error ?? `Erro (${res.status})`;
          }
        } catch {
          if (!res.ok) msg = `Erro (${res.status})`;
        }
        if (msg) {
          toast.error(msg);
          return;
        }
        reload();
        toast.success("Abastecimento registrado.");
        return;
      }

      if (supabase) {
        const nowIso = new Date().toISOString();
        const patch: Record<string, unknown> = {
          almox_supplied_at: nowIso,
          almox_supplied_by: profile.id,
          almox_supplied_auto: false,
        };
        let { error } = await supabase.from("order_items").update(patch).eq("id", itemId);
        if (
          error?.message &&
          /almox_supplied_auto|column|does not exist|schema cache/i.test(error.message)
        ) {
          const { almox_supplied_auto: _skip, ...rest } = patch;
          ({ error } = await supabase.from("order_items").update(rest).eq("id", itemId));
        }

        if (error) {
          if (/almox_supplied|column|does not exist|schema cache/i.test(error.message)) {
            toast.error(
              "Execute no Supabase as colunas almox_supplied_at / almox_supplied_by (veja supabase-add-columns.sql)."
            );
          } else {
            toast.error(error.message || "Não foi possível salvar.");
          }
          return;
        }
        reload();
        toast.success("Abastecimento registrado.");
      }
    } catch {
      toast.error("Falha ao registrar abastecimento.");
    }
  }

  const title = useMemo(
    () => (line ? `Linha de Produção - ${line.name}` : "Linha de Produção"),
    [line]
  );

  const sortedItems = useMemo(
    () => sortLineItemsByKeys(items, sortKeys),
    [items, sortKeys]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedItems;
    return sortedItems.filter((it) => {
      if (it.order.order_number?.toLowerCase().includes(q)) return true;
      if (it.order.client_name?.toLowerCase().includes(q)) return true;
      if (it.description?.toLowerCase().includes(q)) return true;
      if ((it.product_code ?? "").toLowerCase().includes(q)) return true;
      return false;
    });
  }, [sortedItems, search]);

  const isAlmoxarifado = line ? productionLineIsAlmoxarifado(line) : false;

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

  if (!supabase && !useApi) {
    return (
      <div className="text-sm text-amber-700">
        Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e
        NEXT_PUBLIC_SUPABASE_ANON_KEY para usar o sistema (ou use o modo local com
        API).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-[200px] flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-[11px] text-slate-500">
            {isAlmoxarifado
              ? "Itens com data de início em todas as linhas (somente visualização)."
              : "Visualização dos itens alocados nesta linha com calendário Gantt."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <input
            type="text"
            className="w-56 max-w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs"
            placeholder={
              isAlmoxarifado
                ? "Buscar pedido, código ou descrição..."
                : "Buscar pedido, cliente ou descrição..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {isAlmoxarifado && (
            <>
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                value={almoxPeriod}
                onChange={(e) =>
                  setAlmoxPeriod(e.target.value as AlmoxPeriod)
                }
                aria-label="Período (data de início)"
              >
                <option value="7">Próximos 7 dias</option>
                <option value="15">Próximos 15 dias</option>
                <option value="30">Próximos 30 dias</option>
                <option value="all">Todos os períodos</option>
              </select>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 whitespace-nowrap cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-slate-700"
                  checked={almoxGroupByDay}
                  onChange={(e) => setAlmoxGroupByDay(e.target.checked)}
                />
                Agrupar por dia
              </label>
            </>
          )}
          <PageExportMenu
            fileNameBase={`linha-${line?.id?.slice(0, 8) ?? "export"}-${tab}`}
            sheetTitle={title}
            getData={() => {
              const lineNameOf = (it: LineItemWithOrder) =>
                allLines.find((l) => l.id === it.line_id)?.name ?? "";

              const statusPt = (s: string) => {
                switch (s) {
                  case "waiting":
                    return "Aguardando";
                  case "scheduled":
                    return "Programado";
                  case "completed":
                    return "Concluído";
                  case "delayed":
                    return "Atrasado";
                  default:
                    return s || "—";
                }
              };

              if (isAlmoxarifado) {
                return {
                  headers: [
                    "Linha",
                    "Nº pedido",
                    "Código",
                    "Descrição",
                    "Qtd",
                    "Início prod.",
                    "Fim prod.",
                    "Status",
                    tab === "finished" ? "Data abastecimento" : "Abastecido",
                  ],
                  rows: filteredItems.map((it) => {
                    const supplyCol =
                      tab === "finished"
                        ? (it.almox_supplied_at ?? "").slice(0, 16)
                        : "";
                    return [
                    lineNameOf(it),
                    it.order.order_number,
                    (it.product_code ?? "").trim(),
                    it.description,
                    String(it.quantity),
                    it.production_start ?? "",
                    it.production_end ?? "",
                    statusPt(String(it.status)),
                      tab === "finished" ? supplyCol : "",
                  ];
                  }),
                };
              }

              return {
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
                  "Obs.",
                ],
                rows: filteredItems.map((it) => {
                  const pcp =
                    it.pcp_deadline ??
                    it.order.pcp_deadline ??
                    it.order.delivery_deadline ??
                    "";
                  const pcEntrega = itemPcArrivalForProduction(
                    it.po_expected_delivery,
                    it.po_follow_up_date,
                    it.pc_delivery_date
                  );
                  return [
                    it.order.order_number,
                    it.order.client_name,
                    it.description,
                    it.quantity,
                    pcp,
                    it.pc_number ?? "",
                    pcEntrega ?? "",
                    it.production_start ?? "",
                    it.production_end ?? "",
                    it.status,
                    it.notes ?? "",
                  ];
                }),
              };
            }}
          />
          {!isAlmoxarifado && (
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
          )}
          <button
            className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border ${
              tab === "in_progress"
                ? "bg-white border-slate-300 text-slate-900"
                : "bg-slate-100 border-transparent text-slate-600"
            }`}
            onClick={() => setTab("in_progress")}
          >
            {isAlmoxarifado ? (
              <>
                Em aberto
                {almoxPendingCount !== null ? (
                  <span
                    className="ml-1 font-semibold tabular-nums"
                    aria-label={`${almoxPendingCount} pendentes de abastecimento`}
                  >
                    ({almoxPendingCount})
                  </span>
                ) : loadingData ? (
                  <span className="ml-1 text-slate-400 font-normal tabular-nums">(…)</span>
                ) : null}
              </>
            ) : (
              "Em Produção"
            )}
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

      {!isAlmoxarifado && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-xs text-slate-800">
          <span className="font-medium">{selectedIds.size} selecionado(s)</span>
          <button
            type="button"
            className="rounded-md border border-emerald-400 bg-emerald-50 px-2 py-1 text-emerald-800 hover:bg-emerald-100"
            onClick={handleBulkComplete}
          >
            Finalizar selecionados
          </button>
          <button
            type="button"
            className="text-slate-600 underline hover:text-slate-900"
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar seleção
          </button>
        </div>
      )}

      {loadingData ? (
        <div className="text-sm text-slate-500">Carregando itens...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500">
          {isAlmoxarifado
            ? "Nenhum item com data de início para esta aba e período selecionados."
            : "Nenhum item encontrado para esta linha."}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-sm text-slate-500">
          Nenhum item corresponde à busca.
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {tab === "finished" && (
            <p className="text-[11px] text-slate-600 px-2 py-1 shrink-0 bg-white">
              {isAlmoxarifado
                ? "Itens já abastecidos/separados (todas as linhas)."
                : "Itens finalizados nesta linha."}
            </p>
          )}
          <div className="flex flex-1 min-h-0 min-w-0 flex-col border border-slate-200 rounded-md bg-white">
            <div
              ref={lineGanttScrollRef}
              className="flex-1 min-h-0 min-w-0 overflow-auto overscroll-x-contain [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]"
            >
              <div
                className={
                  isAlmoxarifado
                    ? "flex w-full min-h-full min-w-0 flex-row items-stretch"
                    : "flex w-max min-h-full flex-row items-stretch"
                }
              >
                <div
                  className={
                    isAlmoxarifado
                      ? "flex-1 min-w-0 min-h-0 self-stretch"
                      : "sticky left-0 z-20 flex-shrink-0 self-stretch bg-white shadow-[4px_0_6px_-1px_rgba(0,0,0,0.1)]"
                  }
                >
                  <LineTable
                    items={filteredItems}
                    profile={profile}
                    sortKeys={sortKeys}
                    onChangeSort={setSortKeys}
                    onChangeDate={handleChangeDate}
                    onChangeNotes={handleChangeNotes}
                    onComplete={handleComplete}
                    onReopenCompleted={
                      profile && hasPermission(profile.role, "finishOrders")
                        ? handleReopenCompleted
                        : undefined
                    }
                    isAlmoxarifado={isAlmoxarifado}
                    almoxGroupByDay={almoxGroupByDay}
                    almoxTab={tab}
                    onAlmoxSupply={isAlmoxarifado ? handleAlmoxSupply : undefined}
                    onGerarEtiqueta={
                      isAlmoxarifado
                        ? undefined
                        : (item) => setEtiquetaItem(item)
                    }
                    allLines={allLines}
                    columnWidths={
                      linePrefs.columnWidths.length > 0
                        ? linePrefs.columnWidths
                        : undefined
                    }
                    onColumnWidthsChange={(widths) => {
                      setLinePrefs((prev) => ({ ...prev, columnWidths: widths }));
                    }}
                    selectedItemIds={selectedIds}
                    onToggleItemSelected={
                      isAlmoxarifado
                        ? undefined
                        : (id) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            });
                          }
                    }
                    onToggleSelectAllVisible={
                      isAlmoxarifado
                        ? undefined
                        : () => {
                            const ids = filteredItems.map((i) => i.id);
                            setSelectedIds((prev) => {
                              const allSel =
                                ids.length > 0 &&
                                ids.every((id) => prev.has(id));
                              if (allSel) return new Set();
                              return new Set(ids);
                            });
                          }
                    }
                    cqContext={
                      effectiveCompanyId ?? profile.company_id
                        ? {
                            userId: profile.id,
                            companyId:
                              (effectiveCompanyId ??
                                profile.company_id) as string,
                          }
                        : null
                    }
                  />
                </div>
                {!isAlmoxarifado && (
                  <div className="flex-shrink-0">
                    <GanttCalendarLazy items={filteredItems} holidays={holidays} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <GerarEtiquetaModal
        item={etiquetaItem}
        open={etiquetaItem != null}
        onClose={() => setEtiquetaItem(null)}
      />
    </div>
  );
}

