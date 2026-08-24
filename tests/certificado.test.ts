import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rotearCertificado } from "../src/lib/certificado/roteador";
import {
  TEMPLATE_A,
  TEMPLATE_B,
  TEMPLATE_C,
  TEMPLATE_D,
  normaDoTemplate,
  NORMA_ABSOLUTO,
  NORMA_FINO_BOLSA_GROSSO,
  textoClasseComNorma,
  toleranciaChecklist,
  textoEficiencia,
  textoVazaoPressaoCertificado,
} from "../src/lib/certificado/templates";
import {
  APROVADORES,
  ELABORADOR_PADRAO,
  pathAssinatura,
} from "../src/lib/certificado/dados-fixos";

describe("4 famílias / 4 templates", () => {
  it("absoluto: NBR ISO 29463-1:2013, 12 itens, com DOP/eficiência", () => {
    const r = rotearCertificado("HF-ABSW6", "HF-ABSW6 H14 610x610x292mm");
    assert.ok(r);
    assert.equal(r!.template.familia, "absoluto");
    assert.equal(r!.template.norma, "NBR ISO 29463-1:2013");
    assert.equal(r!.template.temTesteBancada, true);
    assert.equal(r!.template.checklist.length, 12);
    assert.ok(
      r!.template.checklist.some((i) =>
        i.caracteristica.toLowerCase().includes("aerossol")
      )
    );
    const ef = r!.template.checklist.find((i) => i.ordem === 11);
    assert.equal(ef?.tolerancia, "H14 >= 99,995% (H13 >= 99,95%)");
  });

  it("fino FFP/FFW: NBR 16101:2012, 9 itens, sem bancada", () => {
    const ffp = rotearCertificado("HF-FFP", "HF-FFP F9 595x595x96mm");
    const ffw = rotearCertificado(
      "HF-FFW3",
      "FILTRO HF-FFW3-F8 592X592X292mm"
    );
    for (const r of [ffp, ffw]) {
      assert.ok(r);
      assert.equal(r!.template.familia, "fino");
      assert.equal(r!.tipo, "B");
      assert.equal(r!.template.norma, "NBR 16101:2012");
      assert.equal(r!.template.temTesteBancada, false);
      assert.equal(r!.template.checklist.length, 9);
      const t = r!.template.checklist
        .map((i) => i.caracteristica.toLowerCase())
        .join(" ");
      assert.equal(t.includes("aerossol"), false);
      assert.equal(t.includes("eficiência") || t.includes("eficiencia"), false);
    }
    assert.equal(ffw!.foto, "cunha");
    assert.equal(ffp!.foto, "plano");
  });

  it("bolsa: 8 itens, PLANO DE REAÇÃO, sem bancada", () => {
    const r = rotearCertificado("HF-BSF8", "HF-BSF8 F8 592x592x600mm 8 bolsas");
    assert.ok(r);
    assert.equal(r!.template.familia, "bolsa");
    assert.equal(r!.template.checklist.length, 8);
    assert.equal(r!.template.colunaCertificacao, "PLANO DE REAÇÃO");
    assert.equal(r!.template.temTesteBancada, false);
    assert.equal(r!.template.norma, "NBR 16101:2012");
  });

  it("grosso/plissado: 9 itens, PLANO DE REAÇÃO, sem curva/vazão", () => {
    const r = rotearCertificado("HF-GP", "HF-GP G4 595x595x48mm");
    assert.ok(r);
    assert.equal(r!.template.familia, "grosso");
    assert.equal(r!.template.checklist.length, 9);
    assert.equal(r!.template.colunaCertificacao, "PLANO DE REAÇÃO");
    assert.equal(r!.template.temTesteBancada, false);
    assert.equal(r!.template.temCurvaDesempenho, false);
    assert.equal(r!.template.norma, "NBR 16101:2012");
  });
});

