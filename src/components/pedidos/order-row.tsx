import { useState } from "react";
import type { OrderWithItems, ProductionLine, UserRole } from "@/lib/types/database";
import { formatShortDate } from "@/lib/utils/date";
import { CompactDateCell } from "@/components/ui/compact-date-cell";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderItems } from "./order-items";
import { hasPermission } from "@/lib/utils/permissions";
import {
  areAllOrderDeadlinesSameDay,
  effectiveOrderProductionDeadline,
  getOrderDeadlineTrafficLight,
  getOrderPrincipalStatus,
} from "@/lib/utils/order-aggregates";

export interface OrderRowProps {
  order: OrderWithItems;
  lines: ProductionLine[];
  userRole: UserRole;
  onUpdateOrderPcpDate: (orderId: string, date: string | null) => void;
  onUpdateItemLine: (itemId: string, lineId: string | null) => void;
  onUpdateItemQuantity: (itemId: string, quantity: number) => void;
  onUpdateItemPc: (
    itemId: string,
    data: { pc_number: string | null; pc_delivery_date: string | null }
  ) => void;
  onUpdateOrder: (
    orderId: string,
    data: { order_number?: string; client_name?: string; delivery_deadline?: string | null }
  ) => void;
  onDeleteOrder: (orderId: string) => void;
  onFinishOrder: (orderId: string) => void;
  showSelect?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function OrderRow({
  order,
  lines,
  userRole,
  onUpdateOrderPcpDate,
  onUpdateItemLine,
  onUpdateItemQuantity,
  onUpdateItemPc,
  onUpdateOrder,
  onDeleteOrder,
  onFinishOrder,
  showSelect,
  selected,
  onToggleSelect,
}: OrderRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNumber, setEditNumber] = useState(order.order_number);
  const [editClient, setEditClient] = useState(order.client_name);
  const [editDelivery, setEditDelivery] = useState(order.delivery_deadline ?? "");

  const allItemsCompleted =
    order.items.length > 0 &&
    order.items.every((item) => item.status === "completed");
  const canFinish = hasPermission(userRole, "finishOrders") && allItemsCompleted;
  const canEdit = hasPermission(userRole, "viewOrders");

  const principalStatus = getOrderPrincipalStatus(order);
  const displayProductionDeadline = effectiveOrderProductionDeadline(order);
  const traffic = getOrderDeadlineTrafficLight(order);
  const sameDayAllDeadlines = areAllOrderDeadlinesSameDay(order);
  const rowTrafficClass =
    traffic === "red"
      ? "bg-red-50"
      : traffic === "yellow"
        ? "bg-amber-50"
        : traffic === "green"
          ? "bg-emerald-50"
          : "bg-white";

  function openEditModal() {
    setEditNumber(order.order_number);
    setEditClient(order.client_name);
    setEditDelivery(order.delivery_deadline ?? "");
    setShowEditModal(true);
  }

  function submitEdit() {
    onUpdateOrder(order.id, {
      order_number: editNumber.trim() || order.order_number,
      client_name: editClient.trim() || order.client_name,
      delivery_deadline: editDelivery || null,
    });
    setShowEditModal(false);
  }

  function handleDelete() {
    if (window.confirm("Excluir este pedido? Esta ação não pode ser desfeita.")) {
      onDeleteOrder(order.id);
    }
  }

