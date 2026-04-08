import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

function canManageUsers(role: string | null | undefined): boolean {
  return (
    role === "manager" ||
    role === "admin" ||
    role === "super_admin"
  );
}

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
    const body = await request.json();
    const { email, password, fullName, role, companyId, lineIds } = body as {
      email?: string;
      password?: string;
      fullName?: string;
      role?: string;
      companyId?: string;
      lineIds?: string[];
    };

    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

    if (hasLocalAuth) {
      const cid = String(companyId ?? "").trim();
      if (!cid || !isUuid(cid)) {
        return NextResponse.json(
          { success: false, error: "companyId inválido" },
          { status: 400 }
        );
      }
      let primary = await resolvePrimaryCompanyId(supabaseAdmin);
      if (!primary) {
        const { data: anyCompany } = await supabaseAdmin
          .from("companies")
          .select("id")
          .limit(1)
          .maybeSingle();
        primary = anyCompany?.id ?? null;
      }
      if (primary && cid !== primary) {
        return NextResponse.json(
          { success: false, error: "Não permitido para esta empresa" },
          { status: 403 }
        );
      }
      if (!primary) {
        const { data: row } = await supabaseAdmin
          .from("companies")
          .select("id")
          .eq("id", cid)
          .maybeSingle();
        if (!row?.id) {
          return NextResponse.json(
            { success: false, error: "Empresa não encontrada" },
            { status: 400 }
          );
        }
      }
    } else {
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

      if (!profile || !canManageUsers(profile.role)) {
        return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
      }

      if (String(companyId ?? "").trim() !== String(profile.company_id ?? "").trim()) {
        return NextResponse.json(
          { success: false, error: "Empresa inválida" },
          { status: 403 }
        );
      }
    }

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

    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

    let callerCompanyId: string | null = null;

    if (hasLocalAuth) {
      callerCompanyId = await resolvePrimaryCompanyId(supabaseAdmin);
      if (!callerCompanyId) {
        const { data: anyCompany } = await supabaseAdmin
          .from("companies")
          .select("id")
          .limit(1)
          .maybeSingle();
        callerCompanyId = anyCompany?.id ?? null;
      }
    } else {
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

      if (!caller || !canManageUsers(caller.role)) {
        return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
      }

      callerCompanyId = caller.company_id as string;
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (
      !targetProfile ||
      !callerCompanyId ||
      targetProfile.company_id !== callerCompanyId
    ) {
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

