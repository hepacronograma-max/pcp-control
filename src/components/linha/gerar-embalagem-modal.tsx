"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LineItemWithOrder } from "@/components/linha/gantt-calendar";
import {
  printReadiness,
  remainingPieces,
  sequenceLabel,
} from "@/lib/packaging/allocation";
import { formatBoxDimensions, isAvulsaBoxCode } from "@/lib/packaging/boxes";
import {
  buildEmbalagemSheetsHtml,
  volumeBoxLabel,
} from "@/lib/packaging/print-html";
import {
  itemQtyFromVolume,
  maxEqualVolumeCount,
  type GroupableItem,
} from "@/lib/packaging/volume-items";
import { EMBALAGEM_PRINT_CSS } from "@/lib/packaging/print-styles";
import { getHepaLogoDataUrl } from "@/lib/etiqueta-assets-cache";
import {
  openEtiquetaPrintWindow,
  POPUP_BLOCKED_ERROR,
  wrapPrintDocument,
  writePrintHtml,
} from "@/lib/etiqueta-print-window";
import type { PackagingBox, PackagingVolume } from "@/lib/types/database";
import { useClientOrderNumber } from "@/lib/hooks/use-client-order-number";

type Props = {
  item: LineItemWithOrder | null;
  companyId: string | null;
  open: boolean;
  onClose: () => void;
};

const CUSTOM_BOX_VALUE = "__custom__";

type ExtraRow = { key: string; orderItemId: string; pieces: string };

type EditRow = {
  orderItemId: string;
  label: string;
  pieces: string;
  /** peças deste item que já estão neste volume (antes da edição) */
  current: number;
};

type EditState = {
  volumeId: string;
  sequence: number;
  wasPrinted: boolean;
  boxId: string;
  customSize: string;
  weight: string;
  rows: EditRow[];
  addId: string;
};

type LoadPayload = {
  volumes: PackagingVolume[];
  boxes: PackagingBox[];
  totalPieces: number;
  remaining: number;
  groupableItems?: GroupableItem[];
  volumeItemsMissing?: boolean;
};

async function postVolume(body: Record<string, unknown>) {
  const res = await fetch("/api/packaging-volumes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    error?: string;
    volumes?: PackagingVolume[];
    volume?: PackagingVolume;
    leftover?: number;
  };
  if (!res.ok) {
    return { ok: false as const, error: json.error || `Erro (${res.status})` };
  }
  return { ok: true as const, ...json };
}

