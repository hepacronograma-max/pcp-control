"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { shouldUseLocalServiceApi } from "@/lib/local-service-api";
import {
  defaultAppPathForRole,
  hasPermission,
} from "@/lib/utils/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import {
  PurchaseOrdersTable,
  type PurchaseOrderRow,
} from "@/components/compras/purchase-orders-table";
import { toast } from "sonner";
import { formatShortDate } from "@/lib/utils/date";

type ItemForLink = {
  id: string;
  order_id: string;
  description: string | null;
  pc_number: string | null;
  pc_delivery_date: string | null;
  order_number: string;
};

function formatDateOnly(iso: string | null) {
  if (!iso) return "—";
  const s = formatShortDate(iso);
  return s === "--" ? "—" : s;
}

function poStatusLabel(s: string) {
  const m: Record<string, string> = {
    open: "Aberto",
    received: "Recebido",
    cancelled: "Cancelado",
  };
  return m[s] ?? s;
}

export default function ComprasPage() {
  const { profile, loading: userLoading } = useUser();
  const { companyId: effectiveCompanyId, loaded: effectiveLoaded } =
    useEffectiveCompanyId(profile);
  const router = useRouter();

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [orderItemsForLink, setOrderItemsForLink] = useState<ItemForLink[]>([]);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [schemaMsg, setSchemaMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newExpected, setNewExpected] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const allowed = profile && hasPermission(profile.role, "viewCompras");
  const canEditCompras = profile && hasPermission(profile.role, "editCompras");
  const readOnly = Boolean(allowed && !canEditCompras);
  const canImport =
    profile && hasPermission(profile.role, "importComprasPdfs");

  useEffect(() => {
    if (userLoading) return;
    if (profile && !hasPermission(profile.role, "viewCompras")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [userLoading, profile, router]);

  const load = useCallback(async () => {
    if (!profile || !hasPermission(profile.role, "viewCompras")) return;
    const useApi = shouldUseLocalServiceApi(profile);
    if (useApi && profile.company_id === "local-company" && !effectiveLoaded) {
      return;
    }
    const companyId = effectiveCompanyId;
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/purchase-orders?companyId=${encodeURIComponent(companyId)}`,
        { credentials: "include" }
      );
      const j = (await res.json()) as {
        purchaseOrders?: PurchaseOrderRow[];
        orderItemsForLink?: ItemForLink[];
        schemaMissing?: boolean;
        error?: string;
      };
      if (j.schemaMissing) {
        setSchemaMissing(true);
        setSchemaMsg(j.error ?? null);
        setPurchaseOrders([]);
        setOrderItemsForLink([]);
        return;
      }
      setSchemaMissing(false);
      setSchemaMsg(null);
      if (!res.ok) {
        toast.error(j.error || "Erro ao carregar compras");
        return;
      }
      setPurchaseOrders(
        (j.purchaseOrders ?? []).map((p) => ({
          ...p,
          lines: p.lines ?? [],
          links: p.links ?? [],
        }))
      );
      setOrderItemsForLink(j.orderItemsForLink ?? []);
    } catch {
      toast.error("Erro de rede ao carregar compras");
    } finally {
      setLoading(false);
    }
  }, [profile, effectiveCompanyId, effectiveLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => void load(), 45000);
    return () => clearInterval(t);
  }, [load]);

  async function createPo() {
    if (!newNumber.trim()) {
      toast.error("Informe o número do pedido de compra");
      return;
    }
    const companyId = effectiveCompanyId;
    if (!companyId) return;
    try {
      const res = await fetch(
        `/api/purchase-orders?companyId=${encodeURIComponent(companyId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            number: newNumber.trim(),
            supplier_name: newSupplier.trim() || null,
            expected_delivery: newExpected || null,
            notes: newNotes.trim() || null,
          }),
        }
      );
      const j2 = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(j2.error || "Não foi possível criar o pedido");
        return;
      }
      toast.success("Pedido de compra criado");
      setNewNumber("");
      setNewSupplier("");
      setNewExpected("");
      setNewNotes("");
      setShowNew(false);
      void load();
    } catch {
      toast.error("Erro de rede");
    }
  }

  async function doLink(poId: string, orderItemId: string, purchaseOrderLineId?: string) {
    const companyId = effectiveCompanyId;
    if (!companyId || !poId || !orderItemId) {
      toast.error("Selecione o item de venda");
      return;
    }
    try {
      const res = await fetch(
        `/api/purchase-orders?companyId=${encodeURIComponent(companyId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "link",
            purchase_order_id: poId,
            order_item_id: orderItemId,
            ...(purchaseOrderLineId
              ? { purchase_order_line_id: purchaseOrderLineId }
              : {}),
          }),
        }
      );
      const j2 = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(j2.error || "Falha ao vincular");
        return;
      }
      toast.success("Item vinculado — PC e prazo de vendas atualizados no item");
      void load();
    } catch {
      toast.error("Erro de rede");
    }
  }

  async function doUnlink(poId: string, itemId: string) {
    const companyId = effectiveCompanyId;
    if (!companyId) return;
    try {
      const res = await fetch(
        `/api/purchase-orders?companyId=${encodeURIComponent(companyId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "unlink",
            purchase_order_id: poId,
            order_item_id: itemId,
          }),
        }
      );
      if (!res.ok) {
        const j2 = (await res.json()) as { error?: string };
        toast.error(j2.error || "Falha ao desvincular");
        return;
      }
      toast.success("Vínculo removido");
      void load();
    } catch {
      toast.error("Erro de rede");
    }
  }

  async function deletePo(id: string) {
    const companyId = effectiveCompanyId;
    if (!companyId) return;
    try {
      const res = await fetch(
        `/api/purchase-orders?companyId=${encodeURIComponent(companyId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const j2 = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(j2.error || "Não foi possível excluir");
        return;
      }
      toast.success("Pedido de compra excluído");
      void load();
    } catch {
      toast.error("Erro de rede");
    }
  }

  async function updatePoFields(
    poId: string,
    fields: { follow_up_date?: string | null; compras_observation?: string | null }
  ) {
    const companyId = effectiveCompanyId;
    if (!companyId || !poId) return;
    try {
      const res = await fetch(
        `/api/purchase-orders?companyId=${encodeURIComponent(companyId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_po",
            purchase_order_id: poId,
            ...fields,
          }),
        }
      );
      const j2 = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(j2.error || "Não foi possível salvar");
        void load();
        return;
      }
      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.id === poId
            ? {
                ...p,
                ...(fields.follow_up_date !== undefined
                  ? { follow_up_date: fields.follow_up_date }
                  : {}),
                ...(fields.compras_observation !== undefined
                  ? { compras_observation: fields.compras_observation }
                  : {}),
                updated_at: new Date().toISOString(),
              }
            : p
        )
      );
    } catch {
      toast.error("Erro de rede");
    }
  }

  if (userLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        Carregando…
      </div>
    );
  }
  if (!allowed) {
    return null;
  }

  return (
    <div className="space-y-4 w-full max-w-[100vw] min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Compras</h1>
          <p className="text-sm text-slate-600">
            Pedidos de compra, importação de PDF, vínculo a itens de venda (preenche nº de PC e
            prazo de vendas no item) e acompanhamento de prazos.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0 justify-end">
          <Button
            type="button"
            className="text-xs h-8 bg-white text-slate-800 border border-slate-300 hover:bg-slate-50"
            onClick={() => void load()}
            disabled={loading}
          >
            Atualizar
          </Button>
          <PageExportMenu
            fileNameBase="compras-pedidos"
            sheetTitle="Compras"
            getData={() => ({
              headers: [
                "PC",
                "Linha PC",
                "Cód. PC",
                "Fornecedor",
                "Previsão entrega",
                "Follow-up",
                "Obs. compras",
                "Status",
                "Item venda vinculado",
                "PV",
                "Prazo vendas (item)",
              ],
              rows: purchaseOrders.flatMap((p) => {
                const lns = p.lines ?? [];
                const vendaFromLines = lns.filter((x) => x.venda);
                if (vendaFromLines.length > 0) {
                  return vendaFromLines.map((ln) => {
                    const v = ln.venda!;
                    return [
                      p.number,
                      String(ln.line_number),
                      ln.product_code ?? "—",
                      p.supplier_name ?? "—",
                      formatDateOnly(p.expected_delivery),
                      formatDateOnly(p.follow_up_date ?? null),
                      p.compras_observation?.trim() || "—",
                      poStatusLabel(p.status),
                      v.item_description ?? "—",
                      v.order_number,
                      formatDateOnly(v.sales_deadline),
                    ];
                  });
                }
                if (!p.links.length) {
                  return [
                    [
                      p.number,
                      "—",
                      "—",
                      p.supplier_name ?? "—",
                      formatDateOnly(p.expected_delivery),
                      formatDateOnly(p.follow_up_date ?? null),
                      p.compras_observation?.trim() || "—",
                      poStatusLabel(p.status),
                      "—",
                      "—",
                      "—",
                    ],
                  ];
                }
                return p.links.map((l) => [
                  p.number,
                  "—",
                  "—",
                  p.supplier_name ?? "—",
                  formatDateOnly(p.expected_delivery),
                  formatDateOnly(p.follow_up_date ?? null),
                  p.compras_observation?.trim() || "—",
                  poStatusLabel(p.status),
                  l.description ?? "—",
                  l.order_number,
                  formatDateOnly(l.sales_deadline ?? null),
                ]);
              }),
            })}
          />
          <Button
            type="button"
            className="bg-slate-100 text-slate-800 hover:bg-slate-200 text-xs h-8"
            onClick={() => setShowNew(true)}
            disabled={schemaMissing || readOnly}
            title={readOnly ? "Apenas Compras/gestão pode criar PC" : undefined}
          >
            ➕ Novo PC
          </Button>
          {canImport && (
            <Button
              className="text-xs h-8"
              onClick={() => {
                window.location.href = "/compras/importar";
              }}
            >
              Importar PDFs
            </Button>
          )}
        </div>
      </div>

      {schemaMissing && (
        <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-sm">
          {schemaMsg ||
            "Execute o script `supabase-purchase-orders.sql` no painel SQL do Supabase para habilitar a aba Compras."}
        </div>
      )}

      {readOnly && !schemaMissing && (
        <div className="rounded-md border border-slate-200 bg-slate-50 text-slate-700 px-3 py-2 text-sm">
          <strong>Modo leitura (PCP):</strong> visualização dos pedidos de compra. Alterações e vínculos ficam
          com o perfil <strong>Compras</strong> ou gestão.
        </div>
      )}

      {loading && !purchaseOrders.length && !schemaMissing && (
        <p className="text-sm text-slate-500">Carregando…</p>
      )}

      <PurchaseOrdersTable
        purchaseOrders={purchaseOrders}
        orderItemsForLink={orderItemsForLink}
        schemaMissing={schemaMissing}
        readOnly={readOnly}
        onLink={doLink}
        onUnlink={doUnlink}
        onDeletePo={deletePo}
        onUpdatePoFields={updatePoFields}
      />

      {showNew && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Novo pedido de compra</h2>
              <button
                className="text-xs text-slate-500"
                onClick={() => setShowNew(false)}
                type="button"
              >
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <Label className="text-xs">Número do PC *</Label>
                <Input
                  className="h-9 text-xs mt-0.5"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  disabled={schemaMissing}
                />
              </div>
              <div>
                <Label className="text-xs">Fornecedor</Label>
                <Input
                  className="h-9 text-xs mt-0.5"
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  disabled={schemaMissing}
                />
              </div>
              <div>
                <Label className="text-xs">Previsão de entrega</Label>
                <Input
                  className="h-9 text-xs mt-0.5"
                  type="date"
                  value={newExpected}
                  onChange={(e) => setNewExpected(e.target.value)}
                  disabled={schemaMissing}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Observações</Label>
                <Input
                  className="h-9 text-xs mt-0.5"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  disabled={schemaMissing}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                className="text-xs bg-white text-slate-800 border border-slate-300 hover:bg-slate-50"
                onClick={() => setShowNew(false)}
              >
                Cancelar
              </Button>
              <Button type="button" className="text-xs" onClick={() => void createPo()}>
                Criar pedido de compra
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
