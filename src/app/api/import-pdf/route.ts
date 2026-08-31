/**
 * API de importação de PDFs de pedidos (manual: PCP HEPA, TOTVS ou Omie PDF).
 * A sincronização pela API do Omie não passa por aqui.
 *
 * O prazo de entrega é extraído do PDF e salvo quando as colunas existem.
 * Se delivery_deadline/pcp_deadline não existirem: tenta criar via ensureDeliveryColumns(),
 * e se não conseguir, importa sem prazo (fallback) com aviso para o usuário adicionar
 * as colunas e re-importar.
 */
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDocument } from "pdfjs-serverless";
import { parseTotvsOrcamento } from "@/lib/pdf/parse-totvs";
import {
  parseOmiePedido,
  isOmiePdf,
} from "@/lib/pdf/parse-omie";
import {
  isPcpManualPdf,
  parsePcpManualPdf,
} from "@/lib/pdf/parse-pcp-manual";
import {
  isZenithQuotePdf,
  parseZenithQuote,
} from "@/lib/pdf/parse-zenith-quote";
import {
  applyManualImportDefaults,
  isManualPdfOrigin,
  parseManualImportKind,
  resolveManualImportKind,
  resolveManualOrderCollision,
  type ManualImportKind,
} from "@/lib/pdf/apply-manual-import";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasRequestLocalAuthCookie } from "@/lib/server-local-auth";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { toDateOnly, toQuantity } from "@/lib/utils/supabase-data";
import { ensureDeliveryColumns } from "@/lib/db/ensure-delivery-columns";
import { orderNumberFromPdfFileName } from "@/lib/utils/order-number-filename";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB (Vercel limite ~4.5 MB)

/** Salva o PDF na pasta matriz (só funciona fora do Vercel, ex: local ou self-hosted) */
async function savePdfToFolder(
  buffer: Buffer,
  fileName: string,
  orderNumber: string,
  ordersPath: string
): Promise<string | null> {
  if (process.env.VERCEL) return null;
  const trimmed = (ordersPath || "").trim();
  if (!trimmed) return null;
  try {
    /** Pasta do pedido = mesmo nome do pedido; `/` e caracteres inválidos viram `_` (ex.: 260184/4 → 260184_4). */
    const safeOrder = orderNumber.replace(/[<>:"/\\|?*]/g, "_");
    const folderPath = path.join(trimmed, safeOrder);
    if (!existsSync(folderPath)) {
      await mkdir(folderPath, { recursive: true });
    }
    const filePath = path.join(folderPath, fileName);
    await writeFile(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error("Erro ao salvar PDF na pasta:", err);
    return null;
  }
}

interface ExtractedData {
  orderNumber: string;
  clientName: string;
  deliveryDate: string | null;
  pdfTipo?: ManualImportKind | null;
  items: {
    description: string;
    quantity: number;
    product_code?: string | null;
  }[];
}

function mapOmieItemsToExtracted(
  items: { description: string; quantity: number; productCode?: string | null }[]
): ExtractedData["items"] {
  return items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    product_code: it.productCode ?? null,
  }));
}

async function insertImportedOrderItems(
  supabase: SupabaseClient,
  orderId: string,
  items: ExtractedData["items"]
): Promise<{ error: { message: string } | null }> {
  const rows = items.map((item) => {
    const row: Record<string, unknown> = {
      order_id: orderId,
      description: String(item.description || "").trim().slice(0, 500),
      quantity: toQuantity(item.quantity),
    };
    const code = item.product_code?.trim();
    if (code) row.product_code = code.slice(0, 120);
    return row;
  });
  let res = await supabase.from("order_items").insert(rows);
  if (
    res.error &&
    /product_code|schema cache|column|does not exist|PGRST204/i.test(
      res.error.message
    )
  ) {
    const stripped = rows.map((r) => {
      const { product_code: _, ...rest } = r;
      return rest;
    });
    res = await supabase.from("order_items").insert(stripped);
  }
  return res;
}

