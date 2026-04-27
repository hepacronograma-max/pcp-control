'use client';

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { getOperatorLineIdsForLocalUser } from "@/lib/local-users";
import type { ProductionLine, Profile } from "@/lib/types/database";
import {
  canViewProductionLineMenu,
  hasPermission,
} from "@/lib/utils/permissions";
import { itemNeedsProductionProgram } from "@/lib/utils/line-program-indicator";
import { shouldUseLocalServiceApi } from "@/lib/local-service-api";
import { PRODUCTION_LINES_ACTIVE_OR } from "@/lib/supabase/production-line-filters";

interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
}

interface OperatorLine {
  line_id: string;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { profile, loading } = useUser();
  const { companyId: effectiveCompanyId, loaded: effectiveLoaded } =
    useEffectiveCompanyId(profile);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [operatorLines, setOperatorLines] = useState<OperatorLine[]>([]);
  const [unprogrammedByLine, setUnprogrammedByLine] = useState<Record<string, number>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  /** Uma tentativa de criar linha padrão Almoxarifado por empresa (sessão). */
  const ensureDefaultsTriedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    const needsEffectiveCompany =
      supabase && profile.company_id === "local-company";
    if (needsEffectiveCompany && !effectiveLoaded) return;

    const companyId = effectiveCompanyId ?? profile.company_id;
    if (!companyId) return;

    /** Cookie local + Supabase: RLS do anon não aplica; mesmos dados que Pedidos (companyId explícito). */
    const useCompanyDataApi =
      !!supabase && !!profile && shouldUseLocalServiceApi(profile);

    if (useCompanyDataApi) {
      const resolvedCompanyId =
        profile.company_id !== "local-company"
          ? profile.company_id
          : effectiveCompanyId;
      if (!resolvedCompanyId || resolvedCompanyId === "local-company") {
        setCompany(null);
        setLines([]);
        setUnprogrammedByLine({});
        return;
      }
      const apiCompanyId: string = resolvedCompanyId;

      let cancelled = false;
      async function loadCompanyData() {
        try {
          const dataUrl = `/api/company-data?companyId=${encodeURIComponent(apiCompanyId)}&lite=1`;
          let res = await fetch(dataUrl, { credentials: "include" });
          let json = await res.json();
          if (cancelled) return;

          if (
            apiCompanyId &&
            ensureDefaultsTriedRef.current !== apiCompanyId
          ) {
            ensureDefaultsTriedRef.current = apiCompanyId;
            try {
              const ens = await fetch("/api/production-lines", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "ensure_defaults",
                  companyId: apiCompanyId,
                }),
              });
              const ej = (await ens.json()) as {
                success?: boolean;
                created?: boolean;
              };
              if (ej.success && ej.created) {
                res = await fetch(dataUrl, { credentials: "include" });
                json = await res.json();
              }
            } catch {
              /* ignore */
            }
          }

