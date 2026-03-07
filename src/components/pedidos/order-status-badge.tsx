import type { OrderStatus, ItemStatus } from "@/lib/types/database";
import { parseLocalDate } from "@/lib/utils/date";

const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  imported: "bg-gray-100 text-gray-700",
  planning: "bg-blue-100 text-blue-700",
  in_production: "bg-green-100 text-green-700",
  ready: "bg-yellow-100 text-yellow-700",
  finished: "bg-emerald-100 text-emerald-700",
  delayed: "bg-red-100 text-red-700",
};

const ITEM_STATUS_COLORS: Record<ItemStatus | "scheduled_future" | "will_delay", string> = {
  waiting: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  delayed: "bg-red-100 text-red-700",
  scheduled_future: "bg-blue-50 text-blue-700",
  will_delay: "bg-red-100 text-red-700",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ORDER_STATUS_COLORS[status]}`}
    >
      {status === "imported" && "Importado"}
      {status === "planning" && "Em Programação"}
      {status === "in_production" && "Em Produção"}
      {status === "ready" && "Pronto para Finalizar"}
      {status === "finished" && "Finalizado"}
      {status === "delayed" && "Atrasado"}
    </span>
  );
}

interface ItemStatusBadgeProps {
  status: ItemStatus;
  productionStart?: string | null;
  productionEnd?: string | null;
  pcpDeadline?: string | null;
}

export function ItemStatusBadge({
  status,
  productionStart,
  productionEnd,
  pcpDeadline,
}: ItemStatusBadgeProps) {
  let label = "";
  let colorKey: ItemStatus | "scheduled_future" | "will_delay" = status;

  if (status === "completed") {
    label = "Finalizado";
  } else if (status === "delayed") {
    let end: Date | null = null;
    if (productionEnd) {
      end = productionEnd.includes("-")
        ? parseLocalDate(productionEnd)
        : new Date(productionEnd);
      if (isNaN(end.getTime())) end = null;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (end) end.setHours(0, 0, 0, 0);
    if (end && today <= end) {
      label = "Produzindo";
      colorKey = "scheduled";
    } else {
      label = "Atrasado";
      colorKey = "delayed";
    }
  } else {
    if (!productionStart) {
      label = "Aguardando produção";
      colorKey = "waiting";
    } else {
      const today = new Date();
      const start = productionStart.includes("-")
        ? parseLocalDate(productionStart)
        : new Date(productionStart);
      const end = productionEnd
        ? productionEnd.includes("-")
          ? parseLocalDate(productionEnd)
          : new Date(productionEnd)
        : null;

      today.setHours(0, 0, 0, 0);
      start.setHours(0, 0, 0, 0);
      if (end) end.setHours(0, 0, 0, 0);

      if (today < start) {
        label = "Programado";
        colorKey = "scheduled_future";
      } else if (!end || today <= end) {
        label = "Produzindo";
        colorKey = "scheduled";
      } else {
        label = "Atrasado";
        colorKey = "delayed";
      }
    }
  }

  if (
    status !== "completed" &&
    productionEnd &&
    pcpDeadline &&
    productionEnd > pcpDeadline
  ) {
    label = "Vai atrasar";
    colorKey = "will_delay";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ITEM_STATUS_COLORS[colorKey]}`}
    >
      {label ||
        (status === "waiting" && "Aguardando produção") ||
        (status === "scheduled" && "Produzindo") ||
        (status === "completed" && "Finalizado") ||
        (status === "delayed" && "Atrasado")}
    </span>
  );
}