async function extractFromPdf(
  buffer: Buffer,
  fileName: string
): Promise<ExtractedData & { _rawText?: string }> {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;

  const parts: string[] = [];
  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{
      str?: string;
      hasEOL?: boolean;
      transform?: number[];
    }>;

    let pageText = "";
    let lastY: number | null = null;

    for (const item of items) {
      const str = item.str ?? "";
      const y = item.transform ? item.transform[5] : null;

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        pageText += "\n";
      } else if (item.hasEOL) {
        pageText += "\n";
      } else if (pageText.length > 0 && !pageText.endsWith("\n") && str.length > 0) {
        pageText += " ";
      }

      pageText += str;
      if (y !== null) lastY = y;
    }
    parts.push(pageText);
  }
  const text = parts.join("\n");
  if (!text || text.length < 20) {
    throw new Error("Não foi possível extrair texto do PDF.");
  }

  console.log("[import-pdf] Texto extraído de", fileName, ":\n", text.substring(0, 3000));

  if (isZenithQuotePdf(text)) {
    const zenith = parseZenithQuote(text, fileName);
    const isZenithFallback =
      zenith.items.length === 1 &&
      zenith.items[0].description.startsWith("Item importado de ");
    if (!isZenithFallback && zenith.items.length > 0) {
      return {
        orderNumber: zenith.orderNumber,
        clientName: zenith.clientName,
        deliveryDate: zenith.deliveryDate ?? null,
        items: zenith.items,
        pdfTipo: null,
        _rawText: text,
      };
    }
  }

  if (isPcpManualPdf(text)) {
    const pcp = parsePcpManualPdf(text, fileName);
    const isPcpFallback =
      pcp.items.length === 1 &&
      pcp.items[0].description.startsWith("Item importado de ");
    if (!isPcpFallback && pcp.items.length > 0) {
      return {
        orderNumber: pcp.orderNumber,
        clientName: pcp.clientName,
        deliveryDate: pcp.deliveryDate ?? null,
        items: pcp.items,
        pdfTipo: pcp.tipo,
        _rawText: text,
      };
    }
  }

  const textLower = text.toLowerCase();
  const pareceTotvs =
    textLower.includes("orçamento nº") ||
    textLower.includes("orcamento nº") ||
    textLower.includes("orçamento n") ||
    textLower.includes("itens do orçamento") ||
    textLower.includes("itens do orcamento") ||
    textLower.includes("previsão de faturamento") ||
    textLower.includes("previsao de faturamento");
  const pareceOmie = !pareceTotvs && isOmiePdf(text);

  // 1) Se parece TOTVS, tentar parser TOTVS primeiro
  if (pareceTotvs) {
    const totvs = parseTotvsOrcamento(text, fileName);
    const isTotvsFallback =
      totvs.items.length === 1 &&
      totvs.items[0].description.startsWith("Item importado de ");
    if (!isTotvsFallback && totvs.items.length > 0) {
      return {
        orderNumber: totvs.orderNumber,
        clientName: totvs.clientName,
        deliveryDate: totvs.deliveryDate ?? null,
        items: totvs.items,
        _rawText: text,
      };
    }
  }

  // 2) Se parece Omie, tentar parser Omie
  let omie: ReturnType<typeof parseOmiePedido> | null = null;
  if (pareceOmie || !pareceTotvs) {
    omie = parseOmiePedido(text, fileName);
    const isOmieFallback =
      omie.items.length === 1 &&
      omie.items[0].description.startsWith("Item importado de ");
    if (!isOmieFallback && omie.items.length > 0) {
      return {
        orderNumber: omie.orderNumber,
        clientName: omie.clientName,
        deliveryDate: omie.deliveryDate ?? null,
        items: mapOmieItemsToExtracted(omie.items),
        _rawText: text,
      };
    }
  }

  // 3) Fallback: retornar o que tiver
  if (pareceTotvs) {
    const totvs = parseTotvsOrcamento(text, fileName);
    return {
      orderNumber: totvs.orderNumber,
      clientName: totvs.clientName,
      deliveryDate: totvs.deliveryDate ?? null,
      items: totvs.items,
      _rawText: text,
    };
  }

  if (omie) {
    return {
      orderNumber: omie.orderNumber,
      clientName: omie.clientName,
      deliveryDate: omie.deliveryDate ?? null,
      items: mapOmieItemsToExtracted(omie.items),
      _rawText: text,
    };
  }

  const fallback = parseOmiePedido(text, fileName);
  return {
    orderNumber: fallback.orderNumber,
    clientName: fallback.clientName,
    deliveryDate: fallback.deliveryDate ?? null,
    items: mapOmieItemsToExtracted(fallback.items),
    _rawText: text,
  };
}

