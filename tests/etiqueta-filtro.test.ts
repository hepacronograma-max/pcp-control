import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decidirModeloEtiqueta,
  detectarClasseFiltragem,
  extrairDimensoes,
} from "../src/lib/utils/etiqueta-filtro";

describe("detectarClasseFiltragem", () => {
  it("G4 -> G4", () => {
    assert.equal(
      detectarClasseFiltragem("FILTRO HF-GP-G4 618X604X25mm"),
      "G4"
    );
  });

  it("M5 -> M5", () => {
    assert.equal(
      detectarClasseFiltragem("FILTRO HF-PL-M5 595X595X100mm"),
      "M5"
    );
  });

  it("F8 -> F8", () => {
    assert.equal(
      detectarClasseFiltragem("FILTRO HF-FFW3-F8 592x592x292mm"),
      "F8"
    );
  });

  it("F9 -> F9", () => {
    assert.equal(detectarClasseFiltragem("FILTRO HF-XXX-F9 400X400X50mm"), "F9");
  });

  it("H14 -> H14", () => {
    assert.equal(detectarClasseFiltragem("FILTRO HF-HEPA-H14 610X610X78mm"), "H14");
  });

  it("BSF8 (multibolsa) -> F8", () => {
    assert.equal(
      detectarClasseFiltragem("FILTRO HF-BSF8-8-AG 592X592X600mm"),
      "F8"
    );
  });

  it("HESP-007 sem classe -> null", () => {
    assert.equal(detectarClasseFiltragem("FILTRO HF-HESP-007"), null);
    assert.equal(detectarClasseFiltragem("HF-HESP-007", "HF-HESP-007"), null);
  });
});

describe("decidirModeloEtiqueta", () => {
  it("G4/M5 -> simples", () => {
    assert.equal(decidirModeloEtiqueta("G4"), "simples");
    assert.equal(decidirModeloEtiqueta("M5"), "simples");
  });

  it("F8/F9/H14 -> completa", () => {
    assert.equal(decidirModeloEtiqueta("F8"), "completa");
    assert.equal(decidirModeloEtiqueta("F9"), "completa");
    assert.equal(decidirModeloEtiqueta("H14"), "completa");
  });

  it("null -> simples", () => {
    assert.equal(decidirModeloEtiqueta(null), "simples");
  });
});

describe("extrairDimensoes", () => {
  it("extrai NxNxN mm", () => {
    assert.equal(
      extrairDimensoes("FILTRO HF-PL-M5 595X595X100mm"),
      "595X595X100mm"
    );
    assert.equal(
      extrairDimensoes("FILTRO HF-FFW3-F7 592x592x292 mm"),
      "592X592X292mm"
    );
    assert.equal(extrairDimensoes("305X610X75mm"), "305X610X75mm");
  });

  it("sem dimensões -> null", () => {
    assert.equal(extrairDimensoes("FILTRO HF-HESP-007"), null);
  });
});
