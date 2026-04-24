import { formatShortDate, parseLocalDate } from "@/lib/utils/date";

export type DelayedOrderSidebarItem = {
  id: string;
  order_number: string;
  client_name: string | null;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
};

function calendarDaysOverdue(
  delivery: string | null,
  pcp: string | null
): number | null {
  const raw = delivery || pcp;
  if (!raw) return null;
  const end = raw.includes("-")
    ? parseLocalDate(raw)
    : (() => {
        const t = new Date(raw);
        return isNaN(t.getTime()) ? null : t;
      })();
  if (!end) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.floor((today.getTime() - end.getTime()) / 86_400_000)
  );
}

function delayBadgeClass(days: number) {
  if (days >= 16) {
    return "bg-red-100 text-red-800 border border-red-200";
  }
  if (days >= 8) {
    return "bg-orange-100 text-orange-800 border border-orange-200";
  }
  return "bg-amber-100 text-amber-800 border border-amber-200";
}

export function DelayedOrdersSidebar({
  items,
}: {
  items: DelayedOrderSidebarItem[];
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 max-h-[640px] overflow-y-auto">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        Pedidos em Atraso ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum pedido em atraso.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((order) => {
            const raw = order.delivery_deadline || order.pcp_deadline;
            const deadlineLabel = formatShortDate(raw);
            const daysLate = calendarDaysOverdue(
              order.delivery_deadline,
              order.pcp_deadline
            );
            return (
              <li
                key={order.id}
                className="flex items-start justify-between gap-2 p-2 rounded bg-slate-50 border border-slate-100"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-slate-800">
                    {order.order_number}
                  </span>
                  <p className="text-xs text-slate-500 truncate max-w-[180px]">
                    {order.client_name}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-slate-600 font-medium tabular-nums whitespace-nowrap">
                    {deadlineLabel}
                  </span>
                  {daysLate != null && (
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${delayBadgeClass(
                        daysLate
                      )}`}
                    >
                      {daysLate}{" "}
                      {daysLate === 1 ? "dia" : "dias"} em atraso
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
