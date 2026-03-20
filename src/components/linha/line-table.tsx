import { format } from "date-fns";
import { CompactDateCell } from "@/components/ui/compact-date-cell";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LineItemWithOrder } from "./gantt-calendar";
import type { Profile, ProductionLine } from "@/lib/types/database";
import { parseLocalDate } from "@/lib/utils/date";
import { toDateOnly } from "@/lib/utils/supabase-data";

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
  isAlmoxarifado?: boolean;
  allLines?: ProductionLine[];
  onSupply?: (itemId: string) => void;
}

export function LineTable({
  items,
  profile,
  sortKeys,
  onChangeSort,
  onChangeDate,
  onChangeNotes,
  onComplete,
  isAlmoxarifado,
  allLines,
  onSupply,
}: LineTableProps) {
  /**
   * Início/Fim precisam de ~104–116px: o seletor de data usa área mínima ~96px;
   * valores menores encavalam colunas e o clique só pega no canto.
   */
  const defaultWidths = isAlmoxarifado
    ? [60, 140, 200, 55, 110, 90, 80]
    : [54, 118, 158, 42, 76, 76, 116, 116, 40, 96];

  const [columnWidths, setColumnWidths] = useState<number[]>(defaultWidths);
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
        ? [44, 72, 96, 36, 72, 64, 56]
        : [44, 72, 96, 36, 56, 56, 100, 100, 32, 64],
    [isAlmoxarifado]
  );

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
  }, [columnWidths, columnMinWidths]);
  function toggleSort(key: LineSortKey) {
    onChangeSort(getNextSortKeys(sortKeys, key));
  }

  function getSortIndex(key: LineSortKey): number | null {
    const idx = sortKeys.indexOf(key);
    return idx >= 0 && idx < 3 ? idx + 1 : null;
  }

  function handleComplete(itemId: string) {
    if (!window.confirm("Marcar item como concluído?")) return;
    onComplete(itemId);
  }

  const linesMap = new Map((allLines ?? []).map((l) => [l.id, l.name]));

  if (isAlmoxarifado) {
    return (
      <div className="min-w-[640px]">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
          <div
            className="grid text-[11px] h-[var(--line-gantt-header-h)] items-stretch box-border overflow-hidden bg-slate-50/70"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <HeaderCell
              onClick={() => toggleSort("order_number")}
              sortIndex={getSortIndex("order_number")}
              onResizeStart={(e) => handleResizeStart(0, e)}
            >
              Pedido
            </HeaderCell>
            <HeaderCell
              onClick={() => toggleSort("client_name")}
              sortIndex={getSortIndex("client_name")}
              onResizeStart={(e) => handleResizeStart(1, e)}
            >
              Cliente
            </HeaderCell>
            <HeaderCell
              onClick={() => toggleSort("description")}
              sortIndex={getSortIndex("description")}
              onResizeStart={(e) => handleResizeStart(2, e)}
            >
              Descrição
            </HeaderCell>
            <HeaderCell
              className="text-center"
              onClick={() => toggleSort("quantity")}
              sortIndex={getSortIndex("quantity")}
              onResizeStart={(e) => handleResizeStart(3, e)}
            >
              Qtd
            </HeaderCell>
            <HeaderCell
              onResizeStart={(e) => handleResizeStart(4, e)}
            >
              Linha
            </HeaderCell>
            <HeaderCell
              className="text-center"
              onClick={() => toggleSort("production_start")}
              sortIndex={getSortIndex("production_start")}
              onResizeStart={(e) => handleResizeStart(5, e)}
            >
              Início Prod.
            </HeaderCell>
            <HeaderCell
              className="text-center"
              onResizeStart={(e) => handleResizeStart(6, e)}
            >
              Abastecido
            </HeaderCell>
          </div>
        </div>

        <div>
          {items.map((item, idx) => {
            const lineName = item.line_id ? linesMap.get(item.line_id) ?? "--" : "--";
            const isSupplied = !!item.supplied_at;

            return (
              <div
                key={item.id}
                className={`grid text-[11px] items-center border-b border-slate-200 h-[var(--line-gantt-row-h)] gap-x-0 box-border overflow-hidden ${
                  idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                }`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <Cell className="font-medium text-slate-800 flex items-center">
                  {item.order.order_number}
                </Cell>
                <Cell title={item.order.client_name} className="flex items-center min-w-0">
                  <span className="truncate block">{item.order.client_name}</span>
                </Cell>
                <Cell title={item.description} className="flex items-center min-w-0">
                  <span className="truncate block">{item.description}</span>
                </Cell>
                <Cell className="text-center flex justify-center items-center">
                  {item.quantity}
                </Cell>
                <Cell title={lineName} className="flex items-center min-w-0">
                  <span className="truncate block text-slate-600">{lineName}</span>
                </Cell>
                <Cell className="text-center flex justify-center items-center">
                  {item.production_start
                    ? format(safeParse(item.production_start), "d/M/yy")
                    : "--"}
                </Cell>
                <Cell className="text-center flex justify-center items-center">
                  {isSupplied ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-medium">
                      OK
                    </span>
                  ) : (
                    <button
                      onClick={() => onSupply?.(item.id)}
                      className="inline-flex h-6 px-2 items-center justify-center rounded border border-blue-300 text-[10px] font-medium text-blue-700 hover:bg-blue-50"
                      title="Marcar como abastecido"
                    >
                      Abastecer
                    </button>
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
    <div className="min-w-[720px]">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div
          className="grid text-[11px] h-[var(--line-gantt-header-h)] items-stretch box-border overflow-x-clip bg-slate-50/70"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <HeaderCell
            onClick={() => toggleSort("order_number")}
            sortIndex={getSortIndex("order_number")}
            onResizeStart={(e) => handleResizeStart(0, e)}
          >
            Pedido
          </HeaderCell>
          <HeaderCell
            onClick={() => toggleSort("client_name")}
            sortIndex={getSortIndex("client_name")}
            onResizeStart={(e) => handleResizeStart(1, e)}
          >
            Cliente
          </HeaderCell>
          <HeaderCell
            onClick={() => toggleSort("description")}
            sortIndex={getSortIndex("description")}
            onResizeStart={(e) => handleResizeStart(2, e)}
          >
            Descrição
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onClick={() => toggleSort("quantity")}
            sortIndex={getSortIndex("quantity")}
            onResizeStart={(e) => handleResizeStart(3, e)}
          >
            Qtd
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onClick={() => toggleSort("delivery_deadline")}
            sortIndex={getSortIndex("delivery_deadline")}
            onResizeStart={(e) => handleResizeStart(4, e)}
          >
            Prazo PCP
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onResizeStart={(e) => handleResizeStart(5, e)}
          >
            PC entrega
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onClick={() => toggleSort("production_start")}
            sortIndex={getSortIndex("production_start")}
            onResizeStart={(e) => handleResizeStart(6, e)}
          >
            Início Prod.
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onClick={() => toggleSort("production_end")}
            sortIndex={getSortIndex("production_end")}
            onResizeStart={(e) => handleResizeStart(7, e)}
          >
            Fim Prod.
          </HeaderCell>
          <HeaderCell
            className="text-center"
            onResizeStart={(e) => handleResizeStart(8, e)}
          >
            ✓
          </HeaderCell>
          <HeaderCell onResizeStart={(e) => handleResizeStart(9, e)}>
            Obs.
          </HeaderCell>
        </div>
      </div>

      <div>
        {items.map((item, idx) => {
          const pcpDeadline = item.pcp_deadline ?? item.order.pcp_deadline ?? item.order.delivery_deadline;
          const pcpDisplay =
            pcpDeadline && format(safeParse(pcpDeadline), "d/M/yy");

          const willDelay =
            item.production_end &&
            pcpDeadline &&
            item.production_end > pcpDeadline &&
            item.status !== "completed";

          const dayPcp = pcpDeadline ? toDateOnly(pcpDeadline) : null;
          const dayPc = item.pc_delivery_date ? toDateOnly(item.pc_delivery_date) : null;
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
              <Cell className="font-medium text-slate-800 flex items-center">
                {item.order.order_number}
              </Cell>
              <Cell title={item.order.client_name} className="flex items-center min-w-0">
                <span className="truncate block">
                  {item.order.client_name}
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
                title={item.pc_number ? `PC ${item.pc_number}` : undefined}
              >
                {item.pc_delivery_date
                  ? format(safeParse(item.pc_delivery_date), "d/M/yy")
                  : "--"}
              </Cell>
              <Cell className="flex items-stretch p-0 h-full min-h-0 !overflow-visible z-[1]">
                <CompactDateCell
                  value={item.production_start}
                  min={item.pc_delivery_date}
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
                  min={maxDateStr(item.production_start, item.pc_delivery_date)}
                  onChange={(val) =>
                    onChangeDate(item.id, "production_end", val)
                  }
                />
              </Cell>
              <Cell className="text-center px-0.5 flex items-center justify-center">
                <button
                  onClick={() => handleComplete(item.id)}
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
                    willDelay
                      ? "border-red-300 text-red-700 hover:bg-red-100"
                      : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  }`}
                  title={willDelay ? "Vai atrasar - Marcar como concluído" : "Marcar como concluído"}
                >
                  ✓
                </button>
              </Cell>
              <Cell className="flex items-center py-0 h-full min-h-0">
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 text-[10px] h-[26px] box-border"
                  value={item.notes ?? ""}
                  onChange={(e) => onChangeNotes(item.id, e.target.value)}
                  placeholder="Observações..."
                />
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