          if (cancelled) return;
          setCompany(json.company ?? null);
          const rawLines = (json.lines ?? []) as ProductionLine[];
          setLines(rawLines.filter((l) => l.is_active !== false));
          setUnprogrammedByLine(json.unprogrammedByLine ?? {});
          if (profile?.role === "operator" || profile?.role === "logistica") {
            const lineIds = getOperatorLineIdsForLocalUser(profile.id);
            setOperatorLines(lineIds.map((line_id) => ({ line_id })));
          }
        } catch {
          if (!cancelled) {
            setCompany(null);
            setLines([]);
            setUnprogrammedByLine({});
          }
        }
      }
      loadCompanyData();
      /** Atualização em background: antes 5s puxava todos os pedidos — pesado. */
      const interval = setInterval(loadCompanyData, 60000);
      const onFocus = () => loadCompanyData();
      window.addEventListener("focus", onFocus);
      return () => {
        cancelled = true;
        clearInterval(interval);
        window.removeEventListener("focus", onFocus);
      };
    }

    if (!supabase) {
      setCompany({ id: companyId, name: "Empresa Local", logo_url: null });
      setLines([]);
      setUnprogrammedByLine({});
      if (profile.role === "operator" || profile.role === "logistica") {
        const lineIds = getOperatorLineIdsForLocalUser(profile.id);
        setOperatorLines(lineIds.map((line_id) => ({ line_id })));
      }
      return;
    }

    const client = supabase;
    async function loadData() {
      const { data: companyData } = await client
        .from("companies")
        .select("id, name, logo_url")
        .eq("id", companyId)
        .single();
      setCompany(companyData ?? null);

      const { data: linesData } = await client
        .from("production_lines")
        .select("*")
        .eq("company_id", companyId)
        .or(PRODUCTION_LINES_ACTIVE_OR)
        .order("sort_order", { ascending: true });
      setLines(linesData ?? []);

      if (profile?.role === "operator" || profile?.role === "logistica") {
        const { data: opLines } = await client
          .from("operator_lines")
          .select("line_id")
          .eq("user_id", profile!.id);
        if (opLines?.length) {
          setOperatorLines(opLines);
        } else {
          const lineIds = getOperatorLineIdsForLocalUser(profile!.id);
          setOperatorLines(lineIds.map((line_id) => ({ line_id })));
        }
      }

      try {
        const { data: itemsData } = await client
          .from("order_items")
          .select("line_id, status, production_start, production_end")
          .not("line_id", "is", null);
        const counts: Record<string, number> = {};
        for (const it of itemsData ?? []) {
          if (itemNeedsProductionProgram(it)) {
            counts[it.line_id] = (counts[it.line_id] ?? 0) + 1;
          }
        }
        setUnprogrammedByLine(counts);
      } catch {
        setUnprogrammedByLine({});
      }
    }

    loadData();
  }, [profile, supabase, effectiveCompanyId, effectiveLoaded, pathname]);

  // Atualiza contagem ao trocar de aba / intervalo — só com sessão Supabase no browser.
  // Login local (+ company-data na API) NÃO deve usar isto: RLS do anon zera a contagem e o piscar “morre”.
  useEffect(() => {
    if (!supabase || !effectiveCompanyId) return;
    if (shouldUseLocalServiceApi(profile)) return;

    const client = supabase;
    async function refreshCounts() {
      try {
        const { data } = await client
          .from("order_items")
          .select("line_id, status, production_start, production_end")
          .not("line_id", "is", null);
        const counts: Record<string, number> = {};
        for (const it of data ?? []) {
          if (itemNeedsProductionProgram(it)) {
            counts[it.line_id] = (counts[it.line_id] ?? 0) + 1;
          }
        }
        setUnprogrammedByLine(counts);
      } catch {
        // ignore
      }
    }
    const interval = setInterval(refreshCounts, 5000);
    window.addEventListener("focus", refreshCounts);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshCounts);
    };
  }, [profile, supabase, effectiveCompanyId]);

  const pageTitle = useMemo(() => {
    if (pathname === "/dashboard" || pathname === "/") return "Dashboard";
    if (pathname?.startsWith("/pedidos")) return "Pedidos";
    if (pathname?.startsWith("/linha")) return "Linha de Produção";
    if (pathname?.startsWith("/configuracoes")) return "Configurações";
    if (pathname?.startsWith("/importar")) return "Importar PDFs";
    if (pathname?.startsWith("/comercial")) return "Comercial";
    if (pathname?.startsWith("/compras")) return "Compras";
    return "Dashboard";
  }, [pathname]);

  const visibleLines = useMemo(() => {
    if (!profile) return [];
    if (profile.role === "operator" || profile.role === "logistica") {
      const allowedIds = new Set(operatorLines.map((ol) => ol.line_id));
      return lines.filter((l) => allowedIds.has(l.id));
    }
    return lines;
  }, [profile, lines, operatorLines]);

  function handleLogout() {
    const isLocalUser =
      !supabase ||
      profile?.company_id === "local-company" ||
      profile?.id === "local-admin" ||
      profile?.id?.startsWith("local-");
    if (isLocalUser) {
      window.localStorage.removeItem("pcp-local-profile");
      document.cookie = "pcp-local-auth=; path=/; max-age=0";
      router.push("/login");
      router.refresh();
      return;
    }
    supabase!.auth.signOut().finally(() => {
      router.push("/login");
      router.refresh();
    });
  }

  const roleLabel = profile
    ? profile.role === "super_admin"
      ? "Super Admin"
      : profile.role === "manager"
      ? "Manager"
      : profile.role === "pcp"
      ? "PCP"
      : profile.role === "comercial"
      ? "Comercial"
      : profile.role === "compras"
      ? "Compras"
      : profile.role === "logistica"
      ? "Logística"
      : "Operador"
    : "";

  // Quando profile é null (ex: perfil não existe no Supabase), mostramos menu completo
  // para o usuário poder navegar e configurar. Evita sidebar vazio no ambiente local.
  const canViewDashboard =
    !profile || hasPermission(profile.role, "viewDashboard");
  const canViewOrders =
    !profile || hasPermission(profile.role, "viewOrders");
  const canViewSettings =
    !profile || hasPermission(profile.role, "viewSettings");
  const canViewComercial =
    !profile || hasPermission(profile.role, "viewComercial");
  const canViewCompras =
    !profile || hasPermission(profile.role, "viewCompras");
  const showProductionLines =
    profile && canViewProductionLineMenu(profile.role);

  return (
    <div className="min-h-screen min-h-[100dvh] flex w-full max-w-[100vw] overflow-x-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-white">
        <div className="h-14 flex items-center px-4 border-b gap-2">
          <div className="h-8 w-8 rounded bg-[#1B4F72] text-white flex items-center justify-center text-xs font-bold overflow-hidden">
            {company?.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <span>{company?.name?.[0] ?? "P"}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">
              {company?.name ?? "PCP Control"}
            </span>
            <span className="text-[11px] text-slate-500">
              Multi-tenant PCP
            </span>
          </div>
        </div>
        <nav className="flex-1 p-3 text-sm text-slate-700 space-y-1">
          {canViewDashboard && (
            <SidebarItem
              label="Dashboard"
              href="/dashboard"
              active={pathname === "/dashboard"}
            />
          )}
          {canViewOrders && (
            <SidebarItem
              label="Pedidos"
              href="/pedidos"
              active={pathname?.startsWith("/pedidos")}
            />
          )}
          {canViewComercial && (
            <SidebarItem
              label="Comercial"
              href="/comercial"
              active={pathname?.startsWith("/comercial")}
            />
          )}
          {canViewCompras && (
            <SidebarItem
              label="Compras"
              href="/compras"
              active={pathname?.startsWith("/compras")}
            />
          )}
          {showProductionLines &&
            visibleLines.map((line) => (
              <SidebarItem
                key={line.id}
                label={line.name}
                href={`/linha/${line.id}`}
                active={pathname?.startsWith(`/linha/${line.id}`)}
                hasUnprogrammed={(unprogrammedByLine[line.id] ?? 0) > 0}
              />
            ))}
          {canViewSettings && (
            <SidebarItem
              label="Configurações"
              href="/configuracoes"
              active={pathname?.startsWith("/configuracoes")}
            />
          )}
        </nav>
        <div className="border-t px-3 py-2 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full rounded-md border border-red-200 px-3 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
          >
            Sair
          </button>
          <div className="text-[11px] text-slate-500 flex items-center justify-between">
            <span>PCP Control</span>
            <span>v1.0.0</span>
          </div>
        </div>
      </aside>

      {/* Conteúdo principal com header */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="min-h-14 shrink-0 border-b bg-white flex flex-wrap items-center gap-x-2 gap-y-1 px-2 sm:px-4 py-2 justify-between sticky top-0 z-20 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
            <button
              type="button"
              className="md:hidden shrink-0 rounded-md border border-slate-200 p-2 min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 active:bg-slate-50"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="sr-only">Abrir menu</span>
              <div className="w-4 h-0.5 bg-slate-800" />
              <div className="w-4 h-0.5 bg-slate-800" />
              <div className="w-4 h-0.5 bg-slate-800" />
            </button>
            <h1 className="text-sm font-medium text-slate-800 truncate">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
            {profile && (
              <>
                <div className="hidden sm:flex flex-col items-end min-w-0 max-w-[220px] md:max-w-none">
                  <span className="text-xs font-medium text-slate-800 truncate max-w-full">
                    {profile.full_name}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate max-w-full hidden sm:block">
                    {company?.name}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-slate-100 text-slate-700 whitespace-nowrap">
                  {roleLabel}
                </span>
              </>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-red-600 border border-red-200 rounded-md px-2 py-1.5 min-h-[36px] sm:min-h-0 hover:bg-red-50 whitespace-nowrap"
            >
              Sair
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] bg-slate-50">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Carregando...
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Sidebar mobile: gaveta à esquerda + área de toque para fechar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <aside className="w-[min(18rem,88vw)] flex flex-col border-r border-slate-200 bg-white shadow-xl pt-[env(safe-area-inset-top)]">
            <div className="h-14 flex items-center px-4 border-b justify-between gap-2 min-w-0">
              <span className="text-sm font-semibold truncate">
                {company?.name ?? "PCP Control"}
              </span>
              <button
                type="button"
                className="text-xs text-slate-500 shrink-0 py-2 px-2 min-h-[44px]"
                onClick={() => setSidebarOpen(false)}
              >
                Fechar
              </button>
            </div>
            <nav className="flex-1 p-3 text-sm text-slate-700 space-y-1">
              {canViewDashboard && (
                <SidebarItem
                  label="Dashboard"
                  href="/dashboard"
                  active={pathname === "/dashboard"}
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              {canViewOrders && (
                <SidebarItem
                  label="Pedidos"
                  href="/pedidos"
                  active={pathname?.startsWith("/pedidos")}
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              {canViewComercial && (
                <SidebarItem
                  label="Comercial"
                  href="/comercial"
                  active={pathname?.startsWith("/comercial")}
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              {canViewCompras && (
                <SidebarItem
                  label="Compras"
                  href="/compras"
                  active={pathname?.startsWith("/compras")}
                  onClick={() => setSidebarOpen(false)}
                />
              )}
              {showProductionLines &&
                visibleLines.map((line) => (
                  <SidebarItem
                    key={line.id}
                    label={line.name}
                    href={`/linha/${line.id}`}
                    active={pathname?.startsWith(`/linha/${line.id}`)}
                    hasUnprogrammed={(unprogrammedByLine[line.id] ?? 0) > 0}
                    onClick={() => setSidebarOpen(false)}
                  />
                ))}
              {canViewSettings && (
                <SidebarItem
                  label="Configurações"
                  href="/configuracoes"
                  active={pathname?.startsWith("/configuracoes")}
                  onClick={() => setSidebarOpen(false)}
                />
              )}
            </nav>
            <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(false);
                  handleLogout();
                }}
                className="w-full rounded-md border border-red-200 px-3 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 min-h-[44px]"
              >
                Sair
              </button>
            </div>
          </aside>
          <div
            className="flex-1 bg-black/40 min-w-0"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}

interface SidebarItemProps {
  label: string;
  href: string;
  active?: boolean;
  hasUnprogrammed?: boolean;
  onClick?: () => void;
}

function SidebarItem({ label, href, active, hasUnprogrammed, onClick }: SidebarItemProps) {
  const router = useRouter();

  function handleClick() {
    router.push(href);
    router.refresh();
    onClick?.();
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
        active
          ? "bg-[#1B4F72] text-white"
          : hasUnprogrammed
          ? "text-slate-800 bg-amber-50 border-2 border-amber-400 pcp-sidebar-line-alert"
          : "text-slate-700 hover:bg-slate-100"
      }`}
      title={
        hasUnprogrammed
          ? "Itens nesta linha sem data de produção programada — defina na Linha de Produção"
          : undefined
      }
    >
      {hasUnprogrammed && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-400/50 pcp-sidebar-line-alert-dot"
          title="Aguardando programação"
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {hasUnprogrammed && (
        <span className="text-[10px] font-bold text-amber-600 shrink-0">!</span>
      )}
    </button>
  );
}

