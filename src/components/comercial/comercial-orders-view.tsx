"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ItemStatus, OrderStatus, OrderWithItems } from "@/lib/types/database";
import { formatBrazilianDateTime, formatShortDate } from "@/lib/utils/date";
import { OrderStatusBadge } from "@/components/pedidos/order-status-badge";
import {
  areAllOrderDeadlinesSameDay,
  getOrderDeadlineTrafficLight,
  getOrderPrincipalStatus,
  type OrderPrincipalStatus,
} from "@/lib/utils/order-aggregates";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { Button } from "@/components/ui/button";

export type ComercialItemLite = {
  id: string;
  line_id: string | null;
  status: string;
  production_start: string | null;
  production_end: string | null;
  description?: string | null;
};

export type ComercialOrderApi = {
  id: string;
  order_number: string;
  client_name: string | null;
  created_at: string;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
  production_deadline: string | null;
  status: string;
  updated_at: string | null;
  items: ComercialItemLite[];
};

type SortKey =
  | "order_number"
  | "client_name"
  | "created_at"
  | "delivery_deadline"
  | "pcp_deadline";

type TabKey = "open" | "finished";

function toOrderWithItems(row: ComercialOrderApi): OrderWithItems {
  const t = row.created_at;
  const items = (row.items ?? []).map((it) => ({
    id: it.id,
    order_id: row.id,
    item_number: 0,
    description: it.description ?? "",
    quantity: 0,
    line_id: it.line_id,
    pcp_deadline: null,
    production_start: it.production_start,
    production_end: it.production_end,
    status: it.status as ItemStatus,
    completed_at: null,
    completed_by: null,
    notes: null,
    supplied_at: null,
    pc_number: null,
    pc_delivery_date: null,
    created_at: t,
    updated_at: t,
  }));
  return {
    id: row.id,
    company_id: "",
    order_number: row.order_number,
    client_name: row.client_name ?? "",
    delivery_deadline: row.delivery_deadline,
    pcp_deadline: row.pcp_deadline,
    production_deadline: row.production_deadline,
    status: row.status as OrderStatus,
    pdf_path: null,
    folder_path: null,
    notes: null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    finished_at: null,
    created_by: null,
    items,
  };
}

function StatusBadges({ principal, orderStatus }: { principal: OrderPrincipalStatus; orderStatus: OrderStatus }) {
  if (principal) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {principal === "atrasado" && (
          <span className="inline-flex shrink-0 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
            Atrasado
          </span>
        )}
        {principal === "vai_atrasar" && (
          <span className="inline-flex shrink-0 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
            Vai atrasar
          </span>
        )}
        {principal === "falta_linha" && (
          <span className="inline-flex shrink-0 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
            Falta escolher linha
          </span>
        )}
        {principal === "aguardando_programacao" && (
          <span className="inline-flex shrink-0 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
            Aguardando programação
          </span>
        )}
        {principal === "programado" && (
          <span className="inline-flex shrink-0 rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
            Programado
          </span>
        )}
        {principal === "produzindo" && (
          <span className="inline-flex shrink-0 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
            Produzindo
          </span>
        )}
        {principal === "finalizado" && (
          <span className="inline-flex shrink-0 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap">
            Finalizado
          </span>
        )}
      </div>
    );
  }
  return <OrderStatusBadge status={orderStatus} />;
}

/** Larguras estáveis: nº, cliente, 3 datas iguais, status — menos “folga” entre colunas. */
const COMERCIAL_TABLE_GRID =
  "grid w-full min-w-[46rem] sm:min-w-[54rem] grid-cols-[5.5rem_minmax(0,1.1fr)_5.5rem_5.5rem_5.5rem_minmax(9.5rem,1fr)] items-center gap-x-2 sm:gap-x-2.5 gap-y-0";

