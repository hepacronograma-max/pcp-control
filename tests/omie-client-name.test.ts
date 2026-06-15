import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPlaceholderOmieClientName,
  pickOmieClientDisplayName,
  resolveClientNameForPedido,
} from "../src/lib/omie/client-name-resolver";
import { extractClientNameFromPedido } from "../src/lib/omie/mapper";
import type { OmiePedidoCompleto } from "../src/lib/omie/types";

describe("extractClientNameFromPedido", () => {
  it("usa nome_cliente do cabecalho quando presente", () => {
    const omie: OmiePedidoCompleto = {
      cabecalho: {
        codigo_pedido: 1,
        numero_pedido: "260209",
        nome_cliente: "ACME Industria Ltda",
        codigo_cliente: 2422656210,
      },
    };
    assert.equal(extractClientNameFromPedido(omie), "ACME Industria Ltda");
  });

  it("fallback placeholder quando so tem codigo_cliente", () => {
    const omie: OmiePedidoCompleto = {
      cabecalho: {
        codigo_pedido: 1,
        numero_pedido: "260209",
        codigo_cliente: 2422656210,
      },
    };
    assert.equal(extractClientNameFromPedido(omie), "Cliente Omie 2422656210");
    assert.equal(isPlaceholderOmieClientName("Cliente Omie 2422656210"), true);
  });
});

describe("resolveClientNameForPedido", () => {
  it("consulta Omie e cacheia quando pedido so traz codigo_cliente", async () => {
    const omie: OmiePedidoCompleto = {
      cabecalho: {
        codigo_pedido: 6922905311,
        numero_pedido: "260209",
        codigo_cliente: 2422656210,
      },
    };
    const cache = new Map<number, string>();
    let calls = 0;
    const client = {
      consultarCliente: async (cod: number) => {
        calls += 1;
        assert.equal(cod, 2422656210);
        return {
          razao_social: "RAZAO SOCIAL ACME LTDA",
          nome_fantasia: "ACME Filtros",
        };
      },
    };

    const name1 = await resolveClientNameForPedido(
      omie,
      client as never,
      cache
    );
    const name2 = await resolveClientNameForPedido(
      omie,
      client as never,
      cache
    );

    assert.equal(name1, "ACME Filtros");
    assert.equal(name2, "ACME Filtros");
    assert.equal(calls, 1);
  });

  it("prefere razao social se fantasia ausente", async () => {
    const omie: OmiePedidoCompleto = {
      cabecalho: { codigo_pedido: 1, codigo_cliente: 99 },
    };
    const client = {
      consultarCliente: async () => ({
        razao_social: "Empresa Sem Fantasia ME",
        nome_fantasia: "",
      }),
    };
    const name = await resolveClientNameForPedido(
      omie,
      client as never,
      new Map()
    );
    assert.equal(name, "Empresa Sem Fantasia ME");
  });
});

describe("pickOmieClientDisplayName", () => {
  it("prioriza nome fantasia", () => {
    assert.equal(
      pickOmieClientDisplayName("Razao Longa", "Fantasia"),
      "Fantasia"
    );
  });
});
