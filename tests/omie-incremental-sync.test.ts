import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isItemTouchedByOperator,
  isOmieQuantityReliableForSync,
  isOrderClosedForOmieAdds,
  matchOmieToPcpItems,
  planItemSync,
  type PcpItemRow,
} from "../src/lib/omie/incremental-sync";

function basePcpItem(overrides: Partial<PcpItemRow> = {}): PcpItemRow {
  return {
    id: "item-1",
    order_id: "order-1",
    description: "Filtro HEPA",
    quantity: 2,
    product_code: "HF-1579",
    omie_codigo_item: 6935884757,
    omie_sync_flag: null,
    line_id: null,
    production_start: null,
    production_end: null,
    status: "waiting",
    completed_at: null,
    almox_supplied_at: null,
    ...overrides,
  };
}

describe("planItemSync — item novo", () => {
  it("detecta item Omie ausente no PCP", () => {
    const plan = planItemSync(
      [],
      [
        {
          omieCodigoItem: 111,
          description: "Item novo",
          quantity: 1,
          productCode: "HF-100",
        },
      ],
      "shadow"
    );
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].type, "add");
    assert.match(plan.shadowLogs[0], /criaria item/);
  });
});

describe("planItemSync — quantidade alterada", () => {
  it("atualiza qty e preserva line_id/producao (nao inclui no patch)", () => {
    const existing = basePcpItem({
      line_id: "line-a",
      production_start: "2026-06-01T10:00:00Z",
      quantity: 2,
    });
    const plan = planItemSync(
      [existing],
      [
        {
          omieCodigoItem: 6935884757,
          description: "Filtro HEPA",
          quantity: 5,
          omieQuantidadeBruta: 5,
          productCode: "HF-1579",
        },
      ],
      "shadow",
      { orderClosed: false }
    );
    const action = plan.actions.find((a) => a.type === "update");
    assert.ok(action && action.type === "update");
    const qtyCh = action.changes.find((c) => c.field === "quantity");
    assert.ok(qtyCh);
    assert.equal(qtyCh!.from, 2);
    assert.equal(qtyCh!.to, 5);
    assert.equal(plan.stats.itens_qty_atualizados, 1);
    assert.match(plan.shadowLogs.join("\n"), /preserva line_id/);
  });
});

describe("planItemSync — item removido nao tocado", () => {
  it("planeja delete quando line_id null e sem producao", () => {
    const existing = basePcpItem({ omie_codigo_item: 999 });
    const removedPlan = planItemSync([existing], [], "active");
    assert.equal(removedPlan.actions.length, 1);
    assert.equal(removedPlan.actions[0].type, "delete");
    assert.match(removedPlan.shadowLogs[0], /removeria item/);
  });
});

describe("planItemSync — item removido em producao", () => {
  it("marca removido_no_omie e NAO deleta", () => {
    const existing = basePcpItem({
      omie_codigo_item: 888,
      line_id: "linha-1",
      status: "in_progress",
    });
    assert.ok(isItemTouchedByOperator(existing));
    const plan = planItemSync([existing], [], "shadow");
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].type, "mark_removed");
    assert.match(plan.shadowLogs[0], /NAO deleta/);
  });

  it("considera tocado com production_start mesmo sem line_id", () => {
    const existing = basePcpItem({
      omie_codigo_item: 777,
      production_start: "2026-06-01T08:00:00Z",
    });
    assert.ok(isItemTouchedByOperator(existing));
    const plan = planItemSync([existing], [], "active");
    assert.equal(plan.actions[0].type, "mark_removed");
  });
});

describe("isItemTouchedByOperator", () => {
  it("nao tocado: waiting, sem line_id, sem datas", () => {
    assert.equal(isItemTouchedByOperator(basePcpItem()), false);
  });
});

