import {
  parseAlmoxSourceItemId,
  productionLineIsAlmoxarifado,
} from "@/lib/supabase/sync-almoxarifado-on-program";
import { productionLineNameIsStandaloneLogistica } from "@/lib/utils/nav-line-groups";

/** full = abastecido; partial = produção pode começar faltando peça. */
export type SupplyStatus = "partial" | "full";

export type AbastecimentoFilter = "todos" | "pendentes" | "parcial" | "abastecido";

export function parseSupplyStatus(raw: unknown): SupplyStatus | null {
  if (raw === "partial" || raw === "full") return raw;
  return null;
}

export function itemBelongsOnAbastecimentoBoard(input: {
  line: { name?: string | null; is_almoxarifado?: boolean | null } | null;
  orderStatus: string | null | undefined;
  itemStatus: string | null | undefined;
  notes?: string | null;
}): boolean {
  if (!input.line) return false;
  if (productionLineIsAlmoxarifado(input.line)) return false;
  if (productionLineNameIsStandaloneLogistica(input.line.name)) return false;
  if (parseAlmoxSourceItemId(input.notes)) return false;
  if (input.orderStatus === "finished") return false;
  if (input.itemStatus === "completed") return false;
  return true;
}

/** Mesmas chaves da tabela da linha de produção. */
export type AbastecimentoSortKey =
  | "order_number"
  | "client_name"
  | "description"
  | "quantity"
  | "pcp_deadline"
  | "production_start"
  | "production_end";

export const ABASTECIMENTO_DEFAULT_SORT: AbastecimentoSortKey[] = [
  "production_start",
  "production_end",
  "order_number",
];

export type AbastecimentoSortable = {
  order_number: string;
  client_name: string;
  description: string;
  quantity: number;
  pcp_deadline: string | null;
  production_start: string | null;
  production_end: string | null;
};

function sortValue(item: AbastecimentoSortable, key: AbastecimentoSortKey): string | number {
  switch (key) {
    case "order_number":
      return item.order_number;
    case "client_name":
      return item.client_name;
    case "description":
      return item.description;
    case "quantity":
      return item.quantity;
    case "pcp_deadline":
      return item.pcp_deadline || "";
    case "production_start":
      return item.production_start || "";
    case "production_end":
      return item.production_end || "";
  }
}

/** Datas vazias vão para o fim, como em `sortLineItemsByKeys`. */
export function compareAbastecimentoItems(
  a: AbastecimentoSortable,
  b: AbastecimentoSortable,
  sortKeys: AbastecimentoSortKey[]
): number {
  for (const key of sortKeys) {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === bv) continue;
    if (av === null || av === undefined || av === "") return 1;
    if (bv === null || bv === undefined || bv === "") return -1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    const as = String(av);
    const bs = String(bv);
    if (as < bs) return -1;
    if (as > bs) return 1;
  }
  return 0;
}

export function nextAbastecimentoSortKeys(
  current: AbastecimentoSortKey[],
  key: AbastecimentoSortKey
): AbastecimentoSortKey[] {
  const existingIndex = current.indexOf(key);
  if (existingIndex === 0) return current;
  if (existingIndex > 0) {
    const copy = [...current];
    copy.splice(existingIndex, 1);
    copy.unshift(key);
    return copy;
  }
  return [key, ...current].slice(0, 3);
}

export function matchesAbastecimentoFilter(
  status: SupplyStatus | null,
  filter: AbastecimentoFilter
): boolean {
  if (filter === "todos") return true;
  if (filter === "pendentes") return status == null;
  if (filter === "parcial") return status === "partial";
  return status === "full";
}
