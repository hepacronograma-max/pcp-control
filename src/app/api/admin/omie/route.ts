import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { hasPermission } from "@/lib/utils/permissions";
import type { UserRole } from "@/lib/types/database";
import { importarPedidosDaFabricacao } from "@/lib/omie/sync-service";
import { getOmieIntegrationMode } from "@/lib/omie/integration-mode";

async function requireManager() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  if (!role || !hasPermission(role, "viewSettings")) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }

  return { profile, admin: createSupabaseAdminClient() };
}

/** Mesma permissão do antigo "Importar PDFs" em /pedidos (gestor + PCP). */
async function requireOmieImport() {
  if (await hasServerLocalAuthCookie()) {
    return { admin: createSupabaseAdminClient() };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as UserRole | undefined;
  if (!role || !hasPermission(role, "importOrders")) {
    return {
      error: NextResponse.json(
        { error: "Sem permissão para importar pedidos do Omie" },
        { status: 403 }
      ),
    };
  }

  return { profile, admin: createSupabaseAdminClient() };
}

function startOfDayIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const gate = await requireManager();
  if ("error" in gate && gate.error) return gate.error;

  const admin = gate.admin!;

  const { data: links, error: linksErr } = await admin
    .from("omie_order_links")
    .select(
      "id, pcp_order_id, omie_codigo_pedido, omie_numero_pedido, omie_etapa, sync_status, last_synced_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (linksErr) {
    const missing = /relation|does not exist/i.test(linksErr.message);
    return NextResponse.json(
      {
        error: missing
          ? "Tabela omie_order_links ausente. Aplique supabase/migrations/20260604_omie_import.sql"
          : linksErr.message,
        links: [],
      },
      { status: missing ? 503 : 500 }
    );
  }

  const today = startOfDayIso(new Date());
  const yesterday = startOfDayIso(new Date(Date.now() - 86_400_000));
  const weekAgo = startOfDayIso(new Date(Date.now() - 7 * 86_400_000));

  const countByDay = (status?: string) => {
    const rows = links ?? [];
    const filt = status
      ? rows.filter((r) => r.sync_status === status)
      : rows;
    const todayN = filt.filter((r) =>
      String(r.created_at).startsWith(today)
    ).length;
    const yesterdayN = filt.filter((r) =>
      String(r.created_at).startsWith(yesterday)
    ).length;
    const weekN = filt.filter(
      (r) => String(r.created_at).slice(0, 10) >= weekAgo
    ).length;
    return { today: todayN, yesterday: yesterdayN, last7days: weekN };
  };

  const { data: lastAudit } = await admin
    .from("audit_log")
    .select("created_at, new_data")
    .eq("table_name", "omie_import")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: removedItems, error: removedErr } = await admin
    .from("order_items")
    .select(
      "id, description, quantity, product_code, omie_codigo_item, omie_sync_flag, order_id, orders(order_number, client_name)"
    )
    .eq("omie_sync_flag", "removido_no_omie")
    .order("id", { ascending: false })
    .limit(200);

  return NextResponse.json({
    mode: getOmieIntegrationMode(),
    links: links ?? [],
    metrics: {
      shadow_detected: countByDay("shadow_detected"),
      synced: countByDay("synced"),
      backfill_skipped: countByDay("backfill_skipped"),
      all: countByDay(),
    },
    removedInOmie: removedErr
      ? { error: removedErr.message, items: [] }
      : { items: removedItems ?? [] },
    lastImport: lastAudit
      ? {
          at: lastAudit.created_at,
          report: lastAudit.new_data,
        }
      : null,
  });
}

/** Importação sob demanda — etapa 20; gestor (admin) ou PCP (/pedidos). */
export async function POST() {
  const gate = await requireOmieImport();
  if ("error" in gate && gate.error) return gate.error;

  try {
    const report = await importarPedidosDaFabricacao();
    if (report.skipped_reason === "locked") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "locked",
        report,
      });
    }
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