function HeaderCell({
  children,
  active,
  onClick,
  align = "left",
}: {
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
  align?: "left" | "center" | "right";
}) {
  const alignCls =
    align === "center"
      ? "justify-center text-center"
      : align === "right"
        ? "justify-end text-right"
        : "justify-start text-left";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full min-w-0 items-center gap-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-500 leading-tight ${alignCls} ${
        active ? "text-slate-800" : ""
      }`}
    >
      <span className="break-words hyphens-auto">{children}</span>
      <span className="shrink-0 text-[9px] text-slate-400" aria-hidden>
        ↕
      </span>
    </button>
  );
}

interface ComercialOrdersViewProps {
  orders: ComercialOrderApi[];
  loadError: string | null;
  fetching: boolean;
  lastAt: Date | null;
  onRefresh: () => void;
}

export function ComercialOrdersView({
  orders,
  loadError,
  fetching,
  lastAt,
  onRefresh,
}: ComercialOrdersViewProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("open");
  const [sortKey, setSortKey] = useState<SortKey>("delivery_deadline");
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const { openList, finishedList, openCount, finishedCount } = useMemo(() => {
    const o = orders.filter((x) => x.status !== "finished");
    const f = orders.filter((x) => x.status === "finished");
    return {
      openList: o,
      finishedList: f,
      openCount: o.length,
      finishedCount: f.length,
    };
  }, [orders]);

  const source = tab === "open" ? openList : finishedList;

  const filteredAndSorted = useMemo(() => {
    const query = search.trim().toLowerCase();
    const statusLabels: Record<string, string> = {
      finished: "finalizado",
      imported: "importado",
      planning: "programação",
      in_production: "produção",
      ready: "pronto",
      delayed: "atrasado",
    };
    let list = source;
    if (query) {
      list = list.filter((row) => {
        if (row.order_number?.toLowerCase().includes(query)) return true;
        if (row.client_name?.toLowerCase().includes(query)) return true;
        const st = statusLabels[row.status ?? ""] ?? "";
        if (st && st.includes(query)) return true;
        return (row.items ?? []).some((it) =>
          (it.description ?? "").toLowerCase().includes(query)
        );
      });
    }
    return [...list].sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sortKey] ?? "");
      const bv = String((b as unknown as Record<string, unknown>)[sortKey] ?? "");
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [source, search, sortKey, sortAsc]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Prazos de venda</h1>
          <p className="text-sm text-slate-600">
            Visualização dos pedidos — mesmas informações principais da lista de Pedidos, sem editar.
          </p>
          {lastAt && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              Última atualização: {formatBrazilianDateTime(lastAt)}{" "}
              {fetching ? "· atualizando…" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            className="text-xs h-8 bg-white text-slate-800 border border-slate-300 hover:bg-slate-50"
            onClick={onRefresh}
            disabled={fetching}
          >
            Atualizar agora
          </Button>
          <PageExportMenu
            fileNameBase="comercial-pedidos"
            sheetTitle="Comercial"
            getData={() => ({
              headers: [
                "Pedido",
                "Cliente",
                "Data início",
                "Prazo vendas",
                "Prazo entrega",
                "Status pedido",
              ],
              rows: orders.map((o) => [
                o.order_number,
                o.client_name ?? "—",
                formatShortDate(o.created_at),
                formatShortDate(o.delivery_deadline),
                formatShortDate(o.pcp_deadline),
                o.status,
              ]),
            })}
          />
        </div>
      </div>

      {loadError && (
        <p className="text-sm text-red-600 border border-red-200 rounded-md px-3 py-2 bg-red-50">
          {loadError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("open")}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            tab === "open"
              ? "bg-[#1B4F72] text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Em aberto ({openCount})
        </button>
        <button
          type="button"
          onClick={() => setTab("finished")}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            tab === "finished"
              ? "bg-[#1B4F72] text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Finalizados ({finishedCount})
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-2 border-b border-slate-200 flex justify-end">
          <input
            type="search"
            placeholder="Buscar pedido, cliente ou situação…"
            className="w-full max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-xs h-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto border-b border-slate-200">
          <div
            className={`${COMERCIAL_TABLE_GRID} px-3 sm:px-4 py-2.5 min-h-[42px] border-b border-slate-100`}
          >
            <HeaderCell active={sortKey === "order_number"} onClick={() => toggleSort("order_number")}>
              Nº pedido
            </HeaderCell>
            <HeaderCell active={sortKey === "client_name"} onClick={() => toggleSort("client_name")}>
              Cliente
            </HeaderCell>
            <HeaderCell
              active={sortKey === "created_at"}
              onClick={() => toggleSort("created_at")}
              align="center"
            >
              Data início
            </HeaderCell>
            <HeaderCell
              active={sortKey === "delivery_deadline"}
              onClick={() => toggleSort("delivery_deadline")}
              align="center"
            >
              Prazo vendas
            </HeaderCell>
            <HeaderCell
              active={sortKey === "pcp_deadline"}
              onClick={() => toggleSort("pcp_deadline")}
              align="center"
            >
              Prazo entrega
            </HeaderCell>
            <div className="text-right text-[10px] sm:text-[11px] font-semibold text-slate-500 pl-1">
              Status
            </div>
          </div>
        </div>

        {filteredAndSorted.length === 0 ? (
          <div className="px-3 sm:px-4 py-6 text-center text-xs text-slate-500">
            {orders.length === 0 && !loadError
              ? "Nenhum pedido encontrado."
              : "Nenhum pedido corresponde à busca nesta aba."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div>
              {filteredAndSorted.map((row) => {
                const o = toOrderWithItems(row);
                const principal = getOrderPrincipalStatus(o);
                const traffic = getOrderDeadlineTrafficLight(o);
                const sameDay = areAllOrderDeadlinesSameDay(o);
                const rowTrafficClass =
                  traffic === "red"
                    ? "bg-red-50"
                    : traffic === "yellow"
                      ? "bg-amber-50"
                      : traffic === "green"
                        ? "bg-emerald-50"
                        : "bg-white";
                return (
                  <div
                    key={row.id}
                    className={`${COMERCIAL_TABLE_GRID} px-3 sm:px-4 py-1.5 border-b border-slate-200 text-[11px] sm:text-xs ${rowTrafficClass}`}
                    title={
                      traffic === "white"
                        ? undefined
                        : sameDay
                          ? "Atenção: prazo de vendas, PCP e produção na mesma data."
                          : traffic === "red"
                            ? "Alerta: PCP após vendas ou produção após vendas."
                            : traffic === "yellow"
                              ? "Atenção: produção após o PCP e até a data de vendas."
                              : "OK: produção até o PCP, antes de vendas."
                    }
                  >
                    <div className="font-medium text-slate-800 tabular-nums tracking-tight">
                      {row.order_number}
                    </div>
                    <div className="min-w-0 truncate text-slate-800 pr-0.5" title={row.client_name ?? ""}>
                      {row.client_name || "—"}
                    </div>
                    <div className="text-center tabular-nums text-slate-600">
                      {formatShortDate(row.created_at)}
                    </div>
                    <div className="text-center tabular-nums text-slate-600">
                      {formatShortDate(row.delivery_deadline)}
                    </div>
                    <div className="text-center tabular-nums text-[#1B4F72] font-medium">
                      {formatShortDate(row.pcp_deadline)}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-0.5 min-h-[24px] pl-0.5">
                      <StatusBadges principal={principal} orderStatus={o.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
