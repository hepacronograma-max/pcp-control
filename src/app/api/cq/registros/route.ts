import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { assertTasksCompanyAccess } from "@/lib/tasks-api-guard";
import type { CQGravidade, CQRegistro, CQTargetType } from "@/lib/types/cq";
import { isUuid } from "@/lib/utils/is-uuid";

type Body = {
  company_id?: string;
  target_type?: CQTargetType;
  target_id?: string;
  /** UUID auth; modo local pode ser não-UUID → API gera UUID e guarda este valor em metadata */
  registered_by?: string | null;
  registered_by_role?: string;
  categoria?: string;
  descricao?: string | null;
  gravidade?: CQGravidade;
  metadata?: Record<string, unknown>;
};

const CQ_TARGET_TYPES: CQTargetType[] = ["order", "order_item", "purchase_order"];

function isCQTargetType(v: string | null): v is CQTargetType {
  return v !== null && (CQ_TARGET_TYPES as string[]).includes(v);
}

/** Lista registros CQ por alvo (service role; não depende de RLS/sessão Supabase). */
export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  const targetType = request.nextUrl.searchParams.get("target_type");
  const targetId = request.nextUrl.searchParams.get("target_id")?.trim() ?? "";

  if (!isCQTargetType(targetType)) {
    return NextResponse.json(
      { error: "target_type inválido (order | order_item | purchase_order)" },
      { status: 400 }
    );
  }
  if (!targetId) {
    return NextResponse.json({ error: "target_id obrigatório" }, { status: 400 });
  }

  const gate = await assertTasksCompanyAccess(companyId || null);
  if (!gate.ok) {
    console.warn("[api/cq/registros GET] negado:", gate.status, gate.error);
    return NextResponse.json({ error: gate.error, registros: [] }, { status: gate.status });
  }

  const { data, error } = await gate.admin
    .from("cq_registros")
    .select("*")
    .eq("company_id", companyId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/cq/registros GET]", error.message);
    return NextResponse.json({ error: error.message, registros: [] }, { status: 500 });
  }

  const registros = (data ?? []) as CQRegistro[];
  console.info(
    "[api/cq/registros GET] company=%s %s/%s → %s linhas",
    companyId,
    targetType,
    targetId,
    registros.length
  );
  return NextResponse.json({ registros });
}

type PatchBody = {
  company_id?: string;
  id?: string;
  resolvido_por?: string | null;
};

/** Marcar ocorrência como resolvida (modo local / sem sessão JWT no cliente). */
export async function PATCH(request: NextRequest) {
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const companyId = body.company_id?.trim();
  const id = body.id?.trim();
  if (!companyId || !id) {
    return NextResponse.json({ error: "company_id e id obrigatórios" }, { status: 400 });
  }

  const gate = await assertTasksCompanyAccess(companyId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const rawPor = body.resolvido_por?.trim() ?? "";
  const resolvido_por = isUuid(rawPor) ? rawPor : null;

  const { error } = await gate.admin
    .from("cq_registros")
    .update({
      resolvido_em: new Date().toISOString(),
      resolvido_por,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) {
    console.error("[api/cq/registros PATCH]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Inserção CQ com service role — necessário quando `registered_by` não é UUID (utilizadores locais). */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const companyId = body.company_id?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "company_id obrigatório" }, { status: 400 });
  }

  const gate = await assertTasksCompanyAccess(companyId);
  if (!gate.ok) {
    console.warn("[api/cq/registros] acesso negado:", gate.status, gate.error);
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const target_type = body.target_type;
  const target_id = body.target_id?.trim();
  const categoria = body.categoria?.trim();
  if (
    !target_type ||
    !target_id ||
    !categoria ||
    !body.gravidade ||
    !body.registered_by_role
  ) {
    return NextResponse.json(
      { error: "target_type, target_id, categoria, gravidade e registered_by_role são obrigatórios" },
      { status: 400 }
    );
  }

  const rawBy = body.registered_by?.trim() ?? "";
  const registered_by = isUuid(rawBy) ? rawBy : randomUUID();
  const metadata: Record<string, unknown> = {
    ...(typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {}),
    ...(!isUuid(rawBy) && rawBy ? { registered_by_local_id: rawBy } : {}),
  };

  const { error } = await gate.admin.from("cq_registros").insert({
    company_id: companyId,
    target_type,
    target_id,
    registered_by,
    registered_by_role: body.registered_by_role,
    categoria,
    descricao: body.descricao ?? null,
    gravidade: body.gravidade,
    metadata,
  });

  if (error) {
    console.error("[api/cq/registros] insert:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/cq/registros] ok company=%s target=%s/%s cat=%s", companyId, target_type, target_id, categoria);
  return NextResponse.json({ ok: true });
}
