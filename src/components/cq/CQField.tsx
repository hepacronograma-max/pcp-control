"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { allowLocalAuthClient } from "@/lib/allow-local-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, Flag } from "lucide-react";
import { toast } from "sonner";
import type { CQGravidade, CQTargetType, CQCategoria } from "@/lib/types/cq";
import { normalizeUserRole } from "@/lib/utils/permissions";
import { isUuid } from "@/lib/utils/is-uuid";
import { categoryRoleFallbackChain } from "@/lib/cq/category-role-chain";

function dispatchCQRefresh(targetType: CQTargetType, targetId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("pcp-cq-refresh", {
      detail: { targetType, targetId },
    })
  );
}

interface CQFieldProps {
  targetType: CQTargetType;
  targetId: string;
  userRole: string;
  userId?: string;
  companyId?: string;
  onRegistered?: () => void;
  variant?: "button" | "icon" | "inline";
  label?: string;
  /** Linha de produção: alvo de toque maior + tooltips */
  comfortableTouch?: boolean;
}

const ROLES_CAN_REGISTER = new Set([
  "super_admin",
  "manager",
  "admin",
  "operator",
  "logistica",
  "pcp",
  "compras",
  "comercial",
]);

function hasPcpLocalDevSession(): boolean {
  if (typeof window === "undefined") return false;
  return (
    allowLocalAuthClient() && !!window.localStorage.getItem("pcp-local-profile")
  );
}

