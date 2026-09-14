import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocatedQtyForItem,
  itemQtyFromVolume,
  maxEqualVolumeCount,
  mixPieceTotal,
  parseAllocateMix,
  volumeIdsForItem,
} from "../src/lib/packaging/volume-items";
import { buildEmbalagemSheetsHtml } from "../src/lib/packaging/print-html";

describe("agrupar itens na mesma caixa", () => {
  it("recusa o mesmo item duas vezes", () => {
    const r = parseAllocateMix({
      hostItemId: "11111111-1111-4111-8111-111111111111",
      hostPieces: 2,
      groupedItems: [
        { orderItemId: "11111111-1111-4111-8111-111111111111", pieceQuantity: 1 },
      ],
    });
    assert.equal(r.ok, false);
  });

  it("monta o mix host + extra", () => {
    const r = parseAllocateMix({
      hostItemId: "11111111-1111-4111-8111-111111111111",
      hostPieces: 2,
      groupedItems: [
        { orderItemId: "22222222-2222-4222-8222-222222222222", pieceQuantity: 3 },
      ],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.lines.length, 2);
    assert.equal(mixPieceTotal(r.lines), 5);
  });

  it("máximo de volumes iguais é o menor saldo/peças", () => {
    assert.equal(
      maxEqualVolumeCount([
        { pieceQuantity: 2, remaining: 50 },
        { pieceQuantity: 1, remaining: 10 },
      ]),
      10
    );
    assert.equal(
      maxEqualVolumeCount([{ pieceQuantity: 3, remaining: 2 }]),
      0
    );
  });

  it("saldo do item B conta volume agrupado no item A", () => {
    const volumes = [
      {
        id: "vol-1",
        order_item_id: "item-a",
        piece_quantity: 5,
      },
    ];
    const lines = [
      { volume_id: "vol-1", order_item_id: "item-a", piece_quantity: 2 },
      { volume_id: "vol-1", order_item_id: "item-b", piece_quantity: 3 },
    ];
    assert.equal(allocatedQtyForItem("item-b", volumes, lines), 3);
    assert.equal(allocatedQtyForItem("item-a", volumes, lines), 2);
    assert.deepEqual(volumeIdsForItem("item-b", volumes, lines), ["vol-1"]);
    assert.equal(
      itemQtyFromVolume(
        { order_item_id: "item-a", piece_quantity: 5, items: lines },
        "item-b"
      ),
      3
    );
  });

  it("etiqueta lista os dois itens da caixa", () => {
    const html = buildEmbalagemSheetsHtml([
      {
        sequence: 3,
        clientName: "Cliente",
        orderNumber: "260833",
        productCode: "A",
        description: "Filtro A",
        pieceQuantity: 5,
        items: [
          { productCode: "A", description: "Filtro A", pieceQuantity: 2 },
          { productCode: "B", description: "Filtro B", pieceQuantity: 3 },
        ],
        boxLabel: "Avulsa · 31 × 20 × 31 cm",
        weightKg: 4.5,
        qrDataUrl: "data:image/png;base64,qq",
        logoDataUrl: "data:image/png;base64,ll",
      },
    ]);
    assert.match(html, /Filtro A/);
    assert.match(html, /Filtro B/);
    assert.match(html, />2</);
    assert.match(html, />3</);
  });
});
