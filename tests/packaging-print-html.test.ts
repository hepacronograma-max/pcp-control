import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEmbalagemSheetsHtml } from "../src/lib/packaging/print-html";

describe("etiqueta de embalagem OS / Pedido", () => {
  it("grava OS no número interno e Pedido no número do cliente", () => {
    const html = buildEmbalagemSheetsHtml([
      {
        sequence: 1,
        clientName: "Cliente X",
        orderNumber: "260358",
        clientOrderNumber: "PO-99",
        productCode: "HF-1",
        description: "Filtro",
        pieceQuantity: 2,
        boxLabel: "C1",
        weightKg: 1,
        qrDataUrl: "data:image/png;base64,xx",
        logoDataUrl: "data:image/png;base64,yy",
      },
    ]);
    assert.match(html, /<strong>OS:<\/strong> 260358/);
    assert.match(html, /<strong>Pedido:<\/strong> PO-99/);
    assert.doesNotMatch(html, /<strong>Pedido:<\/strong> 260358/);
  });
});
