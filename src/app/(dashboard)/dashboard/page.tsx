"use client";

import { Suspense, useEffect, useState } from "react";
import { OperatorDashboard } from "@/components/dashboard/operator-dashboard";
import { ComprasDashboard } from "@/components/dashboard/compras-dashboard";
import { DashboardMainTabs } from "@/components/dashboard/dashboard-main-tabs";
import { hasPermission, parseExtraRoles } from "@/lib/utils/permissions";

export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  const [extraRoles, setExtraRoles] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar admin local
    const hasLocalAuth = document.cookie.includes("pcp-local-auth=1");
    if (hasLocalAuth) {
      let cid: string | null = null;
      let localRole: string | null = null;

      const localProfile = localStorage.getItem("pcp-local-profile");
      if (localProfile) {
        try {
          const parsed = JSON.parse(localProfile) as {
            company_id?: string;
            role?: string;
            extra_roles?: string[];
          };
          cid = parsed.company_id || null;
          localRole = parsed.role ?? null;
          setExtraRoles(parseExtraRoles(parsed.extra_roles, localRole));
        } catch {
          /* ignore */
        }
      }

      const isUuid =
        cid &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          cid
        );
      if (!isUuid) {
        fetch("/api/effective-company", { credentials: "include" })
          .then((r) => r.json())
          .then((data: { companyId?: string | null }) => {
            setCompanyId(data.companyId || null);
            setRole(localRole ?? "manager");
            setLoading(false);
          })
          .catch(() => {
            setRole(localRole ?? "manager");
            setLoading(false);
          });
        return;
      }

      setCompanyId(cid);
      setRole(localRole ?? "manager");
      setLoading(false);
      return;
    }

    fetch("/api/me", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("not authenticated");
        return r.json();
      })
      .then((data: { profile?: { role?: string; company_id?: string | null; extra_roles?: string[] } }) => {
        if (data.profile) {
          setRole(data.profile.role ?? null);
          setCompanyId(data.profile.company_id ?? null);
          setExtraRoles(
            parseExtraRoles(data.profile.extra_roles, data.profile.role)
          );
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-slate-500">Carregando dashboard...</p>
      </div>
    );
  }

  /** Operador/Logística: KPIs só das linhas atribuídas, salvo extra_roles com visão geral. */
  const actor = { role: role ?? undefined, extra_roles: extraRoles };
  if (
    (role === "operator" || role === "logistica") &&
    !hasPermission(actor, "viewAllLines")
  ) {
    return <OperatorDashboard />;
  }

  /**
   * Só Compras (sem PCP/gestão extra): dashboard exclusivo de PC.
   * Com viewAllLines, as abas Produção + Compras iguais à tela da gestão.
   */
  if (
    role === "compras" &&
    companyId &&
    !hasPermission(actor, "viewAllLines")
  ) {
    return <ComprasDashboard companyId={companyId} />;
  }

  if (companyId) {
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-slate-500">Carregando dashboard...</p>
          </div>
        }
      >
        <DashboardMainTabs
                companyId={companyId}
                userRole={role ?? "manager"}
                extraRoles={extraRoles}
              />
      </Suspense>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm text-red-500">
        Não foi possível carregar o dashboard.
      </p>
    </div>
  );
}
