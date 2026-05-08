import { CompactDateCell } from "@/components/ui/compact-date-cell";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ItemStatus, Profile, ProductionLine } from "@/lib/types/database";
import type { LineItemWithOrder } from "./gantt-calendar";
import { formatShortDate, parseLocalDate } from "@/lib/utils/date";
import { itemPcArrivalForProduction } from "@/lib/utils/pc-purchase-dates";
import { hasPermission } from "@/lib/utils/permissions";
import { toDateOnly } from "@/lib/utils/supabase-data";
import { CQField } from "@/components/cq/CQField";
import { CQList } from "@/components/cq/CQList";

function migrateLineTableWidths(
  prop: number[],
  selectCol: boolean,
  defaults: number[]
): number[] | undefined {
  let w = [...prop];
  let guard = 0;
  while (w.length !== defaults.length && guard++ < 8) {
    if (selectCol && w.length === 12 && defaults.length === 13) {
      const checkW = w[10];
      const obsW = w[11];
      if (
        checkW !== undefined &&
        obsW !== undefined &&
        checkW <= 52 &&
        obsW >= 72
      ) {
        w = [...w.slice(0, 10), obsW, 80, checkW];
        continue;
      }
    }
    if (!selectCol && w.length === 11 && defaults.length === 12) {
      const checkW = w[9];
      const obsW = w[10];
      if (
        checkW !== undefined &&
        obsW !== undefined &&
        checkW <= 52 &&
        obsW >= 72
      ) {
        w = [...w.slice(0, 9), obsW, 80, checkW];
        continue;
      }
    }
    if (w.length === defaults.length - 1) {
      const insertAt = selectCol ? 3 : 2;
      w = [...w];
      w.splice(insertAt, 0, defaults[insertAt] ?? 72);
      continue;
    }
    return undefined;
  }
  return w.length === defaults.length ? w : undefined;
}

function safeParse(d: string): Date {
  return d.includes("-") ? parseLocalDate(d) : new Date(d);
}

/** Menor data mínima aceita no input (YYYY-MM-DD) */
function maxDateStr(
  a: string | null | undefined,
  b: string | null | undefined
): string | undefined {
  const as = a?.slice(0, 10) ?? "";
  const bs = b?.slice(0, 10) ?? "";
  if (!as && !bs) return undefined;
  if (!as) return bs || undefined;
  if (!bs) return as || undefined;
  return as >= bs ? as : bs;
}

export type LineSortKey =
  | "order_number"
  | "client_name"
  | "description"
  | "quantity"
  | "delivery_deadline"
  | "production_start"
  | "production_end";

function itemStatusLabelPt(s: ItemStatus | string): string {
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
      return String(s || "—");
  }
}

export function sortLineItemsByKeys(
  items: LineItemWithOrder[],
  sortKeys: LineSortKey[]
): LineItemWithOrder[] {
  const copy = [...items];
  copy.sort((a, b) => {
    for (const key of sortKeys) {
      let av: any;
      let bv: any;
      switch (key) {
        case "order_number":
          av = a.order.order_number;
          bv = b.order.order_number;
          break;
        case "client_name":
          av = a.order.client_name;
          bv = b.order.client_name;
          break;
        case "description":
          av = a.description;
          bv = b.description;
          break;
        case "quantity":
          av = a.quantity;
          bv = b.quantity;
          break;
        case "delivery_deadline":
          av = a.pcp_deadline || a.order.pcp_deadline || a.order.delivery_deadline || "";
          bv = b.pcp_deadline || b.order.pcp_deadline || b.order.delivery_deadline || "";
          break;
        case "production_start":
          av = a.production_start || "";
          bv = b.production_start || "";
          break;
        case "production_end":
          av = a.production_end || "";
          bv = b.production_end || "";
          break;
        default:
          av = "";
          bv = "";
      }
      if (av === bv) continue;
      if (av === null || av === undefined || av === "") return 1;
      if (bv === null || bv === undefined || bv === "") return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return av - bv;
      }
      const as = String(av);
      const bs = String(bv);
      if (as < bs) return -1;
      if (as > bs) return 1;
    }
    return 0;
  });
  return copy;
}

