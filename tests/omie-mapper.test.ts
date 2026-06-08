import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapOmiePedidoToPcp } from "../src/lib/omie/mapper";
import type { OmiePedidoCompleto } from "../src/lib/omie/types";

const COMPANY = "00000000-0000-0000-0000-000000000001";

function mockPedido(
  items: Array<{
    codigo_item: number;
    codigo?: string;
    codigo_produto?: number;
    descricao: string;
    quantidade: number;
  }>
): OmiePedidoCompleto {
  return {
    cabecalho: {
      codigo_pedido: 123456,
      numero_pedido: "260161",
      sequencial: "0001",
      nome_cliente: "Cliente Teste",
      data_previsao: "15/06/2026",
    },
    det: items.map((i) => ({
      ide: { codigo_item: i.codigo_item },
      produto: {
        codigo: i.codigo,
        codigo_produto: i.codigo_produto,
        descricao: i.descricao,
        quantidade: i.quantidade,
      },
    })),
  };
}

describe("mapOmiePedidoToPcp — product_code", () => {
  it("usa produto.codigo (HF) em vez de codigo_produto (ID interno)", () => {
    const draft = mapOmiePedidoToPcp(
      mockPedido([
        {
          codigo_item: 6935884757,
          codigo: "HF-1579",
          codigo_produto: 6081960947,
          descricao: "Filtro HEPA",
          quantidade: 2,
        },
      ]),
      COMPANY
    );
    assert.equal(draft.items[0].productCode, "HF-1579");
    assert.notEqual(draft.items[0].productCode, "6081960947");
  });

  it("fallback para codigo_produto quando codigo vazio", () => {
    const draft = mapOmiePedidoToPcp(
      mockPedido([
        {
          codigo_item: 111,
          codigo: "",
          codigo_produto: 6081960947,
          descricao: "Produto sem codigo HF",
          quantidade: 1,
        },
      ]),
      COMPANY
    );
    assert.equal(draft.items[0].productCode, "6081960947");
  });
});

describe("mapOmiePedidoToPcp — omie_codigo_item", () => {
  it("mapeia ide.codigo_item para omieCodigoItem", () => {
    const draft = mapOmiePedidoToPcp(
      mockPedido([
        {
          codigo_item: 6935884757,
          codigo: "HF-1579",
          descricao: "Filtro",
          quantidade: 1,
        },
      ]),
      COMPANY
    );
    assert.equal(draft.items[0].omieCodigoItem, 6935884757);
  });
});
