import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "pdfjs-serverless";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { toDateOnly } from "@/lib/utils/supabase-data";
import { appendLineFallbackToNotes } from "@/lib/compras/pc-lines-fallback";
import {
  parsePurchaseOrderPdf,
  type ParsedPolLine,
  type ParsedPurchaseOrderHeader,
} from "@/lib/pdf/parse-purchase-order-pdf";

function buildFinalNotes(
  fileName: string,
  parsed: ParsedPurchaseOrderHeader,
  lineRes: { ok: boolean; schemaLinesMissing?: boolean; error?: string }
): string {
  const h = `Importado: ${fileName}`;
  if (parsed.lines.length === 0) {
    if (parsed.items_summary?.trim()) {
      return `${h}\n\nItens (texto bruto do PDF):\n${parsed.items_summary}`.slice(0, 12000);
    }
    return h;
  }
  if (lineRes.ok) {
    if (parsed.lines.length === 0) return h;
    return `${h} — ${parsed.lines.length} itens gravados no banco.`.slice(0, 2000);
  }
  if (lineRes.schemaLinesMissing) {
    const warn = `${h}\n\n[AVISO] A tabela purchase_order_lines ainda não existe. Execute o ficheiro supabase-purchase-order-lines.sql no Supabase, depois importe o PDF outra vez. Abaixo ficam os itens em cópia (apenas leitura no ecrã).`;
    return appendLineFallbackToNotes(warn, parsed.lines).slice(0, 12000);
  }
  const err = !lineRes.ok && "error" in lineRes && lineRes.error
    ? String(lineRes.error)
    : "Erro desconhecido";
  return appendLineFallbackToNotes(
    `${h}\n\n[ERRO] Não foi possível gravar as linhas: ${err}. Cópia dos itens:`,
    parsed.lines
  ).slice(0, 12000);
}

const MAX_FILE_SIZE = 4 * 1024 * 1024;

async function savePurchaseOrderLines(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  purchaseOrderId: string,
  lines: ParsedPolLine[]
) {
  const { error: dErr } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("purchase_order_id", purchaseOrderId);
  if (dErr) {
    if (/relation|does not exist|schema cache/i.test(dErr.message)) {
      return { ok: false as const, schemaLinesMissing: true };
    }
    return { ok: false as const, error: dErr.message, schemaLinesMissing: false };
  }
  if (lines.length === 0) return { ok: true as const, schemaLinesMissing: false };
  const rows = lines.map((l, idx) => ({
    purchase_order_id: purchaseOrderId,
    line_number: l.line_number,
    product_code: l.product_code,
    description: l.description,
    ncm: l.ncm,
    quantity: l.quantity,
    unit: l.unit,
    supplier_code: l.supplier_code,
    sort_order: idx,
  }));
  const { error: inErr } = await supabase.from("purchase_order_lines").insert(rows);
  if (inErr) {
    if (/relation|does not exist|schema cache/i.test(inErr.message)) {
      return { ok: false as const, schemaLinesMissing: true };
    }
    return { ok: false as const, error: inErr.message, schemaLinesMissing: false };
  }
  return { ok: true as const, schemaLinesMissing: false };
}

function canImportPurchase(role: string | null | undefined): boolean {
  return role === "super_admin" || role === "manager" || role === "compras";
}

async function extractText(buffer: Buffer): Promise<string> {
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
  if (!text || text.length < 8) {
    throw new Error("Não foi possível extrair texto do PDF.");
  }
  return text;
}

