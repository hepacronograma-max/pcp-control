import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildShippingListPrintHtml,
  shippingListItemText,
  stripPieceSuffix,
  totalWeightKg,
} from "../src/lib/packaging/shipping-list-print";
import { extractOmieClientOrderNumber } from "../src/lib/omie/mapper";

describe("texto do item na lista de embarque", () => {
  it("omite SKU FAPAGNH e quantidade entre parênteses", () => {
    assert.equal(
      shippingListItemText({
        productCode: "FAPAGNH1400001",
        description: "FILTRO HF-ABSPAGH14 305x305x75mm (2 pç)",
      }),
      "FILTRO HF-ABSPAGH14 305x305x75mm"
    );
  });

  it("remove prefixo do código se a descrição já começa com ele", () => {
    assert.equal(
      shippingListItemText({
        productCode: "FAPAGNH1400001",
        description: "FAPAGNH1400001 · FILTRO HF-ABSPAGH14",
      }),
      "FILTRO HF-ABSPAGH14"
    );
  });

  it("stripPieceSuffix", () => {
    assert.equal(stripPieceSuffix("FILTRO (2 pç)"), "FILTRO");
  });
});

describe("impressão da lista de embarque", () => {
  it("paisagem, Qtde, OS, peso e volumes no cabeçalho", () => {
    const html = buildShippingListPrintHtml({
      logoDataUrl: "data:image/png;base64,ll",
      clientName: `MILARÉ <script>`,
      osNumber: "260833",
      clientOrderNumber: "PO-99",
      receivedBy: "João",
      receivedAtLabel: "10/09/2026",
      listQrDataUrl: "data:image/png;base64,listqr",
      lines: [
        {
          sequence: 1,
          itemText: "FILTRO HF-ABSPAGH14 305x305x75mm",
          boxLabel: "Avulsa 31 × 20 × 31 cm",
          quantity: 2,
          weightKg: 3,
          qrDataUrl: "data:image/png;base64,qq",
        },
        {
          sequence: 2,
          itemText: "FILTRO HF-ABSPAGH14 305x305x75mm",
          boxLabel: "Avulsa 31 × 20 × 31 cm",
          quantity: 2,
          weightKg: 3,
          qrDataUrl: "data:image/png;base64,qq",
        },
      ],
    });
    assert.match(html, /A4 landscape/);
    assert.match(html, />Qtde</);
    assert.doesNotMatch(html, />Peças</);
    assert.match(html, /OS \/ pedido interno/);
    assert.match(html, /260833/);
    assert.match(html, /Pedido cliente/);
    assert.match(html, /PO-99/);
    assert.match(html, /6 kg/);
    assert.match(html, />2<\/strong>/);
    assert.doesNotMatch(html, /FAPAGNH/);
    assert.match(html, /MILARÉ &lt;script&gt;/);
    assert.match(html, /table-header-group/);
    assert.match(html, /<thead>/);
    assert.match(html, /doc-head-row/);
    assert.match(html, /<tfoot>/);
    assert.match(html, /Assinatura:/);
    assert.match(html, /min-height: 32mm/);
    assert.match(html, /Bipar para conferir/);
    assert.match(html, /listqr/);
  });

  it("soma peso total", () => {
    assert.equal(totalWeightKg([{ weightKg: 3 }, { weightKg: 2.5 }]), 5.5);
    assert.equal(totalWeightKg([{ weightKg: null }]), null);
  });

  it("lê pedido do cliente no payload Omie", () => {
    assert.equal(
      extractOmieClientOrderNumber({
        informacoes_adicionais: { numero_pedido_cliente: "ABC-1" },
      }),
      "ABC-1"
    );
    assert.equal(extractOmieClientOrderNumber({}), null);
  });
});
