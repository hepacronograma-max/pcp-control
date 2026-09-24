import { hasServerLocalAuthCookie } from "@/lib/server-local-auth";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";
import { itemNeedsProductionProgram } from "@/lib/utils/line-program-indicator";
import { foldStandaloneLogisticaIntoAlmox } from "@/lib/supabase/fold-logistica-into-almox";
import { productionLineNameIsStandaloneLogistica } from "@/lib/utils/nav-line-groups";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

// Cache em memória por instância do servidor para o modo `lite`.
// O menu lateral é atualizado a cada 60s + no focus; o TTL curto evita
// uma nova ida ao banco quando o usuário navega entre páginas ou quando
// múltiplos componentes fazem o fetch ao mesmo tempo.
type LiteCacheEntry = {
  expiresAt: number;
  payload: {
    companyId: string;
    company: { id: string; name: string; logo_url: string | null };
    orders: [];
    lines: Record<string, unknown>[];
    unprogrammedByLine: Record<string, number>;
  };
};
const LITE_CACHE_TTL_MS = 25_000;
const liteCache = new Map<string, LiteCacheEntry>();
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/** Limpa a entrada do cache para um companyId — usado por endpoints que alteram dados. */
export function invalidateCompanyLiteCache(companyId: string) {
  liteCache.delete(companyId);
}

