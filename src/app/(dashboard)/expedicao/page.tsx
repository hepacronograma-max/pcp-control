"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VolumeQrScanner } from "@/components/expedicao/volume-qr-scanner";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { useUser } from "@/lib/hooks/use-user";
import {
  LIVE_PAGE_POLL_MS,
  liveGetInit,
  usePollWhenVisible,
} from "@/lib/hooks/use-poll-when-visible";
import { formatBoxDimensions, isAvulsaBoxCode } from "@/lib/packaging/boxes";
import { sequenceLabel } from "@/lib/packaging/allocation";
import {
  canFinishLoading,
  expedicaoStationOf,
  EXPEDICAO_STATIONS,
  type ExpedicaoStation,
} from "@/lib/packaging/expedicao";
import {
  parseExpedicaoQr,
  type ExpedicaoQrScan,
} from "@/lib/packaging/parse-expedicao-qr";
import { shippingListItemText } from "@/lib/packaging/shipping-list-print";
import { scannedVolumeCount } from "@/lib/packaging/shipping-stations";
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
};

function boxLabel(box: PackagingBox | undefined): string {
  if (!box) return "—";
  const kind = isAvulsaBoxCode(box.code) ? "Avulsa" : box.code;
  return `${kind} ${formatBoxDimensions(box)}`;
}

function volumeText(volume: PackagingVolume, items: ListRow["items"]): string {
  if (volume.items && volume.items.length > 0) {
    return volume.items
      .map((it) =>
        shippingListItemText({
          productCode: it.product_code,
          description: it.description,
        })
      )
      .join(" · ");
  }
  const it = items.find((i) => i.id === volume.order_item_id);
  return shippingListItemText({
    productCode: it?.product_code,
    description: it?.description,
  });
}

function nfeLabel(list: ShippingList | null): string | null {
  const nfe = String(list?.nfe_number ?? "").trim();
  return nfe || null;
}

async function fileToJpegDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}

