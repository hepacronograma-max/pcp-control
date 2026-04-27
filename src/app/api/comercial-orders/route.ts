import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/supabase/resolve-primary-company";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

function canRoleViewComercial(role: string | null | undefined): boolean {
  return (
    role === "super_admin" ||
    role === "manager" ||
    role === "comercial"
  );
}

/**
 * Lista pedidos de venda com prazos para a área Comercial.
 * Inclui itens mínimos (para o mesmo “status” visual da lista de Pedidos) quando o schema permitir.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const param = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";
    const cookieStore = await cookies();
    const isLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";

    let companyId: string | null = null;
    let profileRole: string | null = null;

    if (!isLocalAuth) {
      const supabaseAuth = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "not authenticated" }, { status: 401 });
      }

      const { data: profile } = await supabaseAuth
        .from("profiles")
        .select("company_id, role")
        .eq("id", user.id)
        .single();
      profileRole = profile?.role ?? null;

      if (!canRoleViewComercial(profileRole)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      if (param && isUuid(param)) {
        const { data: row } = await supabase
          .from("companies")
          .select("id")
          .eq("id", param)
          .maybeSingle();
        if (row?.id) {
          if (profile?.role !== "super_admin" && param !== profile?.company_id) {
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
        } else {
          return NextResponse.json({ error: "no company" }, { status: 403 });
        }
      }
    } else {
      /** Login local (cookie): sem perfil Supabase — mesmo padrão que `company-data`. */
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
      return NextResponse.json({ orders: [] });
    }

    type ItemLite = {
      id: string;
      line_id: string | null;
      status: string;
      production_start: string | null;
      production_end: string | null;
      description: string | null;
    };

    type ComercialRow = {
      id: string;
      order_number: string;
      client_name: string | null;
      created_at: string;
      delivery_deadline: string | null;
      pcp_deadline: string | null;
      production_deadline: string | null;
      status: string;
      updated_at: string | null;
      items: ItemLite[];
    };

    /** Não incluir `updated_at` aqui: vários projetos antigos não têm a coluna em `orders` (erro PostgREST). */
    const selectWithItems = `
      id, order_number, client_name, created_at, delivery_deadline, pcp_deadline, production_deadline, status,
      items:order_items(id, line_id, status, production_start, production_end, description)
    `;

    const r1 = await supabase
      .from("orders")
      .select(selectWithItems)
      .eq("company_id", companyId)
      .order("delivery_deadline", { ascending: true, nullsFirst: false });

    /** Reatribuições com selects distintos — evita incompatibilidade de genérico PostgREST. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res: any = r1;
    if (res.error?.message &&
      /delivery_deadline|pcp_deadline|column|schema cache|does not exist/i.test(res.error.message)
    ) {
      res = await supabase
        .from("orders")
        .select(`
          id, order_number, client_name, created_at, status, production_deadline,
          items:order_items(id, line_id, status, production_start, production_end, description)
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
    }

    if (res.error) {
      res = await supabase
        .from("orders")
        .select(
          "id, order_number, client_name, created_at, delivery_deadline, pcp_deadline, production_deadline, status"
        )
        .eq("company_id", companyId)
        .order("delivery_deadline", { ascending: true, nullsFirst: false });
    }

    if (res.error?.message &&
      /delivery_deadline|pcp_deadline|column|schema cache|does not exist/i.test(res.error.message)
    ) {
      res = await supabase
        .from("orders")
        .select("id, order_number, client_name, created_at, status, production_deadline")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
    }

    if (res.error) {
      console.error("[comercial-orders]", res.error.message);
      return NextResponse.json({ error: res.error.message }, { status: 500 });
    }

    const raw = (res.data ?? []) as (Partial<ComercialRow> & { items?: ItemLite[] | null })[];
    const orders: ComercialRow[] = raw.map((o) => ({
      id: o.id as string,
      order_number: o.order_number as string,
      client_name: o.client_name ?? null,
      created_at: o.created_at as string,
      delivery_deadline: o.delivery_deadline ?? null,
      pcp_deadline: o.pcp_deadline ?? null,
      production_deadline: o.production_deadline ?? null,
      status: o.status as string,
      updated_at: (o.updated_at as string | null | undefined) ?? (o.created_at as string) ?? null,
      items: Array.isArray(o.items) ? o.items : [],
    }));

    return NextResponse.json({ orders });
  } catch (e) {
    console.error("[comercial-orders]", e);
    return NextResponse.json({ orders: [] }, { status: 200 });
  }
}
