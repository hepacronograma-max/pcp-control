'use client';

import { useMemo, useState } from "react";
import type {
  OrderWithItems,
  ProductionLine,
  UserRole,
} from "@/lib/types/database";
import { OrderRow } from "./order-row";
import { effectiveOrderProductionDeadline } from "@/lib/utils/order-aggregates";

type SortKey =
  | "order_number"
  | "client_name"
  | "delivery_deadline"
  | "pcp_deadline"
  | "production_deadline";

interface OrdersTableProps {
  orders: OrderWithItems[];
  visibleOrders: OrderWithItems[];
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
}

export function OrdersTable({
  orders,
  visibleOrders,
  lines,
  userRole,
  onUpdateOrderPcpDate,
  onUpdateItemLine,
  onUpdateItemQuantity,
  onUpdateItemPc,
  onUpdateOrder,
  onDeleteOrder,
  onFinishOrder,
}: OrdersTableProps) {
  const [search, setSearch] = useState("");
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
    // Quando há busca, pesquisa em TODOS os pedidos (abertos e finalizados)
    const listToSearch = query ? orders : visibleOrders;
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
  }, [orders, visibleOrders, search, sortKey, sortAsc]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Pedidos</h2>
        <input
          type="text"
          className="w-64 max-w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs"
          placeholder="Buscar por pedido, cliente ou descrição do item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] gap-2 px-4 py-2 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
        <div />
        <HeaderCell active={sortKey === "order_number"} onClick={() => toggleSort("order_number")}>
          Nº Pedido
        </HeaderCell>
        <HeaderCell active={sortKey === "client_name"} onClick={() => toggleSort("client_name")}>
          Cliente
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
        <div className="col-span-2 text-right">Status</div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-slate-500">
          Nenhum pedido encontrado.
        </div>
      ) : (
        filteredAndSorted.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            lines={lines}
            userRole={userRole}
            onUpdateOrderPcpDate={onUpdateOrderPcpDate}
            onUpdateItemLine={onUpdateItemLine}
            onUpdateItemQuantity={onUpdateItemQuantity}
            onUpdateItemPc={onUpdateItemPc}
            onUpdateOrder={onUpdateOrder}
            onDeleteOrder={onDeleteOrder}
            onFinishOrder={onFinishOrder}
          />
        ))
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

