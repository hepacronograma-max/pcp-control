import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPcpManualPdf,
  parsePcpManualPdf,
} from "../src/lib/pdf/parse-pcp-manual";
import {
  applyManualImportDefaults,
  isManualPdfOrigin,
  resolveManualImportKind,
  resolveManualOrderCollision,
} from "../src/lib/pdf/apply-manual-import";

const SAMPLE_ESTOQUE = `
PCP HEPA
Tipo: ESTOQUE
Pedido: 001
Cliente: ESTOQUE HEPA
Prazo: 15/09/2026

Código: FAPAGNH1400001
Descrição: FILTRO HF-A8SPAGH14 305x305x75mm
Quantidade: 50

Código: HF-071
Descrição: FILTRO ABSOLUTO 610x610x292mm
Quantidade: 10
`;

const SAMPLE_PEDIDO = `
PCP HEPA
Importação manual
Tipo: PEDIDO
Pedido: 99001
Cliente: OUTRO CNPJ LTDA
Prazo: 01/10/2026

Código: HF-010
Descrição: FILTRO FINO 287x287x48mm
Quantidade: 8
`;

describe("parsePcpManualPdf", () => {
  it("reconhece o layout PCP HEPA", () => {
    assert.equal(isPcpManualPdf(SAMPLE_ESTOQUE), true);
    assert.equal(isPcpManualPdf("Orçamento Nº 123 Itens do orçamento"), false);
  });

  it("extrai estoque com código, descrição e quantidade", () => {
    const r = parsePcpManualPdf(SAMPLE_ESTOQUE, "estoque.pdf");
    assert.equal(r.tipo, "estoque");
    assert.equal(r.orderNumber, "001");
    assert.equal(r.clientName, "ESTOQUE HEPA");
    assert.equal(r.deliveryDate, "2026-09-15");
    assert.equal(r.items.length, 2);
    assert.equal(r.items[0].product_code, "FAPAGNH1400001");
    assert.equal(r.items[0].quantity, 50);
    assert.equal(r.items[1].product_code, "HF-071");
    assert.equal(r.items[1].quantity, 10);
  });

  it("extrai pedido de outro CNPJ", () => {
    const r = parsePcpManualPdf(SAMPLE_PEDIDO, "pedido.pdf");
    assert.equal(r.tipo, "pedido");
    assert.equal(r.orderNumber, "99001");
    assert.equal(r.clientName, "OUTRO CNPJ LTDA");
    assert.equal(r.items[0].description.includes("FILTRO FINO"), true);
  });

  it("aceita itens separados por pipe", () => {
    const text = `
PCP HEPA
Pedido: EST-9
Cliente: ESTOQUE HEPA
Itens:
Código | Descrição | Qtd
HF-071 | FILTRO ABSOLUTO | 3
`;
    const r = parsePcpManualPdf(text, "pipe.pdf");
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].product_code, "HF-071");
    assert.equal(r.items[0].quantity, 3);
  });
});

describe("applyManualImportDefaults / colisão Omie", () => {
  it("estoque prefixa EST- e preenche cliente", () => {
    const r = applyManualImportDefaults({
      orderNumber: "001",
      clientName: "Cliente do PDF",
      kind: "estoque",
    });
    assert.equal(r.orderNumber, "EST-001");
    assert.equal(r.clientName, "ESTOQUE HEPA");
    assert.equal(isManualPdfOrigin(r.notes), true);
  });

  it("não sobrescreve pedido Omie com o mesmo número", () => {
    const r = resolveManualOrderCollision({
      orderNumber: "260833",
      kind: "pedido",
      existingFound: true,
      existingNotes: null,
    });
    assert.equal(r.action, "insert");
    assert.equal(r.orderNumber, "PDF-260833");
  });

  it("reimporta PDF atualizando o mesmo pedido manual", () => {
    const r = resolveManualOrderCollision({
      orderNumber: "EST-001",
      kind: "estoque",
      existingFound: true,
      existingNotes: "Origem: estoque (PDF, sem Omie)",
    });
    assert.equal(r.action, "update");
    assert.equal(r.orderNumber, "EST-001");
  });

  it("PDF tipo estoque vence a escolha da tela", () => {
    assert.equal(resolveManualImportKind("pedido", "estoque"), "estoque");
    assert.equal(resolveManualImportKind("estoque", "pedido"), "estoque");
    assert.equal(resolveManualImportKind("pedido", "pedido"), "pedido");
  });
});
