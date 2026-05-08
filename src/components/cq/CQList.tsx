"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { List, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CQTargetType, CQRegistro } from "@/lib/types/cq";
import { toast } from "sonner";
import { normalizeUserRole } from "@/lib/utils/permissions";
import { isUuid } from "@/lib/utils/is-uuid";

function hasPcpLocalAuth(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.trim().startsWith("pcp-local-auth=1"));
}

interface CQListProps {
  targetType: CQTargetType;
  targetId: string;
  /** Necessário para GET/PATCH `/api/cq/registros` em modo local. */
  companyId?: string;
  /** Para `resolvido_por` quando UUID (opcional em modo local). */
  userId?: string;
  userRole?: string;
  /** Linha de produção: maior área de toque e tooltip */
  comfortableTouch?: boolean;
}

export function CQList({
  targetType,
  targetId,
  companyId,
  userId,
  userRole,
  comfortableTouch = false,
}: CQListProps) {
  const [registros, setRegistros] = useState<CQRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [resolvendo, setResolvendo] = useState<string | null>(null);
  const supabase = createClient();
  const companyUuid = Boolean(companyId && isUuid(companyId));
  const useLocalApi = hasPcpLocalAuth() && companyUuid;

  const loadRegistros = useCallback(async () => {
    if (useLocalApi) {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          companyId: companyId!,
          target_type: targetType,
          target_id: targetId,
        });
        const url = `/api/cq/registros?${params.toString()}`;
        console.debug("[CQList] GET", url);
        const r = await fetch(url, { credentials: "include" });
        const j = (await r.json()) as { registros?: CQRegistro[]; error?: string };
        if (!r.ok) {
          console.error("[CQList] API:", j.error ?? r.status);
          toast.error(
            typeof j.error === "string" && j.error.includes("relation")
              ? "Tabelas CQ ausentes (supabase-cq.sql)."
              : j.error ?? "Erro ao carregar ocorrências"
          );
          setRegistros([]);
        } else {
          setRegistros(j.registros ?? []);
          console.debug("[CQList] registros API:", (j.registros ?? []).length);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!supabase) {
      setRegistros([]);
      setLoading(false);
      if (process.env.NODE_ENV !== "production") {
        console.debug("[CQList] sem cliente Supabase (caminho API não activo)");
      }
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("cq_registros")
      .select("*")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[CQList] cliente:", error);
      toast.error(
        error.message.includes("relation")
          ? "Tabelas CQ ausentes (supabase-cq.sql)."
          : "Erro ao carregar ocorrências"
      );
      setRegistros([]);
    } else {
      console.debug("[CQList] registros Supabase:", (data ?? []).length);
      setRegistros((data ?? []) as CQRegistro[]);
    }
    setLoading(false);
  }, [useLocalApi, companyId, supabase, targetType, targetId]);

  useEffect(() => {
    void loadRegistros();
  }, [loadRegistros]);

  useEffect(() => {
    function onRefresh(ev: Event) {
      const ce = ev as CustomEvent<{
        targetType?: string;
        targetId?: string;
      }>;
      const d = ce.detail;
      if (d?.targetType === targetType && d?.targetId === targetId) {
        void loadRegistros();
      }
    }
    window.addEventListener("pcp-cq-refresh", onRefresh);
    return () => window.removeEventListener("pcp-cq-refresh", onRefresh);
  }, [targetType, targetId, loadRegistros]);

  useEffect(() => {
    if (open) {
      void loadRegistros();
    }
  }, [open, loadRegistros]);

  async function handleResolver(registroId: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Marcar esta ocorrência como resolvida?")
    ) {
      return;
    }

    setResolvendo(registroId);

    if (useLocalApi) {
      const resolvido_por =
        userId && isUuid(userId) ? userId : null;
      const r = await fetch("/api/cq/registros", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          id: registroId,
          resolvido_por,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast.error(j.error ?? "Erro ao marcar como resolvida");
      } else {
        toast.success("Ocorrência marcada como resolvida!");
        void loadRegistros();
      }
      setResolvendo(null);
      return;
    }

    if (!supabase) {
      setResolvendo(null);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("cq_registros")
      .update({
        resolvido_em: new Date().toISOString(),
        resolvido_por: user?.id ?? null,
      })
      .eq("id", registroId);

    if (error) {
      toast.error("Erro ao marcar como resolvida");
    } else {
      toast.success("Ocorrência marcada como resolvida!");
      void loadRegistros();
    }
    setResolvendo(null);
  }

  function getGravidadeColor(gravidade: string) {
    switch (gravidade) {
      case "baixa":
        return "bg-green-100 text-green-700";
      case "media":
        return "bg-yellow-100 text-yellow-700";
      case "alta":
        return "bg-orange-100 text-orange-700";
      case "critica":
        return "bg-red-100 text-red-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  }

  function getGravidadeIcon(gravidade: string) {
    switch (gravidade) {
      case "baixa":
        return <Clock className="h-3 w-3" />;
      case "media":
      case "alta":
      case "critica":
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  }

  const unresolved = registros.filter((r) => !r.resolvido_em).length;
  const roleNorm = normalizeUserRole(userRole);
  const canResolve =
    roleNorm &&
    ["super_admin", "manager", "admin", "pcp"].includes(String(roleNorm));

  if (!supabase && !companyUuid) {
    console.debug("[CQList] Oculto: sem Supabase e sem companyId UUID");
    return null;
  }

  function gravidadeLabel(g: string) {
    const s = String(g ?? "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          title="Ver ocorrências"
          className={
            comfortableTouch
              ? "relative h-10 w-10 min-h-[44px] min-w-[44px] sm:h-11 sm:w-11 shrink-0 p-0 gap-0 touch-manipulation"
              : "relative gap-1"
          }
        >
          <List
            className={comfortableTouch ? "h-5 w-5" : "h-4 w-4"}
          />
          {unresolved > 0 ? (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full min-w-[1rem] h-4 px-0.5 flex items-center justify-center">
              {unresolved > 99 ? "99+" : unresolved}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-[100vw] sm:max-w-[540px] p-0">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2 px-1">
            <List className="h-5 w-5" />
            Ocorrências registradas
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] px-4 pb-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800" />
            </div>
          ) : registros.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              Nenhuma ocorrência registrada para este item
            </div>
          ) : (
            <div className="space-y-3 pr-1 pt-4">
              {registros.map((reg) => (
                <div
                  key={reg.id}
                  className={`p-3 rounded-lg border text-xs ${
                    reg.resolvido_em
                      ? "bg-slate-50 border-slate-200"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-slate-900">
                          {reg.categoria}
                        </span>
                        <Badge className={getGravidadeColor(reg.gravidade)}>
                          <span className="flex items-center gap-1">
                            {getGravidadeIcon(reg.gravidade)}
                            {gravidadeLabel(reg.gravidade)}
                          </span>
                        </Badge>
                        {reg.resolvido_em ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resolvida
                          </Badge>
                        ) : null}
                      </div>

                      {reg.descricao ? (
                        <p className="text-sm text-slate-600 mt-2 mb-2 whitespace-pre-wrap">
                          {reg.descricao}
                        </p>
                      ) : null}

                      <div className="text-[11px] text-slate-500 mt-2">
                        Registrado: {reg.registered_by_role} •{" "}
                        {format(
                          new Date(reg.created_at),
                          "dd/MM/yyyy 'às' HH:mm",
                          { locale: ptBR }
                        )}
                      </div>

                      {reg.resolvido_em ? (
                        <div className="text-[11px] text-green-700 mt-1">
                          Resolvido em:{" "}
                          {format(
                            new Date(reg.resolvido_em),
                            "dd/MM/yyyy 'às' HH:mm",
                            { locale: ptBR }
                          )}
                        </div>
                      ) : null}
                    </div>

                    {!reg.resolvido_em && canResolve ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        title="Marcar como resolvida"
                        onClick={() => void handleResolver(reg.id)}
                        disabled={resolvendo === reg.id}
                        className="text-green-600 hover:text-green-700 shrink-0"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
