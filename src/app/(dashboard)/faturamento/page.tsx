"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { useUser } from "@/lib/hooks/use-user";
import { formatBoxDimensions, isAvulsaBoxCode } from "@/lib/packaging/boxes";
import { sequenceLabel } from "@/lib/packaging/allocation";
import { packingListQrHref } from "@/lib/packaging/parse-expedicao-qr";
import {
  buildShippingListPrintHtml,
  shippingListItemText,
} from "@/lib/packaging/shipping-list-print";
import {
  scannedVolumeCount,
  shippingStationLabel,
  shippingStationOf,
  SHIPPING_STATIONS,
  type ShippingStation,
} from "@/lib/packaging/shipping-stations";
import { LOGO_HEPA_PATH } from "@/lib/certificado/roteador";
import {
  openEtiquetaPrintWindow,
  POPUP_BLOCKED_ERROR,
} from "@/lib/etiqueta-print-window";
import {
  defaultAppPathForRole,
  hasPermission,
} from "@/lib/utils/permissions";
import type {
  Order,
  OrderItem,
  PackagingBox,
  PackagingVolume,
  ShippingList,
} from "@/lib/types/database";

type ListRow = {
  order: Pick<Order, "id" | "order_number" | "client_name" | "status" | "finished_at">;
  volumes: PackagingVolume[];
  items: Pick<OrderItem, "id" | "order_id" | "description" | "product_code" | "quantity">[];
  boxes: PackagingBox[];
  shippingList: ShippingList | null;
  hasOmieLink?: boolean;
  clientOrderNumber?: string | null;
};

function boxLabel(box: PackagingBox | undefined): string {
  if (!box) return "—";
  const kind = isAvulsaBoxCode(box.code) ? "Avulsa" : box.code;
  return `${kind} ${formatBoxDimensions(box)}`;
}

function itemLabel(
  itemId: string,
  items: ListRow["items"]
): string {
  const it = items.find((i) => i.id === itemId);
  if (!it) return itemId;
  return shippingListItemText({
    productCode: it.product_code,
    description: it.description,
  });
}

function volumeItemsLabel(
  volume: PackagingVolume,
  items: ListRow["items"]
): string {
  if (volume.items && volume.items.length > 0) {
    return volume.items
      .map((it) =>
        shippingListItemText({
          productCode: it.product_code,
          description: it.description || itemLabel(it.order_item_id, items),
        })
      )
      .join(" · ");
  }
  return itemLabel(volume.order_item_id, items);
}

