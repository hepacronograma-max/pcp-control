"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import {
  defaultAppPathForRole,
  hasPermission,
} from "@/lib/utils/permissions";
import { CQCategoriasAdmin } from "@/components/configuracoes/cq-categorias-admin";

export default function CQCategoriasPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const { companyId: effectiveCompanyId, loaded: effectiveLoaded } =
    useEffectiveCompanyId(profile);

  const ok =
    profile && hasPermission(profile.role, "manageCQCategorias");

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile.role, "manageCQCategorias")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [loading, profile, router]);

  if (loading || !profile) {
    return (
      <div className="flex justify-center py-12 text-sm text-slate-500">
        Carregando…
      </div>
    );
  }

  if (!ok) return null;

  if (!effectiveLoaded) {
    return (
      <div className="text-sm text-slate-500 py-8 text-center">
        Carregando empresa…
      </div>
    );
  }

  if (!effectiveCompanyId || effectiveCompanyId === "local-company") {
    return (
      <div className="text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        Empresa indefinida. Defina empresa em Configurações → Empresa.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">CQ — Categorias</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestão das categorias de ocorrências por perfil (operador, PCP, compras, etc.).
        </p>
      </div>
      <CQCategoriasAdmin companyId={effectiveCompanyId} />
    </div>
  );
}
