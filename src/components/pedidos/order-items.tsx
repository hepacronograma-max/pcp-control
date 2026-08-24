import { useEffect, useState } from "react";
import type {
  OrderItemWithLine,
  ProductionLine,
} from "@/lib/types/database";
import { formatShortDate, isPastDeadline, pastDeadlineTextClass } from "@/lib/utils/date";
import { ItemStatusBadge } from "./order-status-badge";
import { OmieSyncItemAlert } from "./omie-sync-alert";

type ItemTextDraft = { product_code: string; description: string };

interface OrderItemsProps {
  items: OrderItemWithLine[];
  lines: ProductionLine[];
  /** Prazo PCP do pedido — exibido nos itens quando o item ainda não tem coluna preenchida no banco */
  orderPcpDeadline: string | null;
  onChangeLine: (itemId: string, lineId: string | null) => void;
  onChangeQuantity: (itemId: string, quantity: number) => void;
  onChangeProductCode?: (itemId: string, productCode: string) => void;
  onChangeDescription?: (itemId: string, description: string) => void;
  canEditItemDetails?: boolean;
  onUpdateItemPc: (
    itemId: string,
    data: { pc_number: string | null; pc_delivery_date: string | null }
  ) => void;
  /** Reabrir item marcado como concluído (PCP/gestão). */
  canReopenCompletedItem?: boolean;
  onReopenCompletedItem?: (itemId: string) => void;
}

