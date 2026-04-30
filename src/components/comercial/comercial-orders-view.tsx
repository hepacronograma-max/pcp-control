"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  ItemStatus,
  OrderStatus,
  OrderWithItems,
  OrderComercialThreadPatch,
} from "@/lib/types/database";
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
import { toast } from "sonner";

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
  /** Recado visível para o PCP na tela Pedidos */
  comercial_pcp_observation?: string | null;
  comercial_pcp_observation_by?: string | null;
  comercial_pcp_observation_at?: string | null;
  pcp_reply_comercial_observation?: string | null;
  pcp_reply_comercial_observation_by?: string | null;
  pcp_reply_comercial_observation_at?: string | null;
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
    comercial_pcp_observation: row.comercial_pcp_observation ?? null,
    comercial_pcp_observation_by: row.comercial_pcp_observation_by ?? null,
    comercial_pcp_observation_at: row.comercial_pcp_observation_at ?? null,
    pcp_reply_comercial_observation: row.pcp_reply_comercial_observation ?? null,
    pcp_reply_comercial_observation_by: row.pcp_reply_comercial_observation_by ?? null,
    pcp_reply_comercial_observation_at: row.pcp_reply_comercial_observation_at ?? null,
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

/** Larguras estáveis + coluna ícone observação → PCP */
const COMERCIAL_TABLE_GRID =
  "grid w-full min-w-[48rem] sm:min-w-[56rem] grid-cols-[5.5rem_minmax(0,1.1fr)_5.5rem_5.5rem_5.5rem_minmax(9.5rem,1fr)_2.75rem] items-center gap-x-2 sm:gap-x-2.5 gap-y-0";

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
  /** Comercial / gestão pode editar recado ao PCP */
  canEditObservation: boolean;
  onObservationSaved?: (orderId: string, patch: OrderComercialThreadPatch) => void;
}

