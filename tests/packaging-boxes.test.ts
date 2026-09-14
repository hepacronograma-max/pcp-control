import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAvulsaBoxCode,
  formatBoxDimensions,
  isAvulsaBoxCode,
  mapPgPackagingBoxError,
  parseCustomBoxSize,
  parsePackagingBoxPayload,
} from "../src/lib/packaging/boxes";

describe("parsePackagingBoxPayload", () => {
  const valid = {
    code: " CX-310 ",
    name: "Caixa 310x200x310",
    length_cm: "310",
    width_cm: "200,5",
    height_cm: 310,
    empty_weight_kg: "0,45",
    stock_quantity: "12",
    active: true,
  };

  it("aceita payload válido e normaliza vírgula decimal", () => {
    const r = parsePackagingBoxPayload(valid);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.code, "CX-310");
    assert.equal(r.data.name, "Caixa 310x200x310");
    assert.equal(r.data.length_cm, 310);
    assert.equal(r.data.width_cm, 200.5);
    assert.equal(r.data.height_cm, 310);
    assert.equal(r.data.empty_weight_kg, 0.45);
    assert.equal(r.data.stock_quantity, 0);
    assert.equal(r.data.active, true);
  });

  it("peso vazio opcional vira null", () => {
    const r = parsePackagingBoxPayload({ ...valid, empty_weight_kg: "" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.empty_weight_kg, null);
  });

  it("recusa dimensão zero ou negativa", () => {
    const r = parsePackagingBoxPayload({ ...valid, length_cm: 0 });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /Comprimento/);
  });

  it("exige código e nome", () => {
    const noCode = parsePackagingBoxPayload({ ...valid, code: "   " });
    assert.equal(noCode.ok, false);
    const noName = parsePackagingBoxPayload({ ...valid, name: "" });
    assert.equal(noName.ok, false);
  });
});

describe("caixa customizada", () => {
  it("aceita 123x20x63, espaços e ×", () => {
    const a = parseCustomBoxSize("123x20x63");
    assert.equal(a.ok, true);
    if (a.ok) {
      assert.equal(a.length_cm, 123);
      assert.equal(a.width_cm, 20);
      assert.equal(a.height_cm, 63);
    }
    const b = parseCustomBoxSize("123 × 20 × 63");
    assert.equal(b.ok, true);
    const c = parseCustomBoxSize("123*20*63");
    assert.equal(c.ok, true);
  });

  it("recusa formato incompleto", () => {
    const r = parseCustomBoxSize("123x20");
    assert.equal(r.ok, false);
  });

  it("marca código avulso e monta AV-…", () => {
    assert.equal(isAvulsaBoxCode("AV-123x20x63"), true);
    assert.equal(isAvulsaBoxCode("CX6"), false);
    assert.equal(
      buildAvulsaBoxCode({ length_cm: 123, width_cm: 20, height_cm: 63 }),
      "AV-123x20x63"
    );
  });
});

describe("formatBoxDimensions / mapPgPackagingBoxError", () => {
  it("formata medidas", () => {
    assert.equal(
      formatBoxDimensions({ length_cm: 310, width_cm: 200, height_cm: 310 }),
      "310 × 200 × 310 cm"
    );
  });

  it("traduz duplicata de código", () => {
    const msg = mapPgPackagingBoxError(
      'duplicate key value violates unique constraint "idx_packaging_boxes_company_code"'
    );
    assert.equal(msg, "Já existe uma caixa com este código nesta empresa.");
  });
});