export function OrderItems({
  items,
  lines,
  orderPcpDeadline,
  onChangeLine,
  onChangeQuantity,
  onChangeProductCode,
  onChangeDescription,
  canEditItemDetails = false,
  onUpdateItemPc,
  canReopenCompletedItem,
  onReopenCompletedItem,
}: OrderItemsProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [pcModalItemId, setPcModalItemId] = useState<string | null>(null);
  const [pcFormNumber, setPcFormNumber] = useState("");
  const [pcFormDate, setPcFormDate] = useState("");
  const [textDrafts, setTextDrafts] = useState<Record<string, ItemTextDraft>>({});

  useEffect(() => {
    setTextDrafts((prev) => {
      const next: Record<string, ItemTextDraft> = { ...prev };
      for (const item of items) {
        next[item.id] = {
          product_code: (item.product_code ?? "").trim(),
          description: item.description ?? "",
        };
      }
      return next;
    });
  }, [items]);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function openPcModal(item: OrderItemWithLine) {
    setPcModalItemId(item.id);
    setPcFormNumber(item.pc_number ?? "");
    setPcFormDate(
      item.pc_delivery_date
        ? String(item.pc_delivery_date).slice(0, 10)
        : ""
    );
  }

  function closePcModal() {
    setPcModalItemId(null);
  }

  function submitPc() {
    if (!pcModalItemId) return;
    onUpdateItemPc(pcModalItemId, {
      pc_number: pcFormNumber.trim() || null,
      pc_delivery_date: pcFormDate.trim() || null,
    });
    closePcModal();
  }

  function patchDraft(itemId: string, patch: Partial<ItemTextDraft>) {
    setTextDrafts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  }

  function commitTextDraft(item: OrderItemWithLine) {
    const draft = textDrafts[item.id];
    if (!draft) return;
    const savedCode = (item.product_code ?? "").trim();
    const savedDesc = item.description ?? "";
    if (onChangeProductCode && draft.product_code !== savedCode) {
      void onChangeProductCode(item.id, draft.product_code);
    }
    if (onChangeDescription && draft.description !== savedDesc) {
      void onChangeDescription(item.id, draft.description);
    }
  }

  const gridCols =
    "grid-cols-[26px_minmax(0,0.55fr)_minmax(0,1.75fr)_40px_minmax(0,0.85fr)_minmax(0,0.7fr)_76px_minmax(0,1.05fr)]";

  return (
    <div className="bg-slate-50 border-t border-slate-200">
      <div
        className={`grid ${gridCols} gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-slate-500 border-b border-slate-200`}
      >
        <span>Item</span>
        <span className="truncate">Cód.</span>
        <span>Descrição</span>
        <span className="text-center">Qtd</span>
        <span className="truncate">Linha</span>
        <span className="text-center truncate">PCP</span>
        <span className="text-center">PC</span>
        <span>Prazo prod.</span>
      </div>
      {items.map((item) => {
        const isExpanded = expandedItems.has(item.id);
        const effectivePcp = item.pcp_deadline ?? orderPcpDeadline;
        const hasPc =
          !!(item.pc_number?.trim()) || !!(item.pc_delivery_date?.trim());
        const draft = textDrafts[item.id] ?? {
          product_code: (item.product_code ?? "").trim(),
          description: item.description ?? "",
        };
        return (
          <div
            key={item.id}
            className={`grid ${gridCols} gap-1.5 px-3 py-2 text-[10px] sm:text-xs items-center`}
          >
            <div className="text-slate-400 text-center">{item.item_number}</div>
            <div className="min-w-0">
              {canEditItemDetails && onChangeProductCode ? (
                <input
                  className="w-full rounded-md border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-mono text-center"
                  value={draft.product_code}
                  placeholder="Código"
                  maxLength={120}
                  onChange={(e) =>
                    patchDraft(item.id, { product_code: e.target.value })
                  }
                  onBlur={() => commitTextDraft(item)}
                  title="Código do produto"
                />
              ) : (
                <div
                  className="font-mono text-[10px] text-slate-700 truncate text-center"
                  title={(item.product_code ?? "").trim() || undefined}
                >
                  {(item.product_code ?? "").trim() || "—"}
                </div>
              )}
            </div>
            <div className="min-w-0">
              {canEditItemDetails && onChangeDescription ? (
                <input
                  className="w-full rounded-md border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                  value={draft.description}
                  maxLength={500}
                  onChange={(e) =>
                    patchDraft(item.id, { description: e.target.value })
                  }
                  onBlur={() => commitTextDraft(item)}
                  title="Descrição do item"
                />
              ) : (
                <div
                  className={
                    isExpanded
                      ? "cursor-pointer whitespace-normal break-words"
                      : "truncate cursor-pointer hover:text-[#1B4F72]"
                  }
                  title={item.description}
                  onClick={() => toggleExpand(item.id)}
                >
                  {item.description}
                </div>
              )}
            </div>
            <div>
              <input
                type="number"
                min={1}
                className="w-full max-w-[40px] mx-auto rounded-md border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-center"
                value={item.quantity}
                onChange={(e) =>
                  onChangeQuantity(
                    item.id,
                    e.target.value === "" ? 0 : Number(e.target.value)
                  )
                }
              />
            </div>
            <div className="min-w-0">
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-1 py-0.5 text-[10px] truncate"
                value={item.line_id ?? ""}
                onChange={(e) =>
                  onChangeLine(item.id, e.target.value || null)
                }
                title={
                  lines.find((l) => l.id === item.line_id)?.name ?? ""
                }
              >
                <option value="">
                  {item.line_id ? "Sem linha" : "Linha..."}
                </option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <div
                className={`w-full rounded-md border px-1 py-0.5 text-[10px] text-center truncate ${
                  item.status !== "completed" && isPastDeadline(effectivePcp)
                    ? "border-red-300 bg-red-50 text-red-700 font-semibold"
                    : "border-slate-200 bg-slate-100 text-slate-700"
                }`}
                title={
                  item.status !== "completed" && isPastDeadline(effectivePcp)
                    ? "Prazo PCP vencido — reprogramar."
                    : undefined
                }
              >
                {formatShortDate(effectivePcp)}
              </div>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => openPcModal(item)}
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                  hasPc
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
                title={
                  hasPc
                    ? `PC ${item.pc_number ?? ""} · entrega ${formatShortDate(item.pc_delivery_date)}`
                    : "Registrar pedido de compra"
                }
              >
                PC
              </button>
            </div>
            <div className="flex justify-between items-center gap-1 min-w-0">
              <span
                className={`text-[10px] shrink-0 ${
                  pastDeadlineTextClass(item.production_end, {
                    open: item.status !== "completed",
                  }) || "text-slate-500"
                }`}
                title={
                  item.status !== "completed" &&
                  isPastDeadline(item.production_end)
                    ? "Prazo de produção vencido — reprogramar."
                    : undefined
                }
              >
                {formatShortDate(item.production_end)}
              </span>
            <div className="flex flex-col items-end gap-0.5 min-w-0">
              <ItemStatusBadge
                status={item.status}
                productionStart={item.production_start}
                productionEnd={item.production_end}
                pcpDeadline={effectivePcp}
              />
              {item.status === "completed" &&
                canReopenCompletedItem &&
                onReopenCompletedItem && (
                  <button
                    type="button"
                    className="rounded border border-amber-400 bg-amber-50 px-1 py-0.5 text-[9px] font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                    title="Desfazer conclusão deste item"
                    onClick={() => onReopenCompletedItem(item.id)}
                  >
                    Reabrir item
                  </button>
                )}
              <OmieSyncItemAlert item={item} />
            </div>
            </div>
          </div>
        );
      })}

      {pcModalItemId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg space-y-3 text-sm">
            <h3 className="text-sm font-semibold text-slate-800">
              Pedido de compras (PC)
            </h3>
            <p className="text-[11px] text-slate-600">
              Matéria-prima: a produção na linha não pode começar antes da data
              de entrega abaixo.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">
                Número do PC
              </label>
              <input
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                value={pcFormNumber}
                onChange={(e) => setPcFormNumber(e.target.value)}
                placeholder="Ex.: PC-2025-001"
                maxLength={80}
              />
              <label className="text-xs font-medium text-slate-700">
                Data de entrega (matéria-prima)
              </label>
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                value={pcFormDate}
                onChange={(e) => setPcFormDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                onClick={closePcModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-[#1B4F72] px-3 py-1.5 text-xs text-white"
                onClick={submitPc}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
