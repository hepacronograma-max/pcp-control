import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcularVazaoPressao,
  isPrecisaInputs,
  isResultadoCalculo,
  motorBolsa,
  motorCunha,
  motorFino,
  motorPlano,
  parseFamilia,
} from "../src/lib/motor-vazao";

describe("motorPlano", () => {
  it("610×610 papel 50mm → ~1072 m³/h", () => {
    const r = motorPlano({
      largura_mm: 610,
      altura_mm: 610,
      espessura_papel_mm: 50,
    });
    assert.equal(r.vazao, 1072);
    assert.equal(r.dPi, 250);
    assert.equal(r.dPf, 600);
  });

  it("610×610 papel 80mm → escala com fator 0.90", () => {
    const r = motorPlano({
      largura_mm: 610,
      altura_mm: 610,
      espessura_papel_mm: 80,
    });
    // 0.8*(80/50)*0.9 * 0.61*0.61 * 3600 ≈ 1543
    assert.equal(r.vazao, 1543);
  });
});

describe("motorCunha", () => {
  it("3 cunhas 450×450 → ~1548 m³/h", () => {
    const r = motorCunha({
      base_mm: 450,
      altura_mm: 450,
      num_cunhas: 3,
    });
    assert.ok(
      Math.abs(r.vazao - 1548) <= 2,
      `esperado ~1548, obtido ${r.vazao}`
    );
    assert.equal(r.dPi, 250);
    assert.equal(r.dPf, 600);
  });

  it("6 cunhas 610×610 (N6) → ~3400 m³/h", () => {
    const r = motorCunha({
      base_mm: 610,
      altura_mm: 610,
      num_cunhas: 6,
    });
    assert.equal(r.vazao, 3400);
    assert.equal(r.dPi, 250);
    assert.equal(r.dPf, 600);
  });

  it("F9 (FF4W) → ΔPi 125 / ΔPf 450", () => {
    const r = motorCunha({
      base_mm: 472,
      altura_mm: 472,
      num_cunhas: 4,
      classe: "F9",
    });
    assert.equal(r.dPi, 125);
    assert.equal(r.dPf, 450);
  });

  it("F8 (FF4WC) → ΔPi 125 / ΔPf 450", () => {
    const r = motorCunha({
      base_mm: 472,
      altura_mm: 472,
      num_cunhas: 4,
      classe: "F8",
    });
    assert.equal(r.dPi, 125);
    assert.equal(r.dPf, 450);
  });

  it("F7 (FFW) → ΔPi 125 / ΔPf 450", () => {
    const r = motorCunha({
      base_mm: 592,
      altura_mm: 592,
      num_cunhas: 3,
      classe: "F7",
      modelo: "FFW3",
    });
    assert.equal(r.dPi, 125);
    assert.equal(r.dPf, 450);
  });

  it("FFW ignora H13 no texto → ainda 125 / 450", () => {
    const r = motorCunha({
      base_mm: 610,
      altura_mm: 610,
      num_cunhas: 3,
      classe: "H13",
      modelo: "FFW",
    });
    assert.equal(r.dPi, 125);
    assert.equal(r.dPf, 450);
  });

  it("ABSW H14 → ΔPi 250 / ΔPf 600", () => {
    const r = motorCunha({
      base_mm: 592,
      altura_mm: 287,
      num_cunhas: 6,
      classe: "H14",
      modelo: "ABSW6",
    });
    assert.equal(r.dPi, 250);
    assert.equal(r.dPf, 600);
  });
});

describe("motorFino", () => {
  it("fibra_vidro 80mm com coroa 592×592 → 3000 m³/h", () => {
    const r = motorFino({
      largura_mm: 592,
      altura_mm: 592,
      material: "fibra_vidro",
      espessura_papel_mm: 80,
      tem_coroa: true,
    });
    assert.equal(r.vazao, 3000);
    assert.equal(r.dPi, 150);
    assert.equal(r.dPf, 450);
  });
});

describe("motorBolsa", () => {
  it("F8 8 bolsas 592×592 → ~3400 m³/h", () => {
    const r = motorBolsa({
      base_mm: 592,
      altura_mm: 592,
      num_bolsas: 8,
      classe: "F8",
    });
    assert.equal(r.vazao, 3400);
    assert.equal(r.dPi, 81);
    assert.equal(r.dPf, 450);
  });
});