/**
 * Importa PDF de pedido de compra: cria ou atualiza `purchase_orders` (cabeçalho).
 */
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
        { success: false, error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024} MB` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractText(buffer);
    const parsed = parsePurchaseOrderPdf(text, file.name);
    const companyIdFromForm = (formData.get("company_id") as string)?.trim() || "";
    const cid = companyIdFromForm === "local-company" ? "" : companyIdFromForm;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const hasSupabase =
      supabaseUrl?.startsWith("http://") || supabaseUrl?.startsWith("https://");
    if (!hasSupabase) {
      return NextResponse.json(
        { success: false, error: "Supabase não configurado." },
        { status: 400 }
      );
    }

    const hasLocal = request.cookies.get("pcp-local-auth")?.value === "1";
    const supabase = createSupabaseAdminClient();
    let companyId: string | null = cid || null;
    if (!companyId) {
      companyId = (await resolvePrimaryCompanyId(supabase)) ?? null;
    }
    if (!companyId) {
      const { data: first } = await supabase.from("companies").select("id").limit(1).maybeSingle();
      companyId = first?.id ?? null;
    }
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "Nenhuma empresa cadastrada no banco." },
        { status: 400 }
      );
    }

    if (!hasLocal) {
      const sAuth = await createServerSupabaseClient();
      const {
        data: { user },
      } = await sAuth.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { success: false, error: "É necessário estar autenticado." },
          { status: 401 }
        );
      }
      const { data: prof } = await sAuth
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .single();
      if (!canImportPurchase(prof?.role)) {
        return NextResponse.json({ success: false, error: "Sem permissão para importar compras." }, { status: 403 });
      }
      if (prof?.company_id && prof.company_id !== companyId && prof?.role !== "super_admin") {
        companyId = prof.company_id;
      }
    }

    const { data: existing, error: exErr } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("company_id", companyId)
      .eq("number", parsed.number)
      .maybeSingle();

    if (exErr && /relation|does not exist|schema cache/i.test(exErr.message)) {
      return NextResponse.json(
        {
          success: false,
          error: "Execute supabase-purchase-orders.sql no Supabase para habilitar Compras.",
        },
        { status: 503 }
      );
    }

    const row = {
      company_id: companyId,
      number: parsed.number,
      supplier_name: parsed.supplier_name,
      expected_delivery: toDateOnly(parsed.expected_delivery),
      notes: `Importado: ${file.name} (a gravar itens…)`,
      status: "open" as const,
    };

    if (existing?.id) {
      const { error: up } = await supabase
        .from("purchase_orders")
        .update({
          supplier_name: row.supplier_name,
          expected_delivery: row.expected_delivery,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (up) {
        return NextResponse.json({ success: false, error: up.message }, { status: 500 });
      }
      const lineRes = await savePurchaseOrderLines(supabase, existing.id, parsed.lines);
      const finalNotes = buildFinalNotes(file.name, parsed, lineRes);
      await supabase
        .from("purchase_orders")
        .update({ notes: finalNotes, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      const message =
        lineRes.schemaLinesMissing
          ? "Execute supabase-purchase-order-lines.sql no Supabase, depois importe o PDF de novo."
          : !lineRes.ok
            ? lineRes.error
            : undefined;
      return NextResponse.json({
        success: true,
        savedToSupabase: true,
        purchaseOrderId: existing.id,
        number: parsed.number,
        updated: true,
        supplierName: parsed.supplier_name,
        expectedDelivery: parsed.expected_delivery,
        lineCount: parsed.lines.length,
        linesSaved: lineRes.ok,
        message,
        linesTableMissing: lineRes.schemaLinesMissing,
      });
    }

    const { data: ins, error: insE } = await supabase
      .from("purchase_orders")
      .insert(row)
      .select("id")
      .single();

    if (insE) {
      if (/relation|does not exist|schema cache/i.test(insE.message)) {
        return NextResponse.json(
          { success: false, error: "Execute supabase-purchase-orders.sql no Supabase." },
          { status: 503 }
        );
      }
      if (insE.message.includes("unique") || insE.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Já existe um pedido de compra com este número." },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, error: insE.message }, { status: 500 });
    }

    const lineRes = await savePurchaseOrderLines(supabase, ins.id, parsed.lines);
    const finalNotes = buildFinalNotes(file.name, parsed, lineRes);
    await supabase
      .from("purchase_orders")
      .update({ notes: finalNotes, updated_at: new Date().toISOString() })
      .eq("id", ins.id);
    const message =
      lineRes.schemaLinesMissing
        ? "Execute supabase-purchase-order-lines.sql no Supabase, depois importe o PDF de novo."
        : !lineRes.ok
          ? lineRes.error
          : undefined;
    return NextResponse.json({
      success: true,
      savedToSupabase: true,
      purchaseOrderId: ins.id,
      number: parsed.number,
      updated: false,
      supplierName: parsed.supplier_name,
      expectedDelivery: parsed.expected_delivery,
      lineCount: parsed.lines.length,
      linesSaved: lineRes.ok,
      message,
      linesTableMissing: lineRes.schemaLinesMissing,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao processar PDF.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
