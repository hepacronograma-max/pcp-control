import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignableProductionLines,
  bucketLinesForSidebar,
  navLineIsRedundantLogisticaMenuItem,
} from "../src/lib/utils/nav-line-groups";
import type { ProductionLine } from "../src/lib/types/database";

function line(
  name: string,
  sort_order: number,
  extra?: Partial<ProductionLine>
): ProductionLine {
  return {
    id: name.toLowerCase(),
    company_id: "c1",
    name,
    sort_order,
    is_active: true,
    is_almoxarifado: false,
    created_at: "",
    updated_at: "",
    ...extra,
  } as ProductionLine;
}

describe("navLineIsRedundantLogisticaMenuItem", () => {
  it("reconhece a linha cujo nome só é LOGISTICA", () => {
    assert.equal(navLineIsRedundantLogisticaMenuItem(line("LOGISTICA", 5)), true);
    assert.equal(navLineIsRedundantLogisticaMenuItem(line("Logística", 5)), true);
    assert.equal(
      navLineIsRedundantLogisticaMenuItem(line("Almoxarifado", 6, { is_almoxarifado: true })),
      false
    );
  });
});

describe("assignableProductionLines", () => {
  it("exclui LOGISTICA e linhas inativas da seleção de Pedidos", () => {
    const out = assignableProductionLines([
      line("Solda", 1),
      line("LOGISTICA", 5),
      line("Almoxarifado", 6, { is_almoxarifado: true }),
      line("Inativa", 2, { is_active: false }),
    ]);
    assert.equal(out.some((l) => l.name === "LOGISTICA"), false);
    assert.equal(out.some((l) => l.name === "Solda"), true);
    assert.equal(out.some((l) => l.name === "Almoxarifado"), true);
    assert.equal(out.some((l) => l.name === "Inativa"), false);
  });
});

describe("bucketLinesForSidebar", () => {
  it("não lista a linha LOGISTICA no menu; mantém Almoxarifado", () => {
    const { producao, logistica } = bucketLinesForSidebar([
      line("Solda", 1),
      line("LOGISTICA", 5),
      line("Almoxarifado", 6, { is_almoxarifado: true }),
    ]);
    assert.equal(
      logistica.some((l) => navLineIsRedundantLogisticaMenuItem(l)),
      false
    );
    assert.equal(logistica.some((l) => l.name === "Almoxarifado"), true);
    assert.equal(producao.some((l) => l.name === "Solda"), true);
    assert.equal(producao.some((l) => l.name === "LOGISTICA"), false);
  });
});
