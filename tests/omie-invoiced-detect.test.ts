import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractOmieNfeNumber, isOmiePedidoFaturado } from "../src/lib/omie/invoiced-detect";

describe("isOmiePedidoFaturado", () => {
  it("não faturado sem flags", () => {
    assert.equal(
      isOmiePedidoFaturado({ cabecalho: { etapa: "20" } }),
      false
    );
    assert.equal(
      isOmiePedidoFaturado({ cabecalho: { etapa: "50" }, infoCadastro: { faturado: "N" } }),
      false
    );
  });

  it("faturado = S", () => {
    assert.equal(
      isOmiePedidoFaturado({
        cabecalho: { etapa: "50" },
        infoCadastro: { faturado: "S" },
      }),
      true
    );
  });

  it("data de faturamento dFat", () => {
    assert.equal(
      isOmiePedidoFaturado({
        infoCadastro: { faturado: "N", dFat: "10/09/2026" },
      }),
      true
    );
  });

  it("NF-e na lista conta como faturado", () => {
    assert.equal(
      isOmiePedidoFaturado({
        lista_nfe: [{ numero_nfe: "12345", status_nfe: "Autorizada" }],
      }),
      true
    );
  });

  it("cancelado não conta como faturado", () => {
    assert.equal(
      isOmiePedidoFaturado({
        infoCadastro: { faturado: "S", cancelado: "S" },
      }),
      false
    );
  });

  it("etapa 50 (Faturar) sozinha não é faturado", () => {
    assert.equal(isOmiePedidoFaturado({ cabecalho: { etapa: "50" } }), false);
  });

  it("extrai número da NF-e da lista Omie", () => {
    assert.equal(
      extractOmieNfeNumber({
        lista_nfe: [
          { numero_nfe: "111", status_nfe: "Cancelada" },
          { numero_nfe: "98765", status_nfe: "Autorizada" },
        ],
      }),
      "98765"
    );
    assert.equal(extractOmieNfeNumber({ lista_nfe: [] }), null);
    assert.equal(
      extractOmieNfeNumber({
        ListaNfe: [{ numero_nfe: "260833", status_nfe: "Autorizada" }],
      }),
      "260833"
    );
  });
});
