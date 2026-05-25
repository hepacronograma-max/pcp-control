import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { hasPermission } from "@/lib/utils/permissions";
import { toDateOnly } from "@/lib/utils/supabase-data";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

function canRoleViewComercial(role: string | null | undefined): boolean {
  return (
    role === "super_admin" ||
    role === "manager" ||
    role === "admin" ||
    role === "comercial"
  );
}

function canRoleEditComercialObservation(role: string | null | undefined): boolean {
  return (
    role === "super_admin" ||
    role === "manager" ||
    role === "admin" ||
    role === "comercial"
  );
}

function canRoleEditComercialDelivery(role: string | null | undefined): boolean {
  return hasPermission(role, "editComercialDeliveryDeadline");
}

function canRolePcpReplyToComercialObservation(
  role: string | null | undefined
): boolean {
  const r = String(role ?? "").trim();
  return (
    r === "super_admin" ||
    r === "manager" ||
    r === "admin" ||
    r === "pcp"
  );
}

async function resolveActorDisplayName(isLocalAuth: boolean): Promise<string> {
  if (isLocalAuth) return "Administrador local";
  const supabaseAuth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user?.id) throw new Error("Sessão inválida.");
  const { data: profile } = await supabaseAuth
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const name = String(profile?.full_name ?? "").trim();
  if (name) return name.slice(0, 120);
  const mail = String(profile?.email ?? user.email ?? "").trim();
  if (mail) return mail.slice(0, 120);
  return `Usuário ${user.id.slice(0, 8)}`;
}

