import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPackagingCompanyAccess } from "@/lib/packaging/access";
import {
  canChangePieceQuantity,
  parsePositiveWeightKg,
  printReadiness,
} from "@/lib/packaging/allocation";
import {
  buildAvulsaBoxCode,
  formatBoxDimensions,
  mapPgPackagingBoxError,
  parseCustomBoxSize,
} from "@/lib/packaging/boxes";
import { ensureOpenShippingList } from "@/lib/packaging/shipping-list";
import {
  allocatedQtyForItem,
  isVolumeItemsTableMissing,
  linesForVolume,
  maxEqualVolumeCount,
  mixPieceTotal,
  parseAllocateMix,
  qtyOfItemInVolume,
  volumeIdsForItem,
  type VolumeItemLine,
} from "@/lib/packaging/volume-items";
import { ensurePackagingVolumeItemsTable } from "@/lib/db/ensure-packaging-volume-items";
import { parseVolumeQrToken } from "@/lib/packaging/parse-volume-qr";
import { isUuid } from "@/lib/utils/is-uuid";
import type {
  PackagingBox,
  PackagingVolume,
  PackagingVolumeItem,
} from "@/lib/types/database";

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function mapVolumeError(message: string | undefined): string | null {
  if (!message) return null;
  const m = message.toLowerCase();
  if (m.includes("packaging_volume_items") && (m.includes("does not exist") || m.includes("schema cache"))) {
    return "Tabela packaging_volume_items ausente. Execute supabase-packaging-volume-items.sql no SQL Editor.";
  }
  if (m.includes("packaging_volumes") && (m.includes("does not exist") || m.includes("schema cache"))) {
    return "Tabela packaging_volumes ausente. Execute supabase-packaging-volumes.sql no SQL Editor.";
  }
  if (m.includes("does not exist") || m.includes("schema cache")) {
    return mapPgPackagingBoxError(message);
  }
  return null;
}

function volumeLocked(status: string): boolean {
  return status === "printed" || status === "scanned";
}

type OrderItemRow = {
  id: string;
  order_id: string;
  quantity: number;
  description: string;
  product_code: string | null;
  line_id: string | null;
  item_number?: number | null;
};

async function fetchOrderItemRow(
  admin: SupabaseClient,
  orderItemId: string
): Promise<{ item: OrderItemRow } | { error: string }> {
  const selects = [
    "id, order_id, quantity, description, product_code, line_id, item_number",
    "id, order_id, quantity, description, product_code, line_id",
    "id, order_id, quantity, description, product_code",
  ];
  let lastError = "";
  for (const sel of selects) {
    const { data, error } = await admin
      .from("order_items")
      .select(sel)
      .eq("id", orderItemId)
      .maybeSingle();
    if (!error && data) {
      return { item: data as unknown as OrderItemRow };
    }
    if (error) {
      lastError = error.message;
      console.error("[packaging-volumes] order_items select falhou:", sel, error.message);
      if (!/column|schema cache|does not exist/i.test(error.message)) {
        break;
      }
    }
  }
  return {
    error: lastError
      ? `Não foi possível ler o item (${lastError}).`
      : "Item de pedido não encontrado.",
  };
}

async function probeVolumeItemsTable(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin
    .from("packaging_volume_items")
    .select("volume_id")
    .limit(1);
  return Boolean(error && isVolumeItemsTableMissing(error.message));
}

async function loadVolumeItemLines(
  admin: SupabaseClient,
  volumeIds: string[]
): Promise<{ missing: boolean; lines: VolumeItemLine[] }> {
  if (volumeIds.length === 0) {
    return { missing: await probeVolumeItemsTable(admin), lines: [] };
  }
  const { data, error } = await admin
    .from("packaging_volume_items")
    .select("volume_id, order_item_id, piece_quantity")
    .in("volume_id", volumeIds);
  if (error) {
    if (isVolumeItemsTableMissing(error.message)) {
      return { missing: true, lines: [] };
    }
    return { missing: false, lines: [] };
  }
  return { missing: false, lines: (data ?? []) as VolumeItemLine[] };
}

