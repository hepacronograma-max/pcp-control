"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CQDashboard } from "@/components/cq/CQDashboard";
import { hasPermission, normalizeUserRole } from "@/lib/utils/permissions";
import { ComprasDashboard } from "./compras-dashboard";
import { ManagerDashboard } from "./manager-dashboard";

type TabKey = "producao" | "compras" | "cq";

/** Parâmetro de URL (?aba=compras|cq); ausente ou inválido = Produção */
const TAB_QUERY = "aba";

interface DashboardMainTabsProps {
  companyId: string;
  userRole: string;
}

export function DashboardMainTabs({
  companyId,
  userRole,
}: DashboardMainTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const normalized = normalizeUserRole(userRole);
  const canCompras = hasPermission(normalized, "viewCompras");
  const canCQ = hasPermission(normalized, "viewCQDashboard");

  const tabFromUrl = searchParams.get(TAB_QUERY)?.toLowerCase();

  const activeTab: TabKey = useMemo(() => {
    if (tabFromUrl === "compras" && canCompras) return "compras";
    if (tabFromUrl === "cq" && canCQ) return "cq";
    return "producao";
  }, [tabFromUrl, canCompras, canCQ]);

  const setTab = useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "producao") params.delete(TAB_QUERY);
      else params.set(TAB_QUERY, next);
      const q = params.toString();
      router.replace(q ? `/dashboard?${q}` : "/dashboard", { scroll: false });
    },
    [router, searchParams]
  );

  const showTabs = canCompras || canCQ;

  return (
    <div className="space-y-4">
      {showTabs ? (
        <nav
          className="-mt-1 flex flex-wrap gap-1 border-b border-slate-200"
          role="tablist"
          aria-label="Vistas do dashboard"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "producao"}
            className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
              activeTab === "producao"
                ? "border-[#1B4F72] text-[#1B4F72] font-semibold"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
            onClick={() => setTab("producao")}
          >
            Produção
          </button>
          {canCompras ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "compras"}
              className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                activeTab === "compras"
                  ? "border-[#1B4F72] text-[#1B4F72] font-semibold"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setTab("compras")}
            >
              Compras
            </button>
          ) : null}
          {canCQ ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "cq"}
              className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                activeTab === "cq"
                  ? "border-[#1B4F72] text-[#1B4F72] font-semibold"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setTab("cq")}
            >
              CQ
            </button>
          ) : null}
        </nav>
      ) : null}

      <div role="tabpanel" className="min-h-[200px]">
        {activeTab === "producao" ? (
          <ManagerDashboard companyId={companyId} />
        ) : null}
        {activeTab === "compras" && canCompras ? (
          <ComprasDashboard companyId={companyId} />
        ) : null}
        {activeTab === "cq" && canCQ ? (
          <CQDashboard companyId={companyId} />
        ) : null}
      </div>
    </div>
  );
}
