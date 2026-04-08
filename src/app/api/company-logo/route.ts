import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

async function assertCanEditCompany(
  companyId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const cookieStore = await cookies();
  if (cookieStore.get("pcp-local-auth")?.value === "1") {
    return { ok: true };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Não autenticado" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { ok: false, status: 403, error: "Perfil não encontrado" };
  }

  const role = profile.role;
  const isManagerLike =
    role === "manager" ||
    role === "admin" ||
    role === "super_admin";

  if (!isManagerLike) {
    return { ok: false, status: 403, error: "Sem permissão" };
  }

  if (
    role !== "super_admin" &&
    role !== "admin" &&
    profile.company_id !== companyId
  ) {
    return { ok: false, status: 403, error: "Sem permissão nesta empresa" };
  }

  return { ok: true };
}

const MAX_SIZE = 2 * 1024 * 1024;

/** multipart: companyId (opcional), file */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    let companyId = String(formData.get("companyId") ?? "").trim();

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Nenhum arquivo enviado." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "Arquivo maior que 2MB." },
        { status: 400 }
      );
    }

    const type = file.type;
    if (!["image/png", "image/jpeg", "image/jpg"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Use PNG ou JPG." },
        { status: 400 }
      );
    }

    if (!companyId || !isUuid(companyId)) {
      const admin = createSupabaseAdminClient();
      companyId = (await resolvePrimaryCompanyId(admin)) ?? "";
    }

    if (!companyId || !isUuid(companyId)) {
      return NextResponse.json(
        { success: false, error: "Empresa não encontrada" },
        { status: 400 }
      );
    }

    const gate = await assertCanEditCompany(companyId);
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error },
        { status: gate.status }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    const safeExt = ext === "jpg" || ext === "jpeg" ? "jpg" : "png";
    const filePath = `${companyId}/logo.${safeExt}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = createSupabaseAdminClient();

    const { error: uploadError } = await supabase.storage
      .from("company-logos")
      .upload(filePath, buffer, {
        contentType: type || "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("[company-logo] upload:", uploadError.message);
      const raw = uploadError.message ?? "";
      const friendly = /bucket not found/i.test(raw)
        ? 'Bucket "company-logos" não existe no Storage. No Supabase: Storage → criar bucket público "company-logos", ou rode o script supabase-storage-company-logos.sql no SQL Editor.'
        : raw;
      return NextResponse.json(
        { success: false, error: friendly },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("company-logos").getPublicUrl(filePath);

    const { error: updErr } = await supabase
      .from("companies")
      .update({ logo_url: publicUrl })
      .eq("id", companyId);

    if (updErr) {
      return NextResponse.json(
        { success: false, error: updErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, logo_url: publicUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