export default function FaturamentoPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const { companyId, loaded: companyLoaded } = useEffectiveCompanyId(profile);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [stationTab, setStationTab] = useState<Exclude<ShippingStation, "packing">>("ready_to_invoice");
  const [receivedName, setReceivedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [syncingOmie, setSyncingOmie] = useState(false);
  const [omieConfigured, setOmieConfigured] = useState(true);

  const allowed = profile && hasPermission(profile.role, "viewFaturamento");

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile.role, "viewFaturamento")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [loading, profile, router]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setFetching(true);
    try {
      const res = await fetch(
        `/api/shipping-lists?companyId=${encodeURIComponent(companyId)}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as {
        lists?: ListRow[];
        error?: string;
        tableMissing?: boolean;
      };
      if (!res.ok) {
        const msg = json.error || `Erro (${res.status})`;
        if (/shipping_lists ausente|does not exist|schema cache/i.test(msg)) {
          setTableMissing(true);
          setRows([]);
          return;
        }
        toast.error(msg);
        return;
      }
      setTableMissing(Boolean(json.tableMissing));
      setRows(json.lists ?? []);
    } catch {
      toast.error("Erro ao carregar listas de embarque");
    } finally {
      setFetching(false);
    }
  }, [companyId]);

  const syncOmie = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!companyId) return 0;
      setSyncingOmie(true);
      try {
        const res = await fetch("/api/shipping-lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "sync-omie", companyId }),
          signal: AbortSignal.timeout(20_000),
        });
        const json = (await res.json()) as {
          error?: string;
          configured?: boolean;
          marked?: number;
          nfeFilled?: number;
          checked?: number;
        };
        if (!res.ok) {
          if (!opts?.silent) toast.error(json.error || "Não foi possível consultar o Omie.");
          return 0;
        }
        setOmieConfigured(json.configured !== false);
        const marked = json.marked ?? 0;
        const nfeFilled = json.nfeFilled ?? 0;
        if (marked > 0 || nfeFilled > 0) {
          toast.success(
            marked > 0
              ? marked === 1
                ? "1 pedido faturado no Omie passou para Faturado"
                : `${marked} pedidos faturados no Omie passaram para Faturado`
              : nfeFilled === 1
                ? "Número da NF atualizado"
                : `${nfeFilled} números de NF atualizados`
          );
          await load();
        } else if (!opts?.silent) {
          const checked = json.checked ?? 0;
          toast.success(
            checked === 0
              ? "Nenhum pedido Omie pendente para conferir"
              : "Nenhum desses pedidos está faturado no Omie ainda"
          );
        }
        return marked;
      } catch (err) {
        if (opts?.silent) return 0;
        const aborted =
          err instanceof DOMException &&
          (err.name === "AbortError" || err.name === "TimeoutError");
        toast.error(
          aborted
            ? "A consulta ao Omie demorou demais. Tente de novo."
            : "Erro ao consultar o Omie"
        );
        return 0;
      } finally {
        setSyncingOmie(false);
      }
    },
    [companyId, load]
  );

  useEffect(() => {
    if (allowed && companyLoaded && companyId) void load();
  }, [allowed, companyLoaded, companyId, load]);

  const openRow = useMemo(
    () => rows.find((r) => r.order.id === openId) ?? null,
    [rows, openId]
  );

  const stationOf = useCallback(
    (row: ListRow): ShippingStation =>
      shippingStationOf(row.shippingList, row.order.status === "finished"),
    []
  );

  const counts = useMemo(() => {
    const c = { ready_to_invoice: 0, invoiced: 0, collected: 0, packing: 0 };
    for (const row of rows) {
      c[stationOf(row)] += 1;
    }
    return c;
  }, [rows, stationOf]);

  const visibleRows = useMemo(
    () => rows.filter((row) => stationOf(row) === stationTab),
    [rows, stationOf, stationTab]
  );

  useEffect(() => {
    setReceivedName(openRow?.shippingList?.received_by_name ?? "");
  }, [openRow?.shippingList?.received_by_name, openRow?.order.id]);

  async function handleCreateTable() {
    if (!companyId) return;
    setCreatingTable(true);
    try {
      const res = await fetch("/api/shipping-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "setup", companyId }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        toast.error(
          json.error || "Cole supabase-shipping-lists.sql no SQL Editor."
        );
        return;
      }
      toast.success("Tabela criada");
      await load();
    } finally {
      setCreatingTable(false);
    }
  }

  async function postListAction(action: "invoice" | "collect", orderId: string) {
    if (!companyId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/shipping-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, companyId, orderId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Não foi possível atualizar a estação.");
        return;
      }
      toast.success(
        action === "invoice" ? "Pedido marcado como Faturado" : "Pedido marcado como Coletado"
      );
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizeOrder(row: ListRow) {
    if (!companyId) return;
    const pending = row.volumes.filter((v) => v.status !== "scanned").length;
    const ok = window.confirm(
      pending > 0
        ? `Pedido ${row.order.order_number}: ainda faltam ${pending} caixa(s) sem conferir na expedição. Finalizar o pedido mesmo assim? Ele vai para Coletado.`
        : `Finalizar o pedido ${row.order.order_number}? Ele vai para Coletado.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch("/api/shipping-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "finalize-order",
          companyId,
          orderId: row.order.id,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Não foi possível finalizar o pedido.");
        return;
      }
      toast.success(
        `Pedido ${row.order.order_number} finalizado — Coletado no Faturamento e na Expedição`
      );
      setStationTab("collected");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleReceive() {
    if (!companyId || !openRow) return;
    setSaving(true);
    try {
      const res = await fetch("/api/shipping-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "receive",
          companyId,
          orderId: openRow.order.id,
          receivedByName: receivedName,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Não foi possível gravar a assinatura.");
        return;
      }
      toast.success("Recebimento registrado");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteList(row: ListRow) {
    if (!companyId) return;
    const ok = window.confirm(
      `Excluir a lista de embarque do pedido ${row.order.order_number}? Os volumes somem daqui; o pedido em si permanece.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch("/api/shipping-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "delete",
          companyId,
          orderId: row.order.id,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Não foi possível excluir a lista.");
        return;
      }
      toast.success(`Lista do pedido ${row.order.order_number} excluída`);
      if (openId === row.order.id) setOpenId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handlePrint(row: ListRow) {
    const origin = window.location.origin;
    const printWin = openEtiquetaPrintWindow("lista-embarque-hepa");
    if (!printWin) {
      toast.error(POPUP_BLOCKED_ERROR);
      return;
    }
    try {
      const [logoRes, ...qrs] = await Promise.all([
        fetch(LOGO_HEPA_PATH).then((r) => r.blob()).then(
          (b) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(b);
            })
        ),
        ...row.volumes.map((v) =>
          QRCode.toDataURL(`${origin}/embarque/bipar/${v.qr_token}`, {
            margin: 0,
            width: 80,
          })
        ),
        row.shippingList?.id
          ? QRCode.toDataURL(packingListQrHref(origin, row.shippingList.id), {
              margin: 0,
              width: 160,
            })
          : Promise.resolve(""),
      ]);
      const listQrDataUrl = qrs.length > row.volumes.length ? qrs.pop() : "";
      const finished = row.order.status === "finished";
      const recv =
        row.shippingList?.received_by_name ||
        (finished ? "________________________________" : "(libera ao finalizar o pedido)");
      const boxById = new Map(row.boxes.map((b) => [b.id, b]));
      const html = buildShippingListPrintHtml({
        logoDataUrl: logoRes,
        clientName: row.order.client_name,
        osNumber: row.order.order_number,
        clientOrderNumber: row.clientOrderNumber ?? null,
        receivedBy: recv,
        receivedAtLabel: row.shippingList?.received_at
          ? new Date(row.shippingList.received_at).toLocaleDateString("pt-BR")
          : "____/____/________",
        listQrDataUrl: listQrDataUrl || null,
        lines: row.volumes.map((v, i) => {
          const box = boxById.get(v.box_id);
          return {
            sequence: v.sequence,
            itemText: volumeItemsLabel(v, row.items),
            boxLabel: boxLabel(box),
            quantity: v.piece_quantity,
            weightKg: v.weight_kg,
            qrDataUrl: qrs[i],
          };
        }),
      });
      printWin.document.write(html);
      printWin.document.close();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível montar a impressão.");
      try {
        printWin.close();
      } catch {
        /* ignore */
      }
    }
  }

  if (loading || !profile) {
    return (
      <div className="flex justify-center py-12 text-sm text-slate-500">
        Carregando…
      </div>
    );
  }
  if (!allowed) return null;
  if (!companyLoaded) {
    return (
      <div className="text-sm text-slate-500 py-8 text-center">
        Carregando empresa…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Faturamento</h1>
        <p className="text-sm text-slate-500 mt-1">
          Uma lista de embarque por pedido, em três estações: o PCP libera
          para faturar; quando o pedido é faturado no Omie, ele passa sozinho
          para Faturado; a expedição finaliza o carregamento e o pedido vai
          para Coletado.
        </p>
      </div>

      {tableMissing ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 space-y-2">
          <p>
            Falta a tabela <code className="text-xs">shipping_lists</code>. Cole{" "}
            <code className="text-xs">supabase-shipping-lists.sql</code> no SQL
            Editor ou tente criar agora.
          </p>
          <Button
            size="sm"
            onClick={() => void handleCreateTable()}
            disabled={creatingTable}
          >
            {creatingTable ? "Criando…" : "Criar tabela agora"}
          </Button>
        </div>
      ) : null}

      {syncingOmie ? (
        <p className="text-xs text-slate-500">Consultando faturamento no Omie…</p>
      ) : null}

      {fetching ? (
        <p className="text-xs text-slate-500">Carregando listas…</p>
      ) : rows.length === 0 && !tableMissing ? (
        <p className="text-sm text-slate-500 rounded-lg border border-slate-200 bg-white px-4 py-6 text-center">
          Nenhuma lista ainda. Gere volumes na linha (botão Embalagem) — o
          Volume 1 do pedido abre a lista aqui.
        </p>
      ) : !tableMissing ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {SHIPPING_STATIONS.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStationTab(st.id)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  stationTab === st.id
                    ? "border-[#1B4F72] bg-[#1B4F72] text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {st.label}
                <span className="ml-1 tabular-nums opacity-80">
                  ({counts[st.id]})
                </span>
              </button>
            ))}
            {omieConfigured ? (
              <Button
                size="sm"
                variant="outline"
                disabled={syncingOmie}
                onClick={() => void syncOmie()}
              >
                {syncingOmie ? "Consultando Omie…" : "Atualizar do Omie"}
              </Button>
            ) : null}
          </div>
          {counts.packing > 0 ? (
            <p className="text-[11px] text-slate-500">
              {counts.packing} lista(s) ainda em embalagem (PCP não liberou).
            </p>
          ) : null}
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Pedido</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">NF</th>
                <th className="px-3 py-2 text-right">Volumes</th>
                <th className="px-3 py-2 text-left">Estação</th>
                <th className="px-3 py-2 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Nenhum pedido nesta estação.
                  </td>
                </tr>
              ) : (
              visibleRows.map((row) => (
                <tr key={row.order.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{row.order.order_number}</td>
                  <td className="px-3 py-2">{row.order.client_name}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.shippingList?.nfe_number?.trim() || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.volumes.length}
                  </td>
                  <td className="px-3 py-2">
                    {shippingStationLabel(stationOf(row))}
                    {row.shippingList?.received_by_name
                      ? ` · ${row.shippingList.received_by_name}`
                      : ""}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-[#1B4F72] hover:underline mr-3"
                      onClick={() => setOpenId(row.order.id)}
                    >
                      Ver
                    </button>
                    <button
                      type="button"
                      className="text-[#1B4F72] hover:underline"
                      onClick={() => void handlePrint(row)}
                    >
                      Imprimir
                    </button>
                    {stationOf(row) !== "collected" ? (
                      <button
                        type="button"
                        className="text-[#1B4F72] hover:underline ml-3"
                        disabled={saving}
                        onClick={() => void handleFinalizeOrder(row)}
                      >
                        Finalizar pedido
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-red-700 hover:underline ml-3"
                      disabled={saving}
                      onClick={() => void handleDeleteList(row)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
        </>
      ) : null}

      {openRow ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Pedido {openRow.order.order_number} — {openRow.order.client_name}
              </p>
              <p className="text-xs text-slate-500">
                {openRow.volumes.length} volume(s) ·{" "}
                {shippingStationLabel(stationOf(openRow))}
                {openRow.shippingList?.nfe_number?.trim()
                  ? ` · NF ${openRow.shippingList.nfe_number.trim()}`
                  : ""}
                {(() => {
                  const scan = scannedVolumeCount(openRow.volumes);
                  return ` · conferidos ${scan.scanned}/${scan.total}`;
                })()}
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-red-700 hover:underline"
              disabled={saving}
              onClick={() => void handleDeleteList(openRow)}
            >
              Excluir lista
            </button>
            <button
              type="button"
              className="text-xs text-slate-500 hover:underline"
              onClick={() => setOpenId(null)}
            >
              Fechar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 text-left">Volume</th>
                  <th className="px-2 py-1.5 text-left">Item</th>
                  <th className="px-2 py-1.5 text-left">Caixa</th>
                  <th className="px-2 py-1.5 text-right">Qtde</th>
                  <th className="px-2 py-1.5 text-right">Peso</th>
                  <th className="px-2 py-1.5 text-left">Conferência</th>
                </tr>
              </thead>
              <tbody>
                {openRow.volumes.map((v) => {
                  const box = openRow.boxes.find((b) => b.id === v.box_id);
                  return (
                    <tr key={v.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-medium">
                        {sequenceLabel(v.sequence)}
                      </td>
                      <td className="px-2 py-1.5">
                        {volumeItemsLabel(v, openRow.items)}
                      </td>
                      <td className="px-2 py-1.5">{boxLabel(box)}</td>
                      <td className="px-2 py-1.5 text-right">{v.piece_quantity}</td>
                      <td className="px-2 py-1.5 text-right">
                        {v.weight_kg ?? "—"} kg
                      </td>
                      <td className="px-2 py-1.5">
                        {v.status === "scanned" ? "Conferido" : "Pendente"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stationOf(openRow) === "ready_to_invoice" && openRow.hasOmieLink ? (
            <p className="text-[11px] text-slate-500">
              Este pedido veio do Omie. Quando a nota for emitida lá, ele passa
              sozinho para Faturado. Se acabou de faturar, use Atualizar do Omie.
            </p>
          ) : null}
          {stationOf(openRow) === "ready_to_invoice" && !openRow.hasOmieLink ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void postListAction("invoice", openRow.order.id)}
            >
              {saving ? "Gravando…" : "Marcar como Faturado"}
            </Button>
          ) : null}
          {stationOf(openRow) === "invoiced" ? (
            <p className="text-[11px] text-slate-500">
              Coletado entra quando a expedição bipar todas as caixas, fotografar
              a carga e finalizar o carregamento. Se alguma caixa saiu sem
              conferir, use Finalizar pedido aqui.
            </p>
          ) : null}
          {stationOf(openRow) !== "collected" ? (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void handleFinalizeOrder(openRow)}
            >
              {saving ? "Gravando…" : "Finalizar pedido"}
            </Button>
          ) : null}
          {openRow.order.status === "finished" ||
          stationOf(openRow) === "collected" ? (
            <div className="rounded-md border border-slate-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-800">
                Assinatura de recebimento
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <label className="text-xs text-slate-600">Quem recebeu</label>
                  <Input
                    value={receivedName}
                    onChange={(e) => setReceivedName(e.target.value)}
                    placeholder="Nome de quem recebeu a carga"
                  />
                </div>
                <Button
                  size="sm"
                  disabled={saving || !receivedName.trim()}
                  onClick={() => void handleReceive()}
                >
                  {saving ? "Gravando…" : "Registrar"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              O campo de assinatura aparece quando o PCP finalizar o pedido.
            </p>
          )}
          <Button size="sm" variant="outline" onClick={() => void handlePrint(openRow)}>
            Imprimir lista (logo + QR)
          </Button>
        </div>
      ) : null}
    </div>
  );
}
