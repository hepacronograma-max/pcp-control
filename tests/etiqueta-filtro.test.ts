import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {

  decidirLayoutFaixaTecnica,

  decidirModeloEtiqueta,

  descricaoSemMedida,

  detectarClasseFiltragem,

  extrairDimensoes,

  formatDataLote,

  formatSerieEtiqueta,

  gerarEtiquetasComSeries,

  gerarEtiquetasSeriesEspecificas,

  gerarLoteEtiqueta,

  medidaEtiquetaFromDescricao,

  parseSeriesReimpressao,

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



describe("descricaoSemMedida / medidaEtiquetaFromDescricao", () => {

  it("separa descrição e medida", () => {

    assert.equal(

      descricaoSemMedida("FILTRO HF-GP-G4 550x550x30mm"),

      "FILTRO HF-GP-G4"

    );

    assert.equal(medidaEtiquetaFromDescricao("FILTRO HF-GP-G4 550x550x30mm"), "550X550X30MM");

  });



  it("HF-HESP-007 com medida no final", () => {

    assert.equal(descricaoSemMedida("HF-HESP-007 240x310x43mm"), "HF-HESP-007");

    assert.equal(medidaEtiquetaFromDescricao("HF-HESP-007 240x310x43mm"), "240X310X43MM");

  });

});



describe("formatDataLote / gerarLoteEtiqueta", () => {

  it("formato AAMMDD-pedido", () => {

    const d = new Date(2026, 5, 15);

    assert.equal(formatDataLote(d), "260615");

    assert.equal(

      gerarLoteEtiqueta({

        data: d,

        numeroPedidoVisivel: "260020",

      }),

      "260615-260020"

    );

  });



  it("pedido com barra/sufixo", () => {

    const d = new Date(2026, 5, 15);

    assert.equal(

      gerarLoteEtiqueta({

        data: d,

        numeroPedidoVisivel: "260161/1",

      }),

      "260615-260161/1"

    );

  });

});



describe("decidirLayoutFaixaTecnica", () => {

  it("placeholders vazios -> uma linha", () => {

    assert.equal(

      decidirLayoutFaixaTecnica({

        vazao: "",

        perdaInicial: "",

        perdaFinal: "",

        classe: "F8",

      }),

      "uma-linha"

    );

  });



  it("valores reais de exemplo -> duas linhas (Vazão limita largura)", () => {

    assert.equal(

      decidirLayoutFaixaTecnica({

        vazao: "280",

        perdaInicial: "250",

        perdaFinal: "400",

        classe: "F8",

      }),

      "duas-linhas"

    );

  });



  it("rótulos ΔPi/ΔPf encurtam perdas mas vazão longa -> duas linhas", () => {

    assert.equal(

      decidirLayoutFaixaTecnica({

        vazao: "2800",

        perdaInicial: "250",

        perdaFinal: "400",

        classe: "F8",

      }),

      "duas-linhas"

    );

  });

});



describe("gerarEtiquetasComSeries", () => {

  it("N etiquetas com série 1..N distinta e lote igual", () => {

    const base = { lote: "260615-260020", codigo: "HF-52503" };

    const batch = gerarEtiquetasComSeries(base, 20);

    assert.equal(batch.length, 20);

    assert.equal(batch[0].serie, 1);

    assert.equal(batch[0].serieTotal, 20);

    assert.equal(batch[19].serie, 20);

    assert.equal(formatSerieEtiqueta(batch[4].serie, batch[4].serieTotal), "5/20");

    assert.ok(batch.every((e) => e.lote === base.lote));

    assert.deepEqual(

      batch.map((e) => e.serie),

      Array.from({ length: 20 }, (_, i) => i + 1)

    );

  });



  it("quantidade mínima 1", () => {

    const batch = gerarEtiquetasComSeries({ lote: "x" }, 0);

    assert.equal(batch.length, 1);

    assert.equal(batch[0].serie, 1);

    assert.equal(batch[0].serieTotal, 1);

  });

});



describe("parseSeriesReimpressao", () => {

  it("vazio imprime todas", () => {

    assert.deepEqual(parseSeriesReimpressao("", 20), { ok: true, numeros: [] });

    assert.deepEqual(parseSeriesReimpressao("   ", 20), { ok: true, numeros: [] });

  });



  it("uma série válida", () => {

    assert.deepEqual(parseSeriesReimpressao("7", 20), { ok: true, numeros: [7] });

  });



  it("várias séries com vírgula", () => {

    assert.deepEqual(parseSeriesReimpressao("7, 12, 15", 20), {

      ok: true,

      numeros: [7, 12, 15],

    });

  });



  it("rejeita série maior que o total", () => {

    const r = parseSeriesReimpressao("25", 20);

    assert.equal(r.ok, false);

    if (!r.ok) assert.match(r.error, /25/);

  });



  it("rejeita série zero", () => {

    assert.equal(parseSeriesReimpressao("0", 20).ok, false);

  });



  it("remove duplicatas e ordena", () => {

    assert.deepEqual(parseSeriesReimpressao("15,7,7,12", 20), {

      ok: true,

      numeros: [7, 12, 15],

    });

  });

});



describe("gerarEtiquetasSeriesEspecificas", () => {

  it("reimpressão mantém serieTotal e lote", () => {

    const base = { lote: "260622-260020", codigo: "HF-52504" };

    const batch = gerarEtiquetasSeriesEspecificas(base, [7], 20);

    assert.equal(batch.length, 1);

    assert.equal(batch[0].serie, 7);

    assert.equal(batch[0].serieTotal, 20);

    assert.equal(formatSerieEtiqueta(batch[0].serie, batch[0].serieTotal), "7/20");

    assert.equal(batch[0].lote, base.lote);

  });

});

