import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * API de limpeza do banco Supabase.
 * Remove registros órfãos e lixo de teste.
 *
 * POST /api/cleanup
 * Query: ?dry_run=1 para apenas simular (não deletar)
 * Header: X-Cleanup-Key (opcional, use CLEANUP_SECRET no .env para proteger)
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.CLEANUP_SECRET?.trim();
    if (secret) {
      const key = request.headers.get("x-cleanup-key");
      if (key !== secret) {
        return NextResponse.json(
          { success: false, error: "Não autorizado." },
          { status: 401 }
        );
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const hasSupabase =
      supabaseUrl?.startsWith("http://") || supabaseUrl?.startsWith("https://");

    if (!hasSupabase) {
      return NextResponse.json(
        { success: false, error: "Supabase não configurado." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dry_run") === "1";

    const supabase = createSupabaseAdminClient();
    const report: string[] = [];
    let deletedCount = 0;

    // 1. order_items órfãos (order_id não existe em orders)
    const { data: allItems } = await supabase
      .from("order_items")
      .select("id, order_id");
    const { data: orderIds } = await supabase.from("orders").select("id");
    const validOrderIds = new Set((orderIds ?? []).map((o) => o.id));
    const orphanItems = (allItems ?? []).filter(
      (it) => !validOrderIds.has(it.order_id)
    );

    if (orphanItems.length > 0 && !dryRun) {
      for (const it of orphanItems) {
        await supabase.from("order_items").delete().eq("id", it.id);
        deletedCount++;
      }
      report.push(`Removidos ${orphanItems.length} itens órfãos (order inexistente)`);
    } else if (orphanItems.length > 0) {
      report.push(`[DRY RUN] Encontrados ${orphanItems.length} itens órfãos`);
    }

    // 2. Feriados duplicados (mesmo company_id + date) - mantém o mais antigo
    const { data: holidays } = await supabase
      .from("holidays")
      .select("id, company_id, date, created_at")
      .order("created_at", { ascending: true });

    const seen = new Map<string, string>();
    const dupHolidays: string[] = [];
    for (const h of holidays ?? []) {
      const key = `${h.company_id}:${h.date}`;
      if (seen.has(key)) {
        dupHolidays.push(h.id);
      } else {
        seen.set(key, h.id);
      }
    }

    if (dupHolidays.length > 0 && !dryRun) {
      for (const id of dupHolidays) {
        await supabase.from("holidays").delete().eq("id", id);
        deletedCount++;
      }
      report.push(`Removidos ${dupHolidays.length} feriados duplicados`);
    } else if (dupHolidays.length > 0) {
      report.push(`[DRY RUN] Encontrados ${dupHolidays.length} feriados duplicados`);
    }

    // 3. Orders vazios (sem itens) e status imported, criados há mais de 90 dias
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoff = ninetyDaysAgo.toISOString();

    const { data: oldOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "imported")
      .lt("created_at", cutoff);

    const emptyOldOrders: string[] = [];
    for (const o of oldOrders ?? []) {
      const { count } = await supabase
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", o.id);
      if (count === 0) {
        emptyOldOrders.push(o.id);
      }
    }

    if (emptyOldOrders.length > 0 && !dryRun) {
      for (const id of emptyOldOrders) {
        await supabase.from("orders").delete().eq("id", id);
        deletedCount++;
      }
      report.push(
        `Removidos ${emptyOldOrders.length} pedidos vazios (imported, >90 dias)`
      );
    } else if (emptyOldOrders.length > 0) {
      report.push(
        `[DRY RUN] Encontrados ${emptyOldOrders.length} pedidos vazios antigos`
      );
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      deleted_count: deletedCount,
      report,
    });
  } catch (err) {
    console.error("Erro na limpeza:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Erro ao executar limpeza.",
      },
      { status: 500 }
    );
  }
}
