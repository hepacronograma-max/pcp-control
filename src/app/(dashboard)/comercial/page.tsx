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

  const allowed = profile && hasPermission(profile.role, "viewComercial");

  useEffect(() => {
    if (userLoading) return;
    if (profile && !hasPermission(profile.role, "viewComercial")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [userLoading, profile, router]);

  const load = useCallback(async () => {
    if (!profile || !hasPermission(profile.role, "viewComercial")) return;
    const useApi = shouldUseLocalServiceApi(profile);
    if (useApi && profile.company_id === "local-company" && !effectiveLoaded) {
      return;
    }
    const companyId = effectiveCompanyId;
    if (!companyId) return;
    setFetching(true);
    try {
      const res = await fetch(
        `/api/comercial-orders?companyId=${encodeURIComponent(companyId)}`,
        { credentials: "include" }
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
        setLoadError(msg);
        toast.error(msg);
        return;
      }
      if (j.error) {
        setLoadError(j.error);
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
      setLoadError("Erro de rede.");
    } finally {
      setFetching(false);
    }
  }, [profile, effectiveCompanyId, effectiveLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      void load();
    }, 20000);
    return () => clearInterval(t);
  }, [load]);

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
    <ComercialOrdersView
      orders={rows}
      loadError={loadError}
      fetching={fetching}
      lastAt={lastAt}
      onRefresh={() => void load()}
    />
  );
}
