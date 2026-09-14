import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmbalagemSheetsHtml,
  escapeHtml,
  formatWeightKg,
} from "../src/lib/packaging/print-html";

describe("etiqueta de embalagem 100×150", () => {
  it("escapa HTML na descrição e no cliente", () => {
    assert.equal(escapeHtml(`A <b>B</b> & "C"`), "A &lt;b&gt;B&lt;/b&gt; &amp; &quot;C&quot;");
  });

  it("formata peso com vírgula", () => {
    assert.equal(formatWeightKg(3), "3");
    assert.equal(formatWeightKg(1.25), "1,25");
  });

  it("gera uma folha por volume com pedido, peso e QR", () => {
    const html = buildEmbalagemSheetsHtml([
      {
        sequence: 14,
        clientName: `MILARÉ <script>`,
        orderNumber: "260833",
        productCode: "FAPAGNH1400001",
        description: "FILTRO HF-A8",
        pieceQuantity: 2,
        boxLabel: "Avulsa · 31 × 20 × 31 cm",
        weightKg: 3,
        qrDataUrl: "data:image/png;base64,qq",
        logoDataUrl: "data:image/png;base64,ll",
      },
      {
        sequence: 15,
        clientName: "MILARÉ",
        orderNumber: "260833",
        productCode: null,
        description: "FILTRO HF-A8",
        pieceQuantity: 2,
        boxLabel: "Avulsa · 31 × 20 × 31 cm",
        weightKg: 3,
        qrDataUrl: "data:image/png;base64,qq",
        logoDataUrl: "data:image/png;base64,ll",
      },
    ]);
    assert.equal((html.match(/embalagem-sheet/g) || []).length, 2);
    assert.match(html, /Volume 14/);
    assert.match(html, /260833/);
    assert.match(html, /3 kg/);
    assert.match(html, /FAPAGNH1400001/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });
});
