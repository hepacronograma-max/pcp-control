"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { useUser } from "@/lib/hooks/use-user";
import { formatBoxDimensions, isAvulsaBoxCode } from "@/lib/packaging/boxes";
import { sequenceLabel } from "@/lib/packaging/allocation";
import type { PackagingBox, PackagingVolume } from "@/lib/types/database";

type Payload = {
  volume?: PackagingVolume;
  box?: PackagingBox | null;
  order?: { order_number: string; client_name: string; status: string };
  item?: { description: string; product_code: string | null; quantity: number };
  items?: {
    order_item_id: string;
    piece_quantity: number;
    product_code?: string | null;
    description?: string;
  }[];
  error?: string;
};

export default function EmbarqueBiparPage() {
  const params = useParams<{ token: string }>();
  const token = String(params.token || "");
  const { profile, loading } = useUser();
  const { companyId, loaded: companyLoaded } = useEffectiveCompanyId(profile);
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !token) return;
    const res = await fetch(
      `/api/packaging-volumes?companyId=${encodeURIComponent(companyId)}&qrToken=${encodeURIComponent(token)}`,
      { credentials: "include" }
    );
    const json = (await res.json()) as Payload;
    if (!res.ok) {
      toast.error(json.error || "Volume não encontrado.");
      setData({ error: json.error });
      return;
    }
    setData(json);
  }, [companyId, token]);

  useEffect(() => {
    if (!loading && companyLoaded) void load();
  }, [loading, companyLoaded, load]);

  async function handleScan() {
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
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Falha na conferência.");
        return;
      }
      toast.success("Volume conferido.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !companyLoaded) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">Carregando…</div>
    );
  }

  const v = data?.volume;
  const box = data?.box ?? null;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Conferência de volume</h1>
      {!v ? (
        <p className="text-sm text-amber-800 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          {data?.error || "QR não encontrado nesta empresa."}
        </p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-2">
          <p className="font-semibold">{sequenceLabel(v.sequence)}</p>
          <p>
            Pedido {data?.order?.order_number} — {data?.order?.client_name}
          </p>
          {(data?.items && data.items.length > 0
            ? data.items
            : data?.item
              ? [
                  {
                    order_item_id: v.order_item_id,
                    piece_quantity: v.piece_quantity,
                    product_code: data.item.product_code,
                    description: data.item.description,
                  },
                ]
              : []
          ).map((it) => (
            <p key={it.order_item_id}>
              {it.product_code ? `${it.product_code} · ` : ""}
              {it.description} ({it.piece_quantity} pç)
            </p>
          ))}
          <p>
            Caixa:{" "}
            {box
              ? `${isAvulsaBoxCode(box.code) ? "Avulsa" : box.code} ${formatBoxDimensions(box)}`
              : "—"}
          </p>
          <p>
            {v.piece_quantity} pç(s) · {v.weight_kg ?? "—"} kg
          </p>
          <p className="text-xs text-slate-500">
            Status: {v.status === "scanned" ? "conferido" : v.status}
          </p>
          {v.status === "scanned" ? (
            <p className="text-emerald-700 text-xs font-medium">
              Este volume já foi conferido
              {v.scanned_at
                ? ` em ${new Date(v.scanned_at).toLocaleString("pt-BR")}`
                : ""}
              .
            </p>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void handleScan()}>
              {busy ? "Gravando…" : "Confirmar conferência"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