export function getNextSortKeys(
  current: LineSortKey[],
  key: LineSortKey
): LineSortKey[] {
  const existingIndex = current.indexOf(key);
  if (existingIndex === 0) {
    return current;
  }
  if (existingIndex > 0) {
    const copy = [...current];
    copy.splice(existingIndex, 1);
    copy.unshift(key);
    return copy;
  }
  return [key, ...current].slice(0, 3);
}

interface LineTableProps {
  items: LineItemWithOrder[];
  profile: Profile;
  sortKeys: LineSortKey[];
  onChangeSort: (keys: LineSortKey[]) => void;
  onChangeDate: (
    itemId: string,
    field: "production_start" | "production_end",
    value: string | null
  ) => void;
  onChangeNotes: (itemId: string, value: string) => void;
  onComplete: (itemId: string) => void;
  /** Desfazer conclusão do item (PCP/gestão). */
  onReopenCompleted?: (itemId: string) => void;
  isAlmoxarifado?: boolean;
  allLines?: ProductionLine[];
  /** Seletor múltiplo (linha de produção) */
  selectedItemIds?: Set<string>;
  onToggleItemSelected?: (itemId: string) => void;
  onToggleSelectAllVisible?: () => void;
  columnWidths?: number[];
  onColumnWidthsChange?: (widths: number[]) => void;
  cqContext?: { userId: string; companyId: string } | null;
  /** Cabeçalhos de grupo por dia (vista só leitura Almox.) */
  almoxGroupByDay?: boolean;
  /** Aba Almox: «Em aberto» vs «Finalizados» (abastecido). */
  almoxTab?: "all" | "in_progress" | "finished";
  /** Marcar como abastecido (só na aba em aberto). */
  onAlmoxSupply?: (itemId: string) => void;
}

