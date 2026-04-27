import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { toDateOnly } from "@/lib/utils/supabase-data";
import {
  parsePcLineFallbackFromNotes,
  stripLineFallbackForDisplay,
} from "@/lib/compras/pc-lines-fallback";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

function canManagePurchases(role: string | null | undefined): boolean {
  return (
    role === "super_admin" ||
    role === "manager" ||
    role === "compras"
  );
}

/** PCP e gestão podem listar; só gestão+Compras alteram. */
function canViewPurchases(role: string | null | undefined): boolean {
  return (
    canManagePurchases(role) ||
    role === "pcp"
  );
}

async function resolveCompanyId(
  supabase: SupabaseClient,
  request: NextRequest,
  isLocalAuth: boolean,
  purchaseAccess: "read" | "write" = "write"
): Promise<{
  companyId: string | null;
  error: NextResponse | null;
}> {
  const param = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  const cookieStore = await cookies();
  if (!isLocalAuth) {
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return { companyId: null, error: NextResponse.json({ error: "not authenticated" }, { status: 401 }) };
    }
    const { data: profile } = await supabaseAuth
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .single();

    const canAccess =
      purchaseAccess === "read"
        ? canViewPurchases(profile?.role)
        : canManagePurchases(profile?.role);
    if (!canAccess) {
      return { companyId: null, error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
    }

    let companyId: string | null = null;
    if (param && isUuid(param)) {
      const { data: row } = await supabase
        .from("companies")
        .select("id")
        .eq("id", param)
        .maybeSingle();
      if (row?.id) {
        if (profile?.role !== "super_admin" && param !== profile?.company_id) {
          return { companyId: null, error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
        }
        companyId = row.id;
      }
    }
    if (!companyId) {
      if (profile?.company_id) companyId = profile.company_id;
      else if (profile?.role === "super_admin") {
        companyId = await resolvePrimaryCompanyId(supabase);
      } else {
        return { companyId: null, error: NextResponse.json({ error: "no company" }, { status: 403 }) };
      }
    }
    return { companyId, error: null };
  }

  let companyId: string | null = null;
  if (param && isUuid(param)) {
    const { data: row } = await supabase
      .from("companies")
      .select("id")
      .eq("id", param)
      .maybeSingle();
    if (row?.id) companyId = row.id;
  }
  if (!companyId) companyId = await resolvePrimaryCompanyId(supabase);
  if (!companyId) {
    const { data: anyCompany } = await supabase
      .from("companies")
      .select("id")
      .limit(1)
      .maybeSingle();
    companyId = anyCompany?.id ?? null;
  }
  return { companyId, error: null };
}

/**
 * GET: lista pedidos de compra + vínculos.
 * companyId via query (igual /api/company-data).
 */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const cookieStore = await cookies();
  const isLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

  const { companyId, error } = await resolveCompanyId(
    supabase,
    request,
    isLocalAuth,
    "read"
  );
  if (error) return error;
  if (!companyId) {
    return NextResponse.json({ purchaseOrders: [], unlinkedItemSamples: [] });
  }

  const { data: pos, error: pe } = await supabase
    .from("purchase_orders")
    .select(
      "id, company_id, number, supplier_name, expected_delivery, follow_up_date, compras_observation, status, notes, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .order("expected_delivery", { ascending: true, nullsFirst: false });

  if (pe) {
    if (
      /follow_up_date|compras_observation/i.test(pe.message) &&
      /column|does not exist/i.test(pe.message)
    ) {
      return NextResponse.json({
        purchaseOrders: [],
        schemaMissing: true,
        error:
          "Execute supabase-purchase-orders-compras-fields.sql no Supabase (prazo follow-up e observação).",
      });
    }
    if (/relation|does not exist|schema cache/i.test(pe.message)) {
      return NextResponse.json({
        purchaseOrders: [],
        schemaMissing: true,
        error: "Execute supabase-purchase-orders.sql no Supabase para habilitar a aba Compras.",
      });
    }
    return NextResponse.json({ error: pe.message }, { status: 500 });
  }

  const poIds = (pos ?? []).map((p) => p.id);
  const linksByPo: Record<
    string,
    {
      id: string;
      order_item_id: string;
      order_id: string;
      description: string | null;
      order_number: string;
      sales_deadline: string | null;
      purchase_order_line_id: string | null;
    }[]
  > = {};

  if (poIds.length > 0) {
    const { data: linkRows } = await supabase
      .from("purchase_order_item_links")
      .select("id, purchase_order_id, order_item_id, purchase_order_line_id")
      .in("purchase_order_id", poIds);

    const itemIds = [...new Set((linkRows ?? []).map((l) => l.order_item_id))];
    const itemById = new Map<
      string,
      {
        id: string;
        order_id: string;
        description: string | null;
        order_number: string;
        sales_deadline: string | null;
      }
    >();
    if (itemIds.length > 0) {
      const { data: oiRows } = await supabase
        .from("order_items")
        .select("id, order_id, description, orders!inner(order_number, delivery_deadline)")
        .in("id", itemIds);
      for (const oi of oiRows ?? []) {
        const or = oi.orders as
          | { order_number: string; delivery_deadline: string | null }
          | { order_number: string; delivery_deadline: string | null }[]
          | null;
        const o0 = Array.isArray(or) ? or[0] : or;
        const onum = o0?.order_number ?? "";
        const sd = o0?.delivery_deadline
          ? String(o0.delivery_deadline).slice(0, 10)
          : null;
        itemById.set(oi.id, {
          id: oi.id,
          order_id: oi.order_id,
          description: oi.description,
          order_number: onum,
          sales_deadline: sd,
        });
      }
    }
    for (const row of linkRows ?? []) {
      const poid = row.purchase_order_id;
      const info = itemById.get(row.order_item_id);
      if (!info) continue;
      if (!linksByPo[poid]) linksByPo[poid] = [];
      const lineId = (row as { purchase_order_line_id?: string | null }).purchase_order_line_id;
      linksByPo[poid].push({
        id: row.id,
        order_item_id: row.order_item_id,
        order_id: info.order_id,
        description: info.description,
        order_number: info.order_number,
        sales_deadline: info.sales_deadline,
        purchase_order_line_id: lineId ?? null,
      });
    }
  }

  const linesByPo: Record<
    string,
    {
      id: string;
      line_number: number;
      product_code: string | null;
      description: string | null;
      ncm: string | null;
      quantity: number | null;
      unit: string | null;
      supplier_code: string | null;
      is_fallback?: boolean;
    }[]
  > = {};
  if (poIds.length > 0) {
    const { data: polRows, error: polE } = await supabase
      .from("purchase_order_lines")
      .select("id, purchase_order_id, line_number, product_code, description, ncm, quantity, unit, supplier_code, sort_order")
      .in("purchase_order_id", poIds)
      .order("sort_order", { ascending: true });
    if (!polE && polRows) {
      for (const r of polRows) {
        const pid = r.purchase_order_id;
        if (!linesByPo[pid]) linesByPo[pid] = [];
        linesByPo[pid].push({
          id: r.id,
          line_number: r.line_number,
          product_code: r.product_code,
          description: r.description,
          ncm: r.ncm,
          quantity: r.quantity !== null && r.quantity !== undefined ? Number(r.quantity) : null,
          unit: r.unit,
          supplier_code: r.supplier_code,
        });
      }
    }
  }

  const { data: allPoIdRows } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("company_id", companyId);
  const allPoIdList = (allPoIdRows ?? []).map((r) => r.id);
  const linkedItemIds = new Set<string>();
  if (allPoIdList.length > 0) {
    const { data: allLinkRows } = await supabase
      .from("purchase_order_item_links")
      .select("order_item_id")
      .in("purchase_order_id", allPoIdList);
    for (const l of allLinkRows ?? []) {
      linkedItemIds.add(l.order_item_id);
    }
  }

  /** Só itens cujo pedido de venda ainda não está finalizado (vínculo não faz sentido em PV encerrado). */
  const { data: itemsSample } = await supabase
    .from("order_items")
    .select(
      "id, order_id, description, pc_number, pc_delivery_date, orders!inner(company_id, order_number, status)"
    )
    .eq("orders.company_id", companyId)
    .neq("orders.status", "finished")
    .not("id", "is", null)
    .limit(200);

  return NextResponse.json({
    purchaseOrders: (pos ?? []).map((p) => {
      const fullNotes = p.notes;
      const links = linksByPo[p.id] ?? [];
      let lineRows = linesByPo[p.id] ?? [];
      if (lineRows.length === 0) {
        const fb = parsePcLineFallbackFromNotes(fullNotes);
        if (fb.length > 0) {
          lineRows = fb.map((l) => ({
            id: l.id,
            line_number: l.line_number,
            product_code: l.product_code,
            description: l.description,
            ncm: l.ncm,
            quantity: l.quantity,
            unit: l.unit,
            supplier_code: l.supplier_code,
            is_fallback: true,
          }));
        }
      }
      const polLines = lineRows.map((ln) => {
        const lk = links.find(
          (x) => x.purchase_order_line_id && x.purchase_order_line_id === ln.id
        );
        return {
          ...ln,
          venda: lk
            ? {
                link_id: lk.id,
                order_item_id: lk.order_item_id,
                order_number: lk.order_number,
                item_description: lk.description,
                sales_deadline: lk.sales_deadline,
              }
            : null,
        };
      });
      return {
        ...p,
        notes: stripLineFallbackForDisplay(fullNotes),
        lines: polLines,
        links,
      };
    }),
    orderItemsForLink: (itemsSample ?? [])
      .filter((r) => {
        const or = r.orders as
          | { order_number: string; status?: string }
          | { order_number: string; status?: string }[]
          | null;
        const o0 = Array.isArray(or) ? or[0] : or;
        if ((o0?.status ?? "") === "finished") return false;
        return !linkedItemIds.has(r.id);
      })
      .map((r) => {
        const or = r.orders as
          | { order_number: string }
          | { order_number: string }[]
          | null;
        const onum = Array.isArray(or) ? or[0]?.order_number : or?.order_number;
        return {
          id: r.id,
          order_id: r.order_id,
          description: r.description,
          pc_number: r.pc_number,
          pc_delivery_date: r.pc_delivery_date,
          order_number: onum ?? "",
        };
      }),
  });
}

type CreateBody = {
  action?: "create";
  number: string;
  supplier_name?: string | null;
  expected_delivery?: string | null;
  notes?: string | null;
};

type LinkBody = {
  action: "link" | "unlink";
  purchase_order_id: string;
  order_item_id: string;
  /** Linha do PC (tabela `purchase_order_lines`); vincular item de venda a esta linha. */
  purchase_order_line_id?: string | null;
};

type UpdatePoBody = {
  action: "update_po";
  purchase_order_id: string;
  follow_up_date?: string | null;
  compras_observation?: string | null;
};

/**
 * POST: criar PC, (des)vincular item ou atualizar prazo/observação do PC.
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const cookieStore = await cookies();
  const isLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

  const { companyId, error } = await resolveCompanyId(
    supabase,
    request,
    isLocalAuth
  );
  if (error) return error;
  if (!companyId) {
    return NextResponse.json({ error: "no company" }, { status: 400 });
  }

  let body: (CreateBody & { action?: string }) | LinkBody | UpdatePoBody;
  try {
    body = (await request.json()) as (CreateBody & { action?: string }) | LinkBody | UpdatePoBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body && "action" in body && (body as UpdatePoBody).action === "update_po") {
    const b = body as UpdatePoBody;
    if (!b.purchase_order_id || !isUuid(b.purchase_order_id)) {
      return NextResponse.json({ error: "purchase_order_id inválido" }, { status: 400 });
    }
    const follow =
      b.follow_up_date !== undefined ? toDateOnly(b.follow_up_date ?? null) : undefined;
    const obs =
      b.compras_observation !== undefined
        ? String(b.compras_observation ?? "")
            .trim()
            .slice(0, 4000) || null
        : undefined;
    if (follow === undefined && obs === undefined) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }
    const { data: poRow } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("id", b.purchase_order_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!poRow) {
      return NextResponse.json({ error: "Pedido de compra não encontrado" }, { status: 404 });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (follow !== undefined) patch.follow_up_date = follow;
    if (obs !== undefined) patch.compras_observation = obs;
    const { error: ue } = await supabase
      .from("purchase_orders")
      .update(patch)
      .eq("id", b.purchase_order_id)
      .eq("company_id", companyId);
    if (ue) {
      if (/column|does not exist|schema cache/i.test(ue.message)) {
        return NextResponse.json(
          {
            error:
              "Execute supabase-purchase-orders-compras-fields.sql no Supabase (colunas follow-up e observação).",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: ue.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (body && "action" in body && (body.action === "link" || body.action === "unlink")) {
    const b = body as LinkBody;
    if (!b.purchase_order_id || !b.order_item_id) {
      return NextResponse.json({ error: "purchase_order_id e order_item_id obrigatórios" }, { status: 400 });
    }
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("id", b.purchase_order_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!po) {
      return NextResponse.json({ error: "Pedido de compra não encontrado" }, { status: 404 });
    }

    const { data: oi } = await supabase
      .from("order_items")
      .select("id, order_id, orders!inner(company_id)")
      .eq("id", b.order_item_id)
      .maybeSingle();
    const ord = oi?.orders as { company_id: string } | { company_id: string }[] | undefined;
    const cid = Array.isArray(ord) ? ord[0]?.company_id : ord?.company_id;
    if (!oi || cid !== companyId) {
      return NextResponse.json({ error: "Item inválido para a empresa" }, { status: 400 });
    }

    if (b.action === "link") {
      let polId: string | null =
        b.purchase_order_line_id && isUuid(b.purchase_order_line_id)
          ? b.purchase_order_line_id
          : null;
      if (polId) {
        const { data: pol } = await supabase
          .from("purchase_order_lines")
          .select("id, purchase_order_id")
          .eq("id", polId)
          .eq("purchase_order_id", b.purchase_order_id)
          .maybeSingle();
        if (!pol) {
          return NextResponse.json(
            { error: "Linha do pedido de compra inválida para este PC." },
            { status: 400 }
          );
        }
        const { data: taken } = await supabase
          .from("purchase_order_item_links")
          .select("id")
          .eq("purchase_order_line_id", polId)
          .maybeSingle();
        if (taken) {
          return NextResponse.json(
            { error: "Esta linha do PC já está vinculada a um item de venda." },
            { status: 409 }
          );
        }
      }
      const { error: ie } = await supabase.from("purchase_order_item_links").insert({
        purchase_order_id: b.purchase_order_id,
        order_item_id: b.order_item_id,
        purchase_order_line_id: polId,
      });
      if (ie) {
        if (/relation|does not exist/i.test(ie.message)) {
          return NextResponse.json(
            { error: "Execute supabase-purchase-orders.sql no Supabase." },
            { status: 503 }
          );
        }
        if (ie.message.includes("unique") || ie.code === "23505") {
          return NextResponse.json({ error: "Este item já está vinculado a um pedido de compra." }, { status: 409 });
        }
        return NextResponse.json({ error: ie.message }, { status: 500 });
      }
      const { data: poRow } = await supabase
        .from("purchase_orders")
        .select("number")
        .eq("id", b.purchase_order_id)
        .eq("company_id", companyId)
        .maybeSingle();
      const { data: oiForDeadline } = await supabase
        .from("order_items")
        .select("order_id, orders!inner(delivery_deadline)")
        .eq("id", b.order_item_id)
        .maybeSingle();
      const ord = oiForDeadline?.orders as
        | { delivery_deadline: string | null }
        | { delivery_deadline: string | null }[]
        | undefined;
      const salesDl = (
        Array.isArray(ord) ? ord[0]?.delivery_deadline : ord?.delivery_deadline
      ) as string | null | undefined;
      if (poRow) {
        const n = String(poRow.number ?? "").trim().slice(0, 80);
        const { error: uErr } = await supabase
          .from("order_items")
          .update({
            pc_number: n || null,
            /** Prazo do pedido de venda (Prazo Vendas) — deixa de ser preenchido à mão no PCP. */
            pc_delivery_date: toDateOnly(salesDl ?? null),
          })
          .eq("id", b.order_item_id);
        if (uErr && !/pc_number|pc_delivery|schema cache|does not exist/i.test(uErr.message)) {
          return NextResponse.json({ error: uErr.message }, { status: 500 });
        }
      }
    } else {
      const { data: poForUnlink } = await supabase
        .from("purchase_orders")
        .select("number")
        .eq("id", b.purchase_order_id)
        .eq("company_id", companyId)
        .maybeSingle();
      const { data: oiRow } = await supabase
        .from("order_items")
        .select("pc_number")
        .eq("id", b.order_item_id)
        .maybeSingle();
      await supabase
        .from("purchase_order_item_links")
        .delete()
        .eq("purchase_order_id", b.purchase_order_id)
        .eq("order_item_id", b.order_item_id);
      const poNum = String(poForUnlink?.number ?? "").trim();
      const curPc = String(oiRow?.pc_number ?? "").trim();
      /** Só zera se o nº ainda bate com o deste PC (não apaga ajuste manual com outro valor). */
      if (!curPc || curPc === poNum) {
        const { error: clErr } = await supabase
          .from("order_items")
          .update({ pc_number: null, pc_delivery_date: null })
          .eq("id", b.order_item_id);
        if (clErr && !/pc_number|pc_delivery|schema cache|does not exist/i.test(clErr.message)) {
          return NextResponse.json({ error: clErr.message }, { status: 500 });
        }
      }
    }
    return NextResponse.json({ success: true });
  }

  const c = body as CreateBody;
  if (!c.number?.trim()) {
    return NextResponse.json({ error: "Número do pedido de compra obrigatório" }, { status: 400 });
  }
  const { data: ins, error: insErr } = await supabase
    .from("purchase_orders")
    .insert({
      company_id: companyId,
      number: c.number.trim(),
      supplier_name: c.supplier_name?.trim() || null,
      expected_delivery: c.expected_delivery || null,
      notes: c.notes?.trim() || null,
      status: "open",
    })
    .select("id")
    .single();

  if (insErr) {
    if (/relation|does not exist/i.test(insErr.message)) {
      return NextResponse.json(
        { error: "Execute supabase-purchase-orders.sql no Supabase." },
        { status: 503 }
      );
    }
    if (insErr.message.includes("unique") || insErr.code === "23505") {
      return NextResponse.json(
        { error: "Já existe um pedido de compra com este número." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, id: ins?.id });
}

/**
 * DELETE ?id=uuid — remove pedido de compra (CASCADE em vínculos).
 */
export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const cookieStore = await cookies();
  const isLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

  const { companyId, error } = await resolveCompanyId(
    supabase,
    request,
    isLocalAuth
  );
  if (error) return error;

  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!isUuid(id) || !companyId) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const { error: delE } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);

  if (delE) {
    if (/relation|does not exist/i.test(delE.message)) {
      return NextResponse.json(
        { error: "Execute supabase-purchase-orders.sql no Supabase." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: delE.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