  return (
    <>
      <div
        className={`grid gap-2 px-3 sm:px-4 py-1.5 border-b border-slate-200 text-xs items-center transition-colors ${
          showSelect
            ? "grid-cols-[28px_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,0.95fr)_28px_minmax(0,1.5fr)_minmax(0,1.2fr)]"
            : "grid-cols-[28px_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,0.95fr)_minmax(0,1.5fr)_minmax(0,1.2fr)]"
        } ${rowTrafficClass}`}
        title={
          traffic === "white"
            ? undefined
            : sameDayAllDeadlines
              ? "Atenção: prazo de vendas, PCP e produção na mesma data."
              : traffic === "red"
                ? "Alerta: PCP após vendas ou produção após vendas."
                : traffic === "yellow"
                  ? "Atenção: produção após o PCP e até a data de vendas (inclui término no limite)."
                  : "OK: produção até o PCP, antes de vendas."
        }
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-slate-500 hover:text-slate-800"
        >
          {expanded ? "▼" : "▶"}
        </button>
        <div className="font-medium text-slate-800">{order.order_number}</div>
        <div className="truncate">{order.client_name}</div>
        <div className="text-center text-slate-600">
          {formatShortDate(order.created_at)}
        </div>
        <div className="text-center">
          {formatShortDate(order.delivery_deadline)}
        </div>
        <div className="flex items-stretch w-full min-h-[28px]">
          <CompactDateCell
            value={order.pcp_deadline}
            onChange={(val) => onUpdateOrderPcpDate(order.id, val)}
          />
        </div>
        <div className="text-center">{formatShortDate(displayProductionDeadline)}</div>
        {showSelect && (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 accent-slate-700 cursor-pointer"
              aria-label="Selecionar pedido"
            />
          </div>
        )}
        <div className="col-span-2 flex flex-nowrap items-center justify-end gap-1">
          {principalStatus === "atrasado" && (
            <span className="inline-flex items-center shrink-0 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
              Atrasado
            </span>
          )}
          {principalStatus === "vai_atrasar" && (
            <span className="inline-flex items-center shrink-0 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
              Vai atrasar
            </span>
          )}
          {principalStatus === "falta_linha" && (
            <span className="inline-flex items-center shrink-0 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
              Falta escolher linha
            </span>
          )}
          {principalStatus === "aguardando_programacao" && (
            <span className="inline-flex items-center shrink-0 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
              Aguardando programação
            </span>
          )}
          {principalStatus === "programado" && (
            <span className="inline-flex items-center shrink-0 rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
              Programado
            </span>
          )}
          {principalStatus === "produzindo" && (
            <span className="inline-flex items-center shrink-0 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
              Produzindo
            </span>
          )}
          {principalStatus === "finalizado" && (
            <span className="inline-flex items-center shrink-0 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
              Finalizado
            </span>
          )}
          {!principalStatus && (
            <span className="shrink-0">
              <OrderStatusBadge status={order.status} />
            </span>
          )}
          {canFinish && (
            <button
              onClick={() => onFinishOrder(order.id)}
              className="shrink-0 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100 whitespace-nowrap"
            >
              Finalizar pedido
            </button>
          )}
          {canEdit && (
            <>
              <button
                onClick={openEditModal}
                className="shrink-0 rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                Editar
              </button>
              <button
                onClick={handleDelete}
                className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-100 whitespace-nowrap"
              >
                Excluir
              </button>
            </>
          )}
        </div>
      </div>

      {showEditModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3 text-sm">
            <h3 className="text-sm font-semibold text-slate-800">Editar pedido</h3>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-slate-700">Nº do Pedido</label>
              <input
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                value={editNumber}
                onChange={(e) => setEditNumber(e.target.value)}
              />
              <label className="text-xs font-medium text-slate-700">Cliente</label>
              <input
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                value={editClient}
                onChange={(e) => setEditClient(e.target.value)}
              />
              <label className="text-xs font-medium text-slate-700">Prazo de Entrega (Vendas)</label>
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                value={editDelivery}
                onChange={(e) => setEditDelivery(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs"
                onClick={() => setShowEditModal(false)}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1.5 rounded-md bg-[#1B4F72] text-white text-xs"
                onClick={submitEdit}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <OrderItems
          items={order.items}
          lines={lines}
          orderPcpDeadline={order.pcp_deadline}
          onChangeLine={onUpdateItemLine}
          onChangeQuantity={onUpdateItemQuantity}
          onUpdateItemPc={onUpdateItemPc}
        />
      )}
    </>
  );
}