describe("norma impressa — sem NBR 16401", () => {
  it("constantes e templates não usam 16401", () => {
    assert.equal(NORMA_ABSOLUTO, "NBR ISO 29463-1:2013");
    assert.equal(NORMA_FINO_BOLSA_GROSSO, "NBR 16101:2012");
    assert.equal(normaDoTemplate("absoluto"), NORMA_ABSOLUTO);
    assert.equal(normaDoTemplate("fino"), NORMA_FINO_BOLSA_GROSSO);
    assert.equal(normaDoTemplate("bolsa"), NORMA_FINO_BOLSA_GROSSO);
    assert.equal(normaDoTemplate("grosso"), NORMA_FINO_BOLSA_GROSSO);
    for (const t of [TEMPLATE_A, TEMPLATE_B, TEMPLATE_C, TEMPLATE_D]) {
      assert.equal(t.norma.includes("16401"), false);
      assert.equal(t.norma, normaDoTemplate(t.familia));
    }
  });
});

describe("assinaturas e aprovadores", () => {
  it("lista de aprovadores tem as 4 pessoas com PNG", () => {
    assert.deepEqual(APROVADORES, [
      "Fernanda Miranda da Silva",
      "Norma Manuel",
      "Eliane Carvalho",
      "Gabriela Baldan dos Santos",
    ]);
  });

  it("mapeia nome → arquivo (inclui Leonardo)", () => {
    assert.equal(
      pathAssinatura("Fernanda Miranda da Silva"),
      "/certificados/assinaturas/assinatura-fernanda.png"
    );
    assert.equal(
      pathAssinatura("Norma Manuel"),
      "/certificados/assinaturas/assinatura-norma.png"
    );
    assert.equal(
      pathAssinatura("Eliane Carvalho"),
      "/certificados/assinaturas/assinatura-eliane.png"
    );
    assert.equal(
      pathAssinatura("Gabriela Baldan dos Santos"),
      "/certificados/assinaturas/assinatura-gabriela.png"
    );
    assert.equal(
      pathAssinatura("Gabriela Baldan dos Santos Araujo"),
      "/certificados/assinaturas/assinatura-gabriela.png"
    );
    assert.equal(
      pathAssinatura(ELABORADOR_PADRAO),
      "/certificados/assinaturas/assinatura-leonardo.png"
    );
    assert.equal(pathAssinatura("Pessoa Sem Assinatura"), null);
  });
});

describe("textoVazaoPressaoCertificado", () => {
  it("bate com os valores da etiqueta (motor_*)", () => {
    assert.equal(
      textoVazaoPressaoCertificado(3400, 250, 600),
      "3400 m3/h | Pi 250 Pa | Pf 600 Pa"
    );
  });
});

describe("item 10 e 11 (absoluto)", () => {
  it("item 10 inclui vazão e Pi/Pf", () => {
    const item = TEMPLATE_A.checklist.find((r) => r.ordem === 10);
    assert.ok(item);
    assert.equal(
      toleranciaChecklist(item!, 3400, "H14", 250, 600),
      "3400 m3/h | Pi 250 Pa | Pf 600 Pa"
    );
  });

  it("item 11 eficiência mostra H14 e H13", () => {
    assert.equal(
      textoEficiencia("H14"),
      "H14 >= 99,995% (H13 >= 99,95%)"
    );
    const item = TEMPLATE_A.checklist.find((r) => r.ordem === 11);
    assert.equal(item?.tolerancia, "H14 >= 99,995% (H13 >= 99,95%)");
  });
});

describe("B/C/D sem teste de bancada", () => {
  it("não têm DOP/fotômetro no checklist", () => {
    for (const t of [TEMPLATE_B, TEMPLATE_C, TEMPLATE_D]) {
      assert.equal(t.temTesteBancada, false);
      const textos = t.checklist
        .map((r) => `${r.caracteristica} ${r.descricao} ${r.meio}`)
        .join(" ")
        .toLowerCase();
      assert.equal(textos.includes("fotometro") || textos.includes("fotômetro"), false);
      assert.equal(textos.includes("aerossol"), false);
    }
  });
});
