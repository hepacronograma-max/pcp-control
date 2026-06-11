import type { ItemStatus } from "@/lib/types/database";
import type { PcpOrderImportDraft } from "./types";

export type PcpItemRow = {
  id: string;
  order_id: string;
  description: string;
  quantity: number;
  product_code: string | null;
  omie_codigo_item: number | null;
  omie_sync_flag: string | null;
  omie_sync_detail?: string | null;
  line_id: string | null;
  production_start: string | null;
  production_end: string | null;
  status: ItemStatus | string | null;
  completed_at: string | null;
  almox_supplied_at?: string | null;
};

export type OmieMappedItem = PcpOrderImportDraft["items"][number];

export type MatchKind = "strong_key" | "fallback_identical" | "fallback_order";

export type ItemFieldChange = {
  field: "description" | "quantity" | "product_code";
  from: string | number | null;
  to: string | number | null;
};

export type PlannedItemAction =
  | { type: "add"; omieCodigoItem: number; item: OmieMappedItem }
  | {
      type: "update";
      omieCodigoItem: number;
      pcpItemId: string;
      matchKind: MatchKind;
      changes: ItemFieldChange[];
      /** Fallback: grava omie_codigo_item na linha PCP (reconciliação). */
      setOmieCodigoItem: boolean;
    }
  | { type: "delete"; omieCodigoItem: number | null; pcpItemId: string }
  | {
      type: "mark_removed";
      omieCodigoItem: number | null;
      pcpItemId: string;
      reason: "em_producao";
    }
  | {
      type: "mark_divergent";
      omieCodigoItem: number | null;
      pcpItemId: string;
      motivo: string;
    }
  | {
      type: "alert";
      motivo: string;
      omieCodigoItem?: number;
      productCode?: string;
    };

export type ItemAlert = {
  motivo: string;
  omie_codigo_item?: number;
  product_code?: string;
};

export type PerOrderMatchStats = {
  total_itens_omie: number;
  total_itens_pcp: number;
  casados_chave_forte: number;
  casados_fallback_identico: number;
  casados_fallback_ordem: number;
  omie_codigo_item_preenchidos: number;
  itens_adicionados: number;
  itens_atualizados: number;
  itens_removidos: number;
  itens_marcados_removido_no_omie: number;
  itens_marcados_divergente_no_omie: number;
  itens_alertados: number;
  itens_qty_atualizados: number;
  itens_qty_divergentes_alertados: number;
  itens_qty_ignorados_nao_confiavel: number;
  alertas: ItemAlert[];
};

export type ItemSyncPlan = {
  actions: PlannedItemAction[];
  shadowLogs: string[];
  stats: PerOrderMatchStats;
};

export type PlanItemSyncOptions = {
  /** Pedido PCP finalizado — item Omie novo só alerta, não adiciona. */
  orderClosed?: boolean;
  orderNumber?: string;
};

/** Item já atribuído ao operador ou em/finalizado — nunca deletar. */
export function isItemTouchedByOperator(row: PcpItemRow): boolean {
  if (row.line_id) return true;
  if (row.production_start) return true;
  if (row.production_end) return true;
  if (row.completed_at) return true;
  if (row.almox_supplied_at) return true;
  const st = String(row.status ?? "waiting");
  if (st !== "waiting") return true;
  return false;
}

/** Item já saiu de waiting — sync Omie não sobrescreve campos operacionais. */
export function isItemStartedInPcp(row: PcpItemRow): boolean {
  return String(row.status ?? "waiting") !== "waiting";
}

/** Pedido fechado para inclusão de itens novos do Omie. */
export function isOrderClosedForOmieAdds(
  orderStatus: string | null | undefined,
  items: PcpItemRow[]
): boolean {
  if (orderStatus === "finished") return true;
  if (items.length > 0 && items.every((i) => String(i.status ?? "") === "completed")) {
    return true;
  }
  return false;
}