export default function ExpedicaoPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const { companyId, loaded: companyLoaded } = useEffectiveCompanyId(profile);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [query, setQuery] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [stationTab, setStationTab] = useState<ExpedicaoStation>("invoiced");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openedFromUrl = useRef(false);

  const allowed = profile && hasPermission(profile, "viewExpedicao");

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile, "viewExpedicao")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [loading, profile, router]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!companyId) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setFetching(true);
    try {
      const res = await fetch(
        `/api/shipping-lists?companyId=${encodeURIComponent(companyId)}`,
        liveGetInit
      );
      const json = (await res.json()) as { lists?: ListRow[]; error?: string };
      if (!res.ok) {
        if (!silent) toast.error(json.error || "Erro ao carregar expedição");
        return;
      }
      setRows(json.lists ?? []);
    } catch {
      if (!silent) toast.error("Erro ao carregar expedição");
    } finally {
      if (!silent) setFetching(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (allowed && companyLoaded && companyId) void load();
  }, [allowed, companyLoaded, companyId, load]);

  usePollWhenVisible(
    () => void load({ silent: true }),
    LIVE_PAGE_POLL_MS,
    Boolean(allowed && companyLoaded && companyId),
    { immediate: false }
  );

  const releasedRows = useMemo(
    () =>
      rows.filter((row) => {
        const list = row.shippingList;
        return (
          row.order.status === "finished" ||
          list?.status === "finalized" ||
          Boolean(list?.finalized_at)
        );
      }),
    [rows]
  );

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return releasedRows.filter((row) => {
      if (expedicaoStationOf(row.shippingList) !== stationTab) return false;
      if (!q) return true;
      const nfe = nfeLabel(row.shippingList)?.toLowerCase() ?? "";
      return (
        String(row.order.order_number).toLowerCase().includes(q) ||
        row.order.client_name.toLowerCase().includes(q) ||
        nfe.includes(q)
      );
    });
  }, [releasedRows, stationTab, query]);

  const openRow = useMemo(
    () => releasedRows.find((r) => r.order.id === openId) ?? null,
    [releasedRows, openId]
  );

  const counts = useMemo(() => {
    const c: Record<ExpedicaoStation, number> = {
      ready: 0,
      invoiced: 0,
      finished: 0,
    };
    for (const row of releasedRows) c[expedicaoStationOf(row.shippingList)] += 1;
    return c;
  }, [releasedRows]);

  const openConference = useCallback(
    (row: ListRow, opts?: { silent?: boolean }) => {
      setStationTab(expedicaoStationOf(row.shippingList));
      setOpenId(row.order.id);
      if (!opts?.silent) {
        const nfe = nfeLabel(row.shippingList);
        toast.success(
          nfe
            ? `Pedido ${row.order.order_number} · NF ${nfe}`
            : `Pedido ${row.order.order_number} (sem nota)`
        );
      }
    },
    []
  );

  useEffect(() => {
    if (openedFromUrl.current || releasedRows.length === 0) return;
    const lista = new URLSearchParams(window.location.search).get("lista");
    if (!lista) return;
    const hit = releasedRows.find((r) => r.shippingList?.id === lista);
    if (hit) {
      openedFromUrl.current = true;
      openConference(hit, { silent: true });
      return;
    }
    const pending = rows.find((r) => r.shippingList?.id === lista);
    if (pending) {
      openedFromUrl.current = true;
      toast.error("Este pedido ainda não foi liberado pelo PCP.");
    }
  }, [releasedRows, rows, openConference]);

  function openByOrderNumber() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = releasedRows.find(
      (r) => String(r.order.order_number).toLowerCase() === q
    );
    const byNfe = releasedRows.find(
      (r) => nfeLabel(r.shippingList)?.toLowerCase() === q
    );
    const partial = releasedRows.find((r) =>
      String(r.order.order_number).toLowerCase().includes(q)
    );
    const hit = exact ?? byNfe ?? partial;
    if (!hit) {
      toast.error("Pedido não encontrado na expedição.");
      return;
    }
    openConference(hit);
  }

  const scanVolume = useCallback(
    async (token: string, row: ListRow) => {
      if (!companyId) return;
      setBusy(true);
      try {
        const res = await fetch("/api/packaging-volumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "scan",
            companyId,
            qrToken: token,
            orderId: row.order.id,
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          alreadyScanned?: boolean;
          volume?: PackagingVolume;
        };
        if (!res.ok) {
          toast.error(json.error || "QR não conferido.");
          return;
        }
        if (json.alreadyScanned) {
          toast.message("Volume já estava conferido.");
        } else {
          const seq = json.volume?.sequence;
          toast.success(
            seq != null ? `${sequenceLabel(seq)} conferido` : "Volume conferido"
          );
        }
        setScanInput("");
        await load();
      } finally {
        setBusy(false);
      }
    },
    [companyId, load]
  );

  const handleScan = useCallback(
    async (scan: ExpedicaoQrScan) => {
      if (scan.type === "list") {
        const hit = releasedRows.find((r) => r.shippingList?.id === scan.listId);
        if (!hit) {
          const pending = rows.find((r) => r.shippingList?.id === scan.listId);
          toast.error(
            pending
              ? "Este pedido ainda não foi liberado pelo PCP."
              : "Packing list não encontrada."
          );
          return;
        }
        openConference(hit);
        return;
      }

      const owner =
        (openRow &&
        openRow.volumes.some((v) => v.qr_token === scan.token)
          ? openRow
          : null) ??
        releasedRows.find((r) => r.volumes.some((v) => v.qr_token === scan.token));
      if (!owner) {
        const asList = releasedRows.find((r) => r.shippingList?.id === scan.token);
        if (asList) {
          openConference(asList);
          return;
        }
        toast.error("Esta caixa não está na expedição.");
        return;
      }
      if (!openRow || openRow.order.id !== owner.order.id) {
        openConference(owner, { silent: true });
      }
      await scanVolume(scan.token, owner);
    },
    [releasedRows, rows, openRow, openConference, scanVolume]
  );

  function handleTypedScan() {
    const parsed = parseExpedicaoQr(scanInput);
    if (parsed) {
      void handleScan(parsed);
      return;
    }
    const q = scanInput.trim().toLowerCase();
    const exact = releasedRows.find(
      (r) => String(r.order.order_number).toLowerCase() === q
    );
    const byNfe = releasedRows.find(
      (r) => nfeLabel(r.shippingList)?.toLowerCase() === q
    );
    const hit = exact ?? byNfe;
    if (hit) {
      setScanInput("");
      openConference(hit);
      return;
    }
    toast.error("QR inválido. Bipe a packing list ou a caixa.");
  }

  async function handlePhoto(file: File | undefined) {
    if (!companyId || !openRow || !file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToJpegDataUrl(file);
      const res = await fetch("/api/shipping-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "upload-cargo-photo",
          companyId,
          orderId: openRow.order.id,
          dataUrl,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Não foi possível gravar a foto.");
        return;
      }
      toast.success("Foto da carga salva");
      await load();
    } catch {
      toast.error("Não foi possível ler a foto.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    if (!companyId || !openRow) return;
    const gate = canFinishLoading(openRow.shippingList, openRow.volumes);
    if (!gate.ok) {
      toast.error(gate.reason);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/shipping-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "finish-loading",
          companyId,
          orderId: openRow.order.id,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Não foi possível finalizar.");
        return;
      }
      toast.success("Carregamento finalizado — pedido em Coletado");
      setStationTab("finished");
      await load();
    } finally {
      setBusy(false);
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

  const scan = openRow ? scannedVolumeCount(openRow.volumes) : null;
  const finishGate = openRow
    ? canFinishLoading(openRow.shippingList, openRow.volumes)
    : null;
  const finished = openRow
    ? expedicaoStationOf(openRow.shippingList) === "finished"
    : false;
  const allBoxesOk = Boolean(scan?.allScanned);
  const hasPhoto = Boolean(openRow?.shippingList?.cargo_photo_url);
  const openNfe = openRow ? nfeLabel(openRow.shippingList) : null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {!openRow ? (
        <>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Expedição</h1>
            <p className="text-sm text-slate-500 mt-1">
              Bipe o QR da packing list, confira caixa a caixa, fotografe a
              carga e finalize.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {EXPEDICAO_STATIONS.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStationTab(st.id)}
                className={`rounded-xl border px-2 py-3 text-center text-[11px] font-semibold leading-tight ${
                  stationTab === st.id
                    ? "border-[#1B4F72] bg-[#1B4F72] text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {st.label}
                <span className="mt-0.5 block tabular-nums opacity-80">
                  {counts[st.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            <p className="text-sm font-semibold text-slate-800">
              {stationTab === "invoiced"
                ? "Bipar packing list (com a nota)"
                : "Bipar packing list ou caixa"}
            </p>
            <VolumeQrScanner
              disabled={busy}
              onScan={(s) => void handleScan(s)}
              labelIdle="Abrir câmera"
              labelActive="Fechar câmera"
            />
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleTypedScan();
              }}
            >
              <Input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Cole o QR ou número do pedido"
                className="min-h-11 flex-1 text-base"
                autoComplete="off"
                disabled={busy}
              />
              <Button
                type="submit"
                className="min-h-11"
                disabled={busy || !scanInput.trim()}
              >
                Abrir
              </Button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                openByOrderNumber();
              }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pedido, cliente ou NF"
                className="min-h-11 text-base"
              />
            </form>
          </div>

          {fetching ? (
            <p className="text-xs text-slate-500">Carregando pedidos…</p>
          ) : visibleRows.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              Nenhum pedido nesta aba.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleRows.map((row) => {
                const s = scannedVolumeCount(row.volumes);
                const nfe = nfeLabel(row.shippingList);
                return (
                  <button
                    key={row.order.id}
                    type="button"
                    onClick={() => openConference(row, { silent: true })}
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-lg font-semibold text-slate-900">
                        {row.order.order_number}
                      </p>
                      <span className="text-sm tabular-nums text-slate-600">
                        {s.scanned}/{s.total}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {row.order.client_name}
                    </p>
                    {nfe ? (
                      <p className="mt-1 text-sm font-medium text-[#1B4F72]">
                        NF {nfe}
                      </p>
                    ) : stationTab === "ready" ? (
                      <p className="mt-1 text-xs text-amber-800">Sem nota</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold text-slate-900">
                Pedido {openRow.order.order_number}
              </p>
              <p className="text-sm text-slate-600">{openRow.order.client_name}</p>
              {openNfe ? (
                <p className="mt-1 text-base font-semibold text-[#1B4F72]">
                  NF {openNfe}
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-800">Aguardando número da nota</p>
              )}
              <p className="mt-1 text-sm text-slate-500">
                {scan ? `Caixas ${scan.scanned}/${scan.total}` : null}
                {finished ? " · Coletado" : ""}
              </p>
            </div>
            <button
              type="button"
              className="min-h-10 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100"
              onClick={() => setOpenId(null)}
            >
              Voltar
            </button>
          </div>

          {!finished ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-800">
                Bipe cada caixa
              </p>
              <VolumeQrScanner
                disabled={busy}
                onScan={(s) => void handleScan(s)}
                labelIdle="Câmera da caixa"
                labelActive="Fechar câmera"
              />
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleTypedScan();
                }}
              >
                <Input
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Cole o QR da caixa"
                  className="min-h-11 flex-1 text-base"
                  autoComplete="off"
                  disabled={busy}
                />
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={busy || !scanInput.trim()}
                >
                  Conferir
                </Button>
              </form>
            </div>
          ) : null}

          <div className="space-y-1.5">
            {openRow.volumes.map((v) => {
              const box = openRow.boxes.find((b) => b.id === v.box_id);
              const ok = v.status === "scanned";
              return (
                <div
                  key={v.id}
                  className={`rounded-xl border px-3 py-3 ${
                    ok
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {sequenceLabel(v.sequence)}
                    </p>
                    <span
                      className={`text-sm font-semibold ${
                        ok ? "text-emerald-800" : "text-amber-900"
                      }`}
                    >
                      {ok ? "OK" : "Pendente"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-700">
                    {volumeText(v, openRow.items)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {boxLabel(box)} · {v.piece_quantity} pç
                  </p>
                </div>
              );
            })}
          </div>

          {!finished && allBoxesOk ? (
            <div className="space-y-3 rounded-xl border-2 border-[#1B4F72] bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">
                Todas as caixas conferidas. Tire a foto da carga.
              </p>
              {hasPhoto ? (
                <img
                  src={
                    companyId
                      ? `/api/expedicao/foto?companyId=${encodeURIComponent(companyId)}&orderId=${encodeURIComponent(openRow.order.id)}`
                      : openRow.shippingList?.cargo_photo_url ?? ""
                  }
                  alt="Foto da carga"
                  className="max-h-56 w-full rounded-md border border-slate-200 object-cover"
                />
              ) : null}
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void handlePhoto(file);
                  }}
                />
                <span className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-base font-medium text-slate-800">
                  {busy
                    ? "Enviando…"
                    : hasPhoto
                      ? "Trocar foto"
                      : "Fotografar carga"}
                </span>
              </label>
              <Button
                className="min-h-12 w-full text-base"
                disabled={busy || !finishGate?.ok}
                onClick={() => void handleFinish()}
              >
                {busy ? "Gravando…" : "Finalizar carregamento"}
              </Button>
              {finishGate && !finishGate.ok ? (
                <p className="text-xs text-slate-500">{finishGate.reason}</p>
              ) : null}
            </div>
          ) : finished ? (
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">
                Pedido coletado. Também está em Coletado no Faturamento.
              </p>
              {hasPhoto ? (
                <img
                  src={
                    companyId
                      ? `/api/expedicao/foto?companyId=${encodeURIComponent(companyId)}&orderId=${encodeURIComponent(openRow.order.id)}`
                      : openRow.shippingList?.cargo_photo_url ?? ""
                  }
                  alt="Foto da carga"
                  className="max-h-56 w-full rounded-md border border-slate-200 object-cover"
                />
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Depois de bipar todas as caixas, o celular pede a foto da carga.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
