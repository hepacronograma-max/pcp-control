'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { getOperatorLineIdsForLocalUser } from "@/lib/local-users";
import type {
  OrderComercialThreadPatch,
  OrderWithItems,
  ProductionLine,
  UserRole,
} from "@/lib/types/database";
import { OrdersTable } from "@/components/pedidos/orders-table";
import { defaultAppPathForRole, hasPermission } from "@/lib/utils/permissions";
import { itemStatusAfterReopenCompleted } from "@/lib/utils/order-aggregates";
import { toDateOnly, toQuantity } from "@/lib/utils/supabase-data";
import { Button } from "@/components/ui/button";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { toast } from "sonner";
import { shouldUseLocalServiceApi } from "@/lib/local-service-api";
import { totalOmieSyncAlertCount } from "@/lib/utils/omie-sync-alerts";
import type { OmieImportReport } from "@/lib/omie/types";
import { summarizeOmieImportReport } from "@/components/omie/import-report-summary";

type TabKey = "open" | "finished";

async function postOrderItemsUpdate(
  body: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/order-items/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let message = "";
  let success = true;
  try {
    const j = (await res.json()) as {
      error?: string;
      success?: boolean;
    };
    message = j.error || "";
    if (j.success === false) success = false;
  } catch {
    message = "";
  }
  if (!res.ok || !success) {
    return {
      ok: false,
      error:
        message ||
        (res.status === 401
          ? "Não autenticado. Saia e entre de novo (login local)."
          : `Erro ao salvar (${res.status})`),
    };
  }
  return { ok: true };
}