function normStr(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function normQty(v: number): number {
  return Number(v) || 0;
}

function normProductCode(v: string | null | undefined): string {
  return normStr(v).toUpperCase();
}

function emptyStats(
  omieCount: number,
  pcpCount: number
): PerOrderMatchStats {
  return {
    total_itens_omie: omieCount,
    total_itens_pcp: pcpCount,
    casados_chave_forte: 0,
    casados_fallback_identico: 0,
    casados_fallback_ordem: 0,
    omie_codigo_item_preenchidos: 0,
    itens_adicionados: 0,
    itens_atualizados: 0,
    itens_removidos: 0,
    itens_marcados_removido_no_omie: 0,
    itens_marcados_divergente_no_omie: 0,
    itens_alertados: 0,
    itens_qty_atualizados: 0,
    itens_qty_divergentes_alertados: 0,
    itens_qty_ignorados_nao_confiavel: 0,
    alertas: [],
  };
}

/**
 * det[].produto.quantidade no Omie reflete saldo PENDENTE em pedidos parciais
 * avançados, não a quantidade total do item no pedido (homologação: 260268).
 * Zero ou ausente = não confiável para sync incremental — não usar toQuantity().
 */
export function isOmieQuantityReliableForSync(
  raw: number | null | undefined
): boolean {
  if (raw == null) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}

function formatOmieQtyForAlert(raw: number | null | undefined): string {
  if (raw == null || Number.isNaN(Number(raw))) return "?";
  return String(Number(raw));
}

function pushAlert(
  actions: PlannedItemAction[],
  stats: PerOrderMatchStats,
  shadowLogs: string[],
  modo: "shadow" | "active",
  alert: ItemAlert
) {
  stats.itens_alertados += 1;
  stats.alertas.push(alert);
  actions.push({
    type: "alert",
    motivo: alert.motivo,
    omieCodigoItem: alert.omie_codigo_item,
    productCode: alert.product_code,
  });
  shadowLogs.push(`[omie ${modo}] ALERTA: ${alert.motivo}`);
}

/** Campos editáveis no sync, exceto quantity (política separada). */
export function diffOmieItemFieldsExcludingQty(
  pcp: PcpItemRow,
  omie: OmieMappedItem
): ItemFieldChange[] {
  const changes: ItemFieldChange[] = [];
  const descP = normStr(pcp.description);
  const descO = normStr(omie.description);
  if (descP !== descO) {
    changes.push({ field: "description", from: descP, to: descO });
  }
  const codeP = normStr(pcp.product_code) || null;
  const codeO = normStr(omie.productCode) || null;
  if (codeP !== codeO) {
    changes.push({ field: "product_code", from: codeP, to: codeO });
  }
  return changes;
}

export function diffOmieItemFields(
  pcp: PcpItemRow,
  omie: OmieMappedItem
): ItemFieldChange[] {
  const changes = diffOmieItemFieldsExcludingQty(pcp, omie);
  if (normQty(pcp.quantity) !== normQty(omie.quantity)) {
    changes.push({
      field: "quantity",
      from: pcp.quantity,
      to: omie.quantity,
    });
  }
  return changes;
}

function resolveQuantitySyncForPair(
  pair: { omie: OmieMappedItem; pcp: PcpItemRow },
  orderClosed: boolean,
  itemStarted: boolean,
  orderLabel: string
): {
  qtyChange: ItemFieldChange | null;
  qtyAlert: ItemAlert | null;
  qtyIgnoredUnreliable: boolean;
  qtyDivergentAlert: boolean;
  qtyWouldUpdate: boolean;
} {
  const raw = pair.omie.omieQuantidadeBruta;
  const reliable = isOmieQuantityReliableForSync(raw);
  const pcpQty = normQty(pair.pcp.quantity);
  const omieQty = reliable ? normQty(Number(raw)) : null;
  const code = pair.omie.productCode ?? pair.pcp.product_code ?? "?";
  const key = pair.omie.omieCodigoItem;
  const blockQtyWrite = orderClosed || itemStarted;
  const statusLabel = String(pair.pcp.status ?? "waiting");

  if (blockQtyWrite) {
    const omieDisplay = formatOmieQtyForAlert(raw);
    const context =
      orderClosed && itemStarted
        ? `pedido finalizado ${orderLabel}, item ${code} (${statusLabel})`
        : orderClosed
          ? `pedido finalizado ${orderLabel}, item ${code}`
          : `item ${code} (${statusLabel}) em produção/concluído no pedido ${orderLabel}`;
    if (reliable && omieQty !== pcpQty) {
      return {
        qtyChange: null,
        qtyAlert: {
          motivo: `qty Omie (${omieDisplay}) diverge do PCP (${pcpQty}) no ${context} — mediar com vendas/produção`,
          omie_codigo_item: key ?? undefined,
          product_code: code,
        },
        qtyIgnoredUnreliable: false,
        qtyDivergentAlert: true,
        qtyWouldUpdate: false,
      };
    }
    if (!reliable && pcpQty > 0) {
      return {
        qtyChange: null,
        qtyAlert: {
          motivo: `qty Omie não confiável (${omieDisplay}; saldo pendente) vs PCP (${pcpQty}) no ${context} — mediar com vendas/produção`,
          omie_codigo_item: key ?? undefined,
          product_code: code,
        },
        qtyIgnoredUnreliable: !orderClosed,
        qtyDivergentAlert: true,
        qtyWouldUpdate: false,
      };
    }
    return {
      qtyChange: null,
      qtyAlert: null,
      qtyIgnoredUnreliable: false,
      qtyDivergentAlert: false,
      qtyWouldUpdate: false,
    };
  }

  if (!reliable) {
    const alert: ItemAlert | null =
      pcpQty > 0
        ? {
            motivo: `qty Omie não confiável (${formatOmieQtyForAlert(raw)}; saldo pendente em pedido parcial) — não atualiza PCP (${pcpQty}) no item ${code}`,
            omie_codigo_item: key ?? undefined,
            product_code: code,
          }
        : null;
    return {
      qtyChange: null,
      qtyAlert: alert,
      qtyIgnoredUnreliable: true,
      qtyDivergentAlert: false,
      qtyWouldUpdate: false,
    };
  }

  if (omieQty !== pcpQty) {
    return {
      qtyChange: {
        field: "quantity",
        from: pcpQty,
        to: omieQty!,
      },
      qtyAlert: null,
      qtyIgnoredUnreliable: false,
      qtyDivergentAlert: false,
      qtyWouldUpdate: true,
    };
  }

  return {
    qtyChange: null,
    qtyAlert: null,
    qtyIgnoredUnreliable: false,
    qtyDivergentAlert: false,
    qtyWouldUpdate: false,
  };
}

type IndexedOmie = { item: OmieMappedItem; index: number };
type IndexedPcp = { row: PcpItemRow; index: number };
type ItemPair = {
  omie: OmieMappedItem;
  pcp: PcpItemRow;
  matchKind: MatchKind;
};

export function matchOmieToPcpItems(
  existingPcpItems: PcpItemRow[],
  omieItems: OmieMappedItem[]
): {
  pairs: ItemPair[];
  unmatchedOmie: OmieMappedItem[];
  unmatchedPcp: PcpItemRow[];
  alerts: ItemAlert[];
} {
  const pairs: ItemPair[] = [];
  const alerts: ItemAlert[] = [];

  const omieIndexed: IndexedOmie[] = omieItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.omieCodigoItem != null);

  const pcpIndexed: IndexedPcp[] = existingPcpItems.map((row, index) => ({
    row,
    index,
  }));

  const pcpByOmieKey = new Map<number, PcpItemRow>();
  for (const row of existingPcpItems) {
    if (row.omie_codigo_item != null) {
      pcpByOmieKey.set(row.omie_codigo_item, row);
    }
  }

  const matchedPcpIds = new Set<string>();
  const matchedOmieKeys = new Set<number>();

  const omieForFallback: OmieMappedItem[] = [];

  for (const { item: omie } of omieIndexed) {
    const key = omie.omieCodigoItem!;
    const pcp = pcpByOmieKey.get(key);
    if (pcp && !matchedPcpIds.has(pcp.id)) {
      pairs.push({ omie, pcp, matchKind: "strong_key" });
      matchedPcpIds.add(pcp.id);
      matchedOmieKeys.add(key);
    } else {
      omieForFallback.push(omie);
    }
  }

  const pcpForFallback: IndexedPcp[] = pcpIndexed.filter(
    ({ row }) => row.omie_codigo_item == null && !matchedPcpIds.has(row.id)
  );

  const omieForFallbackIndexed: IndexedOmie[] = omieForFallback.map((item) => ({
    item,
    index: omieItems.findIndex(
      (o) => o.omieCodigoItem === item.omieCodigoItem
    ),
  }));

  const codeGroups = new Set<string>();
  for (const { item } of omieForFallbackIndexed) {
    const c = normProductCode(item.productCode);
    if (c) codeGroups.add(c);
  }
  for (const { row } of pcpForFallback) {
    const c = normProductCode(row.product_code);
    if (c) codeGroups.add(c);
  }

  const matchedFallbackOmieKeys = new Set<number>();
  const matchedFallbackPcpIds = new Set<string>();

  for (const code of codeGroups) {
    const omieInGroup = omieForFallbackIndexed
      .filter(({ item }) => normProductCode(item.productCode) === code)
      .sort((a, b) => a.index - b.index);

    const pcpInGroup = pcpForFallback
      .filter(({ row }) => normProductCode(row.product_code) === code)
      .sort((a, b) => a.index - b.index);

    // Grupo inteiro sem par na outra ponta: deixa para unmatchedOmie/unmatchedPcp
    // (add/alert ou mark_removed) — evita alerta duplicado.
    if (omieInGroup.length === 0 || pcpInGroup.length === 0) {
      continue;
    }

    const localMatchedOmie = new Set<number>();
    const localMatchedPcp = new Set<string>();

    for (const o of omieInGroup) {
      if (localMatchedOmie.has(o.item.omieCodigoItem!)) continue;
      for (const p of pcpInGroup) {
        if (localMatchedPcp.has(p.row.id)) continue;
        if (normQty(o.item.quantity) === normQty(p.row.quantity)) {
          pairs.push({
            omie: o.item,
            pcp: p.row,
            matchKind: "fallback_identical",
          });
          localMatchedOmie.add(o.item.omieCodigoItem!);
          localMatchedPcp.add(p.row.id);
          matchedFallbackOmieKeys.add(o.item.omieCodigoItem!);
          matchedFallbackPcpIds.add(p.row.id);
          matchedPcpIds.add(p.row.id);
          matchedOmieKeys.add(o.item.omieCodigoItem!);
          break;
        }
      }
    }

    const remOmie = omieInGroup.filter(
      (o) => !localMatchedOmie.has(o.item.omieCodigoItem!)
    );
    const remPcp = pcpInGroup.filter((p) => !localMatchedPcp.has(p.row.id));
    const pairCount = Math.min(remOmie.length, remPcp.length);

    for (let i = 0; i < pairCount; i++) {
      const o = remOmie[i];
      const p = remPcp[i];
      pairs.push({
        omie: o.item,
        pcp: p.row,
        matchKind: "fallback_order",
      });
      matchedFallbackOmieKeys.add(o.item.omieCodigoItem!);
      matchedFallbackPcpIds.add(p.row.id);
      matchedPcpIds.add(p.row.id);
      matchedOmieKeys.add(o.item.omieCodigoItem!);
    }

    if (remOmie.length > pairCount) {
      const excess = remOmie.slice(pairCount);
      alerts.push({
        motivo: `Excedente Omie: ${excess.length} linha(s) codigo ${code} sem par PCP`,
        product_code: code,
      });
    }
    if (remPcp.length > pairCount) {
      const excess = remPcp.slice(pairCount);
      alerts.push({
        motivo: `Excedente PCP: ${excess.length} linha(s) codigo ${code} sem par Omie`,
        product_code: code,
      });
    }
  }

  const unmatchedOmie = omieForFallback.filter(
    (o) => o.omieCodigoItem != null && !matchedOmieKeys.has(o.omieCodigoItem)
  );

  const unmatchedPcp: PcpItemRow[] = [];

  for (const row of existingPcpItems) {
    if (matchedPcpIds.has(row.id)) continue;
    unmatchedPcp.push(row);
  }

  return { pairs, unmatchedOmie, unmatchedPcp, alerts };
}

