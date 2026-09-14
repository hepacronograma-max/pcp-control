import { NextRequest, NextResponse } from "next/server";
import { assertPackagingCompanyAccess } from "@/lib/packaging/access";
import {
  isShippingListsMissing,
  loadShippingList,
  markShippingListCollected,
  markShippingListInvoiced,
} from "@/lib/packaging/shipping-list";
import { ensureShippingListsTable } from "@/lib/db/ensure-shipping-lists";
import { extractOmieClientOrderNumber } from "@/lib/omie/mapper";
import { syncOmieInvoicedShippingLists } from "@/lib/omie/sync-invoiced-shipping";
import { isUuid } from "@/lib/utils/is-uuid";
import {
  isVolumeItemsTableMissing,
  linesForVolume,
  type VolumeItemLine,
} from "@/lib/packaging/volume-items";
import type {
  Order,
  OrderItem,
  PackagingBox,
  PackagingVolume,
  PackagingVolumeItem,
  ShippingList,
} from "@/lib/types/database";

export const maxDuration = 60;

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const orderId = request.nextUrl.searchParams.get("orderId");
  const gate = await assertPackagingCompanyAccess(companyId, {
    requireSettings: false,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error, lists: [] },
      { status: gate.status }
    );
  }

  let volQuery = gate.admin
    .from("packaging_volumes")
    .select("*")
    .eq("company_id", companyId)
    .order("sequence", { ascending: true });
  if (orderId) {
    if (!isUuid(orderId)) return jsonError("orderId inválido", 400);
    volQuery = volQuery.eq("order_id", orderId);
  }
  const { data: volumes, error: volErr } = await volQuery;
  if (volErr) {
    return jsonError(volErr.message, 500);
  }

  const probe = await gate.admin
    .from("shipping_lists")
    .select("id")
    .eq("company_id", companyId)
    .limit(1);
  const tableMissing = !!(
    probe.error && isShippingListsMissing(probe.error.message)
  );

  const vols = (volumes ?? []) as PackagingVolume[];
  const orderIds = [...new Set(vols.map((v) => v.order_id))];
  if (orderIds.length === 0) {
    return NextResponse.json({ success: true, lists: [], tableMissing });
  }

  const { data: orders } = await gate.admin
    .from("orders")
    .select("id, order_number, client_name, status, finished_at")
    .in("id", orderIds);
  const { data: items } = await gate.admin
    .from("order_items")
    .select("id, order_id, description, product_code, quantity")
    .in("order_id", orderIds);
  const boxIds = [...new Set(vols.map((v) => v.box_id).filter(Boolean))];
  const { data: boxes } =
    boxIds.length > 0
      ? await gate.admin.from("packaging_boxes").select("*").in("id", boxIds)
      : { data: [] as PackagingBox[] };

  const volIds = vols.map((v) => v.id);
  let volumeLines: VolumeItemLine[] | null = null;
  if (volIds.length > 0) {
    const { data: lineRows, error: lineErr } = await gate.admin
      .from("packaging_volume_items")
      .select("volume_id, order_item_id, piece_quantity")
      .in("volume_id", volIds);
    if (lineErr && !isVolumeItemsTableMissing(lineErr.message)) {
      return jsonError(lineErr.message, 500);
    }
    if (!lineErr) volumeLines = (lineRows ?? []) as VolumeItemLine[];
  }
  const itemMeta = new Map(
    ((items ?? []) as OrderItem[]).map((it) => [
      it.id,
      { product_code: it.product_code ?? null, description: it.description },
    ])
  );
  const volsDecorated = vols.map((volume) => {
    const own = linesForVolume(volume.id, volumeLines, volume);
    const volumeItems: PackagingVolumeItem[] = own.map((line) => {
      const meta = itemMeta.get(line.order_item_id);
      return {
        volume_id: volume.id,
        order_item_id: line.order_item_id,
        piece_quantity: line.piece_quantity,
        product_code: meta?.product_code ?? null,
        description: meta?.description ?? "",
      };
    });
    return { ...volume, items: volumeItems };
  });

  const { data: omieLinks } = await gate.admin
    .from("omie_order_links")
    .select("pcp_order_id, omie_payload_original")
    .in("pcp_order_id", orderIds);
  const omieOrderIds = new Set<string>();
  const clientPoByOrder = new Map<string, string>();
  for (const link of omieLinks ?? []) {
    const pid = link.pcp_order_id as string | null;
    if (!pid) continue;
    omieOrderIds.add(pid);
    const po = extractOmieClientOrderNumber(link.omie_payload_original);
    if (po && !clientPoByOrder.has(pid)) clientPoByOrder.set(pid, po);
  }

  const { data: listRows } = tableMissing
    ? { data: [] as ShippingList[] }
    : await gate.admin
        .from("shipping_lists")
        .select("*")
        .eq("company_id", companyId)
        .in("order_id", orderIds);
  const listByOrder = new Map(
    ((listRows ?? []) as ShippingList[]).map((row) => [row.order_id, row])
  );

  const volsByOrder = new Map<string, PackagingVolume[]>();
  for (const volume of volsDecorated) {
    const bucket = volsByOrder.get(volume.order_id);
    if (bucket) bucket.push(volume);
    else volsByOrder.set(volume.order_id, [volume]);
  }
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of (items ?? []) as OrderItem[]) {
    const bucket = itemsByOrder.get(item.order_id);
    if (bucket) bucket.push(item);
    else itemsByOrder.set(item.order_id, [item]);
  }

  const lists: Array<{
    order: Pick<Order, "id" | "order_number" | "client_name" | "status" | "finished_at">;
    volumes: PackagingVolume[];
    items: Pick<OrderItem, "id" | "order_id" | "description" | "product_code" | "quantity">[];
    boxes: PackagingBox[];
    shippingList: ShippingList | null;
    hasOmieLink: boolean;
    clientOrderNumber: string | null;
  }> = [];

  const boxesTyped = (boxes ?? []) as PackagingBox[];
  for (const oid of orderIds) {
    const order = (orders ?? []).find((o) => o.id === oid);
    if (!order) continue;
    lists.push({
      order: order as Pick<
        Order,
        "id" | "order_number" | "client_name" | "status" | "finished_at"
      >,
      volumes: volsByOrder.get(oid) ?? [],
      items: itemsByOrder.get(oid) ?? [],
      boxes: boxesTyped,
      shippingList: listByOrder.get(oid) ?? null,
      hasOmieLink: omieOrderIds.has(oid),
      clientOrderNumber: clientPoByOrder.get(oid) ?? null,
    });
  }

  lists.sort((a, b) =>
    String(a.order.order_number).localeCompare(String(b.order.order_number), "pt-BR")
  );

  return NextResponse.json({ success: true, lists, tableMissing });
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

    if (action === "setup") {
      const ok = await ensureShippingListsTable();
      if (!ok) {
        return jsonError(
          "Cole supabase-shipping-lists.sql no SQL Editor do Supabase.",
          400
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === "receive") {
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      const name =
        typeof body.receivedByName === "string"
          ? body.receivedByName.trim().slice(0, 120)
          : "";
      if (!isUuid(orderId)) return jsonError("orderId inválido", 400);
      if (!name) return jsonError("Informe quem recebeu a carga.", 400);

      const { data: order } = await gate.admin
        .from("orders")
        .select("id, status")
        .eq("id", orderId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!order) return jsonError("Pedido não encontrado.", 404);
      if (order.status !== "finished") {
        return jsonError(
          "A assinatura de recebimento só entra depois que o PCP finalizar o pedido.",
          400
        );
      }

      const now = new Date().toISOString();
      const { data: existing, error: readErr } = await gate.admin
        .from("shipping_lists")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();
      if (readErr) {
        if (isShippingListsMissing(readErr.message)) {
          return jsonError(
            "Tabela shipping_lists ausente. Execute supabase-shipping-lists.sql.",
            500
          );
        }
        return jsonError(readErr.message, 500);
      }
      if (!existing) {
        return jsonError("Lista de embarque ainda não existe para este pedido.", 404);
      }
      const { data: updated, error: updErr } = await gate.admin
        .from("shipping_lists")
        .update({
          received_by_name: name,
          received_at: now,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (updErr) return jsonError(updErr.message, 500);
      return NextResponse.json({ success: true, shippingList: updated });
    }

    if (action === "sync-omie") {
      const report = await syncOmieInvoicedShippingLists(gate.admin, companyId!);
      return NextResponse.json({ success: true, ...report });
    }

    if (action === "invoice") {
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      if (!isUuid(orderId)) return jsonError("orderId inválido", 400);
      const { data: order } = await gate.admin
        .from("orders")
        .select("id, status")
        .eq("id", orderId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!order) return jsonError("Pedido não encontrado.", 404);
      const list = await loadShippingList(gate.admin, orderId);
      const pcpReleased =
        order.status === "finished" ||
        list?.status === "finalized" ||
        Boolean(list?.finalized_at);
      if (!pcpReleased) {
        return jsonError(
          "O PCP ainda não liberou este pedido para faturar.",
          400
        );
      }
      const marked = await markShippingListInvoiced(gate.admin, orderId);
      if (!marked.ok) return jsonError(marked.error, 400);
      return NextResponse.json({ success: true });
    }

    if (action === "upload-cargo-photo") {
      await ensureShippingListsTable();
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
      if (!isUuid(orderId)) return jsonError("orderId inválido", 400);
      const m = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
        dataUrl.trim()
      );
      if (!m) return jsonError("Envie uma foto JPG ou PNG.", 400);
      const list = await loadShippingList(gate.admin, orderId);
      if (!list) {
        return jsonError("Lista de embarque não existe para este pedido.", 404);
      }
      if (list.collected_at) {
        return jsonError("Carregamento já finalizado.", 400);
      }
      const { data: orderRow } = await gate.admin
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .maybeSingle();
      const ext = m[1].toLowerCase() === "png" ? "png" : "jpg";
      const buffer = Buffer.from(m[2].replace(/\s/g, ""), "base64");
      if (buffer.length > 4 * 1024 * 1024) {
        return jsonError("Foto maior que 4 MB. Tire de novo mais perto.", 400);
      }
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const safeOrder = String(orderRow?.order_number ?? orderId).replace(
        /[<>:"/\\|?*]/g,
        "_"
      );
      const previousFileId = list.cargo_photo_path?.startsWith("drive:")
        ? list.cargo_photo_path.slice("drive:".length)
        : null;
      let uploaded: { fileId: string };
      try {
        const { uploadCargoPhotoToDrive } = await import(
          "@/lib/google-drive/cargo-photo"
        );
        uploaded = await uploadCargoPhotoToDrive({
          buffer,
          contentType,
          fileName: `OS-${safeOrder}-${stamp}.${ext}`,
          previousFileId,
        });
      } catch (err) {
        return jsonError(
          err instanceof Error ? err.message : "Falha no upload para o Google Drive.",
          500
        );
      }
      const now = new Date().toISOString();
      const viewUrl = `/api/expedicao/foto?orderId=${encodeURIComponent(orderId)}`;
      const { data: updated, error: updErr } = await gate.admin
        .from("shipping_lists")
        .update({
          cargo_photo_url: viewUrl,
          cargo_photo_path: `drive:${uploaded.fileId}`,
          cargo_photo_taken_at: now,
          updated_at: now,
        })
        .eq("id", list.id)
        .select("*")
        .maybeSingle();
      if (updErr) {
        if (/cargo_photo|schema cache|column|does not exist/i.test(updErr.message)) {
          return jsonError(
            "Faltam colunas da foto. Cole supabase-shipping-lists-expedicao.sql no SQL Editor.",
            400
          );
        }
        return jsonError(updErr.message, 500);
      }
      return NextResponse.json({ success: true, shippingList: updated });
    }

    if (action === "finish-loading") {
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      if (!isUuid(orderId)) return jsonError("orderId inválido", 400);
      const list = await loadShippingList(gate.admin, orderId);
      if (!list) {
        return jsonError("Lista de embarque não existe para este pedido.", 404);
      }
      const { data: volumes } = await gate.admin
        .from("packaging_volumes")
        .select("status")
        .eq("order_id", orderId)
        .eq("company_id", companyId);
      const rows = volumes ?? [];
      if (rows.length === 0 || !rows.every((v) => v.status === "scanned")) {
        return jsonError(
          "Bipe todas as caixas antes de finalizar o carregamento.",
          400
        );
      }
      if (!list.cargo_photo_url) {
        return jsonError("Tire a foto da carga antes de finalizar.", 400);
      }
      const marked = await markShippingListCollected(gate.admin, orderId);
      if (!marked.ok) return jsonError(marked.error, 400);
      return NextResponse.json({ success: true });
    }

    if (action === "finalize-order") {
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      if (!isUuid(orderId)) return jsonError("orderId inválido", 400);
      const { data: order } = await gate.admin
        .from("orders")
        .select("id, status")
        .eq("id", orderId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!order) return jsonError("Pedido não encontrado.", 404);
      const list = await loadShippingList(gate.admin, orderId);
      const pcpReleased =
        order.status === "finished" ||
        list?.status === "finalized" ||
        Boolean(list?.finalized_at);
      if (!pcpReleased) {
        return jsonError(
          "O PCP ainda não liberou este pedido para faturar.",
          400
        );
      }
      if (list?.collected_at) {
        return NextResponse.json({ success: true });
      }
      const marked = await markShippingListCollected(gate.admin, orderId);
      if (!marked.ok) return jsonError(marked.error, 400);
      return NextResponse.json({ success: true });
    }

    if (action === "collect") {
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      if (!isUuid(orderId)) return jsonError("orderId inválido", 400);
      const { data: volumes } = await gate.admin
        .from("packaging_volumes")
        .select("status")
        .eq("order_id", orderId)
        .eq("company_id", companyId);
      const rows = volumes ?? [];
      if (rows.length === 0 || !rows.every((v) => v.status === "scanned")) {
        return jsonError(
          "Só é possível marcar Coletado quando todos os volumes foram conferidos (bipados).",
          400
        );
      }
      const list = await loadShippingList(gate.admin, orderId);
      if (!list?.cargo_photo_url) {
        return jsonError(
          "Finalize o carregamento na Expedição: bipar as caixas e fotografar a carga.",
          400
        );
      }
      const marked = await markShippingListCollected(gate.admin, orderId);
      if (!marked.ok) return jsonError(marked.error, 400);
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      if (!isUuid(orderId)) return jsonError("orderId inválido", 400);
      const { data: order } = await gate.admin
        .from("orders")
        .select("id, order_number")
        .eq("id", orderId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!order) return jsonError("Pedido não encontrado.", 404);

      const { error: volDelErr } = await gate.admin
        .from("packaging_volumes")
        .delete()
        .eq("order_id", orderId)
        .eq("company_id", companyId);
      if (volDelErr) {
        return jsonError(volDelErr.message, 500);
      }

      const { error: listDelErr } = await gate.admin
        .from("shipping_lists")
        .delete()
        .eq("order_id", orderId)
        .eq("company_id", companyId);
      if (
        listDelErr &&
        !isShippingListsMissing(listDelErr.message)
      ) {
        return jsonError(listDelErr.message, 500);
      }

      return NextResponse.json({ success: true });
    }

    return jsonError("Ação inválida", 400);
  } catch (err) {
    console.error("[shipping-lists]", err);
    return jsonError(err instanceof Error ? err.message : "Erro", 500);
  }
}
