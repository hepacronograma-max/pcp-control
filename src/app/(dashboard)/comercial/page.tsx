"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { shouldUseLocalServiceApi } from "@/lib/local-service-api";
import {
  LIVE_PAGE_POLL_MS,
  liveGetInit,
  usePollWhenVisible,
} from "@/lib/hooks/use-poll-when-visible";
import type { OrderComercialThreadPatch } from "@/lib/types/database";
import {
  collectActorRoles,
  defaultAppPathForRole,
  hasPermission,
} from "@/lib/utils/permissions";
import { ComercialOrdersView, type ComercialOrderApi } from "@/components/comercial/comercial-orders-view";
import { toast } from "sonner";

export default function ComercialPage() {
  const { profile, loading: userLoading } = useUser();
  const { companyId: effectiveCompanyId, loaded: effectiveLoaded } =
    useEffectiveCompanyId(profile);
  const router = useRouter();
  const [rows, setRows] = useState<ComercialOrderApi[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);

  const allowed = profile && hasPermission(profile, "viewComercial");

  useEffect(() => {
    if (userLoading) return;
    if (profile && !hasPermission(profile, "viewComercial")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [userLoading, profile, router]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!profile || !hasPermission(profile, "viewComercial")) return;
    const silent = Boolean(opts?.silent);
    const useApi = shouldUseLocalServiceApi(profile);
    if (useApi && profile.company_id === "local-company" && !effectiveLoaded) {
      return;
    }
    const companyId = effectiveCompanyId;
    if (!companyId) return;
    if (!silent) setFetching(true);
    try {
      const res = await fetch(
        `/api/comercial-orders?companyId=${encodeURIComponent(companyId)}`,
        liveGetInit
      );
      const j = (await res.json()) as {
        orders?: ComercialOrderApi[];
        error?: string;
      };
      if (!res.ok) {
        const msg =
          j.error ||
          (res.status === 401
            ? "Sessão expirada. Entre de novo."
            : "Não foi possível carregar os pedidos.");
        if (!silent) {
          setLoadError(msg);
          toast.error(msg);
        }
        return;
      }
      if (j.error) {
        if (!silent) setLoadError(j.error);
        return;
      }
      setLoadError(null);
      setRows(
        (j.orders ?? []).map((o) => ({
          ...o,
          items: o.items ?? [],
          production_deadline: o.production_deadline ?? null,
        }))
      );
      setLastAt(new Date());
    } catch {
      if (!silent) setLoadError("Erro de rede.");
    } finally {
      if (!silent) setFetching(false);
    }
  }, [profile, effectiveCompanyId, effectiveLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  usePollWhenVisible(
    () => void load({ silent: true }),
    LIVE_PAGE_POLL_MS,
    Boolean(allowed && effectiveCompanyId),
    { immediate: false }
  );

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

  const canEditObservation = collectActorRoles(profile).some(
    (r) => r === "comercial" || r === "manager" || r === "super_admin"
  );
  const canEditDeliveryDeadline = hasPermission(
    profile,
    "editComercialDeliveryDeadline"
  );

  return (
    <ComercialOrdersView
      orders={rows}
      loadError={loadError}
      fetching={fetching}
      lastAt={lastAt}
      onRefresh={() => void load()}
      canEditObservation={canEditObservation}
      canEditDeliveryDeadline={canEditDeliveryDeadline}
      onObservationSaved={(orderId, patch: OrderComercialThreadPatch) =>
        setRows((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o))
        )
      }
      onDeliveryDeadlineSaved={(orderId, delivery_deadline) =>
        setRows((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, delivery_deadline } : o
          )
        )
      }
    />
  );
}
