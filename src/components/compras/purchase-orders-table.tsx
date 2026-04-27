"use client";

import { useEffect, useMemo, useState } from "react";
import { formatShortDate } from "@/lib/utils/date";
import { Button } from "@/components/ui/button";

export type PoLink = {
  id: string;
  order_item_id: string;
  order_id: string;
  description: string | null;
  order_number: string;
  sales_deadline?: string | null;
  purchase_order_line_id?: string | null;
};

export type PolLineWithVenda = {
  id: string;
  line_number: number;
  product_code: string | null;
  description: string | null;
  ncm: string | null;
  quantity: number | null;
  unit: string | null;
  supplier_code: string | null;
  /** Itens lidos de copia de segurança nas notas (tabela ainda inexistente no banco). */
  is_fallback?: boolean;
  venda: {
    link_id: string;
    order_item_id: string;
    order_number: string;
    item_description: string | null;
    sales_deadline: string | null;
  } | null;
};

export type PurchaseOrderRow = {
  id: string;
  number: string;
  supplier_name: string | null;
  expected_delivery: string | null;
  /** Prazo de follow-up (compras), editável na lista. */
  follow_up_date?: string | null;
  /** Observação da área de compras (separada das notas de importação). */
  compras_observation?: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lines: PolLineWithVenda[];
  links: PoLink[];
};

type ItemForLink = {
  id: string;
  order_id: string;
  description: string | null;
  pc_number: string | null;
  pc_delivery_date: string | null;
  order_number: string;
};

type TabKey = "open" | "closed";

function poStatusLabel(s: string) {
  const m: Record<string, string> = {
    open: "Aberto",
    received: "Recebido",
    cancelled: "Cancelado",
  };
  return m[s] ?? s;
}

function formatCell(iso: string | null) {
  if (!iso) return "—";
  const s = formatShortDate(iso);
  return s === "--" ? "—" : s;
}

interface PurchaseOrdersTableProps {
  purchaseOrders: PurchaseOrderRow[];
  orderItemsForLink: ItemForLink[];
  schemaMissing: boolean;
  /** PCP: só visualização (sem vincular, excluir ou editar prazos/notas). */
  readOnly?: boolean;
  onLink: (poId: string, orderItemId: string, purchaseOrderLineId?: string) => void | Promise<void>;
  onUnlink: (poId: string, orderItemId: string) => void | Promise<void>;
  onDeletePo: (id: string) => void | Promise<void>;
  onUpdatePoFields: (
    poId: string,
    fields: { follow_up_date?: string | null; compras_observation?: string | null }
  ) => void | Promise<void>;
}