describe("matchOmieToPcpItems — fallback product_code", () => {
  it("casa por chave forte quando omie_codigo_item ja existe no PCP", () => {
    const pcp = basePcpItem({ omie_codigo_item: 100 });
    const { pairs, unmatchedOmie, unmatchedPcp } = matchOmieToPcpItems(
      [pcp],
      [
        {
          omieCodigoItem: 100,
          description: "X",
          quantity: 2,
          productCode: "HF-1579",
        },
      ]
    );
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].matchKind, "strong_key");
    assert.equal(unmatchedOmie.length, 0);
    assert.equal(unmatchedPcp.length, 0);
  });

  it("fallback: idênticos (codigo+qty) depois ordem de aparição", () => {
    const pcpRows: PcpItemRow[] = [
      basePcpItem({
        id: "a",
        omie_codigo_item: null,
        product_code: "HF-A",
        quantity: 1,
      }),
      basePcpItem({
        id: "b",
        omie_codigo_item: null,
        product_code: "HF-A",
        quantity: 2,
      }),
      basePcpItem({
        id: "c",
        omie_codigo_item: null,
        product_code: "HF-B",
        quantity: 5,
      }),
    ];
    const omieItems = [
      {
        omieCodigoItem: 501,
        description: "A1",
        quantity: 1,
        productCode: "HF-A",
      },
      {
        omieCodigoItem: 502,
        description: "A2",
        quantity: 3,
        productCode: "HF-A",
      },
      {
        omieCodigoItem: 503,
        description: "B",
        quantity: 5,
        productCode: "HF-B",
      },
    ];
    const { pairs } = matchOmieToPcpItems(pcpRows, omieItems);
    const byPcp = new Map(pairs.map((p) => [p.pcp.id, p]));
    assert.equal(byPcp.get("a")?.matchKind, "fallback_identical");
    assert.equal(byPcp.get("a")?.omie.omieCodigoItem, 501);
    assert.equal(byPcp.get("c")?.matchKind, "fallback_identical");
    assert.equal(byPcp.get("b")?.matchKind, "fallback_order");
    assert.equal(byPcp.get("b")?.omie.omieCodigoItem, 502);
  });

  it("alerta excedente quando contagens divergem", () => {
    const pcpRows = [
      basePcpItem({
        id: "only",
        omie_codigo_item: null,
        product_code: "HF-X",
        quantity: 1,
      }),
    ];
    const omieItems = [
      {
        omieCodigoItem: 1,
        description: "X1",
        quantity: 1,
        productCode: "HF-X",
      },
      {
        omieCodigoItem: 2,
        description: "X2",
        quantity: 1,
        productCode: "HF-X",
      },
    ];
    const { pairs, unmatchedOmie, alerts } = matchOmieToPcpItems(pcpRows, omieItems);
    assert.equal(pairs.length, 1);
    assert.equal(unmatchedOmie.length, 1);
    assert.ok(alerts.some((a) => a.motivo.includes("Excedente Omie")));
  });
});

describe("planItemSync — fallback grava omie_codigo_item", () => {
  it("planeja setOmieCodigoItem em fallback sem alterar qty se igual", () => {
    const existing = basePcpItem({
      omie_codigo_item: null,
      product_code: "HF-24852",
      quantity: 4,
      status: "completed",
      completed_at: "2026-05-01T12:00:00Z",
    });
    const plan = planItemSync(
      [existing],
      [
        {
          omieCodigoItem: 999001,
          description: "Filtro",
          quantity: 4,
          productCode: "HF-24852",
        },
      ],
      "shadow"
    );
    const upd = plan.actions.find((a) => a.type === "update");
    assert.ok(upd && upd.type === "update");
    assert.equal(upd.setOmieCodigoItem, true);
    assert.equal(upd.matchKind, "fallback_identical");
    assert.equal(plan.stats.omie_codigo_item_preenchidos, 1);
    assert.equal(plan.stats.itens_adicionados, 0);
  });

  it("pedido finalizado: item Omie sem par só alerta", () => {
    const plan = planItemSync(
      [],
      [
        {
          omieCodigoItem: 777,
          description: "Novo",
          quantity: 1,
          productCode: "HF-N",
        },
      ],
      "shadow",
      { orderClosed: true, orderNumber: "260268" }
    );
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].type, "alert");
    assert.equal(plan.stats.itens_adicionados, 0);
    assert.equal(plan.stats.itens_alertados, 1);
  });
});