export function ComercialOrdersView({
  orders,
  loadError,
  fetching,
  lastAt,
  onRefresh,
  canEditObservation,
  onObservationSaved,
}: ComercialOrdersViewProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("open");
  const [sortKey, setSortKey] = useState<SortKey>("delivery_deadline");
  const [sortAsc, setSortAsc] = useState(true);
  const [obsExpandedId, setObsExpandedId] = useState<string | null>(null);
  const [obsDraft, setObsDraft] = useState("");
  const [savingObs, setSavingObs] = useState(false);

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
        if ((row.comercial_pcp_observation ?? "").toLowerCase().includes(query)) return true;
        if ((row.pcp_reply_comercial_observation ?? "").toLowerCase().includes(query)) return true;
        if ((row.comercial_pcp_observation_by ?? "").toLowerCase().includes(query)) return true;
        if ((row.pcp_reply_comercial_observation_by ?? "").toLowerCase().includes(query)) return true;
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

  useEffect(() => {
    if (!obsExpandedId) {
      setObsDraft("");
      return;
    }
    const row = orders.find((o) => o.id === obsExpandedId);
    setObsDraft(row?.comercial_pcp_observation ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir/fechar painel; não ligar em `orders` (polling sobrescreveria o texto ao digitar)
  }, [obsExpandedId]);

  async function saveObservation(orderId: string) {
    const trimmed = obsDraft.trim().slice(0, 2000);
    const payload = trimmed.length ? trimmed : null;
    setSavingObs(true);
    try {
      const res = await fetch("/api/comercial-orders", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          comercial_pcp_observation: payload,
        }),
      });
      const j = (await res.json()) as {
        success?: boolean;
        error?: string;
        comercial_pcp_observation?: string | null;
        comercial_pcp_observation_by?: string | null;
        comercial_pcp_observation_at?: string | null;
      };
      if (!res.ok || j.success === false) {
        toast.error(j.error || "Não foi possível salvar.");
        return;
      }
      const patch: OrderComercialThreadPatch = {
        comercial_pcp_observation:
          j.comercial_pcp_observation !== undefined
            ? j.comercial_pcp_observation
            : payload,
        comercial_pcp_observation_by: j.comercial_pcp_observation_by ?? null,
        comercial_pcp_observation_at: j.comercial_pcp_observation_at ?? null,
      };
      onObservationSaved?.(orderId, patch);
      toast.success("Observação para o PCP salva.");
      setObsExpandedId(null);
    } catch {
      toast.error("Erro de rede ao salvar.");
    } finally {
      setSavingObs(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Prazos de venda</h1>
          <p className="text-sm text-slate-600">
            Visualização dos pedidos — prazos e situação. Use o ícone à direita para registrar um recado ao PCP
            (visível na tela Pedidos).
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
                "Obs. Comercial",
                "Registo Comercial",
                "Resposta PCP",
                "Registo PCP",
              ],
              rows: orders.map((o) => [
                o.order_number,
                o.client_name ?? "—",
                formatShortDate(o.created_at),
                formatShortDate(o.delivery_deadline),
                formatShortDate(o.pcp_deadline),
                o.status,
                o.comercial_pcp_observation ?? "",
                [
                  o.comercial_pcp_observation_by ?? "",
                  o.comercial_pcp_observation_at
                    ? formatBrazilianDateTime(o.comercial_pcp_observation_at)
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
                o.pcp_reply_comercial_observation ?? "",
                [
                  o.pcp_reply_comercial_observation_by ?? "",
                  o.pcp_reply_comercial_observation_at
                    ? formatBrazilianDateTime(o.pcp_reply_comercial_observation_at)
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
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
            <div className="text-center text-[10px] sm:text-[11px] font-semibold text-slate-500 px-0">
              Recado
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
                const hasThread =
                  !!(row.comercial_pcp_observation ?? "").trim() ||
                  !!(row.pcp_reply_comercial_observation ?? "").trim();
                const gridTitle =
                  traffic === "white"
                    ? undefined
                    : sameDay
                      ? "Atenção: prazo de vendas, PCP e produção na mesma data."
                      : traffic === "red"
                        ? "Alerta: PCP após vendas ou produção após vendas."
                        : traffic === "yellow"
                          ? "Atenção: produção após o PCP e até a data de vendas."
                          : "OK: produção até o PCP, antes de vendas.";
                return (
                  <div key={row.id} className={`border-b border-slate-200 ${rowTrafficClass}`}>
                    <div
                      className={`${COMERCIAL_TABLE_GRID} px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs`}
                      title={gridTitle}
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
                      <div className="flex justify-center items-center">
                        <button
                          type="button"
                          className={`rounded-md p-1 min-h-[28px] min-w-[28px] flex items-center justify-center border border-transparent hover:bg-white/80 hover:border-slate-200 transition-colors ${
                            hasThread ? "text-sky-700" : "text-slate-400"
                          }`}
                          title={
                            hasThread
                              ? [
                                  (row.comercial_pcp_observation ?? "").trim() &&
                                    `Comercial: ${(row.comercial_pcp_observation ?? "").slice(0, 240)}`,
                                  (row.pcp_reply_comercial_observation ?? "").trim() &&
                                    `PCP: ${(row.pcp_reply_comercial_observation ?? "").slice(0, 240)}`,
                                ]
                                  .filter(Boolean)
                                  .join(" | ") || "Recado"
                              : canEditObservation
                                ? "Registrar observação para o PCP"
                                : "Ver recados com o PCP"
                          }
                          aria-expanded={obsExpandedId === row.id}
                          onClick={() =>
                            setObsExpandedId((id) => (id === row.id ? null : row.id))
                          }
                        >
                          <span className="text-base leading-none" aria-hidden>
                            {hasThread ? "●" : "○"}
                          </span>
                        </button>
                      </div>
                    </div>
                    {obsExpandedId === row.id && (
                      <div className="px-3 sm:px-4 py-3 bg-white/70 border-t border-slate-100 text-xs space-y-2">
                        <div>
                          <p className="text-[11px] font-semibold text-slate-800">
                            Observação para o PCP
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Visível na tela Pedidos para quem programa produção (badge e painel ao expandir o
                            pedido).
                          </p>
                        </div>
                        {!!(row.pcp_reply_comercial_observation ?? "").trim() && (
                          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-slate-800">
                            <p className="text-[11px] font-semibold text-emerald-950">
                              Resposta do PCP ao Comercial
                            </p>
                            <p className="whitespace-pre-wrap mt-1">
                              {row.pcp_reply_comercial_observation}
                            </p>
                            {(row.pcp_reply_comercial_observation_by ||
                              row.pcp_reply_comercial_observation_at) && (
                              <p className="text-[10px] text-emerald-900/85 mt-1.5">
                                Por {row.pcp_reply_comercial_observation_by ?? "—"}
                                {row.pcp_reply_comercial_observation_at
                                  ? ` · ${formatBrazilianDateTime(row.pcp_reply_comercial_observation_at)}`
                                  : ""}
                              </p>
                            )}
                          </div>
                        )}
                        {canEditObservation ? (
                          <>
                            <textarea
                              className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs text-slate-800 min-h-[5rem] resize-y max-h-[14rem]"
                              placeholder="Ex.: combinei com o cliente — novo prazo de entrega em DD/MM/AAAA…"
                              maxLength={2000}
                              rows={4}
                              value={obsDraft}
                              onChange={(e) => setObsDraft(e.target.value.slice(0, 2000))}
                              disabled={savingObs}
                            />
                            {(row.comercial_pcp_observation_by ||
                              row.comercial_pcp_observation_at) && (
                              <p className="text-[10px] text-slate-500">
                                Último envio ao PCP: {row.comercial_pcp_observation_by ?? "—"}
                                {row.comercial_pcp_observation_at
                                  ? ` · ${formatBrazilianDateTime(row.comercial_pcp_observation_at)}`
                                  : ""}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2 justify-end">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-60 min-h-8"
                                disabled={savingObs}
                                onClick={() => setObsExpandedId(null)}
                              >
                                Cancelar
                              </button>
                              <Button
                                type="button"
                                className="text-xs h-8 bg-[#1B4F72]"
                                disabled={savingObs}
                                onClick={() => saveObservation(row.id)}
                              >
                                {savingObs ? "Salvando…" : "Salvar"}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 min-h-[3rem]">
                              {(row.comercial_pcp_observation ?? "").trim() ||
                                "Nenhuma observação registrada pelo Comercial."}
                            </div>
                            {(row.comercial_pcp_observation_by ||
                              row.comercial_pcp_observation_at) &&
                              !!(row.comercial_pcp_observation ?? "").trim() && (
                              <p className="text-[10px] text-slate-500">
                                Por {row.comercial_pcp_observation_by ?? "—"}
                                {row.comercial_pcp_observation_at
                                  ? ` · ${formatBrazilianDateTime(row.comercial_pcp_observation_at)}`
                                  : ""}
                              </p>
                            )}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 min-h-8"
                                onClick={() => setObsExpandedId(null)}
                              >
                                Fechar
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
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
