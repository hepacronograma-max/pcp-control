import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { parseTotvsOrcamento } from "@/lib/pdf/parse-totvs";
import {
  parseOmiePedido,
  isOmiePdf,
} from "@/lib/pdf/parse-omie";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB (Vercel limite ~4.5 MB)

interface ExtractedData {
  orderNumber: string;
  clientName: string;
  deliveryDate: string | null;
  items: { description: string; quantity: number }[];
}

async function extractFromPdf(
  buffer: Buffer,
  fileName: string
): Promise<ExtractedData> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  const text = (result?.text ?? "") || "";
  if (!text || text.length < 20) {
    throw new Error("Não foi possível extrair texto do PDF.");
  }

  const pareceOmie = isOmiePdf(text);

  // 1) Se parece Omie, tentar parser Omie primeiro (otimizado para pedidos Omie)
  let omie: ReturnType<typeof parseOmiePedido> | null = null;
  if (pareceOmie) {
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
      };
    }
  }

  // 2) Tentar parser TOTVS
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
    };
  }

  // 3) Se Omie detectado, preferir resultado Omie; senão TOTVS
  if (omie) {
    return {
      orderNumber: omie.orderNumber,
      clientName: omie.clientName,
      deliveryDate: omie.deliveryDate ?? null,
      items: omie.items,
    };
  }

  return {
    orderNumber: totvs.orderNumber,
    clientName: totvs.clientName,
    deliveryDate: totvs.deliveryDate ?? null,
    items: totvs.items,
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

    // Tentar salvar no Supabase se usuário autenticado
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const hasSupabase =
      supabaseUrl?.startsWith("http://") || supabaseUrl?.startsWith("https://");

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
            order_number: extracted.orderNumber,
            client_name: extracted.clientName,
            delivery_deadline: extracted.deliveryDate,
            status: "imported",
            created_by: user.id,
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
          extracted.items.map((item, index) => ({
            order_id: createdOrder.id,
            item_number: index + 1,
            description: item.description,
            quantity: item.quantity || 1,
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

        return NextResponse.json({
          success: true,
          orderNumber: extracted.orderNumber,
          clientName: extracted.clientName,
          deliveryDate: extracted.deliveryDate,
          itemCount: extracted.items.length,
          savedToSupabase: true,
          orderId: createdOrder.id,
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

    // Sem Supabase: retornar apenas os dados extraídos (modo local usa localhost:3201)
    return NextResponse.json({
      success: true,
      orderNumber: extracted.orderNumber,
      clientName: extracted.clientName,
      deliveryDate: extracted.deliveryDate,
      items: extracted.items,
      savedToSupabase: false,
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