describe("isOrderClosedForOmieAdds", () => {
  it("fecha quando todos itens completed", () => {
    const items = [
      basePcpItem({ status: "completed" }),
      basePcpItem({ id: "i2", status: "completed" }),
    ];
    assert.equal(isOrderClosedForOmieAdds("imported", items), true);
  });
});

describe("política de quantidade no sync", () => {
  it("isOmieQuantityReliableForSync: 0 e ausente são não confiáveis", () => {
    assert.equal(isOmieQuantityReliableForSync(0), false);
    assert.equal(isOmieQuantityReliableForSync(null), false);
    assert.equal(isOmieQuantityReliableForSync(undefined), false);
    assert.equal(isOmieQuantityReliableForSync(9), true);
  });

  it("qty Omie=0 não vira update (não usa toQuantity 0→1)", () => {
    const existing = basePcpItem({
      omie_codigo_item: 100,
      quantity: 12,
      product_code: "HF-30537",
      status: "waiting",
    });
    const plan = planItemSync(
      [existing],
      [
        {
          omieCodigoItem: 100,
          description: "Filtro HEPA",
          quantity: 1,
          omieQuantidadeBruta: 0,
          productCode: "HF-1579",
        },
      ],
      "shadow",
      { orderClosed: false }
    );
    const upd = plan.actions.find((a) => a.type === "update");
    if (upd && upd.type === "update") {
      assert.equal(
        upd.changes.find((c) => c.field === "quantity"),
        undefined
      );
    }
    assert.equal(plan.stats.itens_qty_atualizados, 0);
    assert.equal(plan.stats.itens_qty_ignorados_nao_confiavel, 1);
  });

  it("pedido finalizado: divergência de qty gera alerta, não update de quantity", () => {
    const existing = basePcpItem({
      omie_codigo_item: 200,
      quantity: 12,
      product_code: "HF-30537",
      status: "completed",
      completed_at: "2026-05-01T12:00:00Z",
    });
    const plan = planItemSync(
      [existing],
      [
        {
          omieCodigoItem: 200,
          description: "Filtro HEPA",
          quantity: 1,
          omieQuantidadeBruta: 0,
          productCode: "HF-1579",
        },
      ],
      "shadow",
      { orderClosed: true, orderNumber: "260268" }
    );
    const upd = plan.actions.find((a) => a.type === "update");
    if (upd && upd.type === "update") {
      assert.equal(
        upd.changes.find((c) => c.field === "quantity"),
        undefined
      );
    }
    assert.equal(plan.stats.itens_qty_atualizados, 0);
    assert.equal(plan.stats.itens_qty_divergentes_alertados, 1);
    assert.ok(
      plan.stats.alertas.some((a) =>
        a.motivo.includes("diverge do PCP (12)")
      )
    );
  });

  it("pedido aberto: qty confiável e diferente atualiza", () => {
    const existing = basePcpItem({
      omie_codigo_item: 300,
      quantity: 2,
      status: "waiting",
    });
    const plan = planItemSync(
      [existing],
      [
        {
          omieCodigoItem: 300,
          description: "Filtro HEPA",
          quantity: 5,
          omieQuantidadeBruta: 5,
          productCode: "HF-1579",
        },
      ],
      "active",
      { orderClosed: false }
    );
    const upd = plan.actions.find((a) => a.type === "update");
    assert.ok(upd && upd.type === "update");
    assert.equal(upd.changes.find((c) => c.field === "quantity")?.to, 5);
    assert.equal(plan.stats.itens_qty_atualizados, 1);
  });
});
