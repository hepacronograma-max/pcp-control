"use client";

import { useEffect, useState } from "react";

/** Busca o nº do pedido do cliente no Omie para a OS (pedido interno). */
export function useClientOrderNumber(
  orderId: string | null | undefined,
  enabled: boolean
): string | null {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !orderId) {
      setValue(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/order-client-po?orderId=${encodeURIComponent(orderId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return { clientOrderNumber: null };
        return (await res.json()) as { clientOrderNumber?: string | null };
      })
      .then((json) => {
        if (cancelled) return;
        const n = String(json.clientOrderNumber ?? "").trim();
        setValue(n || null);
      })
      .catch(() => {
        if (!cancelled) setValue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, enabled]);

  return value;
}