function formatFieldChangeSummary(changes: ItemFieldChange[]): string {
  return changes
    .map((c) => `${c.field}: PCP ${String(c.from)} ≠ Omie ${String(c.to)}`)
    .join("; ");
}

function buildDivergenceMotivo(
  pair: ItemPair,
  changes: ItemFieldChange[],
  orderLabel: string
): string {
  const code = pair.omie.productCode ?? pair.pcp.product_code ?? "?";
  const statusLabel = String(pair.pcp.status ?? "waiting");
  const detail = formatFieldChangeSummary(changes);
  return `Omie diverge no pedido ${orderLabel}, item ${code} (${statusLabel}): ${detail} — mediar com vendas/produção`;
}

export function planItemSync(
  existingPcpItems: PcpItemRow[],
  omieItems: OmieMappedItem[],
  modo: "shadow" | "active",
  opts: PlanItemSyncOptions = {}
): ItemSyncPlan {
  const actions: PlannedItemAction[] = [];
  const shadowLogs: string[] = [];
  const stats = emptyStats(omieItems.length, existingPcpItems.length);
  const orderClosed = opts.orderClosed ?? false;
  const orderLabel = opts.orderNumber ?? "pedido";

  const { pairs, unmatchedOmie, unmatchedPcp, alerts: matchAlerts } =
    matchOmieToPcpItems(existingPcpItems, omieItems);

  for (const alert of matchAlerts) {
    stats.itens_alertados += 1;
    stats.alertas.push(alert);
    actions.push({
      type: "alert",
      motivo: alert.motivo,
      omieCodigoItem: alert.omie_codigo_item,
      productCode: alert.product_code,
    });
    shadowLogs.push(`[omie ${modo}] ALERTA: ${alert.motivo}`);
  }

  for (const pair of pairs) {
    const key = pair.omie.omieCodigoItem!;
    const setOmieCodigoItem =
      pair.matchKind !== "strong_key" && pair.pcp.omie_codigo_item == null;
    const itemStarted = isItemStartedInPcp(pair.pcp);

    if (pair.matchKind === "strong_key") stats.casados_chave_forte += 1;
    if (pair.matchKind === "fallback_identical") stats.casados_fallback_identico += 1;
    if (pair.matchKind === "fallback_order") stats.casados_fallback_ordem += 1;
    if (setOmieCodigoItem) stats.omie_codigo_item_preenchidos += 1;

    const qtySync = resolveQuantitySyncForPair(
      pair,
      orderClosed,
      itemStarted,
      orderLabel
    );
    if (qtySync.qtyIgnoredUnreliable) {
      stats.itens_qty_ignorados_nao_confiavel += 1;
    }
    if (qtySync.qtyDivergentAlert) {
      stats.itens_qty_divergentes_alertados += 1;
    }
    if (qtySync.qtyAlert && !itemStarted) {
      pushAlert(actions, stats, shadowLogs, modo, qtySync.qtyAlert);
    }

    const textChanges = diffOmieItemFieldsExcludingQty(pair.pcp, pair.omie);

    if (itemStarted) {
      const divergentChanges: ItemFieldChange[] = [...textChanges];
      const rawQty = pair.omie.omieQuantidadeBruta;
      if (
        isOmieQuantityReliableForSync(rawQty) &&
        normQty(pair.pcp.quantity) !== normQty(Number(rawQty))
      ) {
        divergentChanges.push({
          field: "quantity",
          from: pair.pcp.quantity,
          to: Number(rawQty),
        });
      }

      if (divergentChanges.length > 0 || qtySync.qtyAlert) {
        const motivo =
          divergentChanges.length > 0
            ? buildDivergenceMotivo(pair, divergentChanges, orderLabel)
            : qtySync.qtyAlert!.motivo;
        pushAlert(actions, stats, shadowLogs, modo, {
          motivo,
          omie_codigo_item: key,
          product_code: pair.omie.productCode ?? pair.pcp.product_code ?? undefined,
        });
        actions.push({
          type: "mark_divergent",
          omieCodigoItem: key,
          pcpItemId: pair.pcp.id,
          motivo,
        });
        stats.itens_marcados_divergente_no_omie += 1;
        shadowLogs.push(
          `[omie ${modo}] item ${key} em producao/concluido — divergencia Omie (NAO sobrescreve): ${motivo}`
        );
      }

      if (setOmieCodigoItem) {
        actions.push({
          type: "update",
          omieCodigoItem: key,
          pcpItemId: pair.pcp.id,
          matchKind: pair.matchKind,
          changes: [],
          setOmieCodigoItem: true,
        });
        stats.itens_atualizados += 1;
        shadowLogs.push(
          `[omie ${modo}] reconciliaria omie_codigo_item ${key} na linha ${pair.pcp.id} (sem alterar dados operacionais)`
        );
      }
      continue;
    }

    const operationalChanges: ItemFieldChange[] = [...textChanges];
    if (qtySync.qtyChange) {
      operationalChanges.push(qtySync.qtyChange);
      stats.itens_qty_atualizados += 1;
    }

    const changes = operationalChanges;

    if (changes.length > 0 || setOmieCodigoItem) {
      actions.push({
        type: "update",
        omieCodigoItem: key,
        pcpItemId: pair.pcp.id,
        matchKind: pair.matchKind,
        changes,
        setOmieCodigoItem,
      });
      stats.itens_atualizados += 1;

      const detail = [
        setOmieCodigoItem ? `omie_codigo_item: null → ${key}` : null,
        ...changes.map(
          (c) => `${c.field}: ${String(c.from)} → ${String(c.to)}`
        ),
      ]
        .filter(Boolean)
        .join("; ");

      shadowLogs.push(
        `[omie ${modo}] atualizaria item ${key} (${pair.matchKind}): ${detail} (Omie fonte da verdade — item waiting)`
      );
    }
  }

  for (const omieItem of unmatchedOmie) {
    const key = omieItem.omieCodigoItem!;
    if (orderClosed) {
      const motivo = `Omie tem item novo em pedido finalizado ${orderLabel} (omie_codigo_item=${key}, codigo=${omieItem.productCode ?? "?"}) — revisar manualmente`;
      stats.itens_alertados += 1;
      stats.alertas.push({
        motivo,
        omie_codigo_item: key,
        product_code: omieItem.productCode ?? undefined,
      });
      actions.push({
        type: "alert",
        motivo,
        omieCodigoItem: key,
        productCode: omieItem.productCode ?? undefined,
      });
      shadowLogs.push(`[omie ${modo}] ALERTA: ${motivo}`);
    } else {
      actions.push({ type: "add", omieCodigoItem: key, item: omieItem });
      stats.itens_adicionados += 1;
      shadowLogs.push(
        `[omie ${modo}] criaria item omie_codigo_item=${key} (${omieItem.description})`
      );
    }
  }

  for (const pcpRow of unmatchedPcp) {
    const omieKey = pcpRow.omie_codigo_item;

    if (isItemTouchedByOperator(pcpRow)) {
      const motivo = `Item sumiu no Omie mas permanece no PCP (em produção) — mediar com vendas/produção`;
      actions.push({
        type: "mark_removed",
        omieCodigoItem: omieKey,
        pcpItemId: pcpRow.id,
        reason: "em_producao",
      });
      stats.itens_marcados_removido_no_omie += 1;
      pushAlert(actions, stats, shadowLogs, modo, {
        motivo,
        omie_codigo_item: omieKey ?? undefined,
        product_code: pcpRow.product_code ?? undefined,
      });
      shadowLogs.push(
        `[omie ${modo}] item ${omieKey ?? pcpRow.id} sumiu do Omie mas esta em producao — marcaria removido_no_omie (NAO deleta)`
      );
    } else {
      actions.push({
        type: "delete",
        omieCodigoItem: omieKey,
        pcpItemId: pcpRow.id,
      });
      stats.itens_removidos += 1;
      shadowLogs.push(
        `[omie ${modo}] removeria item ${omieKey ?? pcpRow.id} (nao iniciado, line_id null)`
      );
    }
  }

  return { actions, shadowLogs, stats };
}

export type OrderHeaderPatch = {
  client_name?: string;
  delivery_deadline?: string | null;
};

export function diffOrderHeader(
  order: { client_name: string; delivery_deadline: string | null },
  draft: Pick<PcpOrderImportDraft, "clientName" | "deliveryDeadline">
): OrderHeaderPatch | null {
  const patch: OrderHeaderPatch = {};
  const clientDraft = normStr(draft.clientName);
  if (normStr(order.client_name) !== clientDraft) {
    patch.client_name = clientDraft;
  }
  const dlOrder = order.delivery_deadline?.slice(0, 10) ?? null;
  const dlDraft = draft.deliveryDeadline?.slice(0, 10) ?? null;
  if (dlOrder !== dlDraft) {
    patch.delivery_deadline = dlDraft;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
