import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local"
    );
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL inválido. Deve ser uma URL HTTP ou HTTPS válida."
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  let supabaseAdmin: SupabaseClient;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (configError) {
    const msg =
      configError instanceof Error
        ? configError.message
        : "Supabase não configurado corretamente";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }

  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "manager") {
      return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
    }

    const { email, password, fullName, role, companyId, lineIds } =
      await request.json();

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role },
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, error: authError?.message ?? "Erro ao criar usuário" },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("profiles")
      .update({ company_id: companyId, role, full_name: fullName })
      .eq("id", authData.user.id);

    if (role === "operator" && Array.isArray(lineIds) && lineIds.length > 0) {
      const associations = lineIds.map((lineId: string) => ({
        user_id: authData.user.id,
        line_id: lineId,
      }));
      await supabaseAdmin.from("operator_lines").insert(associations);
    }

    return NextResponse.json({ success: true, userId: authData.user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

/**
 * Atualiza usuário (perfil, senha opcional, linhas do operador).
 * Body: { userId, fullName, email?, password?, role, lineIds }
 */
export async function PATCH(request: NextRequest) {
  let supabaseAdmin: SupabaseClient;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (configError) {
    const msg =
      configError instanceof Error
        ? configError.message
        : "Supabase não configurado corretamente";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }

  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const { data: caller } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();

    if (!caller || caller.role !== "manager") {
      return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
    }

    const body = await request.json();
    const {
      userId,
      fullName,
      email,
      password,
      role,
      lineIds,
    } = body as {
      userId?: string;
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
      lineIds?: string[];
    };

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, error: "userId obrigatório" },
        { status: 400 }
      );
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (!targetProfile || targetProfile.company_id !== caller.company_id) {
      return NextResponse.json(
        { success: false, error: "Usuário não encontrado nesta empresa" },
        { status: 403 }
      );
    }

    const nameVal = String(fullName ?? "").trim();
    const emailVal = String(email ?? "").trim();
    const roleVal = role === "pcp" || role === "operator" ? role : "operator";

    const authUpdates: { email?: string; password?: string } = {};
    if (emailVal) authUpdates.email = emailVal;
    if (password != null && String(password).length > 0) {
      authUpdates.password = String(password);
    }
    if (Object.keys(authUpdates).length > 0) {
      const { error: authUpdErr } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        authUpdates
      );
      if (authUpdErr) {
        return NextResponse.json(
          { success: false, error: authUpdErr.message },
          { status: 500 }
        );
      }
    }

    const profileUpdate: Record<string, unknown> = {
      full_name: nameVal,
      role: roleVal,
    };
    if (emailVal) profileUpdate.email = emailVal;

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId);

    if (profErr) {
      return NextResponse.json(
        { success: false, error: profErr.message },
        { status: 500 }
      );
    }

    await supabaseAdmin.from("operator_lines").delete().eq("user_id", userId);

    if (roleVal === "operator" && Array.isArray(lineIds) && lineIds.length > 0) {
      const associations = lineIds.map((lineId: string) => ({
        user_id: userId,
        line_id: lineId,
      }));
      const { error: insErr } = await supabaseAdmin.from("operator_lines").insert(associations);
      if (insErr) {
        return NextResponse.json(
          { success: false, error: insErr.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

