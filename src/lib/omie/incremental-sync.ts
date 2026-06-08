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
  line_id: string | null;
  production_start: string | null;
  production_end: string | null;
  status: ItemStatus | string | null;
  completed_at: string | null;
  almox_supplied_at?: string | null;
};

export type OmieMappedItem = PcpOrderImportDraft["items"][number];

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
      changes: ItemFieldChange[];
    }
  | { type: "delete"; omieCodigoItem: number; pcpItemId: string }
  | {
      type: "mark_removed";
      omieCodigoItem: number;
      pcpItemId: string;
      reason: "em_producao";
    };

export type ItemSyncPlan = {
  actions: PlannedItemAction[];
  shadowLogs: string[];
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

function normStr(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function normQty(v: number): number {
  return Number(v) || 0;
}

export function diffOmieItemFields(
  pcp: PcpItemRow,
  omie: OmieMappedItem
): ItemFieldChange[] {
  const changes: ItemFieldChange[] = [];
  const descP = normStr(pcp.description);
  const descO = normStr(omie.description);
  if (descP !== descO) {
    changes.push({ field: "description", from: descP, to: descO });
  }
  if (normQty(pcp.quantity) !== normQty(omie.quantity)) {
    changes.push({
      field: "quantity",
      from: pcp.quantity,
      to: omie.quantity,
    });
  }
  const codeP = normStr(pcp.product_code) || null;
  const codeO = normStr(omie.productCode) || null;
  if (codeP !== codeO) {
    changes.push({ field: "product_code", from: codeP, to: codeO });
  }
  return changes;
}

export function planItemSync(
  existingPcpItems: PcpItemRow[],
  omieItems: OmieMappedItem[],
  modo: "shadow" | "active"
): ItemSyncPlan {
  const actions: PlannedItemAction[] = [];
  const shadowLogs: string[] = [];

  const omieByKey = new Map<number, OmieMappedItem>();
  for (const item of omieItems) {
    if (item.omieCodigoItem == null) continue;
    omieByKey.set(item.omieCodigoItem, item);
  }

  const pcpByOmieKey = new Map<number, PcpItemRow>();
  for (const row of existingPcpItems) {
    if (row.omie_codigo_item != null) {
      pcpByOmieKey.set(row.omie_codigo_item, row);
    }
  }

  for (const [omieKey, omieItem] of omieByKey) {
    const existing = pcpByOmieKey.get(omieKey);
    if (!existing) {
      actions.push({ type: "add", omieCodigoItem: omieKey, item: omieItem });
      const msg = `[omie ${modo}] criaria item omie_codigo_item=${omieKey} (${omieItem.description})`;
      shadowLogs.push(msg);
      continue;
    }

    const changes = diffOmieItemFields(existing, omieItem);
    if (changes.length > 0) {
      actions.push({
        type: "update",
        omieCodigoItem: omieKey,
        pcpItemId: existing.id,
        changes,
      });
      const detail = changes
        .map((c) => `${c.field}: ${String(c.from)} → ${String(c.to)}`)
        .join("; ");
      shadowLogs.push(
        `[omie ${modo}] atualizaria item ${omieKey}: ${detail} (preserva line_id/producao)`
      );
    }
  }

  for (const [omieKey, pcpRow] of pcpByOmieKey) {
    if (omieByKey.has(omieKey)) continue;

    if (isItemTouchedByOperator(pcpRow)) {
      actions.push({
        type: "mark_removed",
        omieCodigoItem: omieKey,
        pcpItemId: pcpRow.id,
        reason: "em_producao",
      });
      shadowLogs.push(
        `[omie ${modo}] item ${omieKey} sumiu do Omie mas esta em producao — marcaria removido_no_omie (NAO deleta)`
      );
    } else {
      actions.push({
        type: "delete",
        omieCodigoItem: omieKey,
        pcpItemId: pcpRow.id,
      });
      shadowLogs.push(
        `[omie ${modo}] removeria item ${omieKey} (nao iniciado, line_id null)`
      );
    }
  }

  return { actions, shadowLogs };
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