function parseOptionalString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Lista pedidos de venda com prazos para a área Comercial.
 * Inclui itens mínimos (para o mesmo “status” visual da lista de Pedidos) quando o schema permitir.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const param = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";
    const isLocalAuth = await hasServerLocalAuthCookie();

    let companyId: string | null = null;
    let profileRole: string | null = null;

    if (!isLocalAuth) {
      const supabaseAuth = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "not authenticated" }, { status: 401 });
      }

      const { data: profile } = await supabaseAuth
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .single();
      profileRole = profile?.role ?? null;

      if (!canRoleViewComercial(profileRole)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      if (param && isUuid(param)) {
        const { data: row } = await supabase
          .from("companies")
          .select("id")
          .eq("id", param)
          .maybeSingle();
        if (row?.id) {
          if (profile?.role !== "super_admin" && param !== profile?.company_id) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
          }
          companyId = row.id;
        }
      }

      if (!companyId) {
        if (profile?.company_id) {
          companyId = profile.company_id;
        } else if (profile?.role === "super_admin") {
          companyId = await resolvePrimaryCompanyId(supabase);
        } else {
          return NextResponse.json({ error: "no company" }, { status: 403 });
        }
      }
    } else {
      /** Login local (cookie): sem perfil Supabase — mesmo padrão que `company-data`. */
      if (param && isUuid(param)) {
        const { data: row } = await supabase
          .from("companies")
          .select("id")
          .eq("id", param)
          .maybeSingle();
        if (row?.id) companyId = row.id;
      }
      if (!companyId) {
        companyId = await resolvePrimaryCompanyId(supabase);
      }
      if (!companyId) {
        const { data: anyCompany } = await supabase
          .from("companies")
          .select("id")
          .limit(1)
          .maybeSingle();
        companyId = anyCompany?.id ?? null;
      }
    }

    if (!companyId) {
      return NextResponse.json({ orders: [] });
    }

    type ItemLite = {
      id: string;
      line_id: string | null;
      status: string;
      production_start: string | null;
      production_end: string | null;
      description: string | null;
    };

    type ComercialRow = {
      id: string;
      order_number: string;
      client_name: string | null;
      created_at: string;
      delivery_deadline: string | null;
      pcp_deadline: string | null;
      production_deadline: string | null;
      status: string;
      updated_at: string | null;
      comercial_pcp_observation: string | null;
      comercial_pcp_observation_by: string | null;
      comercial_pcp_observation_at: string | null;
      pcp_reply_comercial_observation: string | null;
      pcp_reply_comercial_observation_by: string | null;
      pcp_reply_comercial_observation_at: string | null;
      items: ItemLite[];
    };

    /** Não incluir `updated_at` aqui: vários projetos antigos não têm a coluna em `orders` (erro PostgREST). */
    const OBS_COL = "comercial_pcp_observation";
    const OBS_THREAD_COLS =
      "comercial_pcp_observation_by, comercial_pcp_observation_at, pcp_reply_comercial_observation, pcp_reply_comercial_observation_by, pcp_reply_comercial_observation_at";

    const selectWithObsThread = `
      id, order_number, client_name, created_at, delivery_deadline, pcp_deadline, production_deadline, status, ${OBS_COL}, ${OBS_THREAD_COLS},
      items:order_items(id, line_id, status, production_start, production_end, description)
    `;

    const selectWithObsOnly = `
      id, order_number, client_name, created_at, delivery_deadline, pcp_deadline, production_deadline, status, ${OBS_COL},
      items:order_items(id, line_id, status, production_start, production_end, description)
    `;

    const selectWithoutObs = `
      id, order_number, client_name, created_at, delivery_deadline, pcp_deadline, production_deadline, status,
      items:order_items(id, line_id, status, production_start, production_end, description)
    `;

    const r1 = await supabase
      .from("orders")
      .select(selectWithObsThread)
      .eq("company_id", companyId)
      .order("delivery_deadline", { ascending: true, nullsFirst: false });

    /** Reatribuições com selects distintos — evita incompatibilidade de genérico PostgREST. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res: any = r1;
    if (
      res.error?.message &&
      /comercial_pcp_observation_by|pcp_reply_comercial_observation|comercial_pcp_observation|column|schema cache|does not exist|PGRST204/i.test(
        res.error.message
      )
    ) {
      res = await supabase
        .from("orders")
        .select(selectWithObsOnly)
        .eq("company_id", companyId)
        .order("delivery_deadline", { ascending: true, nullsFirst: false });
    }
    if (
      res.error?.message &&
      /comercial_pcp_observation|column|schema cache|does not exist|PGRST204/i.test(res.error.message)
    ) {
      res = await supabase
        .from("orders")
        .select(selectWithoutObs)
        .eq("company_id", companyId)
        .order("delivery_deadline", { ascending: true, nullsFirst: false });
    }
    if (res.error?.message &&
      /delivery_deadline|pcp_deadline|column|schema cache|does not exist/i.test(res.error.message)
    ) {
      res = await supabase
        .from("orders")
        .select(`
          id, order_number, client_name, created_at, status, production_deadline,
          items:order_items(id, line_id, status, production_start, production_end, description)
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
    }

    if (res.error) {
      res = await supabase
        .from("orders")
        .select(
          "id, order_number, client_name, created_at, delivery_deadline, pcp_deadline, production_deadline, status"
        )
        .eq("company_id", companyId)
        .order("delivery_deadline", { ascending: true, nullsFirst: false });
    }

    if (res.error?.message &&
      /delivery_deadline|pcp_deadline|column|schema cache|does not exist/i.test(res.error.message)
    ) {
      res = await supabase
        .from("orders")
        .select("id, order_number, client_name, created_at, status, production_deadline")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
    }

    if (res.error) {
      console.error("[comercial-orders]", res.error.message);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    const raw = (res.data ?? []) as (Partial<ComercialRow> & { items?: ItemLite[] | null })[];
    const orders: ComercialRow[] = raw.map((o) => {
      const row = o as Record<string, unknown>;
      return {
        id: o.id as string,
        order_number: o.order_number as string,
        client_name: o.client_name ?? null,
        created_at: o.created_at as string,
        delivery_deadline: o.delivery_deadline ?? null,
        pcp_deadline: o.pcp_deadline ?? null,
        production_deadline: o.production_deadline ?? null,
        status: o.status as string,
        updated_at: (o.updated_at as string | null | undefined) ?? (o.created_at as string) ?? null,
        comercial_pcp_observation: parseOptionalString(row.comercial_pcp_observation),
        comercial_pcp_observation_by: parseOptionalString(row.comercial_pcp_observation_by),
        comercial_pcp_observation_at: parseOptionalString(row.comercial_pcp_observation_at),
        pcp_reply_comercial_observation: parseOptionalString(
          row.pcp_reply_comercial_observation
        ),
        pcp_reply_comercial_observation_by: parseOptionalString(
          row.pcp_reply_comercial_observation_by
        ),
        pcp_reply_comercial_observation_at: parseOptionalString(
          row.pcp_reply_comercial_observation_at
        ),
        items: Array.isArray(o.items) ? o.items : [],
      };
    });

    return NextResponse.json({ orders });
  } catch (e) {
    console.error("[comercial-orders]", e);
    return NextResponse.json({ orders: [] }, { status: 200 });
  }
}

function formatComercialOrdersPatchError(message: string): string {
  if (
    /comercial_pcp_observation_by|pcp_reply_comercial_observation/i.test(message)
  ) {
    return (
      "Faltam colunas no Supabase (não apaga dados). No SQL Editor execute o script `supabase-comercial-pcp-thread.sql` do projeto — ou o `supabase-comercial-pcp-observation.sql` completo."
    );
  }
  if (/comercial_pcp_observation/i.test(message)) {
    return (
      "Falta a coluna da observação. No SQL Editor: ALTER TABLE orders ADD COLUMN IF NOT EXISTS comercial_pcp_observation text;"
    );
  }
  return message;
}

/**
 * Atualiza observação Comercial → PCP ou resposta do PCP (um tipo de alteração por pedido).
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const body = await request.json();
    const orderId = String(body.orderId ?? "").trim();

    const hasComercialKey = Object.prototype.hasOwnProperty.call(
      body,
      "comercial_pcp_observation"
    );
    const hasPcpReplyKey = Object.prototype.hasOwnProperty.call(
      body,
      "pcp_reply_comercial_observation"
    );
    const hasDeliveryKey = Object.prototype.hasOwnProperty.call(
      body,
      "delivery_deadline"
    );

    if (!isUuid(orderId)) {
      return NextResponse.json(
        { success: false, error: "orderId inválido" },
        { status: 400 }
      );
    }

    const patchKinds = [hasComercialKey, hasPcpReplyKey, hasDeliveryKey].filter(
      Boolean
    ).length;
    if (patchKinds !== 1) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Envie só uma alteração por vez: prazo de vendas, observação do Comercial ou resposta do PCP.",
        },
        { status: 400 }
      );
    }

    const { data: orderRow, error: ordErr } = await supabaseAdmin
      .from("orders")
      .select("company_id")
      .eq("id", orderId)
      .maybeSingle();

    if (ordErr || !orderRow?.company_id) {
      return NextResponse.json(
        { success: false, error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    const orderCompanyId = orderRow.company_id as string;
    const isLocalAuth = await hasServerLocalAuthCookie();

    if (isLocalAuth) {
      let primary = await resolvePrimaryCompanyId(supabaseAdmin);
      if (!primary) {
        const { data: anyCompany } = await supabaseAdmin
          .from("companies")
          .select("id")
          .limit(1)
          .maybeSingle();
        primary = anyCompany?.id ?? null;
      }
      if (primary && orderCompanyId !== primary) {
        return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
      }
    }

    const nowIso = new Date().toISOString();

    if (hasDeliveryKey) {
      if (!isLocalAuth) {
        const supabaseAuth = await createServerSupabaseClient();
        const {
          data: { user },
        } = await supabaseAuth.auth.getUser();
        if (!user) {
          return NextResponse.json(
            { success: false, error: "Não autenticado" },
            { status: 401 }
          );
        }
        const { data: profile } = await supabaseAuth
          .from("profiles")
          .select("company_id, role")
          .eq("id", user.id)
          .single();

        if (!profile || !canRoleEditComercialDelivery(profile.role)) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Somente Comercial pode alterar o prazo de entrega (vendas).",
            },
            { status: 403 }
          );
        }
        const cid = profile.company_id as string | null;
        if (profile.role !== "super_admin" && cid !== orderCompanyId) {
          return NextResponse.json(
            { success: false, error: "Pedido de outra empresa" },
            { status: 403 }
          );
        }
      }

      const delivery = toDateOnly(body.delivery_deadline);
      const payload: Record<string, unknown> = {
        delivery_deadline: delivery,
        updated_at: nowIso,
      };

      let { error: updErr } = await supabaseAdmin
        .from("orders")
        .update(payload)
        .eq("id", orderId);

      if (
        updErr &&
        /updated_at|schema cache|column|does not exist/i.test(updErr.message)
      ) {
        delete payload.updated_at;
        ({ error: updErr } = await supabaseAdmin
          .from("orders")
          .update(payload)
          .eq("id", orderId));
      }

      if (updErr) {
        return NextResponse.json(
          { success: false, error: updErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        delivery_deadline: delivery,
      });
    }

    if (hasComercialKey) {
      const rawObs = body.comercial_pcp_observation;
      const observation =
        rawObs === null || rawObs === undefined
          ? null
          : String(rawObs).trim().slice(0, 2000) || null;

      if (!isLocalAuth) {
        const supabaseAuth = await createServerSupabaseClient();
        const {
          data: { user },
        } = await supabaseAuth.auth.getUser();
        if (!user) {
          return NextResponse.json(
            { success: false, error: "Não autenticado" },
            { status: 401 }
          );
        }
        const { data: profile } = await supabaseAuth
          .from("profiles")
          .select("company_id, role")
          .eq("id", user.id)
          .single();

        if (!profile || !canRoleEditComercialObservation(profile.role)) {
          return NextResponse.json({ success: false, error: "Sem permissão" }, { status: 403 });
        }
        const cid = profile.company_id as string | null;
        if (
          profile.role !== "super_admin" &&
          cid !== orderCompanyId
        ) {
          return NextResponse.json(
            { success: false, error: "Pedido de outra empresa" },
            { status: 403 }
          );
        }
      }

      let actorLabel: string;
      try {
        actorLabel = await resolveActorDisplayName(isLocalAuth);
      } catch {
        actorLabel = "Usuário";
      }

      const payload: Record<string, unknown> = {
        comercial_pcp_observation: observation,
        comercial_pcp_observation_by: observation ? actorLabel : null,
        comercial_pcp_observation_at: observation ? nowIso : null,
        updated_at: nowIso,
      };

      let { error: updErr } = await supabaseAdmin
        .from("orders")
        .update(payload)
        .eq("id", orderId);

      if (
        updErr &&
        /updated_at|schema cache|column|does not exist/i.test(updErr.message)
      ) {
        delete payload.updated_at;
        ({ error: updErr } = await supabaseAdmin
          .from("orders")
          .update(payload)
          .eq("id", orderId));
      }

      if (updErr) {
        return NextResponse.json(
          {
            success: false,
            error: formatComercialOrdersPatchError(updErr.message),
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        comercial_pcp_observation: observation,
        comercial_pcp_observation_by: observation ? actorLabel : null,
        comercial_pcp_observation_at: observation ? nowIso : null,
      });
    }

    const rawReply = body.pcp_reply_comercial_observation;
    const reply =
      rawReply === null || rawReply === undefined
        ? null
        : String(rawReply).trim().slice(0, 2000) || null;

    if (!isLocalAuth) {
      const supabaseAuth = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { success: false, error: "Não autenticado" },
          { status: 401 }
        );
      }
      const { data: profile } = await supabaseAuth
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .single();

      if (!profile || !canRolePcpReplyToComercialObservation(profile.role)) {
        return NextResponse.json(
          { success: false, error: "Sem permissão para responder como PCP." },
          { status: 403 }
        );
      }
      const cid = profile.company_id as string | null;
      if (
        profile.role !== "super_admin" &&
        cid !== orderCompanyId
      ) {
        return NextResponse.json(
          { success: false, error: "Pedido de outra empresa" },
          { status: 403 }
        );
      }
    }

    let actorLabel: string;
    try {
      actorLabel = await resolveActorDisplayName(isLocalAuth);
    } catch {
      actorLabel = "PCP";
    }

    const payload: Record<string, unknown> = {
      pcp_reply_comercial_observation: reply,
      pcp_reply_comercial_observation_by: reply ? actorLabel : null,
      pcp_reply_comercial_observation_at: reply ? nowIso : null,
      updated_at: nowIso,
    };

    let { error: updErr } = await supabaseAdmin
      .from("orders")
      .update(payload)
      .eq("id", orderId);

    if (
      updErr &&
      /updated_at|schema cache|column|does not exist/i.test(updErr.message)
    ) {
      delete payload.updated_at;
      ({ error: updErr } = await supabaseAdmin
        .from("orders")
        .update(payload)
        .eq("id", orderId));
    }

    if (updErr) {
      return NextResponse.json(
        {
          success: false,
          error: formatComercialOrdersPatchError(updErr.message),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      pcp_reply_comercial_observation: reply,
      pcp_reply_comercial_observation_by: reply ? actorLabel : null,
      pcp_reply_comercial_observation_at: reply ? nowIso : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
