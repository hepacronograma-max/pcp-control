"use client";

import { useEffect, useState } from "react";
import { OperatorDashboard } from "@/components/dashboard/operator-dashboard";
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";

export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar admin local
    const hasLocalAuth = document.cookie.includes("pcp-local-auth=1");
    if (hasLocalAuth) {
      const localCompany = localStorage.getItem("local-company");
      if (localCompany) {
        try {
          const parsed = JSON.parse(localCompany);
          setCompanyId(parsed.id || null);
        } catch {
          /* ignore */
        }
      }
      setRole("manager");
      setLoading(false);
      return;
    }

    fetch("/api/me", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("not authenticated");
        return r.json();
      })
      .then((data: { profile?: { role?: string; company_id?: string | null } }) => {
        if (data.profile) {
          setRole(data.profile.role ?? null);
          setCompanyId(data.profile.company_id ?? null);
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

  if (role === "operator") {
    return <OperatorDashboard />;
  }

  if (companyId) {
    return <ManagerDashboard companyId={companyId} />;
  }

  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm text-red-500">
        Não foi possível carregar o dashboard.
      </p>
    </div>
  );
}
