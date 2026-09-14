import { NextRequest, NextResponse } from "next/server";
import { assertPackagingCompanyAccess } from "@/lib/packaging/access";
import {
  mapPgPackagingBoxError,
  parsePackagingBoxPayload,
} from "@/lib/packaging/boxes";
import { isUuid } from "@/lib/utils/is-uuid";

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const includeInactive =
    request.nextUrl.searchParams.get("includeInactive") === "1" ||
    request.nextUrl.searchParams.get("includeInactive") === "true";

  const gate = await assertPackagingCompanyAccess(companyId, {
    requireSettings: includeInactive,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error, boxes: [] },
      { status: gate.status }
    );
  }

  let query = gate.admin
    .from("packaging_boxes")
    .select("*")
    .eq("company_id", companyId!)
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    const mapped = mapPgPackagingBoxError(error.message);
    return jsonError(mapped ?? error.message, 500);
  }

  return NextResponse.json({ success: true, boxes: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const companyId =
      typeof body.companyId === "string" ? body.companyId : null;

    const gate = await assertPackagingCompanyAccess(companyId, {
      requireSettings: true,
    });
    if (!gate.ok) {
      return jsonError(gate.error, gate.status);
    }

    if (action === "create") {
      const parsed = parsePackagingBoxPayload(body);
      if (!parsed.ok) return jsonError(parsed.error, 400);
      const now = new Date().toISOString();
      const { data, error } = await gate.admin
        .from("packaging_boxes")
        .insert({
          company_id: companyId,
          ...parsed.data,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .maybeSingle();
      if (error) {
        return jsonError(
          mapPgPackagingBoxError(error.message) ?? error.message,
          500
        );
      }
      return NextResponse.json({ success: true, box: data });
    }

    if (action === "update") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!isUuid(id)) return jsonError("id inválido", 400);
      const parsed = parsePackagingBoxPayload(body);
      if (!parsed.ok) return jsonError(parsed.error, 400);
      const { data, error } = await gate.admin
        .from("packaging_boxes")
        .update({
          ...parsed.data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId)
        .select("*")
        .maybeSingle();
      if (error) {
        return jsonError(
          mapPgPackagingBoxError(error.message) ?? error.message,
          500
        );
      }
      if (!data) return jsonError("Caixa não encontrada", 404);
      return NextResponse.json({ success: true, box: data });
    }

    if (action === "toggle_active") {
      const id = typeof body.id === "string" ? body.id : "";
      const active = body.active === true;
      if (!isUuid(id)) return jsonError("id inválido", 400);
      const { data, error } = await gate.admin
        .from("packaging_boxes")
        .update({
          active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId)
        .select("*")
        .maybeSingle();
      if (error) {
        return jsonError(
          mapPgPackagingBoxError(error.message) ?? error.message,
          500
        );
      }
      if (!data) return jsonError("Caixa não encontrada", 404);
      return NextResponse.json({ success: true, box: data });
    }

    if (action === "delete") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!isUuid(id)) return jsonError("id inválido", 400);
      const { error } = await gate.admin
        .from("packaging_boxes")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) {
        return jsonError(
          mapPgPackagingBoxError(error.message) ?? error.message,
          500
        );
      }
      return NextResponse.json({ success: true });
    }

    return jsonError("Ação inválida", 400);
  } catch (err) {
    console.error("[packaging-boxes]", err);
    return jsonError(
      err instanceof Error ? err.message : "Erro",
      500
    );
  }
}
