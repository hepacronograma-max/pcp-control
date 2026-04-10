export type DelayedOrderSidebarItem = {
  id: string;
  order_number: string;
  client_name: string | null;
  delivery_deadline: string | null;
  pcp_deadline: string | null;
};

export function DelayedOrdersSidebar({
  items,
}: {
  items: DelayedOrderSidebarItem[];
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 max-h-[640px] overflow-y-auto">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        Pedidos em Atraso ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum pedido em atraso.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((order) => {
            const deadline =
              order.delivery_deadline || order.pcp_deadline || "--";
            return (
              <li
                key={order.id}
                className="flex items-center justify-between p-2 rounded bg-red-50 border border-red-100"
              >
                <div>
                  <span className="text-sm font-medium text-slate-800">
                    {order.order_number}
                  </span>
                  <p className="text-xs text-slate-500 truncate max-w-[180px]">
                    {order.client_name}
                  </p>
                </div>
                <span className="text-xs text-red-600 font-medium whitespace-nowrap">
                  {deadline}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
