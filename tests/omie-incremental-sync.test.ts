import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isItemTouchedByOperator,
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
          productCode: "HF-1579",
        },
      ],
      "shadow"
    );
    assert.equal(plan.actions.length, 1);
    const action = plan.actions[0];
    assert.equal(action.type, "update");
    if (action.type === "update") {
      assert.equal(action.changes.length, 1);
      assert.equal(action.changes[0].field, "quantity");
      assert.equal(action.changes[0].from, 2);
      assert.equal(action.changes[0].to, 5);
    }
    assert.match(plan.shadowLogs[0], /preserva line_id/);
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
