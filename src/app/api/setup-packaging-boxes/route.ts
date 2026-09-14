import { NextResponse } from "next/server";
import { ensurePackagingBoxesTable } from "@/lib/db/ensure-packaging-boxes";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasPermission, normalizeUserRole } from "@/lib/utils/permissions";

/**
 * Cria a tabela packaging_boxes.
 * Usa SUPABASE_ACCESS_TOKEN (Management API) ou DATABASE_URL.
 */
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
        if (!hasPermission(normalizeUserRole(profile?.role), "managePackagingBoxes")) {
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

    const ok = await ensurePackagingBoxesTable();
    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Configure SUPABASE_ACCESS_TOKEN ou DATABASE_URL no .env, ou cole supabase-packaging-boxes.sql no SQL Editor do Supabase.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      msg: "Tabela packaging_boxes criada.",
    });
  } catch (err) {
    console.error("[setup-packaging-boxes]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