export function LineTable({
  items,
  profile,
  sortKeys,
  onChangeSort,
  onChangeDate,
  onChangeNotes,
  onComplete,
  onReopenCompleted,
  isAlmoxarifado,
  allLines,
  selectedItemIds,
  onToggleItemSelected,
  onToggleSelectAllVisible,
  columnWidths: columnWidthsProp,
  onColumnWidthsChange,
  cqContext,
  almoxGroupByDay = false,
  almoxTab = "in_progress",
  onAlmoxSupply,
}: LineTableProps) {
  /**
   * Início/Fim precisam de ~104–116px: o seletor de data usa área mínima ~96px;
   * valores menores encavalam colunas e o clique só pega no canto.
   */
  const selectCol = Boolean(onToggleItemSelected);
  const defaultWidths = useMemo(
    () =>
      isAlmoxarifado
        ? [100, 88, 72, 200, 44, 88, 88, 88, 56]
        : selectCol
          ? [32, 54, 118, 72, 158, 42, 76, 76, 116, 116, 124, 80, 40]
          : [54, 118, 72, 158, 42, 76, 76, 116, 116, 124, 80, 40],
    [isAlmoxarifado, selectCol]
  );

  /** Migra prefs antigas (sem Cód., sem “Ocorrências”, etc.). */
  const normalizedPropWidths = useMemo(() => {
    if (!columnWidthsProp?.length || isAlmoxarifado) return undefined;
    if (columnWidthsProp.length === defaultWidths.length)
      return columnWidthsProp;
    return migrateLineTableWidths(columnWidthsProp, selectCol, defaultWidths);
  }, [columnWidthsProp, defaultWidths, isAlmoxarifado, selectCol]);

  const [internalWidths, setInternalWidths] = useState<number[]>(defaultWidths);
  const columnWidths = normalizedPropWidths ?? internalWidths;
  const setColumnWidths = useCallback(
    (updater: number[] | ((prev: number[]) => number[])) => {
      if (onColumnWidthsChange) {
        const current = normalizedPropWidths ?? internalWidths;
        const next =
          typeof updater === "function" ? updater(current) : updater;
        onColumnWidthsChange(next);
      } else {
        setInternalWidths(updater);
      }
    },
    [onColumnWidthsChange, normalizedPropWidths, internalWidths]
  );
  const resizingIndexRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startWidthsRef = useRef<number[]>([]);

  const gridTemplate = columnWidths.map((w) => `${w}px`).join(" ");

  function handleResizeStart(index: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizingIndexRef.current = index;
    startXRef.current = e.clientX;
    startWidthsRef.current = [...columnWidths];
  }

  /** Mínimos por coluna (índice alinhado a defaultWidths linha “normal”). */
  const columnMinWidths = useMemo(
    () =>
      isAlmoxarifado
        ? [56, 64, 52, 96, 36, 72, 72, 64, 40]
        : selectCol
          ? [28, 44, 72, 52, 96, 36, 56, 56, 100, 100, 64, 64, 32]
          : [44, 72, 52, 96, 36, 56, 56, 100, 100, 64, 64, 32],
    [isAlmoxarifado, selectCol]
  );

  const sel = selectedItemIds ?? new Set<string>();
  const canReopenCompleted =
    !!onReopenCompleted && hasPermission(profile.role, "finishOrders");
  const allVisibleSelected =
    items.length > 0 && items.every((it) => sel.has(it.id));
  const someSelected = items.some((it) => sel.has(it.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  const colOff = selectCol ? 1 : 0;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someSelected && !allVisibleSelected;
  }, [someSelected, allVisibleSelected]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (resizingIndexRef.current === null) return;
      const idx = resizingIndexRef.current;
      const delta = e.clientX - startXRef.current;
      const base = startWidthsRef.current[idx];
      const minW = columnMinWidths[idx] ?? 32;
      const next = Math.max(minW, base + delta);
      setColumnWidths((prev) => {
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      });
    }

    function onMouseUp() {
      resizingIndexRef.current = null;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [setColumnWidths, columnMinWidths]);
  function toggleSort(key: LineSortKey) {
    onChangeSort(getNextSortKeys(sortKeys, key));
  }

  function getSortIndex(key: LineSortKey): number | null {
    const idx = sortKeys.indexOf(key);
    return idx >= 0 && idx < 3 ? idx + 1 : null;
  }

  function handleComplete(itemId: string) {
    onComplete(itemId);
  }

  const linesMap = new Map((allLines ?? []).map((l) => [l.id, l.name]));

  type AlmoxRow =
    | { kind: "day"; key: string; label: string }
    | { kind: "item"; key: string; item: LineItemWithOrder };

  const almoxRows = useMemo((): AlmoxRow[] => {
    if (!isAlmoxarifado) return [];
    if (!almoxGroupByDay) {
      return items.map((item) => ({ kind: "item" as const, key: item.id, item }));
    }
    const sorted = [...items].sort((a, b) => {
      const as = (a.production_start ?? "").slice(0, 10);
      const bs = (b.production_start ?? "").slice(0, 10);
      return as.localeCompare(bs);
    });
    const out: AlmoxRow[] = [];
    let prev = "";
    for (const item of sorted) {
      const d = (item.production_start ?? "").slice(0, 10) || "—";
      if (d !== prev) {
        prev = d;
        out.push({
          kind: "day",
          key: `h-${d}`,
          label:
            d === "—"
              ? "Sem data de início"
              : `Início · ${formatShortDate(safeParse(`${d}T12:00:00`))}`,
        });
      }
      out.push({ kind: "item", key: item.id, item });
    }
    return out;
  }, [isAlmoxarifado, items, almoxGroupByDay]);

  const itemRowStripe = useMemo(() => {
    const m = new Map<string, number>();
    let c = 0;
    for (const row of almoxRows) {
      if (row.kind === "item") {
        m.set(row.item.id, c % 2);
        c++;
      }
    }
    return m;
  }, [almoxRows]);

  if (isAlmoxarifado) {
    return (
      <div className="min-w-[800px]">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
          <div
            className="grid text-[11px] h-[var(--line-gantt-header-h)] items-stretch box-border overflow-hidden bg-slate-50/70"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <HeaderCell onResizeStart={(e) => handleResizeStart(0, e)}>
              Linha de produção
            </HeaderCell>
            <HeaderCell
              onClick={() => toggleSort("order_number")}
              sortIndex={getSortIndex("order_number")}
              onResizeStart={(e) => handleResizeStart(1, e)}
            >
              Nº pedido
            </HeaderCell>
            <HeaderCell onResizeStart={(e) => handleResizeStart(2, e)}>
              Cód.
            </HeaderCell>
            <HeaderCell
              onClick={() => toggleSort("description")}
              sortIndex={getSortIndex("description")}
              onResizeStart={(e) => handleResizeStart(3, e)}
            >
              Descrição
            </HeaderCell>
            <HeaderCell
              className="text-center"
              onClick={() => toggleSort("quantity")}
              sortIndex={getSortIndex("quantity")}
              onResizeStart={(e) => handleResizeStart(4, e)}
            >
              Qtd
            </HeaderCell>
            <HeaderCell
              className="text-center"
              onClick={() => toggleSort("production_start")}
              sortIndex={getSortIndex("production_start")}
              onResizeStart={(e) => handleResizeStart(5, e)}
            >
              Início prod.
            </HeaderCell>
            <HeaderCell
              className="text-center"
              onClick={() => toggleSort("production_end")}
              sortIndex={getSortIndex("production_end")}
              onResizeStart={(e) => handleResizeStart(6, e)}
            >
              Fim prod.
            </HeaderCell>
            <HeaderCell onResizeStart={(e) => handleResizeStart(7, e)}>
              Status
            </HeaderCell>
            <HeaderCell onResizeStart={(e) => handleResizeStart(8, e)}>
              Abastecido
            </HeaderCell>
          </div>
        </div>

        <div>
          {almoxRows.map((row) => {
            if (row.kind === "day") {
              return (
                <div
                  key={row.key}
                  className="w-full border-b border-slate-200 bg-slate-100/90 px-2 py-1.5 text-[11px] font-semibold text-[#1B4F72]"
                >
                  {row.label}
                </div>
              );
            }
            const item = row.item;
            const lineName =
              item.line_id ? linesMap.get(item.line_id) ?? "—" : "—";
            const stripe = itemRowStripe.get(item.id) ?? 0;
            return (
              <div
                key={item.id}
                className={`grid text-[11px] items-center border-b border-slate-200 min-h-[var(--line-gantt-row-h)] gap-x-0 box-border overflow-hidden py-1 ${
                  stripe === 0 ? "bg-white" : "bg-slate-50"
                }`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <Cell title={lineName} className="flex items-center min-w-0 font-medium text-slate-700">
                  <span className="truncate block">{lineName}</span>
                </Cell>
                <Cell className="font-medium text-slate-800 flex items-center">
                  {item.order.order_number}
                </Cell>
                <Cell
                  title={(item.product_code ?? "").trim() || undefined}
                  className="text-center flex justify-center items-center font-mono text-[10px] min-w-0"
                >
                  <span className="truncate block">
                    {(item.product_code ?? "").trim() || "—"}
                  </span>
                </Cell>
                <Cell title={item.description} className="flex items-center min-w-0">
                  <span className="truncate block">{item.description}</span>
                </Cell>
                <Cell className="text-center flex justify-center items-center">
                  {item.quantity}
                </Cell>
                <Cell className="text-center flex justify-center items-center text-slate-800">
                  {item.production_start
                    ? formatShortDate(safeParse(item.production_start))
                    : "—"}
                </Cell>
                <Cell className="text-center flex justify-center items-center text-slate-800">
                  {item.production_end
                    ? formatShortDate(safeParse(item.production_end))
                    : "—"}
                </Cell>
                <Cell className="flex justify-center items-center">
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700">
                    {itemStatusLabelPt(item.status)}
                  </span>
                </Cell>
                <Cell className="text-center flex justify-center items-center px-0.5">
                  {almoxTab === "finished" ? (
                    <span className="text-[10px] text-slate-800 tabular-nums">
                      {item.almox_supplied_at
                        ? formatShortDate(safeParse(item.almox_supplied_at))
                        : "—"}
                    </span>
                  ) : onAlmoxSupply ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlmoxSupply(item.id);
                      }}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-emerald-300 text-[10px] leading-none touch-manipulation text-emerald-700 hover:bg-emerald-50"
                      title="Marcar como abastecido"
                    >
                      ✓
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400">—</span>
                  )}
                </Cell>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-[min(780px,100%)] md:min-w-[780px]">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div
          className="grid text-[11px] h-[var(--line-gantt-header-h)] items-stretch box-border overflow-x-clip bg-slate-50/70"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {selectCol && (
            <div className="relative h-full min-h-0 px-1 flex items-center justify-center border-r border-slate-200 bg-slate-50/80">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() => onToggleSelectAllVisible?.()}
                title="Selecionar todos os itens visíveis"
                className="h-3.5 w-3.5 accent-slate-700 cursor-pointer"
              />
            </div>
          )}
          <HeaderCell
            onClick={() => toggleSort("order_number")}
            sortIndex={getSortIndex("order_number")}
            onResizeStart={(e) => handleResizeStart(0 + colOff, e)}
          >
            Pedido
          </HeaderCell>
          <HeaderCell
            onClick={() => toggleSort("client_name")}
            sortIndex={getSortIndex("client_name")}
            onResizeStart={(e) => handleResizeStart(1 + colOff, e)}
          >
            Cliente
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onResizeStart={(e) => handleResizeStart(2 + colOff, e)}
          >
            Cód.
          </HeaderCell>
          <HeaderCell
            onClick={() => toggleSort("description")}
            sortIndex={getSortIndex("description")}
            onResizeStart={(e) => handleResizeStart(3 + colOff, e)}
          >
            Descrição
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onClick={() => toggleSort("quantity")}
            sortIndex={getSortIndex("quantity")}
            onResizeStart={(e) => handleResizeStart(4 + colOff, e)}
          >
            Qtd
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onClick={() => toggleSort("delivery_deadline")}
            sortIndex={getSortIndex("delivery_deadline")}
            onResizeStart={(e) => handleResizeStart(5 + colOff, e)}
          >
            Prazo PCP
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onResizeStart={(e) => handleResizeStart(6 + colOff, e)}
          >
            PC entrega
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onClick={() => toggleSort("production_start")}
            sortIndex={getSortIndex("production_start")}
            onResizeStart={(e) => handleResizeStart(7 + colOff, e)}
          >
            Início Prod.
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onClick={() => toggleSort("production_end")}
            sortIndex={getSortIndex("production_end")}
            onResizeStart={(e) => handleResizeStart(8 + colOff, e)}
          >
            Fim Prod.
          </HeaderCell>
          <HeaderCell onResizeStart={(e) => handleResizeStart(9 + colOff, e)}>
            Obs.
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onResizeStart={(e) => handleResizeStart(10 + colOff, e)}
          >
            Ocorrências
          </HeaderCell>
          <HeaderCell
            className="text-center px-0.5"
            onResizeStart={(e) => handleResizeStart(11 + colOff, e)}
          >
            ✓
          </HeaderCell>
        </div>
      </div>

      <div>
        {items.map((item, idx) => {
          const pcpDeadline = item.pcp_deadline ?? item.order.pcp_deadline ?? item.order.delivery_deadline;
          const pcpDisplay =
            pcpDeadline && formatShortDate(safeParse(pcpDeadline));

          const willDelay =
            item.production_end &&
            pcpDeadline &&
            item.production_end > pcpDeadline &&
            item.status !== "completed";

          const dayPcp = pcpDeadline ? toDateOnly(pcpDeadline) : null;
          const pcArrival = itemPcArrivalForProduction(
            item.po_expected_delivery,
            item.po_follow_up_date,
            item.pc_delivery_date
          );
          const dayPc = pcArrival ? toDateOnly(pcArrival) : null;
          const dayStart = item.production_start ? toDateOnly(item.production_start) : null;
          const dayEnd = item.production_end ? toDateOnly(item.production_end) : null;
          const allLineDatesEqualAttention =
            !!dayPcp &&
            !!dayPc &&
            !!dayStart &&
            !!dayEnd &&
            dayPcp === dayPc &&
            dayPc === dayStart &&
            dayStart === dayEnd;

          const rowBg = willDelay
            ? "bg-red-50"
            : allLineDatesEqualAttention
              ? "bg-amber-50"
              : idx % 2 === 0
                ? "bg-white"
                : "bg-slate-50";

          return (
            <div
              key={item.id}
              className={`grid text-[11px] items-center border-b border-slate-200 h-[var(--line-gantt-row-h)] gap-x-0 box-border overflow-x-clip overflow-y-visible ${rowBg}`}
              style={{ gridTemplateColumns: gridTemplate }}
              title={
                allLineDatesEqualAttention
                  ? "Atenção: Prazo PCP, PC entrega, início e fim de produção na mesma data."
                  : undefined
              }
            >
              {selectCol && (
                <Cell className="flex items-center justify-center px-0">
                  <input
                    type="checkbox"
                    checked={sel.has(item.id)}
                    onChange={() => onToggleItemSelected?.(item.id)}
                    className="h-3.5 w-3.5 accent-slate-700 cursor-pointer"
                    aria-label="Selecionar item"
                  />
                </Cell>
              )}
              <Cell className="font-medium text-slate-800 flex items-center">
                {item.order.order_number}
              </Cell>
              <Cell title={item.order.client_name} className="flex items-center min-w-0">
                <span className="truncate block">
                  {item.order.client_name}
                </span>
              </Cell>
              <Cell
                title={(item.product_code ?? "").trim() || undefined}
                className="text-center flex justify-center items-center font-mono text-[10px] min-w-0"
              >
                <span className="truncate block">
                  {(item.product_code ?? "").trim() || "—"}
                </span>
              </Cell>
              <Cell title={item.description} className="flex items-center min-w-0">
                <span className="truncate block">{item.description}</span>
              </Cell>
              <Cell className="text-center flex justify-center items-center">
                {item.quantity}
              </Cell>
              <Cell className={`text-center flex justify-center items-center ${willDelay ? "text-red-700 font-semibold" : ""}`}>
                {pcpDisplay ?? "--"}
              </Cell>
              <Cell
                className="text-center flex justify-center items-center text-[10px] min-w-0"
                title={
                  item.pc_number
                    ? `PC ${item.pc_number} — entrega (max. previsão/follow-up ou PV)`
                    : undefined
                }
              >
                {pcArrival ? formatShortDate(safeParse(pcArrival)) : "--"}
              </Cell>
              <Cell className="flex items-stretch p-0 h-full min-h-0 !overflow-visible z-[1]">
                <CompactDateCell
                  value={item.production_start}
                  min={pcArrival}
                  onChange={(val) =>
                    onChangeDate(item.id, "production_start", val)
                  }
                />
              </Cell>
              <Cell
                className={`flex items-stretch p-0 h-full min-h-0 !overflow-visible z-[1] ${willDelay ? "[&_input]:text-red-700 [&_input]:font-semibold" : ""}`}
              >
                <CompactDateCell
                  value={item.production_end}
                  min={maxDateStr(item.production_start, pcArrival)}
                  onChange={(val) =>
                    onChangeDate(item.id, "production_end", val)
                  }
                />
              </Cell>
              <Cell className="flex flex-col gap-1 py-1 h-full min-h-0 justify-center min-w-0">
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 text-[10px] h-[26px] box-border shrink-0"
                  value={item.notes ?? ""}
                  onChange={(e) => onChangeNotes(item.id, e.target.value)}
                  placeholder="Observações..."
                />
              </Cell>
              <Cell className="!overflow-visible px-1 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 py-1 min-h-0 isolate z-[25] [@media(max-width:480px)]:justify-center [@media(max-width:480px)]:max-w-full">
                {cqContext ? (
                  <div
                    className="flex flex-row items-center justify-center gap-2 sm:gap-1 shrink-0 w-full max-w-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CQField
                      targetType="order_item"
                      targetId={item.id}
                      userRole={profile.role}
                      userId={cqContext.userId}
                      companyId={cqContext.companyId}
                      variant="icon"
                      comfortableTouch
                    />
                    <CQList
                      targetType="order_item"
                      targetId={item.id}
                      companyId={cqContext.companyId}
                      userId={cqContext.userId}
                      userRole={profile.role}
                      comfortableTouch
                    />
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-300">—</span>
                )}
              </Cell>
              <Cell className="text-center px-0.5 flex items-center justify-center z-[10]">
                {item.status === "completed" && canReopenCompleted ? (
                  <button
                    type="button"
                    onClick={() => onReopenCompleted!(item.id)}
                    className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded border border-amber-400 bg-amber-50 px-0.5 text-[10px] font-semibold leading-none text-amber-900 hover:bg-amber-100 touch-manipulation"
                    title="Reabrir item (desfazer conclusão)"
                  >
                    ↺
                  </button>
                ) : item.status !== "completed" ? (
                  <button
                    type="button"
                    onClick={() => handleComplete(item.id)}
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] leading-none touch-manipulation ${
                      willDelay
                        ? "border-red-300 text-red-700 hover:bg-red-100"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    }`}
                    title={
                      willDelay
                        ? "Vai atrasar - Marcar como concluído"
                        : "Marcar como concluído"
                    }
                  >
                    ✓
                  </button>
                ) : (
                  <span
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[10px] text-emerald-700"
                    title="Concluído"
                  >
                    ✓
                  </span>
                )}
              </Cell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeaderCell({
  children,
  className = "",
  sortIndex,
  onClick,
  onResizeStart,
}: {
  children: React.ReactNode;
  className?: string;
  sortIndex?: number | null;
  onClick?: () => void;
  onResizeStart?: (e: React.MouseEvent) => void;
}) {
  const isCentered = className.includes("text-center");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-full min-h-0 px-1.5 sm:px-2 py-0 border-r border-slate-200 bg-slate-50/80 flex items-center gap-0 box-border ${
        onClick ? "cursor-pointer hover:bg-slate-100/90" : ""
      } ${className}`}
    >
      <span
        className={`flex-1 flex items-center gap-1.5 min-w-0 ${
          isCentered ? "justify-center" : ""
        }`}
      >
        <span className="text-[11px] font-semibold text-slate-700 tracking-tight leading-snug select-none truncate">
          {children}
        </span>
        {sortIndex != null && sortIndex > 0 ? (
          <span
            className="inline-flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white px-0.5 text-[8px] font-bold text-slate-700 shadow-sm"
            title={`Prioridade de ordenação ${sortIndex}`}
          >
            {sortIndex}
          </span>
        ) : null}
      </span>
      {onResizeStart && (
        <span
          onMouseDown={onResizeStart}
          className="h-full w-1.5 shrink-0 cursor-col-resize hover:bg-slate-300"
        />
      )}
    </button>
  );
}

function Cell({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`h-full min-h-0 min-w-0 px-2 py-0 border-r border-slate-200 overflow-hidden box-border ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}