async function loadNormalizedProductionLines(
  supabase: SupabaseClient,
  companyId: string
): Promise<Record<string, unknown>[]> {
  // Não pede `created_at`/`updated_at` porque essas colunas não existem na
  // tabela `production_lines` do cliente — antes cada chamada gastava 2
  // round-trips falhando até cair no fallback mínimo.
  const linesFull = await supabase
    .from("production_lines")
    .select(
      "id, name, company_id, is_active, sort_order, is_almoxarifado"
    )
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  let rawLines: Record<string, unknown>[] = (linesFull.data ?? []) as Record<
    string,
    unknown
  >[];
  if (linesFull.error) {
    console.warn("[company-data] linhas (completo):", linesFull.error.message);
    const linesMid = await supabase
      .from("production_lines")
      .select("id, name, company_id, is_active, sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true });
    if (!linesMid.error && linesMid.data) {
      rawLines = linesMid.data as Record<string, unknown>[];
    } else if (linesMid.error) {
      console.warn("[company-data] linhas (médio):", linesMid.error.message);
      const linesMin = await supabase
        .from("production_lines")
        .select("id, name, company_id")
        .eq("company_id", companyId);
      if (!linesMin.error && linesMin.data) {
        rawLines = linesMin.data as Record<string, unknown>[];
      } else if (linesMin.error) {
        console.error("[company-data] linhas (mínimo):", linesMin.error.message);
        rawLines = [];
      }
    }
  }

  const lines: Record<string, unknown>[] = [...rawLines].map((row, i) => ({
    ...row,
    is_active: row.is_active !== false,
    is_almoxarifado: row.is_almoxarifado === true,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : i,
  }));
  lines.sort((a, b) => {
    const sa = a.sort_order as number;
    const sb = b.sort_order as number;
    if (sa !== sb) return sa - sb;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
  return lines.filter(
    (l) => !productionLineNameIsStandaloneLogistica(String(l.name ?? ""))
  );
}

/** Contagem leve para o menu lateral (sem carregar todos os pedidos).
 *  Filtra por company_id via join com orders numa única query, evitando
 *  o round-trip para buscar ids + N queries chunked.
 */
async function unprogrammedByLineFromDb(
  supabase: SupabaseClient,
  companyId: string
): Promise<Record<string, number>> {
  const { data: items } = await supabase
    .from("order_items")
    .select(
      "line_id, status, production_start, production_end, orders!inner(company_id)"
    )
    .eq("orders.company_id", companyId)
    .not("line_id", "is", null)
    .neq("status", "completed");

  const unprogrammedByLine: Record<string, number> = {};
  for (const it of items ?? []) {
    if (!itemNeedsProductionProgram(it)) continue;
    const lid = it.line_id as string | null;
    if (!lid) continue;
    unprogrammedByLine[lid] = (unprogrammedByLine[lid] ?? 0) + 1;
  }
  return unprogrammedByLine;
}

/**
 * Retorna pedidos (com itens), linhas e dados da empresa.
 * Usa service role para bypassar RLS - garante que o backup apareça.
 *
 * Query opcional: `?companyId=<uuid>` — deve ser o mesmo retornado por /api/effective-company
 * (login local + produção), para não misturar tenant quando há mais de uma empresa.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const param = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";

    const isLocalAuth = await hasServerLocalAuthCookie();

    let companyId: string | null = null;

    if (!isLocalAuth) {
      const supabaseAuth = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: "not authenticated" },
          { status: 401 }
        );
      }

      const { data: profile } = await supabaseAuth
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .single();

      if (param && isUuid(param)) {
        const { data: row } = await supabase
          .from("companies")
          .select("id")
          .eq("id", param)
          .maybeSingle();
        if (row?.id) {
          if (
            profile?.role !== "super_admin" &&
            param !== profile?.company_id
          ) {
            return NextResponse.json({ error: "forbidden" }, { status: 403 });
          }
          companyId = row.id;
        }
      }

      if (!companyId) {
        if (profile?.company_id) {
          companyId = profile.company_id;
        } else if (profile?.role === "super_admin") {
          companyId = await resolvePrimaryCompanyId(supabase);
          if (!companyId) {
            const { data: anyCompany } = await supabase
              .from("companies")
              .select("id")
              .limit(1)
              .maybeSingle();
            companyId = anyCompany?.id ?? null;
          }
        } else {
          return NextResponse.json({ error: "no company" }, { status: 403 });
        }
      }
    } else {
      if (param && isUuid(param)) {
        const { data: row } = await supabase
          .from("companies")
          .select("id")
          .eq("id", param)
          .maybeSingle();
        if (row?.id) companyId = row.id;
      }

      if (!companyId) {
        companyId = await resolvePrimaryCompanyId(supabase);
      }
      if (!companyId) {
        const { data: anyCompany } = await supabase
          .from("companies")
          .select("id")
          .limit(1)
          .maybeSingle();
        companyId = anyCompany?.id ?? null;
      }
    }
    if (!companyId) {
      return NextResponse.json({
        companyId: null,
        company: null,
        orders: [],
        lines: [],
        unprogrammedByLine: {},
      });
    }

    const lite = request.nextUrl.searchParams.get("lite") === "1";
    if (lite) {
      const cached = liteCache.get(companyId);
      if (cached && cached.expiresAt > Date.now()) {
        return NextResponse.json(cached.payload, NO_STORE);
      }
    }

    const folded = await foldStandaloneLogisticaIntoAlmox(supabase, companyId);
    if (folded.folded) {
      invalidateCompanyLiteCache(companyId);
    }

    const { data: company } = await supabase
      .from("companies")
      .select("id, name, logo_url")
      .eq("id", companyId)
      .maybeSingle();

    const companyPayload = company
      ? {
          id: company.id,
          name: company.name ?? "",
          logo_url: company.logo_url,
        }
      : { id: companyId, name: "Empresa", logo_url: null };

    if (lite) {
      const cached = liteCache.get(companyId);
      const now = Date.now();
      if (cached && cached.expiresAt > now) {
        return NextResponse.json(cached.payload, NO_STORE);
      }

      // Queries independentes em paralelo reduzem o tempo de resposta pela metade.
      const [lines, unprogrammedByLine] = await Promise.all([
        loadNormalizedProductionLines(supabase, companyId),
        unprogrammedByLineFromDb(supabase, companyId),
      ]);
      const payload = {
        companyId,
        company: companyPayload,
        orders: [] as [],
        lines,
        unprogrammedByLine,
      };
      liteCache.set(companyId, {
        expiresAt: now + LITE_CACHE_TTL_MS,
        payload,
      });
      return NextResponse.json(payload, NO_STORE);
    }

    // Modo completo: pedidos (opcionalmente só abertos/finalizados) + linhas.
    const scopeParam = request.nextUrl.searchParams.get("ordersScope")?.toLowerCase();
    const ordersScope =
      scopeParam === "open" || scopeParam === "finished" ? scopeParam : "all";

    const selectWithLine = `
          *,
          items:order_items(
            *,
            production_line:production_lines(id, name)
          )
        `;
    const selectPlain = `
            *,
            items:order_items(*)
          `;

    const ordersQuery = (select: string, orderCol: "delivery_deadline" | "id") => {
      let q = supabase
        .from("orders")
        .select(select)
        .eq("company_id", companyId);
      if (ordersScope === "open") q = q.neq("status", "finished");
      if (ordersScope === "finished") q = q.eq("status", "finished");
      return q.order(orderCol, { ascending: true });
    };

    const ordersPromise = (async () => {
      let res = await ordersQuery(selectWithLine, "delivery_deadline");

      if (res.error?.message?.includes("delivery_deadline")) {
        res = await ordersQuery(selectWithLine, "id");
      }

      if (res.error) {
        console.warn(
          "[company-data] select com production_line falhou:",
          res.error.message
        );
        res = await ordersQuery(selectPlain, "delivery_deadline");
      }
      if (res.error?.message?.includes("delivery_deadline")) {
        res = await ordersQuery(selectPlain, "id");
      }
      if (res.error) {
        console.error(
          "[company-data] falha ao carregar pedidos após fallbacks:",
          res.error.message
        );
      }
      return res.data ?? [];
    })();

    const openCountPromise = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .neq("status", "finished");
    const finishedCountPromise = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "finished");

    const [orders, lines, openCountRes, finishedCountRes] = await Promise.all([
      ordersPromise,
      loadNormalizedProductionLines(supabase, companyId),
      openCountPromise,
      finishedCountPromise,
    ]);

    const unprogrammedByLine: Record<string, number> = {};
    for (const o of orders) {
      const items =
        (o as {
          items?: {
            line_id: string | null;
            status: string;
            production_start: string | null;
            production_end?: string | null;
          }[];
        }).items ?? [];
      for (const it of items) {
        if (!itemNeedsProductionProgram(it)) continue;
        unprogrammedByLine[it.line_id!] = (unprogrammedByLine[it.line_id!] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      companyId,
      company: companyPayload,
      orders,
      lines,
      unprogrammedByLine,
      openCount: openCountRes.count ?? orders.filter((o) => (o as { status?: string }).status !== "finished").length,
      finishedCount: finishedCountRes.count ?? orders.filter((o) => (o as { status?: string }).status === "finished").length,
    }, NO_STORE);
  } catch {
    return NextResponse.json(
      { companyId: null, company: null, orders: [], lines: [], unprogrammedByLine: {} },
      { status: 200 }
    );
  }
}
