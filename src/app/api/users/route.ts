import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import type { Profile } from "@/lib/types/database";

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

/** Supabase Auth exige email com domínio válido (ex.: falta de .com / .com.br falha). */
function isValidAuthEmail(email: string): boolean {
  const e = email.trim();
  if (e.length < 5) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) break;
    const found = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target
    );
    if (found) return found.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
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

/**
 * Lista perfis da empresa com e-mail vindo do Auth (tabela `profiles` pode não ter coluna `email`).
 */
export async function GET(request: NextRequest) {
  let supabaseAdmin: SupabaseClient;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (configError) {
    const msg =
      configError instanceof Error
        ? configError.message
        : "Supabase não configurado corretamente";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";
    const companyIdParam = request.nextUrl.searchParams.get("companyId");

    let companyId: string | null = null;

    if (hasLocalAuth) {
      const cid = String(companyIdParam ?? "").trim();
      if (!cid || !isUuid(cid)) {
        return NextResponse.json(
          { error: "companyId obrigatório na URL" },
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
          { error: "Não permitido para esta empresa" },
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
            { error: "Empresa não encontrada" },
            { status: 400 }
          );
        }
      }
      companyId = cid;
    } else {
      const supabase = await createServerSupabaseClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, company_id")
        .eq("id", user.id)
        .single();

      if (!profile || !canManageUsers(profile.role)) {
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
      }

      companyId = profile.company_id as string;
    }

    if (!companyId || !isUuid(companyId)) {
      return NextResponse.json({ error: "Empresa inválida" }, { status: 400 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("company_id", companyId)
      .order("full_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enriched = await Promise.all(
      (rows ?? []).map(async (row: Record<string, unknown>) => {
        const { data: authWrap } = await supabaseAdmin.auth.admin.getUserById(
          String(row.id)
        );
        const authEmail = authWrap?.user?.email ?? "";
        const rowEmail =
          typeof row.email === "string" ? row.email : "";
        const rowActive = row.is_active;
        const is_active =
          typeof rowActive === "boolean" ? rowActive : true;
        return {
          ...row,
          email: rowEmail || authEmail || "",
          is_active,
        } as Profile;
      })
    );

    return NextResponse.json({ profiles: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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

    const emailTrim = String(email ?? "").trim();
    if (!emailTrim || !isValidAuthEmail(emailTrim)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Email inválido. Use um formato completo com domínio (ex.: nome@empresa.com.br).",
        },
        { status: 400 }
      );
    }

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: emailTrim,
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

    const userId = authData.user.id;
    const roleVal =
      role === "pcp" || role === "operator" ? role : "operator";

    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        company_id: companyId,
        role: roleVal,
        full_name: String(fullName ?? "").trim() || emailTrim,
      },
      { onConflict: "id" }
    );

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { success: false, error: profileErr.message },
        { status: 500 }
      );
    }

    await supabaseAdmin.from("operator_lines").delete().eq("user_id", userId);

    if (roleVal === "operator" && Array.isArray(lineIds) && lineIds.length > 0) {
      const associations = lineIds.map((lineId: string) => ({
        user_id: userId,
        line_id: lineId,
      }));
      const { error: olErr } = await supabaseAdmin
        .from("operator_lines")
        .insert(associations);
      if (olErr) {
        return NextResponse.json(
          { success: false, error: olErr.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, userId });
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
 * ou só ativar/desativar: { userId, onlyActive: true, isActive: boolean }
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
      isActive,
      onlyActive,
    } = body as {
      userId?: string;
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
      lineIds?: string[];
      isActive?: boolean;
      onlyActive?: boolean;
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

    if (onlyActive === true && typeof isActive === "boolean") {
      const { error: actErr } = await supabaseAdmin
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", userId);
      if (actErr) {
        const needsSql = /is_active|schema cache/i.test(actErr.message);
        return NextResponse.json(
          {
            success: false,
            error: needsSql
              ? "Falta a coluna is_active em profiles. No Supabase → SQL Editor, execute: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;"
              : actErr.message,
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true });
    }

    const nameVal = String(fullName ?? "").trim();
    const emailVal = String(email ?? "").trim();
    const roleVal = role === "pcp" || role === "operator" ? role : "operator";

    const { data: authUserWrap, error: authGetErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (authGetErr || !authUserWrap?.user) {
      return NextResponse.json(
        { success: false, error: "Usuário não encontrado no Auth" },
        { status: 404 }
      );
    }

    const currentAuthEmail = (authUserWrap.user.email ?? "").trim().toLowerCase();
    const emailNorm = emailVal.toLowerCase();
    const emailChanged =
      emailVal.length > 0 && emailNorm !== currentAuthEmail;

    if (emailChanged && !isValidAuthEmail(emailVal)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Email inválido. Use um formato completo com domínio (ex.: nome@empresa.com.br).",
        },
        { status: 400 }
      );
    }

    const authUpdates: { email?: string; password?: string } = {};
    if (emailChanged) authUpdates.email = emailVal.trim();
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

/**
 * Remove usuário: operator_lines, perfil e conta no Auth.
 * Query: ?userId=<uuid>
 */
export async function DELETE(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    let userId = String(searchParams.get("userId") ?? "").trim();
    const emailParam = String(searchParams.get("email") ?? "").trim();

    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

    if ((!userId || !isUuid(userId)) && emailParam && hasLocalAuth) {
      const foundId = await findAuthUserIdByEmail(supabaseAdmin, emailParam);
      if (!foundId) {
        return NextResponse.json(
          {
            success: false,
            error: "Nenhum usuário com este e-mail no Auth.",
          },
          { status: 404 }
        );
      }
      userId = foundId;
    }

    if (!userId || !isUuid(userId)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Informe userId na URL ou, como administrador local, ?email= para remover alguém que não aparece na lista.",
        },
        { status: 400 }
      );
    }

    let callerCompanyId: string | null = null;
    let callerUserId: string | null = null;

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
        return NextResponse.json(
          { success: false, error: "Não autenticado" },
          { status: 401 }
        );
      }
      callerUserId = user.id;

      const { data: caller } = await supabase
        .from("profiles")
        .select("role, company_id")
        .eq("id", user.id)
        .single();

      if (!caller || !canManageUsers(caller.role)) {
        return NextResponse.json(
          { success: false, error: "Sem permissão" },
          { status: 403 }
        );
      }

      callerCompanyId = caller.company_id as string;
    }

    if (callerUserId && userId === callerUserId) {
      return NextResponse.json(
        {
          success: false,
          error: "Não é possível excluir o próprio usuário.",
        },
        { status: 400 }
      );
    }

    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, role")
      .eq("id", userId)
      .maybeSingle();

    if (targetProfile) {
      if (!callerCompanyId || targetProfile.company_id !== callerCompanyId) {
        return NextResponse.json(
          { success: false, error: "Usuário não encontrado nesta empresa" },
          { status: 403 }
        );
      }
      if (targetProfile.role === "super_admin") {
        return NextResponse.json(
          { success: false, error: "Não é permitido excluir este perfil." },
          { status: 403 }
        );
      }
    } else if (!hasLocalAuth) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este e-mail existe no Auth sem perfil. Exclua em Supabase → Authentication → Users ou use o login administrador local.",
        },
        { status: 404 }
      );
    }

    await supabaseAdmin.from("operator_lines").delete().eq("user_id", userId);

    const { error: delProfileErr } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (delProfileErr) {
      return NextResponse.json(
        { success: false, error: delProfileErr.message },
        { status: 500 }
      );
    }

    const { error: authDelErr } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDelErr) {
      return NextResponse.json(
        { success: false, error: authDelErr.message },
        { status: 500 }
      );
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
