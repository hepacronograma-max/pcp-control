import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABASTECIMENTO_DEFAULT_SORT,
  compareAbastecimentoItems,
  itemBelongsOnAbastecimentoBoard,
  matchesAbastecimentoFilter,
  nextAbastecimentoSortKeys,
  parseSupplyStatus,
  type AbastecimentoSortable,
} from "../src/lib/abastecimento";

describe("parseSupplyStatus", () => {
  it("aceita só partial e full", () => {
    assert.equal(parseSupplyStatus("partial"), "partial");
    assert.equal(parseSupplyStatus("full"), "full");
    assert.equal(parseSupplyStatus("pendente"), null);
    assert.equal(parseSupplyStatus(null), null);
  });
});

describe("itemBelongsOnAbastecimentoBoard", () => {
  it("inclui item de linha de produção em aberto", () => {
    assert.equal(
      itemBelongsOnAbastecimentoBoard({
        line: { name: "SOLDA", is_almoxarifado: false },
        orderStatus: "in_production",
        itemStatus: "scheduled",
      }),
      true
    );
  });

  it("exclui almox, logística avulsa, espelho, pedido finalizado e item concluído", () => {
    assert.equal(
      itemBelongsOnAbastecimentoBoard({
        line: { name: "Almoxarifado", is_almoxarifado: true },
        orderStatus: "in_production",
        itemStatus: "scheduled",
      }),
      false
    );
    assert.equal(
      itemBelongsOnAbastecimentoBoard({
        line: { name: "LOGISTICA" },
        orderStatus: "planning",
        itemStatus: "waiting",
      }),
      false
    );
    assert.equal(
      itemBelongsOnAbastecimentoBoard({
        line: { name: "SOLDA" },
        orderStatus: "in_production",
        itemStatus: "scheduled",
        notes: "almox-src:11111111-1111-4111-8111-111111111111",
      }),
      false
    );
    assert.equal(
      itemBelongsOnAbastecimentoBoard({
        line: { name: "SOLDA" },
        orderStatus: "finished",
        itemStatus: "scheduled",
      }),
      false
    );
    assert.equal(
      itemBelongsOnAbastecimentoBoard({
        line: { name: "SOLDA" },
        orderStatus: "in_production",
        itemStatus: "completed",
      }),
      false
    );
  });
});

function row(
  partial: Partial<AbastecimentoSortable> & Pick<AbastecimentoSortable, "order_number">
): AbastecimentoSortable {
  return {
    client_name: "",
    description: "",
    quantity: 1,
    pcp_deadline: null,
    production_start: null,
    production_end: null,
    ...partial,
  };
}

describe("compareAbastecimentoItems", () => {
  it("ordena por início, fim e pedido, com data vazia no fim", () => {
    const items = [
      row({ order_number: "261000", production_start: "2026-10-05", production_end: "2026-10-08" }),
      row({ order_number: "260100", production_start: null }),
      row({ order_number: "260200", production_start: "2026-09-18", production_end: "2026-09-20" }),
      row({ order_number: "260900", production_start: "2026-10-05", production_end: "2026-10-06" }),
    ];
    items.sort((a, b) => compareAbastecimentoItems(a, b, ABASTECIMENTO_DEFAULT_SORT));
    assert.deepEqual(
      items.map((i) => i.order_number),
      ["260200", "260900", "261000", "260100"]
    );
  });
});

describe("nextAbastecimentoSortKeys", () => {
  it("coloca a coluna clicada na frente e mantém até 3 chaves", () => {
    assert.deepEqual(
      nextAbastecimentoSortKeys(ABASTECIMENTO_DEFAULT_SORT, "order_number"),
      ["order_number", "production_start", "production_end"]
    );
  });
});

describe("matchesAbastecimentoFilter", () => {
  it("separa pendente, parcial e abastecido", () => {
    assert.equal(matchesAbastecimentoFilter(null, "pendentes"), true);
    assert.equal(matchesAbastecimentoFilter("partial", "pendentes"), false);
    assert.equal(matchesAbastecimentoFilter("partial", "parcial"), true);
    assert.equal(matchesAbastecimentoFilter("full", "abastecido"), true);
    assert.equal(matchesAbastecimentoFilter(null, "todos"), true);
  });
});
