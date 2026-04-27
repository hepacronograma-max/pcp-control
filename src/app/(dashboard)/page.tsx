"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OperatorDashboard } from "@/components/dashboard/operator-dashboard";
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";

export default function DashboardPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hasLocalAuth =
      typeof document !== "undefined" &&
      document.cookie.split("; ").some((c) => c.startsWith("pcp-local-auth=1"));
    if (hasLocalAuth) {
      try {
        const raw = window.localStorage.getItem("pcp-local-profile");
        if (raw) {
          const p = JSON.parse(raw) as {
            role?: string;
            company_id?: string | null;
          };
          setRole(p.role ?? "manager");
          setCompanyId(p.company_id ?? "local-company");
        } else {
          setRole("manager");
          setCompanyId("local-company");
        }
      } catch {
        setRole("manager");
        setCompanyId("local-company");
      }
      setLoading(false);
      return;
    }

    fetch("/api/me", { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        return r.json() as Promise<{
          profile?: { role?: string; company_id?: string | null };
        }>;
      })
      .then((data) => {
        if (!data) return;
        if (data.profile) {
          setRole(data.profile.role ?? null);
          setCompanyId(data.profile.company_id ?? null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-slate-500">Carregando dashboard...</p>
      </div>
    );
  }

  if (role === "operator" || role === "logistica") {
    return <OperatorDashboard />;
  }

  if (!companyId) {
    return (
      <div className="text-sm text-amber-700 py-8 text-center">
        Empresa não encontrada no perfil. Configure em Configurações → Empresa.
      </div>
    );
  }

  return <ManagerDashboard companyId={companyId} />;
}