export function PurchaseOrdersTable({
  purchaseOrders,
  orderItemsForLink,
  schemaMissing,
  readOnly = false,
  onLink,
  onUnlink,
  onDeletePo,
  onUpdatePoFields,
}: PurchaseOrdersTableProps) {
  const [tab, setTab] = useState<TabKey>("open");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /** chave: `${poId}:${lineId}` ou `l:${poId}` (legado) → order_item selecionado */
  const [linkPick, setLinkPick] = useState<Record<string, string>>({});
  /** chave idem → `order_id` do pedido de venda (filtra a lista de itens) */
  const [linkOrderPick, setLinkOrderPick] = useState<Record<string, string>>({});

  const salesOrdersList = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of orderItemsForLink) {
      if (!m.has(it.order_id)) m.set(it.order_id, it.order_number);
    }
    return Array.from(m.entries())
      .map(([order_id, order_number]) => ({ order_id, order_number }))
      .sort((a, b) =>
        a.order_number.localeCompare(b.order_number, undefined, { numeric: true })
      );
  }, [orderItemsForLink]);

  const openCount = useMemo(
    () => purchaseOrders.filter((p) => p.status === "open").length,
    [purchaseOrders]
  );
  const closedCount = useMemo(
    () => purchaseOrders.filter((p) => p.status !== "open").length,
    [purchaseOrders]
  );

  const visible = useMemo(() => {
    const list =
      tab === "open"
        ? purchaseOrders.filter((p) => p.status === "open")
        : purchaseOrders.filter((p) => p.status !== "open");
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      if (p.number.toLowerCase().includes(q)) return true;
      if (p.supplier_name?.toLowerCase().includes(q)) return true;
      if (p.notes?.toLowerCase().includes(q)) return true;
      if (p.links.some((l) => l.order_number.toLowerCase().includes(q)))
        return true;
      if (p.links.some((l) => l.description?.toLowerCase().includes(q)))
        return true;
      if (p.lines?.some((l) => l.product_code?.toLowerCase().includes(q)))
        return true;
      if (p.lines?.some((l) => l.description?.toLowerCase().includes(q)))
        return true;
      if (p.compras_observation?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [purchaseOrders, tab, search]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  useEffect(() => {
    setExpanded(new Set());
  }, [tab]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden w-full min-w-0">
      <div className="px-3 sm:px-4 py-2 border-b border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-800 shrink-0">Pedidos de compra</h2>
        <input
          type="search"
          placeholder="Buscar PC, fornecedor, PV ou item…"
          className="w-full sm:max-w-xs rounded-md border border-slate-300 px-2 py-1.5 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={schemaMissing}
        />
      </div>

      <div className="px-3 sm:px-4 py-2 border-b border-slate-100 flex flex-wrap gap-2">
        <button
          type="button"
          className={`px-3 py-2 min-h-[40px] rounded-md text-xs font-medium border ${
            tab === "open"
              ? "bg-white border-slate-300 text-slate-900"
              : "bg-slate-100 border-transparent text-slate-600"
          }`}
          onClick={() => setTab("open")}
        >
          Abertos ({openCount})
        </button>
        <button
          type="button"
          className={`px-3 py-2 min-h-[40px] rounded-md text-xs font-medium border ${
            tab === "closed"
              ? "bg-white border-slate-300 text-slate-900"
              : "bg-slate-100 border-transparent text-slate-600"
          }`}
          onClick={() => setTab("closed")}
        >
          Encerrados ({closedCount})
        </button>
      </div>

      {visible.length === 0 && !schemaMissing && (
        <p className="p-4 text-sm text-slate-500">
          {purchaseOrders.length === 0
            ? "Nenhum pedido de compra cadastrado."
            : "Nenhum resultado nesta aba com o filtro atual."}
        </p>
      )}

      {visible.map((p) => {
        const ex = expanded.has(p.id);
        const fu = p.follow_up_date?.slice(0, 10) ?? "";
        const ob = p.compras_observation ?? "";
        return (
          <div key={p.id} className="border-b border-slate-100 last:border-0 text-xs">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2 px-2 sm:px-3 py-2.5 bg-white hover:bg-slate-50/80">
              <button
                type="button"
                onClick={() => toggleExpand(p.id)}
                className="text-slate-500 hover:text-slate-800 w-6 shrink-0 self-center mb-0.5"
                aria-expanded={ex}
              >
                {ex ? "▼" : "▶"}
              </button>
              <div className="shrink-0 min-w-[3.5rem]">
                <span className="text-[9px] uppercase tracking-wide text-slate-500 block leading-tight">
                  Nº PC
                </span>
                <div className="font-mono font-semibold text-slate-900" title={p.number}>
                  {p.number}
                </div>
              </div>
              <div className="min-w-[6rem] max-w-[14rem] flex-1">
                <span className="text-[9px] uppercase tracking-wide text-slate-500 block leading-tight">
                  Fornecedor
                </span>
                <div className="truncate text-slate-800" title={p.supplier_name ?? ""}>
                  {p.supplier_name || "—"}
                </div>
              </div>
              <div className="shrink-0 w-[5.5rem]">
                <span className="text-[9px] uppercase tracking-wide text-slate-500 block leading-tight">
                  Prazo pedido
                </span>
                <div className="text-slate-700 tabular-nums">{formatCell(p.expected_delivery)}</div>
              </div>
              <div className="shrink-0 w-[8.5rem]">
                <span className="text-[9px] uppercase tracking-wide text-slate-500 block leading-tight">
                  Follow-up
                </span>
                {readOnly ? (
                  <div className="h-7 flex items-center justify-center text-[10px] tabular-nums text-slate-700">
                    {formatCell(p.follow_up_date ?? null)}
                  </div>
                ) : (
                  <div
                    className="relative h-7 w-full min-w-[4.75rem] rounded border border-slate-300 bg-white"
                    title="Clique para escolher a data (mesmo formato do prazo do pedido ao exibir)"
                  >
                    <input
                      type="date"
                      aria-label="Data de follow-up"
                      key={`fu-${p.id}-${p.updated_at}`}
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      defaultValue={fu}
                      disabled={schemaMissing}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const next = v || null;
                        const cur = p.follow_up_date?.slice(0, 10) || null;
                        if (next !== cur) void onUpdatePoFields(p.id, { follow_up_date: next });
                      }}
                    />
                    <div className="pointer-events-none flex h-full items-center justify-center px-1 text-[10px] tabular-nums text-slate-700">
                      {formatCell(p.follow_up_date ?? null)}
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-[7rem] flex-1 basis-[8rem] max-w-md">
                <span className="text-[9px] uppercase tracking-wide text-slate-500 block leading-tight">
                  Observação
                </span>
                {readOnly ? (
                  <div className="min-h-7 line-clamp-2 text-[10px] text-slate-700 px-0.5" title={ob || undefined}>
                    {ob.trim() ? ob : "—"}
                  </div>
                ) : (
                  <input
                    type="text"
                    key={`ob-${p.id}-${p.updated_at}`}
                    className="w-full h-7 rounded border border-slate-300 px-1.5 text-[10px] bg-white"
                    defaultValue={ob}
                    placeholder="Nota interna…"
                    disabled={schemaMissing}
                    maxLength={4000}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      const next = v || null;
                      const cur = (p.compras_observation ?? "").trim() || null;
                      if (next !== cur) void onUpdatePoFields(p.id, { compras_observation: next });
                    }}
                  />
                )}
              </div>
              <div className="shrink-0 w-9 text-center">
                <span className="text-[9px] uppercase tracking-wide text-slate-500 block leading-tight">
                  Itens
                </span>
                <div className="text-slate-600 tabular-nums">{p.lines?.length ?? 0}</div>
              </div>
              <div className="shrink-0 w-[4.5rem] text-center">
                <span className="text-[9px] uppercase tracking-wide text-slate-500 block leading-tight">
                  Status
                </span>
                <div className="text-slate-700">{poStatusLabel(p.status)}</div>
              </div>
              {!readOnly && (
                <div className="shrink-0 flex justify-end self-center mb-0.5">
                  <button
                    type="button"
                    className="text-red-600 hover:underline text-[11px] whitespace-nowrap"
                    onClick={() => {
                      if (window.confirm("Excluir este pedido de compra?")) void onDeletePo(p.id);
                    }}
                  >
                    Excluir
                  </button>
                </div>
              )}
              {readOnly && <div className="w-0 shrink-0" aria-hidden />}
            </div>

            {ex && (
              <div className="pl-2 sm:pl-8 pr-2 pb-3 bg-slate-50/50 border-t border-slate-100">
                {p.notes && (
                  <p className="text-[11px] text-slate-500 py-1 border-b border-slate-100/80 line-clamp-2">
                    <span className="font-medium text-slate-600">Notas (import / sistema):</span>{" "}
                    {p.notes}
                  </p>
                )}

                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide pt-2 pb-1">
                  Itens do pedido de compra (importados do PDF) e vínculo ao pedido de venda
                </p>
                {(p.lines?.length ?? 0) > 0 ? (
                  <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                    {(p.lines ?? []).some((x) => x.is_fallback) && (
                      <p className="text-[10px] text-amber-900 px-2 py-1.5 bg-amber-50 border-b border-amber-100">
                        Itens em <strong>cópia de segurança</strong> (a tabela de linhas ainda não existe no
                        Supabase). Execute <code className="text-[9px]">supabase-purchase-order-lines.sql</code>,{" "}
                        depois <strong>importe o PDF de novo</strong> para gravar linhas reais e permitir vínculo
                        ao PV.
                      </p>
                    )}
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 text-left">
                          <th className="p-1.5 font-medium w-8">#</th>
                          <th className="p-1.5 font-medium">Cód.</th>
                          <th className="p-1.5 font-medium min-w-[140px]">Descrição</th>
                          <th className="p-1.5 font-medium">NCM</th>
                          <th className="p-1.5 font-medium">Qtd</th>
                          <th className="p-1.5 font-medium min-w-[200px]">Pedido venda e item</th>
                          <th className="p-1.5 font-medium w-28">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(p.lines ?? []).map((ln) => {
                          const k = `${p.id}:${ln.id}`;
                          const v = ln.venda;
                          return (
                            <tr key={ln.id} className="border-t border-slate-100 align-top">
                              <td className="p-1.5 text-slate-600">{ln.line_number}</td>
                              <td className="p-1.5 font-mono text-[10px]">{ln.product_code || "—"}</td>
                              <td className="p-1.5 text-slate-800">{ln.description || "—"}</td>
                              <td className="p-1.5 text-[10px] text-slate-600">{ln.ncm || "—"}</td>
                              <td className="p-1.5 whitespace-nowrap">
                                {ln.quantity != null
                                  ? String(ln.quantity).replace(".", ",")
                                  : "—"}{" "}
                                {ln.unit || ""}
                              </td>
                              <td className="p-1.5">
                                {v ? (
                                  <div>
                                    <span className="font-mono text-[#1B4F72]">PV {v.order_number}</span>
                                    <div className="text-[10px] text-slate-600 line-clamp-2">
                                      {v.item_description || "—"} · Prazo vendas:{" "}
                                      {formatCell(v.sales_deadline)}
                                    </div>
                                  </div>
                                ) : readOnly ? (
                                  <span className="text-slate-500">—</span>
                                ) : ln.is_fallback ? (
                                  <span className="text-[10px] text-amber-800">Só leitura até SQL + reimport</span>
                                ) : orderItemsForLink.length > 0 ? (
                                  <div className="flex flex-col gap-1.5 min-w-[200px] max-w-[min(100%,280px)]">
                                    <div>
                                      <span className="text-[9px] text-slate-500 block mb-0.5">
                                        Pedido de venda
                                      </span>
                                      <select
                                        className="w-full h-8 rounded border border-slate-300 text-[10px] px-1 bg-white"
                                        value={linkOrderPick[k] ?? ""}
                                        onChange={(e) => {
                                          const oid = e.target.value;
                                          setLinkOrderPick((prev) => ({
                                            ...prev,
                                            [k]: oid,
                                          }));
                                          setLinkPick((prev) => {
                                            const n = { ...prev };
                                            const cur = n[k]
                                              ? orderItemsForLink.find((x) => x.id === n[k])
                                              : null;
                                            if (!oid || (cur && cur.order_id !== oid)) {
                                              delete n[k];
                                            }
                                            return n;
                                          });
                                        }}
                                      >
                                        <option value="">Nº do PV…</option>
                                        {salesOrdersList.map((o) => (
                                          <option key={o.order_id} value={o.order_id}>
                                            {o.order_number}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <span className="text-[9px] text-slate-500 block mb-0.5">Item</span>
                                      <select
                                        className="w-full h-8 rounded border border-slate-300 text-[10px] px-1 bg-white"
                                        value={linkPick[k] ?? ""}
                                        disabled={!linkOrderPick[k]}
                                        onChange={(e) =>
                                          setLinkPick((prev) => ({
                                            ...prev,
                                            [k]: e.target.value,
                                          }))
                                        }
                                      >
                                        <option value="">
                                          {linkOrderPick[k] ? "Escolher item…" : "Selecione o PV acima"}
                                        </option>
                                        {orderItemsForLink
                                          .filter((it) => it.order_id === linkOrderPick[k])
                                          .map((it) => (
                                            <option key={it.id} value={it.id}>
                                              {(it.description || "sem descrição").slice(0, 48)}
                                            </option>
                                          ))}
                                      </select>
                                    </div>
                                    <Button
                                      type="button"
                                      className="text-[10px] h-7 py-0 w-full"
                                      disabled={!linkPick[k] || !linkOrderPick[k]}
                                      onClick={() => {
                                        const oi = linkPick[k];
                                        if (oi) void onLink(p.id, oi, ln.id);
                                      }}
                                    >
                                      Vincular
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="p-1.5">
                                {v && !readOnly ? (
                                  <button
                                    type="button"
                                    className="text-slate-500 hover:text-red-600 underline text-[10px]"
                                    onClick={() => void onUnlink(p.id, v.order_item_id)}
                                  >
                                    Desvincular
                                  </button>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : p.links.length > 0 ? (
                  <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                    <p className="text-[10px] text-amber-800 px-2 py-1 bg-amber-50 border-b">
                      Sem linhas no banco. Execute{" "}
                      <code className="text-[9px]">supabase-purchase-order-lines.sql</code> e
                      reimporte o PDF, ou vincule abaixo (legado).
                    </p>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 text-left">
                          <th className="p-1.5 font-medium">PV</th>
                          <th className="p-1.5 font-medium">Prazo</th>
                          <th className="p-1.5 font-medium">Item</th>
                          <th className="p-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {p.links.map((l) => (
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className="p-1.5 font-mono">{l.order_number}</td>
                            <td className="p-1.5 text-center">
                              {formatCell(l.sales_deadline ?? null)}
                            </td>
                            <td className="p-1.5">{l.description || "—"}</td>
                            <td className="p-1.5">
                              {!readOnly ? (
                                <button
                                  type="button"
                                  className="text-slate-500 hover:text-red-600 underline"
                                  onClick={() => void onUnlink(p.id, l.order_item_id)}
                                >
                                  Desvincular
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-slate-500 text-[11px] py-1">Nenhum item importado ainda.</p>
                )}

                {!readOnly && (p.lines?.length ?? 0) === 0 && orderItemsForLink.length > 0 && (() => {
                  const leg = `l:${p.id}`;
                  return (
                  <div className="mt-3 flex flex-col gap-2 max-w-md">
                    <p className="text-[10px] text-slate-500">
                      Vínculo sem linha (legado) — escolha o <strong>pedido de venda</strong> e o{" "}
                      <strong>item</strong>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Pedido de venda</label>
                        <select
                          className="w-full h-9 rounded-md border border-slate-300 text-xs px-2 bg-white"
                          value={linkOrderPick[leg] ?? ""}
                          onChange={(e) => {
                            const oid = e.target.value;
                            setLinkOrderPick((prev) => ({ ...prev, [leg]: oid }));
                            setLinkPick((prev) => {
                              const n = { ...prev };
                              const cur = n[leg]
                                ? orderItemsForLink.find((x) => x.id === n[leg])
                                : null;
                              if (!oid || (cur && cur.order_id !== oid)) delete n[leg];
                              return n;
                            });
                          }}
                        >
                          <option value="">Nº do PV…</option>
                          {salesOrdersList.map((o) => (
                            <option key={o.order_id} value={o.order_id}>
                              {o.order_number}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Item do pedido</label>
                        <select
                          className="w-full h-9 rounded-md border border-slate-300 text-xs px-2 bg-white"
                          value={linkPick[leg] ?? ""}
                          disabled={!linkOrderPick[leg]}
                          onChange={(e) =>
                            setLinkPick((prev) => ({ ...prev, [leg]: e.target.value }))
                          }
                        >
                          <option value="">
                            {linkOrderPick[leg] ? "Item…" : "Selecione o PV"}
                          </option>
                          {orderItemsForLink
                            .filter((it) => it.order_id === linkOrderPick[leg])
                            .map((it) => (
                              <option key={it.id} value={it.id}>
                                {(it.description || "sem descrição").slice(0, 60)}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="text-xs h-9 w-fit"
                      disabled={!linkPick[leg] || !linkOrderPick[leg]}
                      onClick={() => {
                        const id = linkPick[leg];
                        if (id) void onLink(p.id, id);
                      }}
                    >
                      Vincular
                    </Button>
                  </div>
                );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
