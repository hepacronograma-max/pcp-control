'use client';

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/hooks/use-user";
import { getOperatorLineIdsForLocalUser } from "@/lib/local-users";
import type { ProductionLine, Profile } from "@/lib/types/database";
import { hasPermission } from "@/lib/utils/permissions";

interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
}

interface OperatorLine {
  line_id: string;
}

/** Conta itens não programados (status waiting ou sem production_start, excluindo finalizados) por linha */
function countUnprogrammedByLine(
  orders: { items: { line_id: string | null; status: string; production_start: string | null }[] }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    for (const item of order.items) {
      if (!item.line_id) continue;
      if (item.status === "completed") continue;
      const needsProgram =
        item.status === "waiting" || item.production_start == null;
      if (needsProgram) {
        counts[item.line_id] = (counts[item.line_id] ?? 0) + 1;
      }
    }
  }
  return counts;
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const { profile, loading } = useUser();
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [operatorLines, setOperatorLines] = useState<OperatorLine[]>([]);
  const [unprogrammedByLine, setUnprogrammedByLine] = useState<Record<string, number>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!profile) return;

    const isLocal =
      !supabase ||
      profile.company_id === "local-company" ||
      profile.id === "local-admin" ||
      profile.id?.startsWith("local-");
    if (isLocal && profile.company_id) {
      try {
        const raw =
          typeof window !== "undefined" &&
          window.localStorage.getItem("pcp-local-company");
        const parsed = raw ? JSON.parse(raw) : null;
        setCompany({
          id: profile.company_id,
          name: parsed?.name ?? "Empresa Local",
          logo_url: parsed?.logo_url ?? null,
        });
      } catch {
        setCompany({
          id: profile.company_id,
          name: "Empresa Local",
          logo_url: null,
        });
      }
      try {
        const raw = typeof window !== "undefined" && window.localStorage.getItem("pcp-local-lines");
        let parsed = raw ? (JSON.parse(raw) as ProductionLine[]) : [];
        const hasAlmox = parsed.some((l) => l.is_almoxarifado);
        if (!hasAlmox) {
          const almoxLine: ProductionLine = {
            id: "almoxarifado-default",
            company_id: profile.company_id!,
            name: "Almoxarifado",
            is_active: true,
            is_almoxarifado: true,
            sort_order: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          parsed = [almoxLine, ...parsed];
          window.localStorage.setItem("pcp-local-lines", JSON.stringify(parsed));
        }
        const active = parsed
          .filter((l) => l.is_active !== false)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        setLines(active);
      } catch {
        setLines([]);
      }
      if (profile.role === "operator") {
        const lineIds = getOperatorLineIdsForLocalUser(profile.id);
        setOperatorLines(lineIds.map((line_id) => ({ line_id })));
      }
      try {
        const rawOrders = typeof window !== "undefined" && window.localStorage.getItem("pcp-local-orders");
        const orders = rawOrders ? (JSON.parse(rawOrders) as { items: { line_id: string | null; status: string; production_start: string | null }[] }[]) : [];
        setUnprogrammedByLine(countUnprogrammedByLine(orders));
      } catch {
        setUnprogrammedByLine({});
      }
      return;
    }
    const client = supabase!;
    async function loadData(p: Profile) {
      if (p.company_id) {
        const { data: companyData } = await client
          .from("companies")
          .select("id, name, logo_url")
          .eq("id", p.company_id)
          .single();
        setCompany(companyData ?? null);

        const { data: linesData } = await client
          .from("production_lines")
          .select("*")
          .eq("company_id", p.company_id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        setLines(linesData ?? []);
      }

      if (p.role === "operator") {
        const { data: opLines } = await client
          .from("operator_lines")
          .select("line_id")
          .eq("user_id", p.id);
        setOperatorLines(opLines ?? []);
      }

      if (p.company_id) {
        try {
          const { data: itemsData } = await client
            .from("order_items")
            .select("line_id, status, production_start")
            .not("line_id", "is", null);
          const counts: Record<string, number> = {};
          for (const it of itemsData ?? []) {
            if (it.line_id && (it.status === "waiting" || !it.production_start)) {
              counts[it.line_id] = (counts[it.line_id] ?? 0) + 1;
            }
          }
          setUnprogrammedByLine(counts);
        } catch {
          setUnprogrammedByLine({});
        }
      }
    }

    loadData(profile);
  }, [profile, supabase, pathname]);

  // Atualiza contagem de itens não programados (modo local) ao trocar de aba ou periodicamente
  useEffect(() => {
    const isLocal2 =
      !supabase ||
      profile?.company_id === "local-company" ||
      profile?.id === "local-admin" ||
      profile?.id?.startsWith("local-");
    if (!isLocal2 || !profile?.company_id) return;
    function refreshCounts() {
      try {
        const raw = typeof window !== "undefined" && window.localStorage.getItem("pcp-local-orders");
        const orders = raw ? (JSON.parse(raw) as { items: { line_id: string | null; status: string; production_start: string | null }[] }[]) : [];
        setUnprogrammedByLine(countUnprogrammedByLine(orders));
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
  }, [profile, supabase]);

  const pageTitle = useMemo(() => {
    if (pathname === "/dashboard" || pathname === "/") return "Dashboard";
    if (pathname?.startsWith("/pedidos")) return "Pedidos";
    if (pathname?.startsWith("/linha")) return "Linha de Produção";
    if (pathname?.startsWith("/configuracoes")) return "Configurações";
    if (pathname?.startsWith("/importar")) return "Importar PDFs";
    return "Dashboard";
  }, [pathname]);

  const visibleLines = useMemo(() => {
    if (!profile) return [];
    if (profile.role === "operator") {
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
      router.push("/login.html");
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

  return (
    <div className="min-h-screen flex">
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
          {visibleLines.map((line) => (
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
        <header className="h-14 shrink-0 border-b bg-white flex items-center px-4 justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden mr-2 rounded-md border p-1.5"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="sr-only">Abrir menu</span>
              <div className="w-4 h-0.5 bg-slate-800 mb-0.5" />
              <div className="w-4 h-0.5 bg-slate-800 mb-0.5" />
              <div className="w-4 h-0.5 bg-slate-800" />
            </button>
            <h1 className="text-sm font-medium text-slate-800">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-3">
            {profile && (
              <>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-medium text-slate-800">
                    {profile.full_name}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {company?.name}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                  {roleLabel}
                </span>
              </>
            )}
            <button
              onClick={handleLogout}
              className="text-xs text-red-600 border border-red-200 rounded-md px-2 py-1 hover:bg-red-50"
            >
              Sair
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 flex flex-col overflow-y-auto p-4 lg:p-6 bg-slate-50">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Carregando...
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="w-64 flex flex-col border-l bg-white">
            <div className="h-14 flex items-center px-4 border-b justify-between">
              <span className="text-sm font-semibold">
                {company?.name ?? "PCP Control"}
              </span>
              <button
                className="text-xs text-slate-500"
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
              {visibleLines.map((line) => (
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
            <div className="border-t p-3">
              <button
                onClick={() => {
                  setSidebarOpen(false);
                  handleLogout();
                }}
                className="w-full rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Sair
              </button>
            </div>
          </aside>
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
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {hasUnprogrammed && (
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse"
          title="Itens aguardando programação"
        />
      )}
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

