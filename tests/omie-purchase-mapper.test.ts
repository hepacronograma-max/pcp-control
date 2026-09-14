import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brDateToIso,
  extractPedCompraNumber,
  mapOmiePedCompraToPcp,
} from "../src/lib/omie/purchase-mapper";
import type { OmiePedidoCompra } from "../src/lib/omie/types";

const COMPANY = "00000000-0000-0000-0000-000000000001";

const sample: OmiePedidoCompra = {
  cabecalho_consulta: {
    nCodPed: 7316417250,
    cNumero: "PC-1001",
    dDtPrevisao: "20/09/2026",
    nCodFor: 14170458,
    cRazaoFor: "Fornecedor Alpha",
    cEtapa: "10",
    cObs: "Obs Omie",
  },
  produtos_consulta: [
    {
      nCodItem: 1,
      nCodProd: 2037060,
      cProduto: "HF-200",
      cDescricao: "Tela filtrante",
      cNCM: "84213990",
      cUnidade: "UN",
      nQtde: 4,
      nQtdeRec: 0,
    },
  ],
};

describe("mapOmiePedCompraToPcp", () => {
  it("mapeia número, fornecedor, prazo e itens", () => {
    const draft = mapOmiePedCompraToPcp(sample, COMPANY);
    assert.equal(draft.number, "PC-1001");
    assert.equal(draft.supplierName, "Fornecedor Alpha");
    assert.equal(draft.expectedDelivery, "2026-09-20");
    assert.equal(draft.status, "open");
    assert.equal(draft.omieCodigo, 7316417250);
    assert.equal(draft.items.length, 1);
    assert.equal(draft.items[0].productCode, "HF-200");
    assert.equal(draft.items[0].quantity, 4);
    assert.equal(draft.items[0].lineNumber, 1);
  });

  it("marca recebido quando quantidade recebida cobre o pedido", () => {
    const draft = mapOmiePedCompraToPcp(
      {
        ...sample,
        produtos_consulta: [
          { ...sample.produtos_consulta![0], nQtde: 2, nQtdeRec: 2 },
        ],
      },
      COMPANY
    );
    assert.equal(draft.status, "received");
  });
});

describe("extractPedCompraNumber / brDateToIso", () => {
  it("usa cNumero", () => {
    assert.equal(extractPedCompraNumber(sample), "PC-1001");
  });

  it("converte data BR para ISO", () => {
    assert.equal(brDateToIso("01/12/2026"), "2026-12-01");
    assert.equal(brDateToIso(null), null);
  });
});