export function CQField({
  targetType,
  targetId,
  userRole,
  userId,
  companyId,
  onRegistered,
  variant = "icon",
  label = "Registrar Ocorrência",
  comfortableTouch = false,
}: CQFieldProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [outroTexto, setOutroTexto] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [quickRegistering, setQuickRegistering] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");

  const supabase = createClient();

  useEffect(() => {
    async function loadUserInfo() {
      const roleNorm = normalizeUserRole(userRole);

      if (userId && companyId && userRole) {
        setCurrentUserId(userId);
        setCurrentCompanyId(companyId ?? null);
        setCurrentUserRole(roleNorm);
        console.debug("[CQField] contexto a partir de props", {
          userId,
          companyId,
          role: roleNorm,
        });
        return;
      }

      if (!supabase) {
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, company_id")
          .eq("id", user.id)
          .single();

        if (profile) {
          const r = normalizeUserRole(profile.role ?? userRole);
          setCurrentUserRole(r);
          setCurrentCompanyId(profile.company_id);
          console.debug("[CQField] contexto Supabase auth", {
            userId: user.id,
            companyId: profile.company_id,
            role: r,
          });
        }
      } else {
        console.debug("[CQField] Sem sessão Supabase; categorias podem usar API (pcp-local-auth).");
      }
    }
    void loadUserInfo();
  }, [userId, companyId, userRole, supabase]);

  const categoriasFetchEnabled = Boolean(
    currentCompanyId &&
      currentUserRole &&
      (hasPcpLocalDevSession() || !!supabase)
  );

  const categoriasFetchKey = categoriasFetchEnabled
    ? ([currentCompanyId!, currentUserRole!] as const)
    : (["disabled"] as const);

  const {
    data: categorias = [],
    isPending: categoriasLoading,
  } = useQuery({
    queryKey: ["cq-categorias", ...categoriasFetchKey],
    queryFn: async (): Promise<CQCategoria[]> => {
      const cid = currentCompanyId!;
      const role = currentUserRole!;

      if (hasPcpLocalDevSession()) {
        const url = `/api/cq/categorias?companyId=${encodeURIComponent(cid)}&userRole=${encodeURIComponent(role)}`;
        console.debug("[CQField] GET", url);
        const r = await fetch(url, { credentials: "include" });
        const j = (await r.json()) as { categorias?: CQCategoria[]; error?: string };
        if (!r.ok) {
          console.error("[CQField] categorias API:", j.error ?? r.status);
          toast.error(j.error ?? "Erro ao carregar categorias");
          return [];
        }
        const list = j.categorias ?? [];
        console.debug("[CQField] categorias API carregadas:", list.length);
        return list;
      }

      for (const catRole of categoryRoleFallbackChain(role)) {
        const { data, error } = await supabase!
          .from("cq_categorias")
          .select("*")
          .eq("company_id", cid)
          .eq("role", catRole)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (error) {
          console.error("[CQField] categorias cliente:", error);
          toast.error("Erro ao carregar categorias");
          return [];
        }
        if ((data ?? []).length > 0) {
          console.debug("[CQField] categorias cliente role=%s n=%s", catRole, (data ?? []).length);
          return data ?? [];
        }
      }

      const { data: anyRole, error: err2 } = await supabase!
        .from("cq_categorias")
        .select("*")
        .eq("company_id", cid)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (err2) {
        console.error("[CQField] categorias fallback cliente:", err2);
        return [];
      }
      console.debug("[CQField] categorias fallback todas as roles:", (anyRole ?? []).length);
      return anyRole ?? [];
    },
    enabled: categoriasFetchEnabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  async function insertRegistro(
    payload: {
      categoria: string;
      descricao: string | null;
      gravidade: CQGravidade;
    },
    opts?: { quick?: boolean }
  ) {
    if (!currentUserId || !currentCompanyId) {
      toast.error("Usuário não identificado");
      return false;
    }

    const metadata = {
      target_type_label: targetType,
      registered_from:
        typeof window !== "undefined" ? window.location.pathname : "",
      ...(opts?.quick ? { quick_register: true } : {}),
    };

    const useRegistroApi =
      hasPcpLocalDevSession() ||
      Boolean(currentUserId && !isUuid(currentUserId));

    if (useRegistroApi) {
      console.debug("[CQField] registo via POST /api/cq/registros", {
        registered_by: currentUserId,
      });
      const r = await fetch("/api/cq/registros", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: currentCompanyId,
          target_type: targetType,
          target_id: targetId,
          registered_by: currentUserId,
          registered_by_role: currentUserRole,
          categoria: payload.categoria.trim(),
          descricao: payload.descricao,
          gravidade: payload.gravidade,
          metadata,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        console.error("[CQField] insert API:", j.error ?? r.status);
        toast.error(
          typeof j.error === "string" && j.error.includes("relation")
            ? "Tabelas CQ ausentes. Execute supabase-cq.sql no Supabase."
            : j.error ?? "Erro ao registrar ocorrência"
        );
        return false;
      }
      toast.success(`Ocorrência: “${payload.categoria.trim()}” registrada.`);
      dispatchCQRefresh(targetType, targetId);
      onRegistered?.();
      return true;
    }

    if (!supabase) {
      toast.error("Supabase não configurado");
      return false;
    }

    const { error } = await supabase.from("cq_registros").insert({
      company_id: currentCompanyId,
      target_type: targetType,
      target_id: targetId,
      registered_by: currentUserId,
      registered_by_role: currentUserRole,
      categoria: payload.categoria.trim(),
      descricao: payload.descricao,
      gravidade: payload.gravidade,
      metadata,
    });

    if (error) {
      console.error("[CQField] insert:", error);
      toast.error(
        error.message.includes("relation")
          ? "Tabelas CQ ausentes. Execute supabase-cq.sql no Supabase."
          : "Erro ao registrar ocorrência"
      );
      return false;
    }
    toast.success(`Ocorrência: “${payload.categoria.trim()}” registrada.`);
    dispatchCQRefresh(targetType, targetId);
    onRegistered?.();
    return true;
  }

  async function handleQuickRegister(categoriaNome: string) {
    setQuickRegistering(categoriaNome);
    const ok = await insertRegistro(
      {
        categoria: categoriaNome,
        descricao: null,
        gravidade: "media",
      },
      { quick: true }
    );
    setQuickRegistering(null);
    if (ok) setMenuOpen(false);
  }

  async function handleOutroSubmit() {
    const t = outroTexto.trim();
    if (t.length < 3) {
      toast.error("Descreva a ocorrência (mínimo 3 caracteres).");
      return;
    }
    setDetailLoading(true);
    const ok = await insertRegistro({
      categoria: "Outro",
      descricao: t,
      gravidade: "media",
    });
    setDetailLoading(false);
    if (ok) {
      setDetailOpen(false);
      setMenuOpen(false);
      setOutroTexto("");
    }
  }

  if (!supabase && !hasPcpLocalDevSession()) {
    console.debug("[CQField] Oculto: sem cliente Supabase e sem cookie pcp-local-auth");
    return null;
  }

  const roleCheck = normalizeUserRole(currentUserRole || userRole);
  if (!roleCheck || !ROLES_CAN_REGISTER.has(roleCheck)) {
    return null;
  }

  const touchClass = comfortableTouch
    ? "min-h-[44px] min-w-[44px] h-10 w-10 p-0 justify-center"
    : "";

  const iconClass = comfortableTouch ? "h-5 w-5" : "h-4 w-4";

  function renderTrigger() {
    switch (variant) {
      case "inline":
        return (
          <button
            type="button"
            title="Registrar ocorrência"
            className="text-slate-600 hover:text-amber-600 inline-flex items-center justify-center rounded-md border border-transparent hover:bg-amber-50/80 p-1"
          >
            <Flag className={iconClass} strokeWidth={2} />
          </button>
        );
      case "button":
      case "icon":
      default:
        return (
          <button
            type="button"
            title="Registrar ocorrência"
            className={
              `inline-flex items-center justify-center rounded-md border border-transparent text-amber-800 hover:bg-amber-50 hover:border-amber-200/80 transition-colors shrink-0 ` +
              touchClass
            }
          >
            <Flag className={iconClass} strokeWidth={2} />
          </button>
        );
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>{renderTrigger()}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-0">
          <DropdownMenuLabel>Categoria</DropdownMenuLabel>
          {categoriasFetchEnabled && categoriasLoading ? (
            <div className="px-3 py-3 text-xs text-slate-500">Carregando…</div>
          ) : categorias.length === 0 ? (
            <div className="px-3 py-2 text-xs text-amber-700">
              Nenhuma categoria para o seu perfil. Configure em{" "}
              <strong>Configurações → CQ Categorias</strong> ou use &quot;Outro&quot;.
            </div>
          ) : (
            categorias.map((cat) => (
              <DropdownMenuItem
                key={cat.id}
                disabled={!!quickRegistering}
                onSelect={() => void handleQuickRegister(cat.categoria)}
                className="rounded-none"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-200/80"
                  style={{ backgroundColor: cat.cor || "#94a3b8" }}
                />
                <span className="min-w-0 flex-1 leading-snug">{cat.categoria}</span>
                {quickRegistering === cat.categoria ? (
                  <span className="text-[10px] text-slate-400">…</span>
                ) : null}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setOutroTexto("");
              setDetailOpen(true);
            }}
            className="rounded-none font-medium text-amber-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            Outro (descrever)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Registrar ocorrência — Outro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label htmlFor="cq-outro-desc" className="text-xs font-medium">
                Descrição *
              </Label>
              <Textarea
                id="cq-outro-desc"
                placeholder="Descreva a ocorrência…"
                value={outroTexto}
                onChange={(e) => setOutroTexto(e.target.value)}
                rows={5}
              />
              <p className="text-[10px] text-slate-500">
                Gravidade padrão: média. Categoria salva como &quot;Outro&quot;.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDetailOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={detailLoading || outroTexto.trim().length < 3}
                onClick={() => void handleOutroSubmit()}
              >
                {detailLoading ? "Registrando..." : "Registrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
