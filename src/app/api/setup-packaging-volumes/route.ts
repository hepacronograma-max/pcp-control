import { NextResponse } from "next/server";
import { ensurePackagingVolumesTable } from "@/lib/db/ensure-packaging-volumes";
import { ensurePackagingVolumeItemsTable } from "@/lib/db/ensure-packaging-volume-items";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasPermission, normalizeUserRole } from "@/lib/utils/permissions";

export async function POST() {
  try {
    const hasLocalAuth = await hasServerLocalAuthCookie();
    if (!hasLocalAuth) {
      const authClient = await createServerSupabaseClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { success: false, error: "Não autenticado" },
          { status: 401 }
        );
      }
      try {
        const admin = createSupabaseAdminClient();
        const { data: profile } = await admin
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        const role = normalizeUserRole(profile?.role);
        const can =
          hasPermission(role, "managePackagingBoxes") ||
          hasPermission(role, "completeItems");
        if (!can) {
          return NextResponse.json(
            { success: false, error: "Sem permissão" },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: "Sem permissão" },
          { status: 403 }
        );
      }
    }

    const ok = await ensurePackagingVolumesTable();
    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cole supabase-packaging-volumes.sql no SQL Editor do Supabase (mesmo jeito da tabela de caixas).",
        },
        { status: 400 }
      );
    }
    await ensurePackagingVolumeItemsTable();

    return NextResponse.json({
      success: true,
      msg: "Tabela packaging_volumes criada.",
    });
  } catch (err) {
    console.error("[setup-packaging-volumes]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
