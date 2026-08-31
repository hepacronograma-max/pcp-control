import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBusinessDays,
  clientNameFromZenithFileName,
  isZenithQuotePdf,
  parseZenithQuote,
} from "../src/lib/pdf/parse-zenith-quote";

const SAMPLE_ZH = `
DATA   27/08/2026
Cotação #   ZH-260026
Telefone/ WhatsApp: 11 91841-2667
vendas@zenith-hvac.com | www.zenith-hvac.com
Orçamento válido até:   06/09/2026
Nome (Sr/ Sra.)   Preparado por:   Departamento Comercial
Nome da empresa   CONDICIONADO
Telefone
Preços negociados exclusivamente para revenda
VENDEDOR   O.C. NÚMERO   DATA DE APROVAÇÃO   ENVIAR VIA   MODALIDADE DO FRETE   CONDIÇÃO DE PGTO
COMERCIAL   27/08/2026   FOB (Favor informar a transportadora)   28 dias
ITEM   QTD   Modelo   Dimensão (mm)   Preço Unit   Preço Total
1   4   HF-GP-G4   660x150x25   12,31   49,25 R$
2   1   HF-GP-G4   1350x200x25   24,81   24,81 R$
3   2   HF-GP-G4   996x150x25   14,71   29,43 R$
4   1   HF-GP-G4   1060x150x25   22,11   22,11 R$
5   7   HF-GP-G4   500x200x25   11,26   78,84 R$
6   1   HF-GP-G4   860x150x25   13,74   13,74 R$
7   1   HF-GP-G4   650x200x25   12,73   12,73 R$
8   3   HF-GP-G4   950x200x25   15,02   45,05 R$
SUBTOTAL   275,96 R$
FRETE   - R$
TOTAL   275,96 R$
Cotação ZENITH HVAC ENGINEERING LTDA
Orçamento para:
Endereço: R. Dom. João V, 450
Condições gerais:
A) Prazo de entrega:   10 dias úteis, a contar da data útil subsequente a confirmação do pedido.
B) Validade da proposta:   10 dias
`;

describe("parseZenithQuote (modelo ZH-260026)", () => {
  it("reconhece cotação Zenith e ignora TOTVS genérico", () => {
    assert.equal(isZenithQuotePdf(SAMPLE_ZH), true);
    assert.equal(isZenithQuotePdf("Orçamento Nº 123 Itens do orçamento"), false);
  });

  it("lê número, cliente do arquivo, 8 itens e prazo em dias úteis", () => {
    const r = parseZenithQuote(
      SAMPLE_ZH,
      "ZH-260026 - COLD CONTROL AR CONDICIONADO.pdf"
    );
    assert.equal(r.orderNumber, "ZH-260026");
    assert.equal(r.clientName, "COLD CONTROL AR CONDICIONADO");
    assert.equal(r.deliveryDate, "2026-09-10");
    assert.equal(r.items.length, 8);
    assert.equal(r.items[0].product_code, "HF-GP-G4");
    assert.equal(r.items[0].quantity, 4);
    assert.equal(r.items[0].description, "HF-GP-G4 660x150x25mm");
    assert.equal(r.items[1].quantity, 1);
    assert.equal(r.items[1].description, "HF-GP-G4 1350x200x25mm");
    assert.equal(r.items[4].quantity, 7);
    assert.equal(r.items[7].quantity, 3);
  });

  it("se o arquivo não tem o cliente, usa o pedaço do PDF", () => {
    const r = parseZenithQuote(SAMPLE_ZH, "ZH-260026.pdf");
    assert.equal(r.clientName, "CONDICIONADO");
  });

  it("extrai cliente do nome do arquivo", () => {
    assert.equal(
      clientNameFromZenithFileName("ZH-260026 - COLD CONTROL AR CONDICIONADO.pdf"),
      "COLD CONTROL AR CONDICIONADO"
    );
  });

  it("27/08/2026 + 10 dias úteis = 10/09/2026", () => {
    assert.equal(addBusinessDays("2026-08-27", 10), "2026-09-10");
  });
});