export function GerarEmbalagemModal({ item, companyId, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [volumes, setVolumes] = useState<PackagingVolume[]>([]);
  const [boxes, setBoxes] = useState<PackagingBox[]>([]);
  const [totalPieces, setTotalPieces] = useState(0);
  const [tableMissing, setTableMissing] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [boxId, setBoxId] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [piecesPerBox, setPiecesPerBox] = useState("");
  const [repeatCount, setRepeatCount] = useState("1");
  const [weightKg, setWeightKg] = useState("");
  const [printing, setPrinting] = useState(false);
  const [groupableItems, setGroupableItems] = useState<GroupableItem[]>([]);
  const [extraRows, setExtraRows] = useState<ExtraRow[]>([]);
  const [volumeItemsMissing, setVolumeItemsMissing] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const itemId = item?.id ?? null;
  const clientOrderNumber = useClientOrderNumber(item?.order.id, open);
  const itemQty = item
    ? Math.max(1, Math.floor(Number(item.quantity) || 1))
    : 1;

  const remaining = remainingPieces(
    totalPieces,
    volumes.map((v) => ({
      piece_quantity: itemQtyFromVolume(v, itemId ?? ""),
    }))
  );
  const print = printReadiness(
    totalPieces,
    volumes.map((v) => ({
      piece_quantity: itemQtyFromVolume(v, itemId ?? ""),
      weight_kg: v.weight_kg,
    }))
  );
  const fullyAllocated =
    !loadError && totalPieces > 0 && remaining === 0 && volumes.length > 0;
  const catalogBoxes = useMemo(
    () => boxes.filter((b) => !isAvulsaBoxCode(b.code)),
    [boxes]
  );
  const isCustom = boxId === CUSTOM_BOX_VALUE || boxId === "";
  const piecesN = Math.floor(Number(piecesPerBox)) || 0;
  const mixForRepeat = [
    { pieceQuantity: piecesN, remaining },
    ...extraRows
      .map((row) => {
        const g = groupableItems.find((x) => x.id === row.orderItemId);
        const qty = Math.floor(Number(row.pieces)) || 0;
        if (!g || qty < 1) return null;
        return { pieceQuantity: qty, remaining: g.remaining };
      })
      .filter((x): x is { pieceQuantity: number; remaining: number } => x != null),
  ];
  const maxRepeat =
    piecesN >= 1 && remaining > 0 ? maxEqualVolumeCount(mixForRepeat) : 0;

  const load = useCallback(async () => {
    if (!itemId || !companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(
        `/api/packaging-volumes?companyId=${encodeURIComponent(companyId)}&orderItemId=${encodeURIComponent(itemId)}`,
        { credentials: "include", signal: ctrl.signal }
      );
      const json = (await res.json()) as LoadPayload & { error?: string };
      if (!res.ok) {
        const msg = json.error || `Erro (${res.status})`;
        if (/packaging_volumes ausente|does not exist|schema cache/i.test(msg)) {
          setTableMissing(true);
          return;
        }
        setLoadError(msg);
        toast.error(msg);
        return;
      }
      setTableMissing(false);
      setLoadError(null);
      setVolumes(json.volumes ?? []);
      setBoxes(json.boxes ?? []);
      setTotalPieces(json.totalPieces ?? itemQty);
      setGroupableItems(json.groupableItems ?? []);
      setVolumeItemsMissing(Boolean(json.volumeItemsMissing));
      const catalog = (json.boxes ?? []).filter((b) => !isAvulsaBoxCode(b.code));
      setBoxId((prev) => {
        if (prev && prev !== CUSTOM_BOX_VALUE && catalog.some((b) => b.id === prev)) {
          return prev;
        }
        return catalog[0]?.id || CUSTOM_BOX_VALUE;
      });
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      const msg = aborted
        ? "Demorou para carregar as caixas. Você já pode gerar o volume; use Customizada se a lista não aparecer."
        : "Erro ao carregar volumes";
      setLoadError(msg);
      if (!aborted) toast.error(msg);
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }, [itemId, companyId, itemQty]);

  useEffect(() => {
    if (!open || !itemId) return;
    setPiecesPerBox(itemQty === 1 ? "1" : "");
    setRepeatCount("1");
    setBoxId("");
    setCustomSize("");
    setWeightKg("");
    setVolumes([]);
    setLoadError(null);
    setTableMissing(false);
    setTotalPieces(itemQty);
    setExtraRows([]);
    setGroupableItems([]);
    setVolumeItemsMissing(false);
    setGroupOpen(false);
    setEditing(null);
  }, [open, itemId, itemQty]);

  useEffect(() => {
    if (!open || !itemId || !companyId) return;
    void load();
  }, [open, itemId, companyId, load]);

  async function handleCreateTable() {
    setCreatingTable(true);
    try {
      const res = await fetch("/api/setup-packaging-volumes", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        toast.error(
          json.error ||
            "Cole supabase-packaging-volumes.sql no SQL Editor do Supabase."
        );
        return;
      }
      toast.success("Tabela criada");
      await load();
    } finally {
      setCreatingTable(false);
    }
  }

  async function handleAllocate() {
    if (!item || !companyId) return;
    setSaving(true);
    try {
      const r = await postVolume({
        action: "allocate",
        companyId,
        orderItemId: item.id,
        boxId: boxId || CUSTOM_BOX_VALUE,
        customSize: isCustom ? customSize : undefined,
        piecesPerBox,
        repeatCount,
        weightKg,
        groupedItems: extraRows
          .filter((row) => row.orderItemId && Math.floor(Number(row.pieces)) >= 1)
          .map((row) => ({
            orderItemId: row.orderItemId,
            pieceQuantity: Math.floor(Number(row.pieces)),
          })),
      });
      if (!r.ok) {
        toast.error(r.error);
        if (/packaging_volume_items/i.test(r.error)) {
          setVolumeItemsMissing(true);
        }
        return;
      }
      toast.success(
        `${r.volumes?.length ?? 0} volume(s) gerado(s). Saldo do item pendente: ${r.leftover ?? remaining} peça(s).`
      );
      setExtraRows([]);
      setGroupOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function itemLabel(code: string | null | undefined, description: string) {
    const d = description.length > 60 ? `${description.slice(0, 60)}…` : description;
    return code ? `${code} · ${d}` : d;
  }

  /** saldo livre do item (fora deste volume) */
  function freeOf(orderItemId: string): number {
    if (orderItemId === itemId) return remaining;
    return groupableItems.find((g) => g.id === orderItemId)?.remaining ?? 0;
  }

  function startEdit(v: PackagingVolume) {
    const own =
      v.items && v.items.length > 0
        ? v.items
        : [
            {
              order_item_id: v.order_item_id,
              piece_quantity: v.piece_quantity,
              product_code: item?.product_code ?? null,
              description: item?.description ?? "",
            },
          ];
    const box = boxById.get(v.box_id);
    const avulsa = !box || isAvulsaBoxCode(box.code);
    setEditing({
      volumeId: v.id,
      sequence: v.sequence,
      wasPrinted: v.status === "printed",
      boxId: avulsa ? CUSTOM_BOX_VALUE : box?.id ?? CUSTOM_BOX_VALUE,
      customSize: avulsa && box ? formatBoxDimensions(box).replace(/\s*cm$/i, "").replace(/\s*×\s*/g, "x") : "",
      weight: v.weight_kg != null ? String(v.weight_kg) : "",
      rows: own.map((it) => ({
        orderItemId: it.order_item_id,
        label: itemLabel(
          it.product_code ?? (it.order_item_id === itemId ? item?.product_code : null),
          it.description || (it.order_item_id === itemId ? item?.description ?? "" : "")
        ),
        pieces: String(it.piece_quantity),
        current: it.piece_quantity,
      })),
      addId: "",
    });
  }

  async function handleSaveEdit() {
    if (!editing || !companyId) return;
    const rows = editing.rows.filter((r) => Math.floor(Number(r.pieces)) >= 1);
    if (rows.length === 0) {
      toast.error("Deixe pelo menos um item com peças. Para esvaziar, exclua o volume.");
      return;
    }
    setSavingEdit(true);
    try {
      const r = await postVolume({
        action: "edit",
        companyId,
        id: editing.volumeId,
        boxId: editing.boxId || CUSTOM_BOX_VALUE,
        customSize:
          editing.boxId === CUSTOM_BOX_VALUE ? editing.customSize : undefined,
        weightKg: editing.weight,
        items: rows.map((row) => ({
          orderItemId: row.orderItemId,
          pieceQuantity: Math.floor(Number(row.pieces)),
        })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        editing.wasPrinted
          ? `${sequenceLabel(editing.sequence)} alterado. Reimprima a etiqueta desse volume.`
          : `${sequenceLabel(editing.sequence)} alterado.`
      );
      setEditing(null);
      await load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleUpdate(
    volume: PackagingVolume,
    patch: Record<string, unknown>
  ) {
    if (!companyId) return;
    const r = await postVolume({
      action: "update",
      companyId,
      id: volume.id,
      ...patch,
    });
    if (!r.ok) {
      toast.error(r.error);
      await load();
      return;
    }
    if (r.volume) {
      setVolumes((prev) =>
        prev.map((v) => (v.id === volume.id ? r.volume! : v))
      );
    }
  }

  async function handleDelete(volume: PackagingVolume) {
    if (!companyId) return;
    if (
      !window.confirm(
        `Excluir ${sequenceLabel(volume.sequence)}? As peças voltam ao saldo do item.`
      )
    ) {
      return;
    }
    const r = await postVolume({
      action: "delete",
      companyId,
      id: volume.id,
    });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Volume excluído. Peças devolvidas ao saldo do item.");
    await load();
  }

  const boxById = useMemo(() => {
    const m = new Map<string, PackagingBox>();
    for (const b of boxes) m.set(b.id, b);
    return m;
  }, [boxes]);

  function handlePrintClick(only?: PackagingVolume[]) {
    if (!item || !companyId || printing) return;
    if (!print.ok) {
      toast.error(print.reason);
      return;
    }
    const toPrint = only && only.length > 0 ? only : volumes;
    const printWin = openEtiquetaPrintWindow("embalagem-print-hepa");
    if (!printWin) {
      toast.error(POPUP_BLOCKED_ERROR);
      return;
    }
    setPrinting(true);
    void (async () => {
      try {
        const origin = window.location.origin;
        const [logoDataUrl, ...qrs] = await Promise.all([
          getHepaLogoDataUrl(),
          ...toPrint.map((v) =>
            QRCode.toDataURL(`${origin}/embarque/bipar/${v.qr_token}`, {
              width: 160,
              margin: 0,
              errorCorrectionLevel: "M",
              color: { dark: "#1B4F72", light: "#FFFFFF" },
            })
          ),
        ]);
        const labels = toPrint.map((v, i) => {
          const lines =
            v.items && v.items.length > 0
              ? v.items.map((it) => ({
                  productCode: it.product_code ?? null,
                  description: it.description || item.description,
                  pieceQuantity: it.piece_quantity,
                }))
              : [
                  {
                    productCode: item.product_code ?? null,
                    description: item.description,
                    pieceQuantity: v.piece_quantity,
                  },
                ];
          return {
            sequence: v.sequence,
            clientName: item.order.client_name,
            orderNumber: item.order.order_number,
            clientOrderNumber,
            productCode: lines[0]?.productCode ?? item.product_code ?? null,
            description: lines[0]?.description ?? item.description,
            pieceQuantity: v.piece_quantity,
            items: lines,
            boxLabel: volumeBoxLabel(boxById.get(v.box_id)),
            weightKg: Number(v.weight_kg) || 0,
            qrDataUrl: qrs[i],
            logoDataUrl,
          };
        });
        const html = wrapPrintDocument({
          title: `Embalagem ${item.order.order_number}`,
          css: EMBALAGEM_PRINT_CSS,
          bodyHtml: buildEmbalagemSheetsHtml(labels),
        });
        const result = await writePrintHtml(printWin, html);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const marked = await postVolume({
          action: "print",
          companyId,
          orderItemId: item.id,
          volumeIds: only && only.length > 0 ? only.map((v) => v.id) : undefined,
        });
        if (!marked.ok) {
          toast.error(marked.error);
        }
        await load();
      } catch (err) {
        console.error("[embalagem-print]", err);
        toast.error(
          err instanceof Error ? err.message : "Erro ao imprimir etiquetas."
        );
        try {
          printWin.close();
        } catch {
          /* ignore */
        }
      } finally {
        setPrinting(false);
      }
    })();
  }

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Etiqueta de embalagem</DialogTitle>
        </DialogHeader>

        {tableMissing ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 space-y-2">
            <p>
              Falta criar a tabela <code className="text-xs">packaging_volumes</code>.
              Cole <code className="text-xs">supabase-packaging-volumes.sql</code> no
              SQL Editor (como na Fase 1) ou tente criar automaticamente.
            </p>
            <Button
              size="sm"
              onClick={() => void handleCreateTable()}
              disabled={creatingTable}
            >
              {creatingTable ? "Criando…" : "Criar tabela agora"}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <p>
                <span className="font-semibold text-slate-700">OS:</span>{" "}
                {item.order.order_number} — {item.order.client_name}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Pedido:</span>{" "}
                {clientOrderNumber || "—"}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Item:</span>{" "}
                {item.product_code ? `${item.product_code} · ` : ""}
                {item.description}
              </p>
              <p className="tabular-nums">
                <span className="font-semibold text-slate-700">Peças:</span>{" "}
                {totalPieces} · alocado {totalPieces - remaining} · saldo{" "}
                <span className={remaining > 0 ? "font-semibold text-amber-800" : "font-semibold text-emerald-700"}>
                  {remaining}
                </span>
              </p>
            </div>

            {volumeItemsMissing ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-2">
                <p>
                  Para agrupar itens na mesma caixa, cole{" "}
                  <code className="text-[11px]">supabase-packaging-volume-items.sql</code>{" "}
                  no SQL Editor ou tente criar a tabela agora.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCreateTable()}
                  disabled={creatingTable}
                >
                  {creatingTable ? "Criando…" : "Criar tabela agora"}
                </Button>
              </div>
            ) : null}

            {loadError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 space-y-2">
                <p>{loadError}</p>
                <Button size="sm" variant="outline" onClick={() => void load()}>
                  Tentar de novo
                </Button>
              </div>
            ) : null}

            {loading ? (
              <p className="text-xs text-slate-500">
                Carregando catálogo de caixas…
              </p>
            ) : null}

            {fullyAllocated ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                100% das peças alocadas. Clique em Imprimir etiquetas para a
                térmica 100×150 mm.
              </p>
            ) : remaining > 0 ? (
              <div className="rounded-md border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-800">
                  Alocar saldo ({remaining} peça{remaining === 1 ? "" : "s"})
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Caixa</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                      value={boxId || CUSTOM_BOX_VALUE}
                      onChange={(e) => setBoxId(e.target.value)}
                    >
                      {catalogBoxes.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} — {b.name} ({formatBoxDimensions(b)})
                        </option>
                      ))}
                      <option value={CUSTOM_BOX_VALUE}>
                        Customizada — escrever o tamanho
                      </option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Peças nesta caixa</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={piecesPerBox}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPiecesPerBox(v);
                        const n = Math.floor(Number(v));
                        if (n >= 1) {
                          const extras = extraRows
                            .map((row) => {
                              const g = groupableItems.find((x) => x.id === row.orderItemId);
                              const qty = Math.floor(Number(row.pieces)) || 0;
                              if (!g || qty < 1) return null;
                              return { pieceQuantity: qty, remaining: g.remaining };
                            })
                            .filter(
                              (x): x is { pieceQuantity: number; remaining: number } =>
                                x != null
                            );
                          const max = maxEqualVolumeCount([
                            { pieceQuantity: n, remaining },
                            ...extras,
                          ]);
                          setRepeatCount(String(max >= 1 ? max : 1));
                        }
                      }}
                      placeholder="Ex.: 10"
                    />
                  </div>
                  {isCustom ? (
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Tamanho da caixa (cm)</Label>
                      <Input
                        value={customSize}
                        onChange={(e) => setCustomSize(e.target.value)}
                        placeholder="Ex.: 123x20x63"
                      />
                    </div>
                  ) : null}
                  <div>
                    <Label className="text-xs">Volumes iguais</Label>
                    <Input
                      type="number"
                      min={1}
                      max={maxRepeat > 0 ? maxRepeat : undefined}
                      step={1}
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(e.target.value)}
                      placeholder="Ex.: 1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Peso por volume (kg)</Label>
                    <Input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      placeholder="Ex.: 4,5"
                    />
                  </div>
                </div>
                {groupOpen ? (
                  <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[11px] font-semibold text-slate-700">
                      Itens do pedido {item.order.order_number} para colocar na
                      mesma caixa (peças de cada item por volume)
                    </p>
                    {groupableItems.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        Não há outro item deste pedido com saldo para agrupar.
                      </p>
                    ) : (
                      groupableItems.map((g) => {
                        const row = extraRows.find((r) => r.orderItemId === g.id);
                        return (
                          <div
                            key={g.id}
                            className="grid items-center gap-2 sm:grid-cols-[1.25rem_1fr_6rem]"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={Boolean(row)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setExtraRows((prev) => [
                                    ...prev,
                                    {
                                      key: g.id,
                                      orderItemId: g.id,
                                      pieces: "1",
                                    },
                                  ]);
                                } else {
                                  setExtraRows((prev) =>
                                    prev.filter((r) => r.orderItemId !== g.id)
                                  );
                                }
                              }}
                            />
                            <span className="text-xs text-slate-700">
                              {itemLabel(g.product_code, g.description)}{" "}
                              <span className="text-slate-500">(saldo {g.remaining})</span>
                            </span>
                            <Input
                              type="number"
                              min={1}
                              max={g.remaining}
                              step={1}
                              disabled={!row}
                              className="h-8 text-right"
                              value={row?.pieces ?? ""}
                              onChange={(e) =>
                                setExtraRows((prev) =>
                                  prev.map((r) =>
                                    r.orderItemId === g.id
                                      ? { ...r, pieces: e.target.value }
                                      : r
                                  )
                                )
                              }
                              placeholder="Peças"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
                <p className="text-[11px] text-slate-500">
                  Mesma regra do packing: peças nesta caixa × volumes iguais,
                  sem passar do saldo do item. Ex.: 50 peças, 10 por caixa, 5
                  volumes → Volume 1 a 5. O restante fica no saldo. Customizada:
                  escreva C×L×A (ex. 123x20x63). Peso é de cada volume (não o
                  total da geração). Agrupar itens: só itens do mesmo pedido.
                  {maxRepeat > 0
                    ? ` Máximo agora: ${maxRepeat} volume(s).`
                    : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleAllocate()}
                    disabled={
                      saving ||
                      !piecesPerBox ||
                      !repeatCount ||
                      !weightKg ||
                      (isCustom && !customSize.trim()) ||
                      extraRows.some(
                        (row) =>
                          !row.orderItemId ||
                          !(Math.floor(Number(row.pieces)) >= 1)
                      )
                    }
                  >
                    {saving ? "Gerando…" : "Gerar volumes"}
                  </Button>
                  <Button
                    size="sm"
                    variant={groupOpen ? "default" : "outline"}
                    type="button"
                    onClick={() => {
                      if (volumeItemsMissing) {
                        toast.error(
                          "Para agrupar, rode supabase-packaging-volume-items.sql no SQL Editor do Supabase."
                        );
                        return;
                      }
                      if (groupOpen) {
                        setGroupOpen(false);
                        setExtraRows([]);
                      } else {
                        setGroupOpen(true);
                      }
                    }}
                  >
                    {groupOpen ? "Cancelar agrupamento" : "Agrupar itens"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Sem saldo para alocar neste item.
              </p>
            )}

            {volumes.length > 0 ? (
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Volume</th>
                      <th className="px-2 py-1.5 text-left">Caixa</th>
                      <th className="px-2 py-1.5 text-right">Peças</th>
                      <th className="px-2 py-1.5 text-right">Peso/vol. (kg)</th>
                      <th className="px-2 py-1.5 text-left w-20">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {volumes.map((v) => {
                      const box = boxById.get(v.box_id);
                      const locked =
                        v.status === "printed" || v.status === "scanned";
                      const grouped = (v.items?.length ?? 0) > 1;
                      return (
                        <tr key={v.id} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 font-medium">
                            <div>{sequenceLabel(v.sequence)}</div>
                            {grouped ? (
                              <ul className="mt-1 space-y-0.5 font-normal text-[11px] text-slate-600">
                                {v.items!.map((it) => (
                                  <li key={it.order_item_id}>
                                    {it.product_code ? `${it.product_code} · ` : ""}
                                    {it.description} ({it.piece_quantity} pç)
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5">
                            {box
                              ? `${isAvulsaBoxCode(box.code) ? "Avulsa" : box.code} · ${formatBoxDimensions(box)}`
                              : v.box_id}
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              disabled={locked || saving || grouped}
                              className="h-8 text-right"
                              defaultValue={v.piece_quantity}
                              key={`${v.id}-${v.piece_quantity}`}
                              title={
                                grouped
                                  ? "Volume agrupado: exclua e gere de novo para mudar as peças."
                                  : undefined
                              }
                              onBlur={(e) => {
                                const n = Math.floor(Number(e.target.value));
                                if (n === v.piece_quantity) return;
                                void handleUpdate(v, { piece_quantity: n });
                              }}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              min={0.001}
                              step={0.001}
                              disabled={locked || saving}
                              className="h-8 text-right"
                              placeholder="obrigatório"
                              defaultValue={v.weight_kg ?? ""}
                              key={`${v.id}-w-${v.weight_kg}`}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                if (raw === "" && v.weight_kg == null) return;
                                void handleUpdate(v, {
                                  weight_kg: raw === "" ? null : raw,
                                });
                              }}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            {v.status === "scanned" ? (
                              <span className="text-slate-400">bipado</span>
                            ) : (
                              <div className="flex flex-col items-start gap-0.5">
                                <button
                                  type="button"
                                  className="text-blue-700 hover:underline"
                                  onClick={() => startEdit(v)}
                                >
                                  Editar
                                </button>
                                {print.ok ? (
                                  <button
                                    type="button"
                                    className="text-slate-700 hover:underline"
                                    disabled={printing}
                                    onClick={() => handlePrintClick([v])}
                                  >
                                    Imprimir
                                  </button>
                                ) : null}
                                {!locked ? (
                                  <button
                                    type="button"
                                    className="text-red-600 hover:underline"
                                    onClick={() => void handleDelete(v)}
                                  >
                                    Excluir
                                  </button>
                                ) : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {editing ? (
              <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-800">
                  Editando {sequenceLabel(editing.sequence)}
                  {editing.wasPrinted
                    ? " — já impresso: depois de salvar, reimprima a etiqueta dele"
                    : ""}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Caixa</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                      value={editing.boxId}
                      onChange={(e) =>
                        setEditing({ ...editing, boxId: e.target.value })
                      }
                    >
                      {catalogBoxes.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} — {b.name} ({formatBoxDimensions(b)})
                        </option>
                      ))}
                      <option value={CUSTOM_BOX_VALUE}>
                        Customizada — escrever o tamanho
                      </option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Peso do volume (kg)</Label>
                    <Input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={editing.weight}
                      onChange={(e) =>
                        setEditing({ ...editing, weight: e.target.value })
                      }
                    />
                  </div>
                  {editing.boxId === CUSTOM_BOX_VALUE ? (
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Tamanho da caixa (cm)</Label>
                      <Input
                        value={editing.customSize}
                        onChange={(e) =>
                          setEditing({ ...editing, customSize: e.target.value })
                        }
                        placeholder="Ex.: 123x20x63"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Itens dentro desta caixa
                  </p>
                  {editing.rows.map((row) => {
                    const max = row.current + freeOf(row.orderItemId);
                    return (
                      <div
                        key={row.orderItemId}
                        className="grid items-center gap-2 sm:grid-cols-[1fr_6rem_auto]"
                      >
                        <span className="text-xs text-slate-700">
                          {row.label}{" "}
                          <span className="text-slate-500">(máx {max})</span>
                        </span>
                        <Input
                          type="number"
                          min={1}
                          max={max}
                          step={1}
                          className="h-8 text-right"
                          value={row.pieces}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              rows: editing.rows.map((r) =>
                                r.orderItemId === row.orderItemId
                                  ? { ...r, pieces: e.target.value }
                                  : r
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline px-1"
                          title="Tirar este item da caixa"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              rows: editing.rows.filter(
                                (r) => r.orderItemId !== row.orderItemId
                              ),
                            })
                          }
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {(() => {
                    const inBox = new Set(editing.rows.map((r) => r.orderItemId));
                    const candidates = [
                      ...(itemId && remaining > 0 && !inBox.has(itemId)
                        ? [
                            {
                              id: itemId,
                              label: itemLabel(item.product_code, item.description),
                              free: remaining,
                            },
                          ]
                        : []),
                      ...groupableItems
                        .filter((g) => !inBox.has(g.id))
                        .map((g) => ({
                          id: g.id,
                          label: itemLabel(g.product_code, g.description),
                          free: g.remaining,
                        })),
                    ];
                    if (candidates.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <select
                          className="flex-1 min-w-[12rem] rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                          value={editing.addId}
                          onChange={(e) =>
                            setEditing({ ...editing, addId: e.target.value })
                          }
                        >
                          <option value="">
                            + Incluir outro item deste pedido…
                          </option>
                          {candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label} (saldo {c.free})
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          disabled={!editing.addId}
                          onClick={() => {
                            const c = candidates.find((x) => x.id === editing.addId);
                            if (!c) return;
                            setEditing({
                              ...editing,
                              addId: "",
                              rows: [
                                ...editing.rows,
                                {
                                  orderItemId: c.id,
                                  label: c.label,
                                  pieces: "1",
                                  current: 0,
                                },
                              ],
                            });
                          }}
                        >
                          Incluir
                        </Button>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => setEditing(null)}
                    disabled={savingEdit}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => void handleSaveEdit()}
                    disabled={
                      savingEdit ||
                      !editing.weight ||
                      (editing.boxId === CUSTOM_BOX_VALUE &&
                        !editing.customSize.trim())
                    }
                  >
                    {savingEdit ? "Salvando…" : "Salvar volume"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="text-[11px] text-slate-500 max-w-md">
                {print.ok
                  ? printing
                    ? "Abrindo impressão 100×150 mm…"
                    : "Pronto para impressão 100×150 mm."
                  : print.reason}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={onClose}>
                  Fechar
                </Button>
                <Button
                  size="sm"
                  disabled={!print.ok || printing}
                  onClick={() => handlePrintClick()}
                  title={print.ok ? "Imprimir 100×150 mm" : print.reason}
                >
                  {printing ? "Imprimindo…" : "Imprimir etiquetas"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
