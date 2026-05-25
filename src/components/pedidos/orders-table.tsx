'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  OrderComercialThreadPatch,
  OrderWithItems,
  ProductionLine,
  UserRole,
} from "@/lib/types/database";
import { OrderRow } from "./order-row";
import { effectiveOrderProductionDeadline } from "@/lib/utils/order-aggregates";
import { hasPermission } from "@/lib/utils/permissions";

type SortKey =
  | "order_number"
  | "client_name"
  | "created_at"
  | "delivery_deadline"
  | "pcp_deadline"
  | "production_deadline";

interface OrdersTableProps {
  orders: OrderWithItems[];
  visibleOrders: OrderWithItems[];
  lines: ProductionLine[];
  userRole: UserRole;
  cqUserId?: string;
  cqCompanyId?: string | null;
  onUpdateOrderPcpDate: (orderId: string, date: string | null) => void;
  onUpdateItemLine: (itemId: string, lineId: string | null) => void;
  onUpdateItemQuantity: (itemId: string, quantity: number) => void;
  onUpdateItemProductCode?: (itemId: string, productCode: string) => void;
  onUpdateItemDescription?: (itemId: string, description: string) => void;
  onUpdateItemPc: (
    itemId: string,
    data: { pc_number: string | null; pc_delivery_date: string | null }
  ) => void;
  onUpdateOrder: (
    orderId: string,
    data: { order_number?: string; client_name?: string }
  ) => void;
  onDeleteOrder: (orderId: string) => void;
  onFinishOrder: (orderId: string) => void;
  onFinishOrdersBulk?: (orderIds: string[]) => void | Promise<void>;
  onReopenOrder?: (orderId: string) => void | Promise<void>;
  onReopenCompletedItem?: (itemId: string) => void | Promise<void>;
  onComercialObservationThreadUpdated?: (
    orderId: string,
    patch: OrderComercialThreadPatch
  ) => void;
}

