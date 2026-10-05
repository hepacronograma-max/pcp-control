import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPackagingCompanyAccess } from "@/lib/packaging/access";
import { fetchActorProfile } from "@/lib/supabase/fetch-actor-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import {
  ABASTECIMENTO_DEFAULT_SORT,
  compareAbastecimentoItems,
  itemBelongsOnAbastecimentoBoard,
  parseSupplyStatus,
  type SupplyStatus,
} from "@/lib/abastecimento";
import { hasPermission } from "@/lib/utils/permissions";
import { isUuid } from "@/lib/utils/is-uuid";
import { toDateOnly } from "@/lib/utils/supabase-data";

const ITEM_COLUMNS =
  "id, product_code, description, quantity, line_id, pcp_deadline, production_start, production_end, status, notes, supply_planned_date, supply_status, order_id";

function schemaMissing(message: string): boolean {
  return (
    /supply_planned_date|supply_status/i.test(message) &&
    /column|schema cache|does not exist/i.test(message)
  );
}

type OrderEmbed = {
  id: string;
  order_number: string;
  client_name: string;
  status: string;
  company_id: string;
};

type LineEmbed = {
  id: string;
  name: string;
  is_almoxarifado?: boolean | null;
};

type ItemRow = {
  id: string;
  product_code: string | null;
  description: string;
  quantity: number;
  line_id: string | null;
  pcp_deadline: string | null;
  production_start: string | null;
  production_end: string | null;
  status: string;
  notes: string | null;
  supply_planned_date: string | null;
  supply_status: string | null;
  order_id: string;
  orders?: OrderEmbed | OrderEmbed[] | null;
};

