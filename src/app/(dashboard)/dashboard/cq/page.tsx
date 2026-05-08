"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import {
  defaultAppPathForRole,
  hasPermission,
} from "@/lib/utils/permissions";
import { CQDashboard } from "@/components/cq/CQDashboard";

export default function CQDashboardPage() {
  const { profile, loading } = useUser();
  const { companyId: effectiveCompanyId, loaded: effectiveLoaded } =
    useEffectiveCompanyId(profile);
  const router = useRouter();

  const allowed =
    profile && hasPermission(profile.role, "viewCQDashboard");

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile.role, "viewCQDashboard")) {
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

  if (!allowed) {
    return null;
  }

  if (!effectiveLoaded) {
    return (
      <div className="text-sm text-slate-500 py-8 text-center">
        Carregando empresa…
      </div>
    );
  }

  if (!effectiveCompanyId) {
    return (
      <div className="text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        Nenhuma empresa associada. Configure em{" "}
        <strong>Configurações → Empresa</strong> ou o perfil do utilizador no
        Supabase.
      </div>
    );
  }

  return <CQDashboard companyId={effectiveCompanyId} />;
}
