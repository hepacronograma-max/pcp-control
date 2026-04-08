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
  return role === "manager" || role === "admin" || role === "super_admin";
}

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase não configurado. Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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

/**
 * Vincula um usuário que já existe no Auth mas não tem (ou tem perfil incompleto) em `profiles`.
 * Resolve "e-mail já existe" + usuário invisível na lista.
 */
export async function POST(request: NextRequest) {
  let supabaseAdmin: SupabaseClient;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (configError) {
    const msg =
      configError instanceof Error
        ? configError.message
        : "Supabase não configurado corretamente";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { email, fullName, role, companyId } = body as {
      email?: string;
      fullName?: string;
      role?: string;
      companyId?: string;
    };

    const emailTrim = String(email ?? "").trim();
    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Email inválido. Use um formato completo com domínio (ex.: nome@empresa.com.br).",
        },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

    let callerCompanyId: string | null = null;

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
      callerCompanyId = cid;
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
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, company_id")
        .eq("id", user.id)
        .single();
      if (!profile || !canManageUsers(profile.role)) {
        return NextResponse.json(
          { success: false, error: "Sem permissão" },
          { status: 403 }
        );
      }
      callerCompanyId = profile.company_id as string;
    }

    if (!callerCompanyId) {
      return NextResponse.json(
        { success: false, error: "Empresa não encontrada" },
        { status: 400 }
      );
    }

    const authUserId = await findAuthUserIdByEmail(supabaseAdmin, emailTrim);
    if (!authUserId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Nenhum usuário com este e-mail no Auth. Crie um usuário novo ou confira o e-mail.",
        },
        { status: 404 }
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", authUserId)
      .maybeSingle();

    if (
      existing?.company_id &&
      existing.company_id !== callerCompanyId
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este usuário já está vinculado a outra empresa no sistema.",
        },
        { status: 403 }
      );
    }

    const roleVal =
      role === "pcp" || role === "operator" ? role : "operator";
    const nameVal =
      String(fullName ?? "").trim() ||
      emailTrim.split("@")[0] ||
      "Usuário";

    const { error: upErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: authUserId,
        company_id: callerCompanyId,
        role: roleVal,
        full_name: nameVal,
        email: emailTrim,
        is_active: true,
      },
      { onConflict: "id" }
    );

    if (upErr) {
      return NextResponse.json(
        { success: false, error: upErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, userId: authUserId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
