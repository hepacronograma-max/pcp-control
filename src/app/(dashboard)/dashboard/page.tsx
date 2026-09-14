"use client";

import { Suspense, useEffect, useState } from "react";
import { OperatorDashboard } from "@/components/dashboard/operator-dashboard";
import { ComprasDashboard } from "@/components/dashboard/compras-dashboard";
import { DashboardMainTabs } from "@/components/dashboard/dashboard-main-tabs";

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
          if (Array.isArray(parsed.extra_roles)) {
            setExtraRoles(parsed.extra_roles.filter(Boolean));
          }
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
            Array.isArray(data.profile.extra_roles)
              ? data.profile.extra_roles.filter(Boolean)
              : []
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

  /** Operador e Logística: KPIs só das linhas atribuídas (`operator_lines`). */
  if (role === "operator" || role === "logistica") {
    return <OperatorDashboard />;
  }

  /** Compras: KPIs só de pedidos de compra (PC). */
  if (role === "compras" && companyId) {
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
