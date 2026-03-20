import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getDocument } from "pdfjs-serverless";
import { parseTotvsOrcamento } from "@/lib/pdf/parse-totvs";
import {
  parseOmiePedido,
  isOmiePdf,
} from "@/lib/pdf/parse-omie";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toDateOnly, toQuantity } from "@/lib/utils/supabase-data";

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
  items: { description: string; quantity: number }[];
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
        items: omie.items,
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
      items: omie.items,
      _rawText: text,
    };
  }

  const fallback = parseOmiePedido(text, fileName);
  return {
    orderNumber: fallback.orderNumber,
    clientName: fallback.clientName,
    deliveryDate: fallback.deliveryDate ?? null,
    items: fallback.items,
    _rawText: text,
  };
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

    // Pasta matriz: cliente pode enviar ou virá da empresa (Supabase)
    let ordersPath =
      (formData.get("orders_path") as string)?.trim() || "";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const hasSupabase =
      supabaseUrl?.startsWith("http://") || supabaseUrl?.startsWith("https://");

    // Modo local: cookie pcp-local-auth (funciona em qualquer domínio, inclusive produção).
    const hasLocalAuth =
      request.cookies.get("pcp-local-auth")?.value === "1";
    let companyIdFromForm = (formData.get("company_id") as string)?.trim();
    if (companyIdFromForm === "local-company") companyIdFromForm = "";

    if (hasLocalAuth && hasSupabase) {
      try {
        const supabase = createSupabaseAdminClient();
        let companyId = companyIdFromForm;
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
        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("company_id", companyId)
          .eq("order_number", extracted.orderNumber)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({
            success: false,
            error: "Pedido já importado anteriormente. Revise na tela de Pedidos.",
            orderNumber: extracted.orderNumber,
            clientName: extracted.clientName,
            itemCount: extracted.items.length,
          });
        }

        const { data: createdOrders, error: orderError } = await supabase
          .from("orders")
          .insert({
            company_id: companyId,
            order_number: String(extracted.orderNumber).trim().slice(0, 50),
            client_name: String(extracted.clientName).trim().slice(0, 255),
            status: "imported",
          })
          .select();

        if (orderError || !createdOrders?.[0]) {
          console.error("Erro ao criar pedido (local auth):", orderError);
          return NextResponse.json(
            { success: false, error: orderError?.message ?? "Erro ao salvar pedido." },
            { status: 500 }
          );
        }

        const createdOrder = createdOrders[0];
        const { error: itemsError } = await supabase.from("order_items").insert(
          extracted.items.map((item) => ({
            order_id: createdOrder.id,
            description: String(item.description || "").trim().slice(0, 500),
            quantity: toQuantity(item.quantity),
          }))
        );

        if (itemsError) {
          console.error("Erro ao criar itens (local auth):", itemsError);
          return NextResponse.json(
            { success: false, error: "Erro ao salvar itens do pedido." },
            { status: 500 }
          );
        }

        const savedPath = await savePdfToFolder(
          buffer,
          file.name,
          extracted.orderNumber,
          ordersPath
        );

        return NextResponse.json({
          success: true,
          orderNumber: extracted.orderNumber,
          clientName: extracted.clientName,
          deliveryDate: extracted.deliveryDate,
          itemCount: extracted.items.length,
          savedToSupabase: true,
          orderId: createdOrder.id,
          pdfSavedTo: savedPath ?? undefined,
        });
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

        // Verificar duplicidade
        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("company_id", profile.company_id)
          .eq("order_number", extracted.orderNumber)
          .maybeSingle();

        if (existing) {
          return NextResponse.json({
            success: false,
            error:
              "Pedido já importado anteriormente. Revise na tela de Pedidos.",
            orderNumber: extracted.orderNumber,
            clientName: extracted.clientName,
            itemCount: extracted.items.length,
          });
        }

        const { data: createdOrders, error: orderError } = await supabase
          .from("orders")
          .insert({
            company_id: profile.company_id,
            order_number: String(extracted.orderNumber).trim().slice(0, 50),
            client_name: String(extracted.clientName).trim().slice(0, 255),
            status: "imported",
          })
          .select();

        if (orderError || !createdOrders?.[0]) {
          console.error("Erro ao criar pedido:", orderError);
          return NextResponse.json(
            {
              success: false,
              error: orderError?.message ?? "Erro ao salvar pedido no banco.",
            },
            { status: 500 }
          );
        }

        const createdOrder = createdOrders[0];
        const { error: itemsError } = await supabase.from("order_items").insert(
          extracted.items.map((item) => ({
            order_id: createdOrder.id,
            description: String(item.description || "").trim().slice(0, 500),
            quantity: toQuantity(item.quantity),
          }))
        );

        if (itemsError) {
          console.error("Erro ao criar itens:", itemsError);
          // Pedido foi criado mas itens falharam - rollback opcional, por ora retornamos sucesso parcial
          return NextResponse.json(
            {
              success: false,
              error: "Pedido criado, mas houve erro ao salvar itens.",
            },
            { status: 500 }
          );
        }

        const savedPath = await savePdfToFolder(
          buffer,
          file.name,
          extracted.orderNumber,
          ordersPath
        );

        return NextResponse.json({
          success: true,
          orderNumber: extracted.orderNumber,
          clientName: extracted.clientName,
          deliveryDate: extracted.deliveryDate,
          itemCount: extracted.items.length,
          savedToSupabase: true,
          orderId: createdOrder.id,
          pdfSavedTo: savedPath ?? undefined,
        });
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
    const savedPath = await savePdfToFolder(
      buffer,
      file.name,
      extracted.orderNumber,
      ordersPath
    );

    return NextResponse.json({
      success: true,
      orderNumber: extracted.orderNumber,
      clientName: extracted.clientName,
      deliveryDate: extracted.deliveryDate,
      items: extracted.items,
      savedToSupabase: false,
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
