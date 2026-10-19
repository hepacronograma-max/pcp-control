import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/is-uuid";

/**
 * POST /api/users/send-reset  { userId }
 * Gestor envia ao usuário um e-mail com link para ele mesmo criar a nova senha
 * (o gestor não precisa saber nem digitar a senha de ninguém).
 */
function canManageUsers(role: string | null | undefined): boolean {
  return role === "manager" || role === "admin" || role === "super_admin";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { userId?: string };
    const userId = String(body.userId ?? "").trim();
    if (!isUuid(userId)) {
      return NextResponse.json(
        { success: false, error: "Usuário inválido" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      );
    }

    const admin = createSupabaseAdminClient();

    const { data: caller } = await admin
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!caller || !canManageUsers(caller.role)) {
      return NextResponse.json(
        { success: false, error: "Sem permissão" },
        { status: 403 }
      );
    }

    const { data: target } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!target || target.company_id !== caller.company_id) {
      return NextResponse.json(
        { success: false, error: "Usuário não encontrado nesta empresa" },
        { status: 403 }
      );
    }

    const { data: authWrap, error: authErr } =
      await admin.auth.admin.getUserById(userId);
    const email = authWrap?.user?.email;
    if (authErr || !email) {
      return NextResponse.json(
        { success: false, error: "Usuário sem e-mail no cadastro de acesso" },
        { status: 404 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const publicClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
    });

    const { error: sendErr } = await publicClient.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${request.nextUrl.origin}/redefinir-senha` }
    );
    if (sendErr) {
      const m = sendErr.message.toLowerCase();
      const rate =
        sendErr.status === 429 ||
        m.includes("rate limit") ||
        m.includes("security purposes");
      return NextResponse.json(
        {
          success: false,
          error: rate
            ? "Um link foi enviado para este usuário há pouco. Aguarde um minuto."
            : sendErr.message,
        },
        { status: rate ? 429 : 500 }
      );
    }

    return NextResponse.json({ success: true, email });
  } catch (err) {
    console.error("[users/send-reset]", err);
    return NextResponse.json(
      { success: false, error: "Erro ao enviar o link" },
      { status: 500 }
    );
  }
}