export function OrdersTable({
  orders: _orders,
  visibleOrders,
  lines,
  userRole,
  cqUserId,
  cqCompanyId,
  onUpdateOrderPcpDate,
  onUpdateItemLine,
  onUpdateItemQuantity,
  onUpdateItemProductCode,
  onUpdateItemDescription,
  onUpdateItemPc,
  onUpdateOrder,
  onDeleteOrder,
  onFinishOrder,
  onFinishOrdersBulk,
  onReopenOrder,
  onReopenCompletedItem,
  onComercialObservationThreadUpdated,
}: OrdersTableProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const showBulk =
    hasPermission(userRole, "finishOrders") && !!onFinishOrdersBulk;
  const [sortKey, setSortKey] = useState<SortKey>("delivery_deadline");
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const filteredAndSorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    const listToSearch = visibleOrders;
    let list = listToSearch;
    if (query) {
      const statusLabels: Record<string, string> = {
        finished: "finalizado",
        imported: "importado",
        planning: "programação",
        in_production: "produção",
        ready: "pronto",
        delayed: "atrasado",
      };
      list = list.filter((o) => {
        if (o.order_number?.toLowerCase().includes(query)) return true;
        if (o.client_name?.toLowerCase().includes(query)) return true;
        if ((o.comercial_pcp_observation ?? "").toLowerCase().includes(query))
          return true;
        if (
          (o.pcp_reply_comercial_observation ?? "").toLowerCase().includes(query)
        )
          return true;
        if ((o.comercial_pcp_observation_by ?? "").toLowerCase().includes(query))
          return true;
        if (
          (o.pcp_reply_comercial_observation_by ?? "").toLowerCase().includes(query)
        )
          return true;
        const statusLabel = statusLabels[o.status ?? ""] ?? "";
        if (statusLabel && statusLabel.includes(query)) return true;
        const matchInItems = o.items?.some((it) =>
          it.description?.toLowerCase().includes(query)
        );
        if (matchInItems) return true;
        return false;
      });
    }
    return [...list].sort((a, b) => {
      let av: string = "";
      let bv: string = "";
      if (sortKey === "production_deadline") {
        av = effectiveOrderProductionDeadline(a) ?? "";
        bv = effectiveOrderProductionDeadline(b) ?? "";
      } else {
        av = String((a as unknown as Record<string, unknown>)[sortKey] ?? "");
        bv = String((b as unknown as Record<string, unknown>)[sortKey] ?? "");
      }
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [visibleOrders, search, sortKey, sortAsc]);

  const allVisibleSelected =
    filteredAndSorted.length > 0 &&
    filteredAndSorted.every((o) => selectedIds.has(o.id));
  const someSelected = filteredAndSorted.some((o) => selectedIds.has(o.id));

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someSelected && !allVisibleSelected;
  }, [someSelected, allVisibleSelected]);

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const ids = filteredAndSorted.map((o) => o.id);
    setSelectedIds((prev) => {
      const allSel = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allSel) return new Set();
      return new Set(ids);
    });
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-3 sm:px-4 py-2 border-b border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-800 shrink-0">Pedidos</h2>
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          className="w-full sm:w-64 sm:max-w-full min-h-[40px] rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
          placeholder="Buscar pedido, cliente, obs./resposta Comercial↔PCP ou item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showBulk && selectedIds.size > 0 && (
        <div className="px-3 sm:px-4 py-2 border-b border-amber-200 bg-amber-50 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-slate-800">
            {selectedIds.size} pedido(s) selecionado(s)
          </span>
          <button
            type="button"
            className="rounded-md border border-emerald-400 bg-emerald-50 px-2 py-1 text-emerald-800 hover:bg-emerald-100"
            onClick={async () => {
              await onFinishOrdersBulk?.([...selectedIds]);
              setSelectedIds(new Set());
            }}
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

      <div className="overflow-x-auto border-b border-slate-200">
        <div
          className={`grid gap-2 px-3 sm:px-4 py-2 min-h-[42px] items-center text-[11px] font-semibold text-slate-500 min-w-[820px] ${
            showBulk
              ? "grid-cols-[28px_minmax(0,0.82fr)_minmax(0,1.28fr)_minmax(0,0.88fr)_minmax(0,0.88fr)_minmax(0,1.02fr)_minmax(0,0.88fr)_28px_minmax(0,1.95fr)_4.75rem]"
              : "grid-cols-[28px_minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(0,0.92fr)_minmax(0,0.92fr)_minmax(0,1.06fr)_minmax(0,0.92fr)_minmax(0,2.1fr)_4.75rem]"
          }`}
        >
        <div />
        <HeaderCell active={sortKey === "order_number"} onClick={() => toggleSort("order_number")}>
          Nº Pedido
        </HeaderCell>
        <HeaderCell active={sortKey === "client_name"} onClick={() => toggleSort("client_name")}>
          Cliente
        </HeaderCell>
        <HeaderCell
          active={sortKey === "created_at"}
          onClick={() => toggleSort("created_at")}
        >
          Data Início
        </HeaderCell>
        <HeaderCell
          active={sortKey === "delivery_deadline"}
          onClick={() => toggleSort("delivery_deadline")}
        >
          Prazo Vendas
        </HeaderCell>
        <HeaderCell
          active={sortKey === "pcp_deadline"}
          onClick={() => toggleSort("pcp_deadline")}
        >
          Prazo PCP
        </HeaderCell>
        <HeaderCell
          active={sortKey === "production_deadline"}
          onClick={() => toggleSort("production_deadline")}
        >
          Prazo Produção
        </HeaderCell>
        {showBulk ? (
          <div className="flex items-center justify-center">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              title="Selecionar pedidos visíveis"
              className="h-3.5 w-3.5 accent-slate-700 cursor-pointer"
            />
          </div>
        ) : null}
        <div className="text-right flex items-center justify-end gap-1">Status</div>
        <div
          className="flex items-center justify-center text-[10px] font-semibold text-slate-500"
          title="Ocorrências (CQ)"
        >
          CQ
        </div>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="px-3 sm:px-4 py-6 text-center text-xs text-slate-500">
          Nenhum pedido encontrado.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {filteredAndSorted.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                lines={lines}
                userRole={userRole}
                onUpdateOrderPcpDate={onUpdateOrderPcpDate}
                onUpdateItemLine={onUpdateItemLine}
                onUpdateItemQuantity={onUpdateItemQuantity}
                onUpdateItemProductCode={onUpdateItemProductCode}
                onUpdateItemDescription={onUpdateItemDescription}
                onUpdateItemPc={onUpdateItemPc}
                onUpdateOrder={onUpdateOrder}
                onDeleteOrder={onDeleteOrder}
                onFinishOrder={onFinishOrder}
                onReopenOrder={onReopenOrder}
                onReopenCompletedItem={onReopenCompletedItem}
                onComercialObservationThreadUpdated={
                  onComercialObservationThreadUpdated
                }
                cqUserId={cqUserId}
                cqCompanyId={cqCompanyId}
                showSelect={showBulk}
                selected={selectedIds.has(order.id)}
                onToggleSelect={() => toggleOrder(order.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface HeaderCellProps {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}

function HeaderCell({ children, active, onClick }: HeaderCellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 text-left ${
        active ? "text-slate-800" : ""
      }`}
    >
      <span>{children}</span>
      <span className="text-[9px] text-slate-400">↕</span>
    </button>
  );
}

