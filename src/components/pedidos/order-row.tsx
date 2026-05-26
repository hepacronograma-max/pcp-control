import { useEffect, useMemo, useState } from "react";
import type {
  OrderComercialThreadPatch,
  OrderWithItems,
  ProductionLine,
  UserRole,
} from "@/lib/types/database";
import { formatBrazilianDateTime, formatShortDate } from "@/lib/utils/date";
import { toast } from "sonner";
import { CompactDateCell } from "@/components/ui/compact-date-cell";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderItems } from "./order-items";
import { hasPermission } from "@/lib/utils/permissions";
import {
  comercialObsSeenToken,
  readComercialObsSeen,
  writeComercialObsSeen,
} from "@/lib/utils/comercial-obs-seen";
import {
  areAllOrderDeadlinesSameDay,
  effectiveOrderProductionDeadline,
  getOrderDeadlineTrafficLight,
  getOrderPrincipalStatus,
  orderComercialObsNeedsPcpReply,
} from "@/lib/utils/order-aggregates";
import { CQField } from "@/components/cq/CQField";
import { CQList } from "@/components/cq/CQList";

export interface OrderRowProps {
  order: OrderWithItems;
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
  onReopenOrder?: (orderId: string) => void;
  onReopenCompletedItem?: (itemId: string) => void;
  showSelect?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onComercialObservationThreadUpdated?: (
    orderId: string,
    patch: OrderComercialThreadPatch
  ) => void;
}

/** Mesmas regras que PATCH `/api/comercial-orders` para `pcp_reply_comercial_observation`. */
function canPatchPcpReplyRole(role: UserRole | string | null | undefined): boolean {
  const r = String(role ?? "").trim();
  return (
    r === "super_admin" ||
    r === "manager" ||
    r === "admin" ||
    r === "pcp"
  );
}