export default function PedidosPage() {
  const supabase = createClient();
  const { profile, loading } = useUser();
  const {
    companyId: effectiveCompanyId,
    loaded: effectiveLoaded,
  } = useEffectiveCompanyId(profile);
  const router = useRouter();

  /** Modo local APENAS quando Supabase não está configurado. Com Supabase, sempre usa banco. */
  const isLocal = !supabase;

  useEffect(() => {
    if (!loading && profile && (profile.role === "operator" || profile.role === "logistica")) {
      const lineIds = getOperatorLineIdsForLocalUser(profile.id);
      if (lineIds.length > 0) {
        router.replace(`/linha/${lineIds[0]}`);
      } else {
        router.replace("/");
      }
    }
  }, [loading, profile, router]);

  useEffect(() => {
    if (
      !loading &&
      profile &&
      profile.role !== "operator" &&
      profile.role !== "logistica" &&
      !hasPermission(profile.role, "viewOrders")
    ) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [loading, profile, router]);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [tab, setTab] = useState<TabKey>("open");
  const [loadingData, setLoadingData] = useState(false);
  const [importingOmie, setImportingOmie] = useState(false);

  const useApi = shouldUseLocalServiceApi(profile);

  const reloadOrders = useCallback(async () => {
    if (!profile || !effectiveCompanyId) return;
    setLoadingData(true);
    try {
      const res = await fetch(
        `/api/company-data?companyId=${encodeURIComponent(effectiveCompanyId)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        setOrders([]);
        setLines([]);
        return;
      }
      const json = await res.json();
      setOrders((json.orders ?? []) as OrderWithItems[]);
      const raw = (json.lines ?? []) as ProductionLine[];
      setLines(raw.filter((l) => l.is_active !== false));
    } catch {
      setOrders([]);
      setLines([]);
    } finally {
      setLoadingData(false);
    }
  }, [profile, effectiveCompanyId]);

  useEffect(() => {
    if (!profile) return;
    if (useApi && profile.company_id === "local-company" && !effectiveLoaded) {
      return;
    }
    if (!effectiveCompanyId) return;
    void reloadOrders();
  }, [profile, effectiveCompanyId, effectiveLoaded, useApi, reloadOrders]);

  const userRole: UserRole | null = profile ? profile.role : null;
  const canImport =
    userRole && hasPermission(userRole, "importOrders");

  const openCount = useMemo(
    () => orders.filter((o) => o.status !== "finished").length,
    [orders]
  );
  const finishedCount = useMemo(
    () => orders.filter((o) => o.status === "finished").length,
    [orders]
  );
  const omieSyncAlertTotal = useMemo(
    () => totalOmieSyncAlertCount(orders),
    [orders]
  );

  function updateOrdersState(
    updater: (prev: OrderWithItems[]) => OrderWithItems[]
  ) {
    setOrders((prev) => updater(prev));
  }

  async function handleImportOmie() {
    setImportingOmie(true);
    const loadingToast = toast.loading("Importando pedidos do Omie…");
    try {
      const res = await fetch("/api/admin/omie", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        skipped?: boolean;
        report?: OmieImportReport;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? `Erro ${res.status}`, { id: loadingToast });
        return;
      }
      if (json.report) {
        const summary = summarizeOmieImportReport(json.report);
        if (summary.level === "warning") {
          toast.warning(summary.title, {
            id: loadingToast,
            description: summary.description,
          });
        } else if (summary.level === "success") {
          toast.success(summary.title, {
            id: loadingToast,
            description: summary.description,
          });
        } else {
          toast.info(summary.title, {
            id: loadingToast,
            description: summary.description,
          });
        }
      } else {
        toast.success("Importação Omie concluída", { id: loadingToast });
      }
      await reloadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar do Omie", {
        id: loadingToast,
      });
    } finally {
      setImportingOmie(false);
    }
  }

  async function handleUpdateOrderPcpDate(orderId: string, date: string | null) {
    const dateVal = toDateOnly(date);
    if (useApi) {
      const r = await postOrderItemsUpdate({
        action: "pcp_deadline",
        orderId,
        pcp_deadline: date,
      });
      if (!r.ok) {
        toast.error(r.error);
        if (/pcp_deadline|column|does not exist/i.test(r.error)) {
          toast.message(
            "Execute no Supabase (SQL): ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pcp_deadline date;",
            { duration: 12000 }
          );
        }
        return;
      }
      toast.success("Prazo PCP salvo.");
    } else if (supabase) {
      const { error: oErr } = await supabase
        .from("orders")
        .update({ pcp_deadline: dateVal })
        .eq("id", orderId);
      if (oErr) {
        toast.error(oErr.message || "Erro ao salvar prazo PCP no pedido.");
        return;
      }
      const { error: iErr } = await supabase
        .from("order_items")
        .update({ pcp_deadline: dateVal })
        .eq("order_id", orderId);
      if (iErr) {
        toast.error(
          iErr.message.includes("pcp_deadline")
            ? "Coluna pcp_deadline ausente em order_items. Execute o SQL em supabase-add-columns.sql"
            : iErr.message
        );
        return;
      }
      toast.success("Prazo PCP salvo.");
    } else return;

    updateOrdersState((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              pcp_deadline: dateVal,
              items: o.items.map((it) => ({
                ...it,
                pcp_deadline: dateVal,
              })),
            }
          : o
      )
    );
  }

  async function handleUpdateItemLine(itemId: string, lineId: string | null) {
    if (useApi) {
      const r = await postOrderItemsUpdate({ action: "line", itemId, lineId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    } else if (supabase) {
      await supabase.from("order_items").update({ line_id: lineId }).eq("id", itemId);
    } else return;
    updateOrdersState((prev) =>
      prev.map((order) => ({
        ...order,
        items: order.items.map((item) =>
          item.id === itemId ? { ...item, line_id: lineId } : item
        ),
      }))
    );
  }

  // Prazo PCP por item deixou de ser editável; os itens herdam o prazo do pedido.

  async function handleUpdateItemPc(
    itemId: string,
    data: { pc_number: string | null; pc_delivery_date: string | null }
  ) {
    const pcNum = data.pc_number;
    const pcDate = toDateOnly(data.pc_delivery_date);
    if (useApi) {
      const r = await postOrderItemsUpdate({
        action: "pc",
        itemId,
        pc_number: pcNum,
        pc_delivery_date: data.pc_delivery_date,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    } else if (supabase) {
      await supabase
        .from("order_items")
        .update({
          pc_number: pcNum,
          pc_delivery_date: pcDate,
        })
        .eq("id", itemId);
    } else return;
    updateOrdersState((prev) =>
      prev.map((order) => ({
        ...order,
        items: order.items.map((item) =>
          item.id === itemId
            ? { ...item, pc_number: pcNum, pc_delivery_date: pcDate }
            : item
        ),
      }))
    );
  }

  async function handleUpdateItemQuantity(itemId: string, quantity: number) {
    const qty = toQuantity(quantity);
    if (useApi) {
      const r = await postOrderItemsUpdate({ action: "quantity", itemId, quantity });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    } else if (supabase) {
      await supabase.from("order_items").update({ quantity: qty }).eq("id", itemId);
    } else return;
    updateOrdersState((prev) =>
      prev.map((order) => ({
        ...order,
        items: order.items.map((item) =>
          item.id === itemId ? { ...item, quantity: qty } : item
        ),
      }))
    );
  }

  async function handleUpdateItemProductCode(itemId: string, productCode: string) {
    if (useApi) {
      const r = await postOrderItemsUpdate({
        action: "item_details",
        itemId,
        product_code: productCode,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    } else if (supabase) {
      const code = productCode.trim();
      await supabase
        .from("order_items")
        .update({ product_code: code || null })
        .eq("id", itemId);
    } else return;
    updateOrdersState((prev) =>
      prev.map((o) => ({
        ...o,
        items: o.items.map((it) =>
          it.id === itemId
            ? { ...it, product_code: productCode.trim() || null }
            : it
        ),
      }))
    );
  }

  async function handleUpdateItemDescription(itemId: string, description: string) {
    const desc = description.trim().slice(0, 500);
    if (useApi) {
      const r = await postOrderItemsUpdate({
        action: "item_details",
        itemId,
        description: desc,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    } else if (supabase) {
      await supabase
        .from("order_items")
        .update({ description: desc })
        .eq("id", itemId);
    } else return;
    updateOrdersState((prev) =>
      prev.map((o) => ({
        ...o,
        items: o.items.map((it) =>
          it.id === itemId ? { ...it, description: desc } : it
        ),
      }))
    );
  }

  async function handleUpdateOrder(
    orderId: string,
    data: {
      order_number?: string;
      client_name?: string;
    }
  ) {
    const update: Record<string, unknown> = {};
    if (data.order_number !== undefined) update.order_number = String(data.order_number).trim().slice(0, 50);
    if (data.client_name !== undefined) update.client_name = String(data.client_name).trim().slice(0, 255);
    if (Object.keys(update).length === 0) return;
    if (useApi) {
      const r = await postOrderItemsUpdate({ action: "order", orderId, ...data });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    } else if (supabase) {
      await supabase.from("orders").update(update).eq("id", orderId);
    } else return;
    updateOrdersState((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, ...update } : o
      )
    );
  }

  async function handleDeleteOrder(orderId: string) {
    if (
      !window.confirm(
        "Excluir este pedido e todos os itens? Esta ação não pode ser desfeita."
      )
    ) {
      return;
    }
    if (useApi) {
      const r = await postOrderItemsUpdate({ action: "delete", orderId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    } else if (supabase) {
      await supabase.from("order_items").delete().eq("order_id", orderId);
      await supabase.from("orders").delete().eq("id", orderId);
    } else return;
    updateOrdersState((prev) => prev.filter((o) => o.id !== orderId));
  }

  async function runFinishOrder(orderId: string) {
    const nowIso = new Date().toISOString();
    if (useApi) {
      const r = await postOrderItemsUpdate({ action: "finish", orderId });
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
    } else if (supabase) {
      let { error } = await supabase
        .from("orders")
        .update({ status: "finished", finished_at: nowIso })
        .eq("id", orderId);
      if (
        error &&
        /finished_at|schema cache|column|does not exist/i.test(error.message)
      ) {
        ({ error } = await supabase
          .from("orders")
          .update({ status: "finished" })
          .eq("id", orderId));
      }
      if (error) {
        toast.error(error.message);
        return false;
      }

      const { error: itemsError } = await supabase
        .from("order_items")
        .update({ status: "completed", completed_at: nowIso })
        .eq("order_id", orderId)
        .neq("status", "completed");
      if (itemsError) {
        toast.error(itemsError.message);
        return false;
      }
    } else return false;

    updateOrdersState((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "finished",
              finished_at: nowIso,
              items: o.items.map((it) =>
                it.status === "completed"
                  ? it
                  : { ...it, status: "completed", completed_at: nowIso }
              ),
            }
          : o
      )
    );
    return true;
  }

  async function handleFinishOrder(orderId: string) {
    if (
      !window.confirm(
        "Finalizar este pedido? Você poderá reabri-lo depois em Finalizados, se precisar."
      )
    ) {
      return;
    }
    await runFinishOrder(orderId);
  }

  async function runReopenOrder(orderId: string): Promise<boolean> {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status !== "finished") return false;

    if (useApi) {
      const r = await postOrderItemsUpdate({ action: "unfinish", orderId });
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
    } else if (supabase) {
      let { error } = await supabase
        .from("orders")
        .update({ status: "planning", finished_at: null })
        .eq("id", orderId);
      if (
        error &&
        /finished_at|schema cache|column|does not exist/i.test(error.message)
      ) {
        ({ error } = await supabase
          .from("orders")
          .update({ status: "planning" })
          .eq("id", orderId));
      }
      if (error) {
        toast.error(error.message);
        return false;
      }

      const completedIds = order.items.filter((it) => it.status === "completed").map((it) => it.id);
      for (const itemId of completedIds) {
        const it = order.items.find((x) => x.id === itemId);
        if (!it) continue;
        const nextStatus = itemStatusAfterReopenCompleted(it);
        let patch: Record<string, unknown> = {
          status: nextStatus,
          completed_at: null,
          completed_by: null,
        };
        let { error: ie } = await supabase.from("order_items").update(patch).eq("id", itemId);
        if (
          ie &&
          /completed_by|schema cache|column|does not exist/i.test(ie.message)
        ) {
          patch = { status: nextStatus, completed_at: null };
          ({ error: ie } = await supabase.from("order_items").update(patch).eq("id", itemId));
        }
        if (ie) {
          toast.error(ie.message);
          return false;
        }
      }
    } else return false;

    updateOrdersState((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "planning",
              finished_at: null,
              items: o.items.map((it) =>
                it.status === "completed"
                  ? {
                      ...it,
                      status: itemStatusAfterReopenCompleted(it),
                      completed_at: null,
                      completed_by: null,
                    }
                  : it
              ),
            }
          : o
      )
    );
    return true;
  }

  async function handleReopenOrder(orderId: string) {
    if (
      !window.confirm(
        "Reabrir este pedido? Ele volta para Em aberto e os itens concluídos voltam para programação ou aguardando."
      )
    ) {
      return;
    }
    const ok = await runReopenOrder(orderId);
    if (ok) toast.success("Pedido reaberto.");
  }

  async function handleReopenItem(itemId: string) {
    const order = orders.find((o) => o.items.some((it) => it.id === itemId));
    const item = order?.items.find((it) => it.id === itemId);
    if (!item || item.status !== "completed") return;

    if (
      !window.confirm(
        "Reabrir este item? Ele deixa de aparecer como concluído e volta para programação ou aguardando."
      )
    ) {
      return;
    }

    const nextStatus = itemStatusAfterReopenCompleted(item);

    if (useApi) {
      const r = await postOrderItemsUpdate({ action: "uncomplete", itemId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    } else if (supabase) {
      let patch: Record<string, unknown> = {
        status: nextStatus,
        completed_at: null,
        completed_by: null,
      };
      let { error } = await supabase.from("order_items").update(patch).eq("id", itemId);
      if (
        error &&
        /completed_by|schema cache|column|does not exist/i.test(error.message)
      ) {
        patch = { status: nextStatus, completed_at: null };
        ({ error } = await supabase.from("order_items").update(patch).eq("id", itemId));
      }
      if (error) {
        toast.error(error.message);
        return;
      }

      if (order?.status === "finished") {
        let { error: oe } = await supabase
          .from("orders")
          .update({ status: "planning", finished_at: null })
          .eq("id", order.id);
        if (
          oe &&
          /finished_at|schema cache|column|does not exist/i.test(oe.message)
        ) {
          ({ error: oe } = await supabase
            .from("orders")
            .update({ status: "planning" })
            .eq("id", order.id));
        }
        if (oe) {
          toast.error(oe.message);
          return;
        }
      }
    } else return;

    updateOrdersState((prev) =>
      prev.map((o) => {
        if (!o.items.some((it) => it.id === itemId)) return o;
        const wasFinished = o.status === "finished";
        return {
          ...o,
          ...(wasFinished
            ? { status: "planning" as const, finished_at: null }
            : {}),
          items: o.items.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  status: nextStatus,
                  completed_at: null,
                  completed_by: null,
                }
              : it
          ),
        };
      })
    );
    toast.success("Item reaberto.");
  }

  async function handleFinishOrdersBulk(orderIds: string[]) {
    if (orderIds.length === 0) return;
    const ready = orderIds.filter((id) => {
      const o = orders.find((x) => x.id === id);
      return (
        o &&
        o.items.length > 0 &&
        o.items.every((it) => it.status === "completed")
      );
    });
    if (ready.length === 0) {
      toast.error(
        "Nenhum pedido selecionado pode ser finalizado (todos os itens precisam estar concluídos)."
      );
      return;
    }
    if (
      !window.confirm(
        `Finalizar ${ready.length} pedido(s)? Você poderá reabrir depois na aba Finalizados, se precisar.`
      )
    ) {
      return;
    }
    let ok = 0;
    for (const id of ready) {
      if (await runFinishOrder(id)) ok++;
    }
    if (ok > 0) {
      toast.success(
        ok === 1 ? "Pedido finalizado." : `${ok} pedidos finalizados.`
      );
    }
  }

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newDeliveryDeadline, setNewDeliveryDeadline] = useState("");
  const [newItems, setNewItems] = useState<
    { description: string; quantity: number }[]
  >([]);

  function addNewItemRow() {
    setNewItems((prev) => [...prev, { description: "", quantity: 1 }]);
  }

  function updateNewItem(
    index: number,
    field: "description" | "quantity",
    value: string
  ) {
    setNewItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]:
                field === "quantity" ? Number(value || 0) : value,
            }
          : item
      )
    );
  }

  function removeNewItem(index: number) {
    setNewItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateOrder() {
    if (!profile || !effectiveCompanyId) return;
    if (!newOrderNumber || !newClientName || newItems.length === 0) return;

    if (supabase) {
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("company_id", effectiveCompanyId)
        .eq("order_number", newOrderNumber.trim())
        .maybeSingle();
      if (existing) {
        alert(`Pedido ${newOrderNumber} já existe para esta empresa.`);
        return;
      }

      const { data: createdOrders } = await supabase
        .from("orders")
        .insert({
          company_id: effectiveCompanyId,
          order_number: newOrderNumber.trim(),
          client_name: newClientName.trim(),
          delivery_deadline: toDateOnly(newDeliveryDeadline),
          status: "imported",
          created_by: profile.id,
        })
        .select();

      const createdOrder = createdOrders?.[0] as OrderWithItems | undefined;
      if (!createdOrder) return;

      const { data: createdItems } = await supabase
        .from("order_items")
        .insert(
          newItems.map((item, index) => ({
            order_id: createdOrder.id,
            item_number: index + 1,
            description: (item.description || "").trim().slice(0, 500),
            quantity: toQuantity(item.quantity),
          }))
        )
        .select();

      const itemsWithMeta = (createdItems ?? []) as any[];
      const fullOrder: OrderWithItems = {
        ...createdOrder,
        items: itemsWithMeta,
      };

      setOrders((prev) => [fullOrder, ...prev]);
    }
    setShowNewDialog(false);
    setNewOrderNumber("");
    setNewClientName("");
    setNewDeliveryDeadline("");
    setNewItems([]);
  }

  const needsEffectiveCompany =
    supabase && profile?.company_id === "local-company";
  const effectiveReady = !needsEffectiveCompany || effectiveLoaded;

  if (loading || !profile || !effectiveReady) {
    return (
      <div className="text-sm text-slate-500">Carregando pedidos...</div>
    );
  }

  if (needsEffectiveCompany && !effectiveCompanyId) {
    return (
      <div className="text-sm text-amber-700">
        Nenhuma empresa cadastrada. Configure em Configurações → Empresa.
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="text-sm text-amber-700">
        Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e
        NEXT_PUBLIC_SUPABASE_ANON_KEY para usar o sistema.
      </div>
    );
  }

  const visibleOrders =
    tab === "finished"
      ? orders.filter((o) => o.status === "finished")
      : orders.filter((o) => o.status !== "finished");

  return (
    <div className="space-y-4 w-full max-w-[100vw] min-w-0">
      {omieSyncAlertTotal > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">
            {omieSyncAlertTotal === 1
              ? "1 item com alerta Omie"
              : `${omieSyncAlertTotal} itens com alerta Omie`}
          </p>
          <p className="mt-1 text-xs text-red-800">
            O Omie divergiu de itens em produção ou concluídos (ou sumiu no Omie).
            O PCP não foi alterado automaticamente — medie com vendas/produção e
            corrija no Omie quando aplicável.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className={`px-3 py-2 min-h-[40px] rounded-md text-xs font-medium border ${
              tab === "open"
                ? "bg-white border-slate-300 text-slate-900"
                : "bg-slate-100 border-transparent text-slate-600"
            }`}
            onClick={() => setTab("open")}
          >
            Em Aberto ({openCount})
          </button>
          <button
            type="button"
            className={`px-3 py-2 min-h-[40px] rounded-md text-xs font-medium border ${
              tab === "finished"
                ? "bg-white border-slate-300 text-slate-900"
                : "bg-slate-100 border-transparent text-slate-600"
            }`}
            onClick={() => setTab("finished")}
          >
            Finalizados ({finishedCount})
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          <PageExportMenu
            fileNameBase={`pedidos-${tab === "open" ? "abertos" : "finalizados"}`}
            sheetTitle="Pedidos"
            getData={() => {
              const headers = [
                "Nº Pedido",
                "Cliente",
                "Prazo Vendas",
                "Prazo PCP",
                "Item",
                "Descrição",
                "Qtd",
                "Linha",
                "PC nº",
                "PC entrega",
                "Prazo Prod.",
                "Status pedido",
              ];
              const rows: (string | number | null)[][] = [];
              for (const o of visibleOrders) {
                const lineName = (id: string | null) =>
                  id ? lines.find((l) => l.id === id)?.name ?? "" : "";
                for (const it of o.items ?? []) {
                  rows.push([
                    o.order_number,
                    o.client_name,
                    o.delivery_deadline ?? "",
                    o.pcp_deadline ?? "",
                    it.item_number,
                    it.description,
                    it.quantity,
                    lineName(it.line_id),
                    it.pc_number ?? "",
                    it.pc_delivery_date ?? "",
                    it.production_end ?? "",
                    o.status,
                  ]);
                }
              }
              return { headers, rows };
            }}
          />
          <Button
            className="bg-slate-100 text-slate-800 hover:bg-slate-200 text-xs"
            onClick={() => setShowNewDialog(true)}
          >
            ➕ Novo Pedido
          </Button>
          {canImport && (
            <>
              <Button
                className="bg-slate-100 text-slate-800 hover:bg-slate-200 text-xs"
                onClick={() => router.push("/importar")}
              >
                Importar PDF
              </Button>
              <Button
                className="text-xs"
                disabled={importingOmie}
                onClick={() => void handleImportOmie()}
              >
                {importingOmie ? "Importando…" : "Importar do Omie"}
              </Button>
            </>
          )}
        </div>
      </div>

      {loadingData ? (
        <div className="text-sm text-slate-500">Carregando dados...</div>
      ) : (
        <OrdersTable
          orders={orders}
          visibleOrders={visibleOrders}
          lines={lines}
          userRole={userRole as UserRole}
          cqUserId={profile?.id}
          cqCompanyId={effectiveCompanyId}
          onUpdateOrderPcpDate={handleUpdateOrderPcpDate}
          onUpdateItemLine={handleUpdateItemLine}
          onUpdateItemQuantity={handleUpdateItemQuantity}
          onUpdateItemProductCode={handleUpdateItemProductCode}
          onUpdateItemDescription={handleUpdateItemDescription}
          onUpdateItemPc={handleUpdateItemPc}
          onUpdateOrder={handleUpdateOrder}
          onDeleteOrder={handleDeleteOrder}
          onFinishOrder={handleFinishOrder}
          onFinishOrdersBulk={handleFinishOrdersBulk}
          onReopenOrder={handleReopenOrder}
          onReopenCompletedItem={handleReopenItem}
          onComercialObservationThreadUpdated={(orderId, patch: OrderComercialThreadPatch) => {
            updateOrdersState((prev) =>
              prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o))
            );
          }}
        />
      )}

      {showNewDialog && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Novo Pedido
              </h2>
              <button
                className="text-xs text-slate-500"
                onClick={() => setShowNewDialog(false)}
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Nº do Pedido
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  value={newOrderNumber}
                  onChange={(e) => setNewOrderNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Cliente
                </label>
                <input
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Prazo de Entrega
                </label>
                <input
                  type="date"
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                  value={newDeliveryDeadline}
                  onChange={(e) => setNewDeliveryDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Itens
                </span>
                <button
                  className="text-xs text-[#1B4F72]"
                  onClick={addNewItemRow}
                >
                  + Adicionar Item
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {newItems.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_40px] gap-2 items-center"
                  >
                    <input
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      placeholder="Descrição"
                      value={item.description}
                      onChange={(e) =>
                        updateNewItem(index, "description", e.target.value)
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      value={item.quantity}
                      onChange={(e) =>
                        updateNewItem(index, "quantity", e.target.value)
                      }
                    />
                    <button
                      className="text-xs text-red-500"
                      onClick={() => removeNewItem(index)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
                {newItems.length === 0 && (
                  <p className="text-[11px] text-slate-500">
                    Nenhum item adicionado. Clique em &quot;+ Adicionar Item&quot;.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs"
                onClick={() => setShowNewDialog(false)}
              >
                Cancelar
              </button>
              <Button
                className="text-xs"
                onClick={handleCreateOrder}
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