function decorateVolumes(
  volumes: PackagingVolume[],
  lines: VolumeItemLine[] | null,
  itemMeta: Map<string, { product_code: string | null; description: string }>
): PackagingVolume[] {
  return volumes.map((volume) => {
    const own = linesForVolume(volume.id, lines, volume);
    const items: PackagingVolumeItem[] = own.map((line) => {
      const meta = itemMeta.get(line.order_item_id);
      return {
        volume_id: volume.id,
        order_item_id: line.order_item_id,
        piece_quantity: line.piece_quantity,
        product_code: meta?.product_code ?? null,
        description: meta?.description ?? "",
      };
    });
    return { ...volume, items };
  });
}

async function loadItemMeta(
  admin: SupabaseClient,
  itemIds: string[]
): Promise<Map<string, { product_code: string | null; description: string }>> {
  const map = new Map<string, { product_code: string | null; description: string }>();
  const unique = [...new Set(itemIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await admin
    .from("order_items")
    .select("id, product_code, description")
    .in("id", unique);
  for (const row of data ?? []) {
    map.set(row.id, {
      product_code: row.product_code ?? null,
      description: row.description ?? "",
    });
  }
  return map;
}

async function loadItemContext(
  admin: SupabaseClient,
  companyId: string,
  orderItemId: string
) {
  const found = await fetchOrderItemRow(admin, orderItemId);
  if (!("item" in found)) return found;
  const item = found.item;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, company_id, order_number, client_name, status")
    .eq("id", item.order_id)
    .maybeSingle();
  if (orderErr || !order || order.company_id !== companyId) {
    return { error: "Pedido não encontrado nesta empresa." };
  }

  const { data: orderVolumes, error: volErr } = await admin
    .from("packaging_volumes")
    .select("*")
    .eq("order_id", item.order_id)
    .eq("company_id", companyId)
    .order("sequence", { ascending: true });
  if (volErr) {
    return { error: mapVolumeError(volErr.message) ?? volErr.message };
  }

  const allVolumes = (orderVolumes ?? []) as PackagingVolume[];
  const fetched = await loadVolumeItemLines(
    admin,
    allVolumes.map((v) => v.id)
  );
  const lines = fetched.missing ? null : fetched.lines;
  const involved = new Set(
    volumeIdsForItem(orderItemId, allVolumes, lines)
  );
  const volumes = allVolumes.filter((v) => involved.has(v.id));

  return {
    item: item as OrderItemRow,
    order,
    volumes,
    orderVolumes: allVolumes,
    lines,
    volumeItemsMissing: fetched.missing,
  };
}

async function nextSequence(
  admin: SupabaseClient,
  orderId: string
): Promise<number> {
  const { data } = await admin
    .from("packaging_volumes")
    .select("sequence")
    .eq("order_id", orderId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (Number(data?.sequence) || 0) + 1;
}

async function resolveBoxForAllocate(
  admin: SupabaseClient,
  companyId: string,
  boxId: string,
  customSize: unknown
): Promise<{ ok: true; box: PackagingBox } | { ok: false; error: string }> {
  const isCustom = boxId === "__custom__" || boxId === "custom";
  if (isCustom) {
    const parsed = parseCustomBoxSize(customSize);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const code = buildAvulsaBoxCode(parsed);
    const { data: existing } = await admin
      .from("packaging_boxes")
      .select("*")
      .eq("company_id", companyId)
      .eq("code", code)
      .maybeSingle();
    if (existing) {
      return { ok: true, box: existing as PackagingBox };
    }
    const now = new Date().toISOString();
    const { data: created, error } = await admin
      .from("packaging_boxes")
      .insert({
        company_id: companyId,
        code,
        name: `Avulsa ${formatBoxDimensions(parsed)}`,
        length_cm: parsed.length_cm,
        width_cm: parsed.width_cm,
        height_cm: parsed.height_cm,
        empty_weight_kg: null,
        stock_quantity: 0,
        active: true,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();
    if (error || !created) {
      return {
        ok: false,
        error: mapPgPackagingBoxError(error?.message) ?? "Falha ao gravar caixa customizada.",
      };
    }
    return { ok: true, box: created as PackagingBox };
  }

  if (!isUuid(boxId)) {
    return { ok: false, error: "Selecione a caixa ou a opção Customizada." };
  }
  const { data: box, error } = await admin
    .from("packaging_boxes")
    .select("*")
    .eq("id", boxId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !box) return { ok: false, error: "Caixa não encontrada." };
  if (!box.active) return { ok: false, error: "Esta caixa está inativa." };
  return { ok: true, box: box as PackagingBox };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const qrToken = request.nextUrl.searchParams.get("qrToken");
  const orderItemId = request.nextUrl.searchParams.get("orderItemId");

  if (qrToken) {
    const gate = await assertPackagingCompanyAccess(companyId, {
      requireSettings: false,
    });
    if (!gate.ok) {
      return NextResponse.json(
        { success: false, error: gate.error },
        { status: gate.status }
      );
    }
    const { data: volume, error } = await gate.admin
      .from("packaging_volumes")
      .select("*")
      .eq("qr_token", qrToken)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error || !volume) {
      return jsonError("Volume não encontrado para este QR.", 404);
    }
    const { data: box } = await gate.admin
      .from("packaging_boxes")
      .select("*")
      .eq("id", volume.box_id)
      .maybeSingle();
    const { data: order } = await gate.admin
      .from("orders")
      .select("id, order_number, client_name, status")
      .eq("id", volume.order_id)
      .maybeSingle();
    const { data: item } = await gate.admin
      .from("order_items")
      .select("id, description, product_code, quantity")
      .eq("id", volume.order_item_id)
      .maybeSingle();
    const fetched = await loadVolumeItemLines(gate.admin, [volume.id]);
    const lines = fetched.missing ? null : fetched.lines;
    const itemIds = [
      volume.order_item_id,
      ...(lines ?? []).map((l) => l.order_item_id),
    ];
    const meta = await loadItemMeta(gate.admin, itemIds);
    const [decorated] = decorateVolumes(
      [volume as PackagingVolume],
      lines,
      meta
    );
    return NextResponse.json({
      success: true,
      volume: decorated,
      box,
      order,
      item,
      items: decorated.items ?? [],
    });
  }

  if (!isUuid(orderItemId)) {
    return jsonError("orderItemId inválido", 400);
  }

  const gate = await assertPackagingCompanyAccess(companyId, {
    requireSettings: false,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error, volumes: [] },
      { status: gate.status }
    );
  }
  if (!companyId || !orderItemId) {
    return jsonError("Parâmetros inválidos.", 400);
  }

  const ctx = await loadItemContext(gate.admin, companyId, orderItemId);
  if (!("item" in ctx)) {
    const msg =
      "error" in ctx && ctx.error
        ? ctx.error
        : "Item de pedido não encontrado.";
    return jsonError(msg, /ausente/i.test(msg) ? 500 : 404);
  }

  const { data: boxes } = await gate.admin
    .from("packaging_boxes")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name", { ascending: true });

  const totalPieces = Math.max(1, Math.floor(Number(ctx.item.quantity) || 1));
  const allocated = allocatedQtyForItem(
    orderItemId!,
    ctx.orderVolumes,
    ctx.lines
  );
  const remaining = Math.max(0, totalPieces - allocated);

  const itemIds = [
    ctx.item.id,
    ...ctx.volumes.map((v) => v.order_item_id),
    ...(ctx.lines ?? []).map((l) => l.order_item_id),
  ];
  const meta = await loadItemMeta(gate.admin, itemIds);
  const volumes = decorateVolumes(ctx.volumes, ctx.lines, meta);

  const { data: siblings } = ctx.item.line_id
    ? await gate.admin
        .from("order_items")
        .select("id, order_id, line_id, quantity, description, product_code")
        .eq("order_id", ctx.item.order_id)
        .eq("line_id", ctx.item.line_id)
    : { data: [] as OrderItemRow[] };

  const groupableItems = (siblings ?? [])
    .filter((s) => s.id !== ctx.item.id)
    .map((s) => {
      const qty = Math.max(1, Math.floor(Number(s.quantity) || 1));
      const used = allocatedQtyForItem(s.id, ctx.orderVolumes, ctx.lines);
      return {
        id: s.id,
        product_code: s.product_code ?? null,
        description: s.description,
        quantity: qty,
        remaining: Math.max(0, qty - used),
        item_number: "item_number" in s ? (s.item_number as number | null) : null,
      };
    })
    .filter((s) => s.remaining > 0);

  return NextResponse.json({
    success: true,
    volumes,
    boxes: (boxes ?? []) as PackagingBox[],
    totalPieces,
    remaining,
    order: ctx.order,
    item: ctx.item,
    groupableItems,
    volumeItemsMissing: ctx.volumeItemsMissing,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const companyId =
      typeof body.companyId === "string" ? body.companyId : null;

    const gate = await assertPackagingCompanyAccess(companyId, {
      requireSettings: false,
    });
    if (!gate.ok) return jsonError(gate.error, gate.status);

    if (action === "allocate") {
      const orderItemId =
        typeof body.orderItemId === "string" ? body.orderItemId : "";
      if (!isUuid(orderItemId)) {
        return jsonError("orderItemId inválido", 400);
      }
      const boxId = typeof body.boxId === "string" ? body.boxId : "";
      const ctx = await loadItemContext(gate.admin, companyId!, orderItemId);
      if (!("item" in ctx)) return jsonError(ctx.error, 404);
      if (ctx.order.status === "finished") {
        return jsonError(
          "Pedido já finalizado. A lista de embarque está fechada.",
          400
        );
      }

      const resolved = await resolveBoxForAllocate(
        gate.admin,
        companyId!,
        boxId,
        body.customSize ?? body.custom_size
      );
      if (!resolved.ok) return jsonError(resolved.error, 400);

      const weight = parsePositiveWeightKg(body.weightKg ?? body.weight_kg);
      if (!weight.ok) return jsonError(weight.error, 400);

      const mix = parseAllocateMix({
        hostItemId: orderItemId,
        hostPieces: body.piecesPerBox,
        groupedItems: body.groupedItems ?? body.grouped_items,
      });
      if (!mix.ok) return jsonError(mix.error, 400);

      if (mix.lines.length > 1 && ctx.volumeItemsMissing) {
        await ensurePackagingVolumeItemsTable();
        const again = await loadItemContext(gate.admin, companyId!, orderItemId);
        if (!("item" in again)) return jsonError(again.error, 404);
        if (again.volumeItemsMissing) {
          return jsonError(
            "Tabela packaging_volume_items ausente. Execute supabase-packaging-volume-items.sql no SQL Editor.",
            400
          );
        }
        ctx.lines = again.lines;
        ctx.orderVolumes = again.orderVolumes;
        ctx.volumeItemsMissing = again.volumeItemsMissing;
      }

      const mixIds = mix.lines.map((l) => l.orderItemId);
      const { data: mixItems, error: mixErr } = await gate.admin
        .from("order_items")
        .select("id, order_id, line_id, quantity, description, product_code")
        .in("id", mixIds);
      if (mixErr) return jsonError(mixErr.message, 500);
      const byId = new Map((mixItems ?? []).map((row) => [row.id, row]));
      for (const line of mix.lines) {
        const row = byId.get(line.orderItemId);
        if (!row) return jsonError("Item agrupado não encontrado.", 400);
        if (row.order_id !== ctx.item.order_id) {
          return jsonError("Só é possível agrupar itens do mesmo pedido.", 400);
        }
        if (!ctx.item.line_id || row.line_id !== ctx.item.line_id) {
          return jsonError(
            "Só é possível agrupar itens da mesma linha de produção.",
            400
          );
        }
      }

      const mixWithRemaining = mix.lines.map((line) => {
        const row = byId.get(line.orderItemId)!;
        const total = Math.max(1, Math.floor(Number(row.quantity) || 1));
        const remaining = Math.max(
          0,
          total - allocatedQtyForItem(line.orderItemId, ctx.orderVolumes, ctx.lines)
        );
        return {
          ...line,
          remaining,
          description: row.description as string,
        };
      });
      for (const line of mixWithRemaining) {
        if (line.pieceQuantity > line.remaining) {
          return jsonError(
            `Saldo insuficiente em "${line.description}": restam ${line.remaining} peça(s).`,
            400
          );
        }
      }

      const maxVolumes = maxEqualVolumeCount(mixWithRemaining);
      if (maxVolumes < 1) {
        return jsonError(
          "Não há saldo suficiente nos itens selecionados para gerar a caixa.",
          400
        );
      }
      let volumeCount = maxVolumes;
      if (body.repeatCount !== undefined && body.repeatCount !== "") {
        const n = Math.floor(Number(body.repeatCount));
        if (!Number.isInteger(n) || n < 1) {
          return jsonError("Informe quantos volumes iguais gerar (inteiro ≥ 1).", 400);
        }
        volumeCount = Math.min(n, maxVolumes);
      }

      const piecesPerVolume = mixPieceTotal(mix.lines);
      const startSeq = await nextSequence(gate.admin, ctx.item.order_id);
      const now = new Date().toISOString();
      const rows = Array.from({ length: volumeCount }, (_, i) => ({
        company_id: companyId,
        order_id: ctx.item.order_id,
        order_item_id: orderItemId,
        box_id: resolved.box.id,
        piece_quantity: piecesPerVolume,
        weight_kg: weight.kg,
        sequence: startSeq + i,
        qr_token: crypto.randomUUID(),
        status: "generated",
        created_at: now,
        updated_at: now,
      }));

      const { data: inserted, error: insErr } = await gate.admin
        .from("packaging_volumes")
        .insert(rows)
        .select("*");
      if (insErr) {
        return jsonError(mapVolumeError(insErr.message) ?? insErr.message, 500);
      }

      const insertedRows = (inserted ?? []) as PackagingVolume[];
      if (insertedRows.length > 0) {
        if (ctx.volumeItemsMissing) {
          await ensurePackagingVolumeItemsTable();
        }
        const itemRows = insertedRows.flatMap((volume) =>
          mix.lines.map((line) => ({
            company_id: companyId,
            volume_id: volume.id,
            order_item_id: line.orderItemId,
            piece_quantity: line.pieceQuantity,
          }))
        );
        const { error: itemsErr } = await gate.admin
          .from("packaging_volume_items")
          .insert(itemRows);
        if (itemsErr) {
          const tableGone = isVolumeItemsTableMissing(itemsErr.message);
          if (!(tableGone && mix.lines.length === 1)) {
            await gate.admin
              .from("packaging_volumes")
              .delete()
              .in(
                "id",
                insertedRows.map((v) => v.id)
              );
            return jsonError(
              mapVolumeError(itemsErr.message) ?? itemsErr.message,
              500
            );
          }
        }
      }

      await ensureOpenShippingList(gate.admin, companyId!, ctx.item.order_id);
      const host = mixWithRemaining[0];
      const leftover = host.remaining - host.pieceQuantity * volumeCount;

      return NextResponse.json({
        success: true,
        volumes: insertedRows,
        leftover,
      });
    }

    if (action === "update") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!isUuid(id)) return jsonError("id inválido", 400);

      const { data: volume, error } = await gate.admin
        .from("packaging_volumes")
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error || !volume) return jsonError("Volume não encontrado.", 404);
      {
        const { data: ordRow } = await gate.admin
          .from("orders")
          .select("status")
          .eq("id", volume.order_id)
          .maybeSingle();
        if (ordRow?.status === "finished") {
          return jsonError(
            "Pedido finalizado: a lista de embarque não aceita edição.",
            400
          );
        }
      }
      if (volumeLocked(volume.status)) {
        return jsonError("Volume já impresso ou bipado não pode ser editado.", 400);
      }

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (body.piece_quantity !== undefined) {
        const fetched = await loadVolumeItemLines(gate.admin, [volume.id]);
        const volLines = linesForVolume(
          volume.id,
          fetched.missing ? null : fetched.lines,
          volume as PackagingVolume
        );
        if (volLines.length > 1) {
          return jsonError(
            "Volume agrupado: exclua e gere de novo para mudar as peças.",
            400
          );
        }
        const ctx = await loadItemContext(
          gate.admin,
          companyId!,
          volume.order_item_id
        );
        if (!("item" in ctx)) return jsonError(ctx.error, 404);
        const totalPieces = Math.max(1, Math.floor(Number(ctx.item.quantity) || 1));
        const allocated = allocatedQtyForItem(
          volume.order_item_id,
          ctx.orderVolumes,
          ctx.lines
        );
        const currentQty = qtyOfItemInVolume(
          volume.id,
          volume.order_item_id,
          volume as PackagingVolume,
          ctx.lines
        );
        const remaining = Math.max(0, totalPieces - allocated);
        const check = canChangePieceQuantity({
          currentQuantity: currentQty,
          nextQuantity: Number(body.piece_quantity),
          remaining,
        });
        if (!check.ok) return jsonError(check.error, 400);
        const nextQty = Math.floor(Number(body.piece_quantity));
        patch.piece_quantity = nextQty;
        if (!fetched.missing) {
          await gate.admin
            .from("packaging_volume_items")
            .update({ piece_quantity: nextQty })
            .eq("volume_id", volume.id)
            .eq("order_item_id", volume.order_item_id);
        }
      }

      if (body.weight_kg !== undefined) {
        if (body.weight_kg === "" || body.weight_kg === null) {
          patch.weight_kg = null;
        } else {
          const w = parsePositiveWeightKg(body.weight_kg);
          if (!w.ok) return jsonError(w.error, 400);
          patch.weight_kg = w.kg;
        }
      }

      if (body.boxId !== undefined) {
        const newBoxId = typeof body.boxId === "string" ? body.boxId : "";
        if (!isUuid(newBoxId)) return jsonError("boxId inválido", 400);
        if (newBoxId !== volume.box_id) {
          patch.box_id = newBoxId;
        }
      }

      const { data: updated, error: updErr } = await gate.admin
        .from("packaging_volumes")
        .update(patch)
        .eq("id", id)
        .eq("company_id", companyId)
        .select("*")
        .maybeSingle();
      if (updErr) {
        return jsonError(mapVolumeError(updErr.message) ?? updErr.message, 500);
      }
      return NextResponse.json({ success: true, volume: updated });
    }

    if (action === "delete") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!isUuid(id)) return jsonError("id inválido", 400);
      const { data: volume, error } = await gate.admin
        .from("packaging_volumes")
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error || !volume) return jsonError("Volume não encontrado.", 404);
      {
        const { data: ordRow } = await gate.admin
          .from("orders")
          .select("status")
          .eq("id", volume.order_id)
          .maybeSingle();
        if (ordRow?.status === "finished") {
          return jsonError(
            "Pedido finalizado: a lista de embarque não aceita exclusão.",
            400
          );
        }
      }
      if (volumeLocked(volume.status)) {
        return jsonError("Volume já impresso ou bipado não pode ser excluído.", 400);
      }
      const { error: delErr } = await gate.admin
        .from("packaging_volumes")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (delErr) {
        return jsonError(mapVolumeError(delErr.message) ?? delErr.message, 500);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "print") {
      const orderItemId =
        typeof body.orderItemId === "string" ? body.orderItemId : "";
      if (!isUuid(orderItemId)) {
        return jsonError("orderItemId inválido", 400);
      }
      const ctx = await loadItemContext(gate.admin, companyId!, orderItemId);
      if (!("item" in ctx)) return jsonError(ctx.error, 404);
      const totalPieces = Math.max(1, Math.floor(Number(ctx.item.quantity) || 1));
      const ready = printReadiness(
        totalPieces,
        ctx.volumes.map((v) => ({
          piece_quantity: qtyOfItemInVolume(v.id, orderItemId, v, ctx.lines),
          weight_kg: v.weight_kg,
        }))
      );
      if (!ready.ok) return jsonError(ready.reason, 400);
      const now = new Date().toISOString();
      const ids = ctx.volumes
        .filter((v) => v.status === "generated" || v.status === "pending")
        .map((v) => v.id);
      if (ids.length > 0) {
        const { error: printErr } = await gate.admin
          .from("packaging_volumes")
          .update({ status: "printed", updated_at: now })
          .in("id", ids)
          .eq("company_id", companyId);
        if (printErr) {
          return jsonError(mapVolumeError(printErr.message) ?? printErr.message, 500);
        }
      }
      return NextResponse.json({ success: true, printed: ids.length });
    }

    if (action === "scan") {
      const rawToken = typeof body.qrToken === "string" ? body.qrToken.trim() : "";
      const token = parseVolumeQrToken(rawToken) ?? (rawToken || "");
      if (!token) return jsonError("qrToken inválido", 400);
      const expectedOrderId =
        typeof body.orderId === "string" ? body.orderId.trim() : "";
      const { data: volume, error } = await gate.admin
        .from("packaging_volumes")
        .select("*")
        .eq("qr_token", token)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error || !volume) return jsonError("Volume não encontrado para este QR.", 404);
      if (expectedOrderId && volume.order_id !== expectedOrderId) {
        return jsonError("Este QR é de outro pedido.", 400);
      }
      const now = new Date().toISOString();
      if (volume.status === "scanned") {
        return NextResponse.json({
          success: true,
          volume,
          alreadyScanned: true,
        });
      }
      const { data: updated, error: updErr } = await gate.admin
        .from("packaging_volumes")
        .update({
          status: "scanned",
          scanned_at: now,
          updated_at: now,
        })
        .eq("id", volume.id)
        .select("*")
        .maybeSingle();
      if (updErr) {
        return jsonError(mapVolumeError(updErr.message) ?? updErr.message, 500);
      }
      return NextResponse.json({ success: true, volume: updated });
    }

    return jsonError("Ação inválida", 400);
  } catch (err) {
    console.error("[packaging-volumes]", err);
    return jsonError(err instanceof Error ? err.message : "Erro", 500);
  }
}
