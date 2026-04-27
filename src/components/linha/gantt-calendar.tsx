import { useMemo } from "react";
import {
  addDays,
  eachDayOfInterval,
  format,
  getDay,
  isSameDay,
  isToday,
  isWeekend,
  subDays,
} from "date-fns";
import type { Holiday, OrderItem } from "@/lib/types/database";
import { GanttBar } from "./gantt-bar";

export interface GanttDay {
  date: Date;
  label: string;
  dayOfWeek: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isToday: boolean;
}

export interface LineItemWithOrder extends OrderItem {
  order: {
    id: string;
    order_number: string;
    client_name: string;
    delivery_deadline: string | null;
    pcp_deadline: string | null;
  };
  /** Preenchido na carga: datas do `purchase_orders` vinculado (Compras). */
  po_expected_delivery?: string | null;
  po_follow_up_date?: string | null;
}

function generateDays(startDate: Date, numDays: number, holidays: Holiday[]): GanttDay[] {
  const endDate = addDays(startDate, numDays);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekAbbr = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return days.map((date) => ({
    date,
    label: format(date, "d/M/yy"),
    dayOfWeek: weekAbbr[getDay(date)],
    isWeekend: isWeekend(date),
    isHoliday: holidays.some((h) => {
      const hDate = new Date(h.date);
      if (h.is_recurring) {
        return (
          hDate.getMonth() === date.getMonth() &&
          hDate.getDate() === date.getDate()
        );
      }
      return isSameDay(hDate, date);
    }),
    holidayName: holidays.find((h) => isSameDay(new Date(h.date), date))
      ?.description,
    isToday: isToday(date),
  }));
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getDayBackground(day: GanttDay): string {
  if (day.isToday) return "bg-yellow-200 border-yellow-400 border-x";
  if (day.isHoliday) return "bg-blue-50";
  if (day.isWeekend) return "bg-gray-100";
  return "bg-white";
}

/** Coluna por dia: largura para data (linha 1) + dia da semana (linha 2) sem encavalamento */
const GANTT_CELL =
  "w-10 min-w-[40px] max-w-[40px] shrink-0 box-border";

interface GanttCalendarProps {
  items: LineItemWithOrder[];
  holidays: Holiday[];
}

export function GanttCalendar({ items, holidays }: GanttCalendarProps) {
  /** Recalcula só quando feriados mudam — evita recriar ~91 colunas a cada render da página. */
  const days = useMemo(() => {
    const today = new Date();
    const startDate = subDays(today, 2);
    return generateDays(startDate, 90, holidays);
  }, [holidays]);

  /** Alturas fixas iguais ao LineTable (--line-gantt-header-h / --line-gantt-row-h). */
  return (
    <div className="min-w-max">
      <div className="sticky top-0 z-10 bg-slate-50/70 border-b border-slate-200 box-border">
        <div className="flex h-[var(--line-gantt-header-h)] box-border bg-slate-50/70">
          {days.map((day) => (
            <div
              key={day.date.toISOString()}
              className={`${GANTT_CELL} h-full flex items-center justify-center px-1 border-r border-slate-200 box-border ${getDayBackground(
                day
              )}`}
              title={`${day.label} — ${day.dayOfWeek}${day.holidayName ? ` — ${day.holidayName}` : ""}`}
            >
              <div className="flex flex-col items-center justify-center gap-0.5 w-full min-w-0">
                <span className="text-[10px] font-semibold text-slate-900 tabular-nums leading-none tracking-tight">
                  {day.label}
                </span>
                <span className="text-[8px] font-medium text-slate-500 uppercase tracking-widest leading-none">
                  {day.dayOfWeek}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        {items.map((item) => {
          const prodStart = item.production_start
            ? parseLocalDate(item.production_start)
            : null;
          const prodEnd = item.production_end
            ? parseLocalDate(item.production_end)
            : null;
          const cellsWithBar =
            prodStart && prodEnd
              ? days.filter(
                  (d) => d.date >= prodStart && d.date <= prodEnd
                )
              : [];
          const firstBarTime = cellsWithBar[0]?.date.getTime();
          const lastBarTime =
            cellsWithBar[cellsWithBar.length - 1]?.date.getTime();

          return (
            <div
              key={item.id}
              className="flex h-[var(--line-gantt-row-h)] box-border border-b border-slate-200 overflow-hidden"
            >
              {days.map((day, idx) => {
                const t = day.date.getTime();
                const isFirst =
                  cellsWithBar.length > 0 && firstBarTime === t;
                const isLast =
                  cellsWithBar.length > 0 && lastBarTime === t;

                return (
                  <div
                    key={day.date.toISOString() + "-" + idx}
                    className={`${GANTT_CELL} h-full flex items-center justify-center border-r border-slate-200 box-border ${getDayBackground(
                      day
                    )}`}
                  >
                    <GanttBar
                      day={day}
                      productionStart={item.production_start}
                      productionEnd={item.production_end}
                      status={item.status}
                      isFirst={isFirst}
                      isLast={isLast}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

