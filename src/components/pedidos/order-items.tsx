import type {
  OrderItemWithLine,
  ProductionLine,
} from "@/lib/types/database";
import { formatShortDate } from "@/lib/utils/date";
import { ItemStatusBadge } from "./order-status-badge";

interface OrderItemsProps {
  items: OrderItemWithLine[];
  lines: ProductionLine[];
  onChangeLine: (itemId: string, lineId: string | null) => void;
  onChangeQuantity: (itemId: string, quantity: number) => void;
}

export function OrderItems({
  items,
  lines,
  onChangeLine,
  onChangeQuantity,
}: OrderItemsProps) {
  return (
    <div className="bg-slate-50 border-t border-slate-200">
      <div className="grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] gap-2 px-4 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-200">
        <span>Item</span>
        <span>Descrição</span>
        <span>Qtde</span>
        <span>Linha Prod.</span>
        <span>Prazo PCP</span>
        <span>Prazo Prod.</span>
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          className="grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] gap-2 px-4 py-2 text-xs items-center"
        >
          <div className="text-slate-400">{item.item_number}</div>
          <div className="truncate">{item.description}</div>
          <div>
            <input
              type="number"
              min={1}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-center"
              value={item.quantity}
              onChange={(e) =>
                onChangeQuantity(
                  item.id,
                  e.target.value === "" ? 0 : Number(e.target.value)
                )
              }
            />
          </div>
          <div>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              value={item.line_id ?? ""}
              onChange={(e) =>
                onChangeLine(item.id, e.target.value || null)
              }
            >
              <option value="">
                {item.line_id ? "Sem linha" : "Selecionar linha..."}
              </option>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="w-full rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-center text-slate-700">
              {formatShortDate(item.pcp_deadline)}
            </div>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs text-slate-500">
              {formatShortDate(item.production_end)}
            </span>
            <ItemStatusBadge
              status={item.status}
              productionStart={item.production_start}
              productionEnd={item.production_end}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

