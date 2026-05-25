import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  getDefaultRules,
  mapOmieOrderToPcp,
  resolveLineName,
} from "@/lib/omie/mapper";
import type { OmiePedidoCompleto } from "@/lib/omie/types";

function loadFixture(name: string): OmiePedidoCompleto {
  const p = path.join(__dirname, "fixtures", "omie", name);
  return JSON.parse(readFileSync(p, "utf8")) as OmiePedidoCompleto;
}

const rules = getDefaultRules();
const companyId = "00000000-0000-4000-8000-000000000001";

describe("mapOmieOrderToPcp", () => {
  it("mapeia pedido com 1 item", () => {
    const omie = loadFixture("pedido-um-item.json");
    const draft = mapOmieOrderToPcp(omie, {
      companyId,
      clientName: "Cliente Teste",
      rules,
    });
    expect(draft.orderNumber).toBe("PV-100001");
    expect(draft.clientName).toBe("Cliente Teste");
    expect(draft.deliveryDeadline).toBe("2026-06-30");
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].lineName).toBe("ABSOLUTO / FINO");
    expect(draft.items[0].quantity).toBe(2);
  });

  it("mapeia pedido com múltiplos itens e linhas distintas", () => {
    const omie = loadFixture("pedido-multi-itens.json");
    const draft = mapOmieOrderToPcp(omie, {
      companyId,
      clientName: "HEPA",
      rules,
    });
    expect(draft.items).toHaveLength(4);
    const lines = draft.items.map((i) => i.lineName);
    expect(lines).toContain("ABSOLUTO / FINO");
    expect(lines).toContain("MULTIBOLSA");
    expect(lines).toContain("CARTONADO GP/PL");
    expect(lines).toContain("LOGISTICA");
  });

  it("usa ALMOXARIFADO quando código não casa regra", () => {
    const omie = loadFixture("pedido-sem-cliente.json");
    const draft = mapOmieOrderToPcp(omie, {
      companyId,
      clientName: "Cliente Omie",
      rules,
    });
    expect(draft.items[0].lineName).toBe("ALMOXARIFADO");
    expect(draft.deliveryDeadline).toBeNull();
  });

  it("falha sem codigo_pedido", () => {
    expect(() =>
      mapOmieOrderToPcp({ cabecalho: {}, det: [] }, { companyId, clientName: "X", rules })
    ).toThrow(/codigo_pedido/);
  });
});

describe("resolveLineName", () => {
  it("HF-FFP → ABSOLUTO / FINO", () => {
    expect(resolveLineName("HF-FFP-071", "", rules)).toBe("ABSOLUTO / FINO");
  });

  it("HF-BSF → MULTIBOLSA", () => {
    expect(resolveLineName("HF-BSF-01", "", rules)).toBe("MULTIBOLSA");
  });

  it("HF-GP → CARTONADO", () => {
    expect(resolveLineName("HF-GP-9", "", rules)).toBe("CARTONADO GP/PL");
  });

  it("MANTA na descrição → LOGISTICA", () => {
    expect(resolveLineName("", "MANTA FILTRO", rules)).toBe("LOGISTICA");
  });
});
