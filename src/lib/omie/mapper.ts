import type { SupabaseClient } from "@supabase/supabase-js";
import type { OmiePedidoCompleto, PcpOrderDraft } from "./types";

export interface LineRoutingRule {
  id: number;
  priority: number;
  match_type: "prefix" | "contains" | "exact" | "regex";
  match_value: string;
  production_line_name: string;
}

const FALLBACK_LINE = "ALMOXARIFADO";

export async function loadLineRoutingRules(
  supabase: SupabaseClient,
  companyId: string
): Promise<LineRoutingRule[]> {
  const { data, error } = await supabase
    .from("line_routing_rules")
    .select("id, priority, match_type, match_value, production_line_name")
    .eq("is_active", true)
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .order("priority", { ascending: true });

  if (error) {
    console.warn("[omie] line_routing_rules:", error.message);
    return getDefaultRules();
  }
  if (!data?.length) return getDefaultRules();
  return data as LineRoutingRule[];
}

export function getDefaultRules(): LineRoutingRule[] {
  return [
    { id: 0, priority: 10, match_type: "prefix", match_value: "HF-FFP", production_line_name: "ABSOLUTO / FINO" },
    { id: 0, priority: 20, match_type: "prefix", match_value: "HF-BSF", production_line_name: "MULTIBOLSA" },
    { id: 0, priority: 30, match_type: "prefix", match_value: "HF-PL", production_line_name: "CARTONADO GP/PL" },
    { id: 0, priority: 31, match_type: "prefix", match_value: "HF-GP", production_line_name: "CARTONADO GP/PL" },
    { id: 0, priority: 40, match_type: "exact", match_value: "HF-MS", production_line_name: "LOGISTICA" },
    { id: 0, priority: 41, match_type: "contains", match_value: "MANTA", production_line_name: "LOGISTICA" },
  ];
}

export function resolveLineName(
  productCode: string,
  description: string,
  rules: LineRoutingRule[]
): string {
  const code = (productCode || "").trim().toUpperCase();
  const desc = (description || "").trim().toUpperCase();
  const haystack = `${code} ${desc}`.trim();

  for (const rule of rules) {
    const val = rule.match_value.trim().toUpperCase();
    if (!val && rule.production_line_name === FALLBACK_LINE) continue;
    switch (rule.match_type) {
      case "prefix":
        if (code.startsWith(val) || haystack.startsWith(val)) {
          return rule.production_line_name;
        }
        break;
      case "contains":
        if (haystack.includes(val)) return rule.production_line_name;
        break;
      case "exact":
        if (code === val) return rule.production_line_name;
        break;
      case "regex":
        try {
          if (new RegExp(val, "i").test(code) || new RegExp(val, "i").test(desc)) {
            return rule.production_line_name;
          }
        } catch {
          /* ignore invalid regex */
        }
        break;
    }
  }
  return FALLBACK_LINE;
}

function brDateToIso(d?: string | null): string | null {
  if (!d || !d.trim()) return null;
  const t = d.trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}

export function mapOmieOrderToPcp(
  omie: OmiePedidoCompleto,
  opts: {
    companyId: string;
    clientName: string;
    rules: LineRoutingRule[];
  }
): PcpOrderDraft {
  const cab = omie.cabecalho ?? {};
  const codigo = cab.codigo_pedido;
  if (!codigo) {
    throw new Error("Pedido Omie sem codigo_pedido");
  }

  const orderNumber = String(
    cab.numero_pedido ?? cab.codigo_pedido_integracao ?? codigo
  ).trim();

  const items = (omie.det ?? []).map((det, idx) => {
    const p = det.produto ?? {};
    const code = String(p.codigo_produto ?? det.ide?.codigo_item_integracao ?? "").trim();
    const description = String(p.descricao ?? `Item ${idx + 1}`).trim();
    const qty = Number(p.quantidade ?? 1);
    return {
      description: description.slice(0, 500),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      productCode: code || null,
      lineName: resolveLineName(code, description, opts.rules),
    };
  });

  return {
    companyId: opts.companyId,
    orderNumber: orderNumber.slice(0, 50),
    clientName: opts.clientName.slice(0, 255) || "Cliente Omie",
    deliveryDeadline: brDateToIso(cab.data_previsao),
    status: "imported",
    items,
  };
}
