import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sincronizarItensDoPedido } from "../src/lib/omie/sync-service";
import type { PcpOrderImportDraft } from "../src/lib/omie/types";

type Row = Record<string, unknown>;

function createMockSupabase(initial: { orderItems: Row[]; orders?: Row }) {
  const orderItems = [...initial.orderItems];
  let orders = initial.orders ?? {
    client_name: "Cliente A",
    delivery_deadline: "2026-06-15",
  };

  const supabase = {
    from(table: string) {
      if (table === "order_items") {
        return {
          select: () => ({
            eq: async (_col: string, orderId: unknown) => ({
              data: orderItems.filter((r) => r.order_id === orderId),
              error: null,
            }),
          }),
          insert: async (row: Row | Row[]) => {
            const rows = Array.isArray(row) ? row : [row];
            for (const r of rows) {
              orderItems.push({ id: `new-${orderItems.length}`, ...r });
            }
            return { error: null };
          },
          update: (patch: Row) => ({
            eq: async (_col: string, id: unknown) => {
              const idx = orderItems.findIndex((r) => r.id === id);
              if (idx >= 0) orderItems[idx] = { ...orderItems[idx], ...patch };
              return { error: null };
            },
          }),
          delete: () => ({
            eq: async (_col: string, id: unknown) => {
              const idx = orderItems.findIndex((r) => r.id === id);
              if (idx >= 0) orderItems.splice(idx, 1);
              return { error: null };
            },
          }),
        };
      }
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: orders, error: null }),
            }),
          }),
          update: (patch: Row) => ({
            eq: async () => {
              orders = { ...orders, ...patch };
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`tabela mock nao suportada: ${table}`);
    },
  };

  return {
    supabase: supabase as unknown as Parameters<typeof sincronizarItensDoPedido>[0],
    getOrderItems: () => orderItems,
  };
}

const draftBase = (): PcpOrderImportDraft => ({
  companyId: "co",
  orderNumber: "260161/1",
  clientName: "Cliente B",
  deliveryDeadline: "2026-06-20",
  status: "imported",
  items: [],
});

describe("sincronizarItensDoPedido — active", () => {
  it("insere item novo com omie_codigo_item", async () => {
    const { supabase, getOrderItems } = createMockSupabase({
      orderItems: [],
    });
    const draft = draftBase();
    draft.items = [
      {
        omieCodigoItem: 100,
        description: "Novo",
        quantity: 1,
        productCode: "HF-1",
      },
    ];
    const counters = await sincronizarItensDoPedido(supabase, {
      pcpOrderId: "order-1",
      omieCodigoPedido: 123,
      draft,
      modo: "active",
      shadowLogs: [],
    });
    assert.equal(counters.itens_adicionados, 1);
    assert.equal(getOrderItems().length, 1);
    assert.equal(getOrderItems()[0].omie_codigo_item, 100);
  });

  it("marca removido_no_omie quando item em producao sumiu do Omie", async () => {
    const { supabase, getOrderItems } = createMockSupabase({
      orderItems: [
        {
          id: "pcp-1",
          order_id: "order-1",
          description: "Em producao",
          quantity: 1,
          product_code: "HF-9",
          omie_codigo_item: 200,
          line_id: "linha-x",
          production_start: null,
          production_end: null,
          status: "in_progress",
          completed_at: null,
          almox_supplied_at: null,
          omie_sync_flag: null,
        },
      ],
    });
    const draft = draftBase();
    draft.items = [];

    const counters = await sincronizarItensDoPedido(supabase, {
      pcpOrderId: "order-1",
      omieCodigoPedido: 123,
      draft,
      modo: "active",
      shadowLogs: [],
    });

    assert.equal(counters.itens_marcados_removido_no_omie, 1);
    assert.equal(getOrderItems().length, 1);
    assert.equal(getOrderItems()[0].omie_sync_flag, "removido_no_omie");
  });

  it("remove item nao tocado ausente no Omie", async () => {
    const { supabase, getOrderItems } = createMockSupabase({
      orderItems: [
        {
          id: "pcp-2",
          order_id: "order-1",
          description: "Aguardando",
          quantity: 1,
          product_code: "HF-2",
          omie_codigo_item: 300,
          line_id: null,
          production_start: null,
          production_end: null,
          status: "waiting",
          completed_at: null,
          almox_supplied_at: null,
          omie_sync_flag: null,
        },
      ],
    });
    const draft = draftBase();
    draft.items = [];

    const counters = await sincronizarItensDoPedido(supabase, {
      pcpOrderId: "order-1",
      omieCodigoPedido: 123,
      draft,
      modo: "active",
      shadowLogs: [],
    });

    assert.equal(counters.itens_removidos, 1);
    assert.equal(getOrderItems().length, 0);
  });
});