describe("parseFamilia", () => {
  it("ABSW6-H14 → cunha, 6 cunhas, H14", () => {
    const f = parseFamilia(
      "HF-1579",
      "FILTRO HF-ABSW6-H14-AG-S 592X287X292mm"
    );
    assert.equal(f.tipo, "cunha");
    assert.equal(f.num_elementos, 6);
    assert.equal(f.classe, "H14");
    assert.equal(f.largura_mm, 592);
    assert.equal(f.altura_mm, 287);
    assert.equal(f.profundidade_mm, 292);
  });

  it("BSF8-8 → bolsa, F8, 8 bolsas", () => {
    const f = parseFamilia("HF-1405", "FILTRO HF-BSF8-8-AG 592X592X600mm");
    assert.equal(f.tipo, "bolsa");
    assert.equal(f.classe, "F8");
    assert.equal(f.num_elementos, 8);
  });

  it("ABSP-H14 → plano, H14", () => {
    const f = parseFamilia(
      "HF-017",
      "FILTRO HF-ABSP-H14-T-S 610X610X78mm"
    );
    assert.equal(f.tipo, "plano");
    assert.equal(f.classe, "H14");
    assert.equal(f.modelo, "ABSP");
  });

  it("FFP-F7 → fino", () => {
    const f = parseFamilia(
      "HF-1822",
      "FILTRO HF-FFP-F7-AG-S 432X620X78mm"
    );
    assert.equal(f.tipo, "fino");
    assert.equal(f.classe, "F7");
  });

  it("FF4W (fibra) → cunha, 4 cunhas, F9", () => {
    const f = parseFamilia(
      "HF-2315",
      "FILTRO HF-FF4W-ABA 472X472X292mm"
    );
    assert.equal(f.tipo, "cunha");
    assert.equal(f.modelo, "FF4W");
    assert.equal(f.num_elementos, 4);
    assert.equal(f.classe, "F9");
    assert.equal(f.largura_mm, 472);
  });

  it("FF4WC (celulose) → cunha, 4 cunhas, F8", () => {
    const f = parseFamilia(
      "HF-2316",
      "FILTRO HF-FF4WC-ABA 472X472X292mm"
    );
    assert.equal(f.tipo, "cunha");
    assert.equal(f.modelo, "FF4WC");
    assert.equal(f.num_elementos, 4);
    assert.equal(f.classe, "F8");
  });

  it("FFW3-F8 → cunha fino, não absoluto", () => {
    const f = parseFamilia(
      "HF-2001",
      "FILTRO HF-FFW3-F8 592X592X292mm"
    );
    assert.equal(f.tipo, "cunha");
    assert.equal(f.modelo, "FFW3");
    assert.equal(f.num_elementos, 3);
    assert.equal(f.classe, "F8");
  });

  it("FFW com H13 no texto → não vira absoluto", () => {
    const f = parseFamilia("HF-FFW", "HF-FFW H13 610x610x292mm");
    assert.equal(f.tipo, "cunha");
    assert.equal(f.modelo, "FFW");
    assert.notEqual(f.classe, "H13");
    assert.notEqual(f.classe, "H14");
  });

  it("PL-M5 → sem_calculo", () => {
    const f = parseFamilia("HF-0251", "FILTRO HF-PL-M5 180x620x45mm");
    assert.equal(f.tipo, "sem_calculo");
    assert.equal(f.classe, "M5");
  });

  it("ABSW sem dígito → cunha com falta num_elementos", () => {
    const f = parseFamilia("HF-066", "FILTRO HF-ABSW-750 305X305X292mm");
    assert.equal(f.tipo, "cunha");
    assert.equal(f.num_elementos, null);
    assert.ok(f.falta.includes("num_elementos"));
  });
});

describe("calcularVazaoPressao", () => {
  it("PL → null (sem_calculo)", () => {
    const r = calcularVazaoPressao({
      product_code: "HF-1",
      description: "FILTRO HF-PL-M5 595X595X45mm",
    });
    assert.equal(r, null);
  });

  it("plano sem papel → precisa espessura_papel_mm", () => {
    const r = calcularVazaoPressao({
      description: "FILTRO HF-ABSP-H14-T-S 610X610X78mm",
    });
    assert.ok(isPrecisaInputs(r));
    if (isPrecisaInputs(r)) {
      assert.ok(r.precisa.includes("espessura_papel_mm"));
    }
  });

  it("plano com papel 50 → 1072", () => {
    const r = calcularVazaoPressao(
      { description: "FILTRO HF-ABSP-H14-T-S 610X610X78mm" },
      { espessura_papel_mm: 50 }
    );
    assert.ok(isResultadoCalculo(r));
    if (isResultadoCalculo(r)) {
      assert.equal(r.motor_usado, "plano");
      assert.equal(r.vazao, 1072);
      assert.ok(r.memoria_calculo.includes("Motor PLANO"));
    }
  });

  it("FF4W F9 calcula ΔPi 125 / ΔPf 450", () => {
    const r = calcularVazaoPressao({
      product_code: "HF-2315",
      description: "FILTRO HF-FF4W-ABA 472X472X292mm",
    });
    assert.ok(isResultadoCalculo(r));
    if (isResultadoCalculo(r)) {
      assert.equal(r.motor_usado, "cunha");
      assert.equal(r.dPi, 125);
      assert.equal(r.dPf, 450);
    }
  });

  it("FFW3-F8 calcula ΔPi 125 / ΔPf 450", () => {
    const r = calcularVazaoPressao({
      product_code: "HF-2001",
      description: "FILTRO HF-FFW3-F8 592X592X292mm",
    });
    assert.ok(isResultadoCalculo(r));
    if (isResultadoCalculo(r)) {
      assert.equal(r.motor_usado, "cunha");
      assert.equal(r.dPi, 125);
      assert.equal(r.dPf, 450);
    }
  });

  it("ABSW6-H14 calcula ΔPi 250 / ΔPf 600", () => {
    const r = calcularVazaoPressao({
      product_code: "HF-1579",
      description: "FILTRO HF-ABSW6-H14-AG-S 592X287X292mm",
    });
    assert.ok(isResultadoCalculo(r));
    if (isResultadoCalculo(r)) {
      assert.equal(r.motor_usado, "cunha");
      assert.equal(r.dPi, 250);
      assert.equal(r.dPf, 600);
    }
  });
});
