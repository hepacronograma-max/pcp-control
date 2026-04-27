"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { defaultAppPathForRole, hasPermission } from "@/lib/utils/permissions";

export default function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  const { profile, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (profile && !hasPermission(profile.role, "viewSettings")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [loading, profile, router]);

  return <>{children}</>;
}