export function OrderRow({
  order,
  lines,
  userRole,
  onUpdateOrderPcpDate,
  onUpdateItemLine,
  onUpdateItemQuantity,
  onUpdateItemProductCode,
  onUpdateItemDescription,
  onUpdateItemPc,
  onUpdateOrder,
  onDeleteOrder,
  onFinishOrder,
  onReopenOrder,
  onReopenCompletedItem,
  showSelect,
  selected,
  onToggleSelect,
  onComercialObservationThreadUpdated,
  cqUserId,
  cqCompanyId,
}: OrderRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editNumber, setEditNumber] = useState(order.order_number);
  const [editClient, setEditClient] = useState(order.client_name);
  const [editItems, setEditItems] = useState<
    Array<{
      product_code: string;
      description: string;
      quantity: number;
      line_id: string;
    }>
  >([]);
  const [pcpReplyDraft, setPcpReplyDraft] = useState(
    order.pcp_reply_comercial_observation ?? ""
  );
  const [savingPcpReply, setSavingPcpReply] = useState(false);

  useEffect(() => {
    setPcpReplyDraft(order.pcp_reply_comercial_observation ?? "");
  }, [order.id, order.pcp_reply_comercial_observation]);

  const allItemsCompleted =
    order.items.length > 0 &&
    order.items.every((item) => item.status === "completed");
  const canFinish =
    hasPermission(userRole, "finishOrders") &&
    order.status !== "finished" &&
    allItemsCompleted;
  const canReopenOrder =
    hasPermission(userRole, "finishOrders") &&
    order.status === "finished" &&
    !!onReopenOrder;
  const canReopenCompletedItem =
    hasPermission(userRole, "finishOrders") && !!onReopenCompletedItem;
  const canEdit = hasPermission(userRole, "viewOrders");
  const canEditItemDetails = hasPermission(userRole, "editOrders");
  const canReplyAsPcp =
    canPatchPcpReplyRole(userRole) && hasPermission(userRole, "viewOrders");
  const obsText = (order.comercial_pcp_observation ?? "").trim();
  const pcpReplyText = (order.pcp_reply_comercial_observation ?? "").trim();
  const comercialObsPendingForPcp =
    canReplyAsPcp && orderComercialObsNeedsPcpReply(order);
  const obsSeenToken = useMemo(
    () => comercialObsSeenToken(order),
    [order.comercial_pcp_observation, order.comercial_pcp_observation_at]
  );
  const needsComercialObsReply = orderComercialObsNeedsPcpReply(order);
  const [storedObsSeenToken, setStoredObsSeenToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? readComercialObsSeen(order.id) : null
  );

  useEffect(() => {
    setStoredObsSeenToken(readComercialObsSeen(order.id));
  }, [order.id]);

  useEffect(() => {
    if (!expanded || !canReplyAsPcp || obsText.length === 0 || !needsComercialObsReply) {
      return;
    }
    writeComercialObsSeen(order.id, obsSeenToken);
    setStoredObsSeenToken(obsSeenToken);
  }, [
    expanded,
    order.id,
    obsSeenToken,
    canReplyAsPcp,
    obsText.length,
    needsComercialObsReply,
  ]);

  /** Pendência real no pedido; o piscar só enquanto o recado atual não foi “visto” (expandir linha). */
  const showComercialObsPulse =
    comercialObsPendingForPcp && storedObsSeenToken !== obsSeenToken;

  /** Na lista: PCP/gestão só vê o badge com recado novo não lido; após expandir some até novo recado. Outros perfis: sempre que houver texto. */
  const showObsComercialBadgeInRow =
    obsText.length > 0 &&
    (!canReplyAsPcp ||
      (needsComercialObsReply && storedObsSeenToken !== obsSeenToken));

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
    setEditItems(
      order.items.map((it) => ({
        product_code: (it.product_code ?? "").trim(),
        description: it.description ?? "",
        quantity: it.quantity,
        line_id: it.line_id ?? "",
      }))
    );
    setExpanded(true);
    setShowEditModal(true);
  }

  function patchEditItem(
    index: number,
    patch: Partial<{
      product_code: string;
      description: string;
      quantity: number;
      line_id: string;
    }>
  ) {
    setEditItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  async function submitEdit() {
    setSavingEdit(true);
    try {
      await Promise.resolve(
        onUpdateOrder(order.id, {
          order_number: editNumber.trim() || order.order_number,
          client_name: editClient.trim() || order.client_name,
        })
      );

      if (canEditItemDetails) {
        for (let i = 0; i < order.items.length; i++) {
          const it = order.items[i];
          const d = editItems[i];
          if (!d) continue;

          const code = d.product_code.trim();
          const savedCode = (it.product_code ?? "").trim();
          if (code !== savedCode && onUpdateItemProductCode) {
            await Promise.resolve(onUpdateItemProductCode(it.id, code));
          }

          const desc = d.description.trim().slice(0, 500);
          if (desc !== (it.description ?? "").trim() && onUpdateItemDescription) {
            await Promise.resolve(onUpdateItemDescription(it.id, desc));
          }

          const qty = Math.max(1, Number(d.quantity) || 1);
          if (qty !== it.quantity) {
            await Promise.resolve(onUpdateItemQuantity(it.id, qty));
          }

          const lineId = d.line_id.trim() || null;
          if (lineId !== (it.line_id ?? null)) {
            await Promise.resolve(onUpdateItemLine(it.id, lineId));
          }
        }
      }

      toast.success("Pedido atualizado.");
      setShowEditModal(false);
    } catch {
      toast.error("Erro ao salvar alterações.");
    } finally {
      setSavingEdit(false);
    }
  }

  function handleDelete() {
    if (window.confirm("Excluir este pedido? Esta ação não pode ser desfeita.")) {
      onDeleteOrder(order.id);
    }
  }

  async function submitPcpReply() {
    const trimmed = pcpReplyDraft.trim().slice(0, 2000);
    const payloadText = trimmed.length > 0 ? trimmed : null;
    setSavingPcpReply(true);
    try {
      const res = await fetch("/api/comercial-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: order.id,
          pcp_reply_comercial_observation: payloadText,
        }),
      });
      const j = (await res.json()) as {
        success?: boolean;
        error?: string;
        pcp_reply_comercial_observation?: string | null;
        pcp_reply_comercial_observation_by?: string | null;
        pcp_reply_comercial_observation_at?: string | null;
      };
      if (!res.ok || j.success === false) {
        toast.error(j.error || `Erro ao salvar (${res.status})`);
        return;
      }
      const patch: OrderComercialThreadPatch = {
        pcp_reply_comercial_observation: j.pcp_reply_comercial_observation ?? null,
        pcp_reply_comercial_observation_by: j.pcp_reply_comercial_observation_by ?? null,
        pcp_reply_comercial_observation_at: j.pcp_reply_comercial_observation_at ?? null,
      };
      onComercialObservationThreadUpdated?.(order.id, patch);
      setPcpReplyDraft(patch.pcp_reply_comercial_observation ?? "");
      toast.success(
        payloadText ? "Resposta do PCP salva." : "Resposta do PCP removida."
      );
    } catch {
      toast.error("Erro de rede ao salvar resposta.");
    } finally {
      setSavingPcpReply(false);
    }
  }

  return (
    <>
      <div
        className={`grid gap-2 px-3 sm:px-4 py-1.5 border-b border-slate-200 text-xs items-center transition-colors ${
          showSelect
            ? "grid-cols-[28px_minmax(0,0.82fr)_minmax(0,1.28fr)_minmax(0,0.88fr)_minmax(0,0.88fr)_minmax(0,1.02fr)_minmax(0,0.88fr)_28px_minmax(0,1.95fr)_4.75rem]"
            : "grid-cols-[28px_minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(0,0.92fr)_minmax(0,0.92fr)_minmax(0,1.06fr)_minmax(0,0.92fr)_minmax(0,2.1fr)_4.75rem]"
        } ${rowTrafficClass}`}
        title={
          traffic === "white"
            ? undefined
            : traffic === "red"
              ? "Atrasado: prazo de vendas, PCP ou produção (fim programado) já passou."
              : traffic === "yellow"
                ? "Atenção: algum prazo vence hoje."
                : sameDayAllDeadlines
                  ? "No prazo; vendas, PCP e produção na mesma data."
                  : "No prazo: todos os prazos ainda no futuro."
        }
      >
        <div className="flex items-center justify-center shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-slate-500 hover:text-slate-800"
          >
            {expanded ? "▼" : "▶"}
          </button>
        </div>
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
        <div className="flex flex-nowrap items-center justify-end gap-1 overflow-x-auto min-w-0">
          {showObsComercialBadgeInRow && (
            <span
              className={`inline-flex shrink-0 max-w-[10rem] truncate rounded-full bg-sky-100 text-sky-900 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap border border-sky-200 ${
                showComercialObsPulse
                  ? "motion-safe:animate-comercial-obs-pulse motion-reduce:animate-none ring-2 ring-sky-400 ring-offset-1 ring-offset-transparent motion-reduce:ring-0"
                  : ""
              }`}
              title={
                showComercialObsPulse
                  ? "Novo recado do Comercial — expanda o pedido para ler e responder"
                  : (order.comercial_pcp_observation ?? undefined)
              }
              aria-label={
                showComercialObsPulse
                  ? "Recado novo do Comercial — não lido"
                  : "Observação do Comercial"
              }
            >
              Obs. Comercial
            </span>
          )}
          {pcpReplyText.length > 0 && !comercialObsPendingForPcp && (
            <span
              className="inline-flex shrink-0 max-w-[10rem] truncate rounded-full bg-emerald-100 text-emerald-900 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap border border-emerald-200"
              title={order.pcp_reply_comercial_observation ?? undefined}
            >
              Resp. PCP
            </span>
          )}
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
          {canReopenOrder && (
            <button
              type="button"
              onClick={() => onReopenOrder?.(order.id)}
              className="shrink-0 rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100 whitespace-nowrap"
            >
              Reabrir pedido
            </button>
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
        <div className="flex justify-center items-center gap-1 min-w-0 py-0.5">
          {cqCompanyId ? (
            <>
              <CQField
                targetType="order"
                targetId={order.id}
                userRole={userRole}
                userId={cqUserId}
                companyId={cqCompanyId}
              />
              <CQList
                targetType="order"
                targetId={order.id}
                companyId={cqCompanyId}
                userId={cqUserId}
                userRole={userRole}
              />
            </>
          ) : (
            <span className="text-[10px] text-slate-300">—</span>
          )}
        </div>
      </div>

      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !savingEdit && setShowEditModal(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-4 shadow-xl space-y-4 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Editar pedido</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-700">Nº do Pedido</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                  disabled={savingEdit}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Cliente</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={editClient}
                  onChange={(e) => setEditClient(e.target.value)}
                  disabled={savingEdit}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Prazo de entrega (vendas):{" "}
              <strong>{formatShortDate(order.delivery_deadline)}</strong> — altere na área{" "}
              <strong>Comercial</strong>.
            </p>

            {canEditItemDetails && editItems.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  Itens do pedido
                </div>
                <div className="divide-y divide-slate-100">
                  {order.items.map((it, idx) => {
                    const d = editItems[idx];
                    if (!d) return null;
                    return (
                      <div
                        key={it.id}
                        className="grid gap-2 px-3 py-2 sm:grid-cols-[2rem_1fr_2fr_4rem_1fr] items-start"
                      >
                        <span className="text-xs text-slate-500 pt-1.5 text-center">
                          {it.item_number}
                        </span>
                        <div>
                          <label className="text-[10px] text-slate-500">Código</label>
                          <input
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-mono"
                            value={d.product_code}
                            maxLength={120}
                            disabled={savingEdit}
                            onChange={(e) =>
                              patchEditItem(idx, { product_code: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">Descrição</label>
                          <input
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                            value={d.description}
                            maxLength={500}
                            disabled={savingEdit}
                            onChange={(e) =>
                              patchEditItem(idx, { description: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">Qtd</label>
                          <input
                            type="number"
                            min={1}
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-center"
                            value={d.quantity}
                            disabled={savingEdit}
                            onChange={(e) =>
                              patchEditItem(idx, {
                                quantity:
                                  e.target.value === ""
                                    ? 1
                                    : Math.max(1, Number(e.target.value)),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500">Linha</label>
                          <select
                            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                            value={d.line_id}
                            disabled={savingEdit}
                            onChange={(e) =>
                              patchEditItem(idx, { line_id: e.target.value })
                            }
                          >
                            <option value="">Linha...</option>
                            {lines.map((line) => (
                              <option key={line.id} value={line.id}>
                                {line.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs"
                disabled={savingEdit}
                onClick={() => setShowEditModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-md bg-[#1B4F72] text-white text-xs disabled:opacity-50"
                disabled={savingEdit}
                onClick={() => void submitEdit()}
              >
                {savingEdit ? "Salvando…" : "Salvar tudo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <>
          {(obsText.length > 0 ||
            pcpReplyText.length > 0 ||
            (canReplyAsPcp && obsText.length > 0)) && (
            <div className="mx-3 mb-2 space-y-2">
              {obsText.length > 0 && (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-slate-800">
                  <p className="text-[11px] font-semibold text-sky-950">
                    Comercial → PCP
                  </p>
                  <p className="whitespace-pre-wrap mt-1">{order.comercial_pcp_observation}</p>
                  {(order.comercial_pcp_observation_by ||
                    order.comercial_pcp_observation_at) && (
                    <p className="text-[10px] text-sky-900/85 mt-1.5">
                      Por {order.comercial_pcp_observation_by ?? "—"}
                      {order.comercial_pcp_observation_at
                        ? ` · ${formatBrazilianDateTime(order.comercial_pcp_observation_at)}`
                        : ""}
                    </p>
                  )}
                </div>
              )}
              {pcpReplyText.length > 0 && !canReplyAsPcp && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-slate-800">
                  <p className="text-[11px] font-semibold text-emerald-950">
                    PCP → Comercial
                  </p>
                  <p className="whitespace-pre-wrap mt-1">
                    {order.pcp_reply_comercial_observation}
                  </p>
                  {(order.pcp_reply_comercial_observation_by ||
                    order.pcp_reply_comercial_observation_at) && (
                    <p className="text-[10px] text-emerald-900/85 mt-1.5">
                      Por {order.pcp_reply_comercial_observation_by ?? "—"}
                      {order.pcp_reply_comercial_observation_at
                        ? ` · ${formatBrazilianDateTime(order.pcp_reply_comercial_observation_at)}`
                        : ""}
                    </p>
                  )}
                </div>
              )}
              {canReplyAsPcp && obsText.length > 0 && (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs space-y-2">
                  <p className="text-[11px] font-semibold text-slate-800">
                    Sua resposta ao Comercial
                  </p>
                  <textarea
                    className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs text-slate-800 min-h-[4rem] resize-y max-h-[12rem]"
                    placeholder="Ex.: prazo mantido na programação atual / linha X às quintas…"
                    maxLength={2000}
                    rows={3}
                    value={pcpReplyDraft}
                    onChange={(e) => setPcpReplyDraft(e.target.value.slice(0, 2000))}
                    disabled={savingPcpReply}
                  />
                  {pcpReplyText.length > 0 &&
                    (order.pcp_reply_comercial_observation_by ||
                      order.pcp_reply_comercial_observation_at) && (
                      <p className="text-[10px] text-slate-500">
                        Última resposta registrada:{" "}
                        {order.pcp_reply_comercial_observation_by ?? "—"}
                        {order.pcp_reply_comercial_observation_at
                          ? ` · ${formatBrazilianDateTime(order.pcp_reply_comercial_observation_at)}`
                          : ""}
                      </p>
                    )}
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      disabled={savingPcpReply}
                      onClick={() =>
                        setPcpReplyDraft(order.pcp_reply_comercial_observation ?? "")
                      }
                    >
                      Descartar edição
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-emerald-400 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      disabled={savingPcpReply}
                      onClick={() => void submitPcpReply()}
                    >
                      {savingPcpReply ? "Salvando…" : "Salvar resposta"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <OrderItems
            items={order.items}
            lines={lines}
            orderPcpDeadline={order.pcp_deadline}
            onChangeLine={onUpdateItemLine}
            onChangeQuantity={onUpdateItemQuantity}
            onChangeProductCode={onUpdateItemProductCode}
            onChangeDescription={onUpdateItemDescription}
            canEditItemDetails={canEditItemDetails}
            onUpdateItemPc={onUpdateItemPc}
            canReopenCompletedItem={canReopenCompletedItem}
            onReopenCompletedItem={onReopenCompletedItem}
          />
        </>
      )}
    </>
  );
}

