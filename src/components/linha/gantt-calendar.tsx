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
}

function generateDays(startDate: Date, numDays: number, holidays: Holiday[]): GanttDay[] {
  const endDate = addDays(startDate, numDays);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekAbbr = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return days.map((date) => ({
    date,
    label: format(date, "d/M"),
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

/** Coluna por dia: mais estreita que o w-10 original (40px); fonte menor = mais dias na tela */
const GANTT_CELL =
  "w-7 min-w-[28px] max-w-[28px] shrink-0 box-border";

interface GanttCalendarProps {
  items: LineItemWithOrder[];
  holidays: Holiday[];
}

export function GanttCalendar({ items, holidays }: GanttCalendarProps) {
  const today = new Date();
  const startDate = subDays(today, 2);
  /** Mais dias no horizonte (antes 60); células mais finas cabem mais na tela */
  const days = generateDays(startDate, 90, holidays);

  /** Cabeçalho h-[42px] alinhado ao LineTable; linhas h-10 alinhadas às linhas da tabela. */
  return (
    <div className="min-w-max">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 box-border">
        <div className="flex">
          {days.map((day) => (
            <div
              key={day.date.toISOString()}
              className={`${GANTT_CELL} h-[42px] flex flex-col items-center justify-center gap-0.5 border-r border-slate-200 box-border leading-none ${getDayBackground(
                day
              )}`}
            >
              <span className="text-[8px] font-medium tracking-tight">
                {day.label}
              </span>
              <span className="text-[7px] text-slate-600">{day.dayOfWeek}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        {items.map((item) => (
          <div key={item.id} className="flex h-10 min-h-[40px] border-b border-slate-200 box-border">
            {days.map((day, idx) => {
              const cellsWithBar = days.filter((d) => {
                const start = item.production_start
                  ? parseLocalDate(item.production_start)
                  : null;
                const end = item.production_end
                  ? parseLocalDate(item.production_end)
                  : null;
                return !!start && !!end && d.date >= start && d.date <= end;
              });
              const isFirst =
                cellsWithBar.length > 0 &&
                cellsWithBar[0].date.getTime() === day.date.getTime();
              const isLast =
                cellsWithBar.length > 0 &&
                cellsWithBar[cellsWithBar.length - 1].date.getTime() ===
                  day.date.getTime();

              return (
                <div
                  key={day.date.toISOString() + "-" + idx}
                  className={`${GANTT_CELL} h-10 min-h-[40px] flex items-center justify-center border-r border-slate-200 self-stretch ${getDayBackground(
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
        ))}
      </div>
    </div>
  );
}