async function findOrderByNumber(
  supabase: SupabaseClient,
  companyId: string,
  orderNumber: string
): Promise<{ id: string; notes: string | null } | null> {
  const withNotes = await supabase
    .from("orders")
    .select("id, notes")
    .eq("company_id", companyId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!withNotes.error) return withNotes.data ?? null;
  if (!/notes|schema cache|column|does not exist|PGRST204/i.test(withNotes.error.message)) {
    return null;
  }
  const onlyId = await supabase
    .from("orders")
    .select("id")
    .eq("company_id", companyId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  return onlyId.data ? { id: onlyId.data.id, notes: null } : null;
}

async function insertOrderWithFallbacks(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
) {
  let ordersRes = await supabase.from("orders").insert(payload).select();
  if (ordersRes.error?.message?.includes("delivery_deadline")) {
    const added = await ensureDeliveryColumns();
    if (added) {
      ordersRes = await supabase.from("orders").insert(payload).select();
    }
    if (ordersRes.error?.message?.includes("delivery_deadline")) {
      const { delivery_deadline: _, ...withoutDelivery } = payload;
      ordersRes = await supabase.from("orders").insert(withoutDelivery).select();
    }
  }
  if (ordersRes.error && /notes|schema cache|column|does not exist|PGRST204/i.test(ordersRes.error.message)) {
    const { notes: _, ...withoutNotes } = payload;
    ordersRes = await supabase.from("orders").insert(withoutNotes).select();
  }
  return ordersRes;
}

async function updateOrderWithFallbacks(
  supabase: SupabaseClient,
  orderId: string,
  payload: Record<string, unknown>
) {
  let updateRes = await supabase.from("orders").update(payload).eq("id", orderId).select();
  if (updateRes.error?.message?.includes("delivery_deadline")) {
    const added = await ensureDeliveryColumns();
    if (added) {
      updateRes = await supabase.from("orders").update(payload).eq("id", orderId).select();
    }
    if (updateRes.error?.message?.includes("delivery_deadline")) {
      const { delivery_deadline: _, ...withoutDelivery } = payload;
      updateRes = await supabase.from("orders").update(withoutDelivery).eq("id", orderId).select();
    }
  }
  if (updateRes.error && /notes|schema cache|column|does not exist|PGRST204/i.test(updateRes.error.message)) {
    const { notes: _, ...withoutNotes } = payload;
    updateRes = await supabase.from("orders").update(withoutNotes).eq("id", orderId).select();
  }
  return updateRes;
}

async function persistImportedOrder(
  supabase: SupabaseClient,
  companyId: string,
  extracted: ExtractedData,
  uiKind: ManualImportKind,
  buffer: Buffer,
  fileName: string,
  ordersPath: string
): Promise<NextResponse> {
  await ensureDeliveryColumns();

  const kind = resolveManualImportKind(uiKind, extracted.pdfTipo ?? null);
  const defaults = applyManualImportDefaults({
    orderNumber: extracted.orderNumber,
    clientName: extracted.clientName,
    kind,
  });
  extracted.orderNumber = defaults.orderNumber;
  extracted.clientName = defaults.clientName;

  const existing = await findOrderByNumber(supabase, companyId, extracted.orderNumber);
  let decision = resolveManualOrderCollision({
    orderNumber: extracted.orderNumber,
    kind,
    existingFound: !!existing,
    existingNotes: existing?.notes ?? null,
  });

  let existingId: string | null =
    decision.action === "update" && existing ? existing.id : null;

  if (decision.action === "insert" && decision.orderNumber !== extracted.orderNumber) {
    const second = await findOrderByNumber(supabase, companyId, decision.orderNumber);
    if (second && isManualPdfOrigin(second.notes)) {
      decision = { action: "update", orderNumber: decision.orderNumber };
      existingId = second.id;
    } else if (second && !isManualPdfOrigin(second.notes)) {
      decision = { action: "insert", orderNumber: `${decision.orderNumber}-2`.slice(0, 50) };
      existingId = null;
    } else {
      extracted.orderNumber = decision.orderNumber;
    }
  }

  extracted.orderNumber = decision.orderNumber;

  if (decision.action === "update" && existingId) {
    const updatePayload: Record<string, unknown> = {
      client_name: String(extracted.clientName).trim().slice(0, 255),
      delivery_deadline: toDateOnly(extracted.deliveryDate),
      notes: defaults.notes,
    };
    const updateRes = await updateOrderWithFallbacks(supabase, existingId, updatePayload);
    const deliveryUpdated = !updateRes.error;
    return NextResponse.json({
      success: true,
      savedToSupabase: true,
      orderNumber: extracted.orderNumber,
      clientName: extracted.clientName,
      deliveryDate: extracted.deliveryDate,
      itemCount: extracted.items.length,
      updated: true,
      deliveryUpdated,
      importKind: kind,
      message: deliveryUpdated
        ? "Pedido já existia. Prazo de entrega e cliente foram atualizados."
        : "Pedido atualizado sem prazo. Adicione as colunas em Configurações e re-importe para salvar o prazo.",
    });
  }

  const orderPayload: Record<string, unknown> = {
    company_id: companyId,
    order_number: String(extracted.orderNumber).trim().slice(0, 50),
    client_name: String(extracted.clientName).trim().slice(0, 255),
    delivery_deadline: toDateOnly(extracted.deliveryDate),
    status: "imported",
    notes: defaults.notes,
  };

  const ordersRes = await insertOrderWithFallbacks(supabase, orderPayload);
  const { data: createdOrders, error: orderError } = ordersRes;

  if (orderError || !createdOrders?.[0]) {
    console.error("Erro ao criar pedido:", orderError);
    return NextResponse.json(
      { success: false, error: orderError?.message ?? "Erro ao salvar pedido." },
      { status: 500 }
    );
  }

  const createdOrder = createdOrders[0];
  const itemsRes = await insertImportedOrderItems(
    supabase,
    createdOrder.id,
    extracted.items
  );

  if (itemsRes.error) {
    console.error("Erro ao criar itens:", itemsRes.error);
    return NextResponse.json(
      { success: false, error: "Erro ao salvar itens do pedido." },
      { status: 500 }
    );
  }

  const savedPath = await savePdfToFolder(
    buffer,
    fileName,
    extracted.orderNumber,
    ordersPath
  );

  const createdOrderData = createdOrder as { id: string; delivery_deadline?: string | null };
  const deliverySaved = !!createdOrderData?.delivery_deadline;
  const collisionNote =
    defaults.orderNumber !== extracted.orderNumber
      ? `Número gravado como ${extracted.orderNumber} para não sobrescrever pedido Omie.`
      : "";

  return NextResponse.json({
    success: true,
    orderNumber: extracted.orderNumber,
    clientName: extracted.clientName,
    deliveryDate: extracted.deliveryDate,
    deliverySaved,
    itemCount: extracted.items.length,
    savedToSupabase: true,
    orderId: createdOrderData.id,
    pdfSavedTo: savedPath ?? undefined,
    importKind: kind,
    message: !deliverySaved && extracted.deliveryDate
      ? "Importado. Adicione as colunas em Configurações e re-importe para salvar o prazo."
      : collisionNote.trim() || undefined,
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Nenhum arquivo enviado." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractFromPdf(buffer, file.name);

    const partialFromFile = orderNumberFromPdfFileName(file.name);
    if (partialFromFile) {
      extracted.orderNumber = partialFromFile;
    }

    const uiKind = parseManualImportKind(
      (formData.get("import_kind") as string) ?? ""
    );

    // Pasta matriz: cliente pode enviar ou virá da empresa (Supabase)
    let ordersPath =
      (formData.get("orders_path") as string)?.trim() || "";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const hasSupabase =
      supabaseUrl?.startsWith("http://") || supabaseUrl?.startsWith("https://");

    const hasLocalAuth = hasRequestLocalAuthCookie(request);
    let companyIdFromForm = (formData.get("company_id") as string)?.trim();
    if (companyIdFromForm === "local-company") companyIdFromForm = "";

    if (hasLocalAuth && hasSupabase) {
      try {
        const supabase = createSupabaseAdminClient();
        let companyId = companyIdFromForm;
        if (!companyId) {
          /** Mesma regra do /api/company-data e /api/effective-company — evita importar em empresa “aleatória”. */
          companyId = (await resolvePrimaryCompanyId(supabase)) ?? "";
        }
        if (!companyId) {
          const { data: firstCompany } = await supabase
            .from("companies")
            .select("id")
            .limit(1)
            .maybeSingle();
          companyId = firstCompany?.id ?? "";
        }
        if (!companyId) {
          return NextResponse.json({
            success: false,
            error: "Nenhuma empresa cadastrada no banco. Importe o backup ou crie uma empresa primeiro.",
          }, { status: 400 });
        }
        return persistImportedOrder(
          supabase,
          companyId,
          extracted,
          uiKind,
          buffer,
          file.name,
          ordersPath
        );
      } catch (err) {
        console.error("Erro na importação (local auth):", err);
        return NextResponse.json(
          { success: false, error: "Erro ao conectar com o banco de dados." },
          { status: 500 }
        );
      }
    }

    // Tentar salvar no Supabase se usuário autenticado (Supabase Auth)
    if (hasSupabase) {
      try {
        const supabase = await createServerSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          return NextResponse.json(
            { success: false, error: "É necessário estar autenticado para importar." },
            { status: 401 }
          );
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();

        if (!profile?.company_id) {
          return NextResponse.json(
            {
              success: false,
              error: "Seu perfil não está vinculado a uma empresa. Configure nas configurações.",
            },
            { status: 400 }
          );
        }

        if (!ordersPath) {
          const { data: company } = await supabase
            .from("companies")
            .select("orders_path, import_path")
            .eq("id", profile.company_id)
            .single();
          ordersPath =
            (company?.orders_path || company?.import_path || "").trim();
        }

        return persistImportedOrder(
          supabase,
          profile.company_id,
          extracted,
          uiKind,
          buffer,
          file.name,
          ordersPath
        );
      } catch (supabaseErr) {
        console.error("Erro Supabase na importação:", supabaseErr);
        return NextResponse.json(
          {
            success: false,
            error:
              supabaseErr instanceof Error
                ? supabaseErr.message
                : "Erro ao conectar com o banco de dados.",
          },
          { status: 500 }
        );
      }
    }

    // Sem Supabase: retornar dados extraídos; salvar PDF na pasta se orders_path enviado
    const previewKind = resolveManualImportKind(uiKind, extracted.pdfTipo ?? null);
    const preview = applyManualImportDefaults({
      orderNumber: extracted.orderNumber,
      clientName: extracted.clientName,
      kind: previewKind,
    });
    const savedPath = await savePdfToFolder(
      buffer,
      file.name,
      preview.orderNumber,
      ordersPath
    );

    return NextResponse.json({
      success: true,
      orderNumber: preview.orderNumber,
      clientName: preview.clientName,
      deliveryDate: extracted.deliveryDate,
      items: extracted.items,
      savedToSupabase: false,
      importKind: previewKind,
      pdfSavedTo: savedPath ?? undefined,
    });
  } catch (err) {
    console.error("Erro na API import-pdf:", err);
    const msg =
      err instanceof Error ? err.message : "Erro ao processar PDF.";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