async function loadLines(
  admin: SupabaseClient,
  lineIds: Array<string | null>
): Promise<Map<string, LineEmbed>> {
  const ids = [...new Set(lineIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, LineEmbed>();
  if (ids.length === 0) return map;
  const { data, error } = await admin
    .from("production_lines")
    .select("id, name, is_almoxarifado")
    .in("id", ids);
  if (error) return map;
  for (const line of (data ?? []) as LineEmbed[]) {
    map.set(line.id, line);
  }
  return map;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const gate = await assertPackagingCompanyAccess(companyId);
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error, items: [] },
      { status: gate.status }
    );
  }

  const allowed = await actorCan(gate.admin, "viewAbastecimento");
  if (!allowed.ok) {
    return NextResponse.json(
      { success: false, error: allowed.error, items: [] },
      { status: allowed.status }
    );
  }

  const { data, error } = await gate.admin
    .from("order_items")
    .select(
      `${ITEM_COLUMNS}, orders!inner(id, order_number, client_name, status, company_id)`
    )
    .eq("orders.company_id", companyId);

  if (error) {
    if (schemaMissing(error.message)) {
      return NextResponse.json({
        success: false,
        schemaMissing: true,
        items: [],
        error:
          "Faltam colunas de abastecimento. Execute supabase-abastecimento.sql no SQL Editor.",
      });
    }
    return NextResponse.json(
      { success: false, error: error.message, items: [] },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as ItemRow[];
  const linesById = await loadLines(
    gate.admin,
    rows.map((row) => row.line_id)
  );

  const items = rows
    .map((row) => {
      const order = one(row.orders);
      const line = row.line_id ? linesById.get(row.line_id) ?? null : null;
      return { row, order, line };
    })
    .filter(({ row, order, line }) =>
      itemBelongsOnAbastecimentoBoard({
        line,
        orderStatus: order?.status,
        itemStatus: row.status,
        notes: row.notes,
      })
    )
    .map(({ row, order, line }) => ({
      id: row.id,
      product_code: row.product_code,
      description: row.description,
      quantity: row.quantity,
      line_id: row.line_id,
      line_name: line?.name ?? "",
      pcp_deadline: toDateOnly(row.pcp_deadline),
      production_start: toDateOnly(row.production_start),
      production_end: toDateOnly(row.production_end),
      status: row.status,
      supply_planned_date: toDateOnly(row.supply_planned_date),
      supply_status: parseSupplyStatus(row.supply_status),
      order_id: order?.id ?? row.order_id,
      order_number: order?.order_number ?? "",
      client_name: order?.client_name ?? "",
    }));

  items.sort((a, b) =>
    compareAbastecimentoItems(a, b, ABASTECIMENTO_DEFAULT_SORT)
  );

  return NextResponse.json({ success: true, items });
}

export async function PATCH(request: NextRequest) {
  let body: {
    companyId?: string;
    itemId?: string;
    supply_planned_date?: string | null;
    supply_status?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corpo JSON inválido." },
      { status: 400 }
    );
  }

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  const gate = await assertPackagingCompanyAccess(companyId);
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error },
      { status: gate.status }
    );
  }
  if (!isUuid(itemId)) {
    return NextResponse.json(
      { success: false, error: "itemId inválido." },
      { status: 400 }
    );
  }

  const allowed = await actorCan(gate.admin, "editAbastecimento");
  if (!allowed.ok) {
    return NextResponse.json(
      { success: false, error: allowed.error },
      { status: allowed.status }
    );
  }

  const hasDate = Object.prototype.hasOwnProperty.call(body, "supply_planned_date");
  const hasStatus = Object.prototype.hasOwnProperty.call(body, "supply_status");
  if (!hasDate && !hasStatus) {
    return NextResponse.json(
      { success: false, error: "Nada para atualizar." },
      { status: 400 }
    );
  }

  const { data: existing, error: loadErr } = await gate.admin
    .from("order_items")
    .select(
      "id, status, notes, line_id, orders!inner(id, status, company_id)"
    )
    .eq("id", itemId)
    .eq("orders.company_id", companyId)
    .maybeSingle();

  if (loadErr) {
    if (schemaMissing(loadErr.message)) {
      return NextResponse.json(
        {
          success: false,
          schemaMissing: true,
          error:
            "Faltam colunas de abastecimento. Execute supabase-abastecimento.sql no SQL Editor.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: loadErr.message },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Item não encontrado." },
      { status: 404 }
    );
  }

  const row = existing as ItemRow;
  const linesById = await loadLines(gate.admin, [row.line_id]);
  const onBoard = itemBelongsOnAbastecimentoBoard({
    line: row.line_id ? linesById.get(row.line_id) ?? null : null,
    orderStatus: one(row.orders)?.status,
    itemStatus: row.status,
    notes: row.notes,
  });
  if (!onBoard) {
    return NextResponse.json(
      { success: false, error: "Este item não entra no abastecimento." },
      { status: 400 }
    );
  }

  const update: Record<string, string | null> = {};
  if (hasDate) {
    const date = toDateOnly(body.supply_planned_date);
    if (body.supply_planned_date && !date) {
      return NextResponse.json(
        { success: false, error: "Data de abastecimento inválida." },
        { status: 400 }
      );
    }
    update.supply_planned_date = date;
  }
  if (hasStatus) {
    const status = parseSupplyStatus(body.supply_status);
    if (body.supply_status != null && body.supply_status !== "" && !status) {
      return NextResponse.json(
        { success: false, error: "Status de abastecimento inválido." },
        { status: 400 }
      );
    }
    update.supply_status = status;
    update.supply_status_at = new Date().toISOString();
    update.supply_status_by = allowed.actorId;
  }

  const { data: saved, error: saveErr } = await gate.admin
    .from("order_items")
    .update(update)
    .eq("id", itemId)
    .select("id, supply_planned_date, supply_status")
    .maybeSingle();

  if (saveErr) {
    if (schemaMissing(saveErr.message)) {
      return NextResponse.json(
        {
          success: false,
          schemaMissing: true,
          error:
            "Faltam colunas de abastecimento. Execute supabase-abastecimento.sql no SQL Editor.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: saveErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    item: {
      id: itemId,
      supply_planned_date: toDateOnly(
        (saved as { supply_planned_date?: string | null } | null)
          ?.supply_planned_date
      ),
      supply_status: parseSupplyStatus(
        (saved as { supply_status?: string | null } | null)?.supply_status
      ) as SupplyStatus | null,
    },
  });
}

async function actorCan(
  admin: SupabaseClient,
  permission: "viewAbastecimento" | "editAbastecimento"
): Promise<
  | { ok: true; actorId: string | null }
  | { ok: false; error: string; status: number }
> {
  if (await hasServerLocalAuthCookie()) {
    return { ok: true, actorId: null };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado", status: 401 };
  const profile = await fetchActorProfile(admin, user.id);
  if (!profile || !hasPermission(profile, permission)) {
    return { ok: false, error: "Sem permissão", status: 403 };
  }
  return { ok: true, actorId: user.id };
}
