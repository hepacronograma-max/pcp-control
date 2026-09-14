import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canChangePieceQuantity,
  parsePositiveWeightKg,
  printReadiness,
  remainingPieces,
  sequenceLabel,
  suggestAllocation,
} from "../src/lib/packaging/allocation";

describe("suggestAllocation (exemplo Helder: 10 peças / 3 por caixa)", () => {
  it("gera 3 volumes de 3 e deixa 1 peça pendente do item", () => {
    const r = suggestAllocation({
      remaining: 10,
      piecesPerBox: 3,
    });
    assert.ok(!("error" in r));
    if ("error" in r) return;
    assert.equal(r.volumeCount, 3);
    assert.equal(r.piecesPerVolume, 3);
    assert.equal(r.piecesCovered, 9);
    assert.equal(r.leftover, 1);
  });

  it("repetir 1 caixa de 3 com saldo 10 deixa 7 peças", () => {
    const r = suggestAllocation({
      remaining: 10,
      piecesPerBox: 3,
      repeatCount: 1,
    });
    assert.ok(!("error" in r));
    if ("error" in r) return;
    assert.equal(r.volumeCount, 1);
    assert.equal(r.leftover, 7);
  });

  it("recusa padrão maior que o saldo de peças do item", () => {
    const r = suggestAllocation({
      remaining: 1,
      piecesPerBox: 3,
    });
    assert.ok("error" in r);
  });
});

describe("remainingPieces / printReadiness / edição", () => {
  it("saldo após alocar 9 de 10 peças do item", () => {
    assert.equal(
      remainingPieces(10, [{ piece_quantity: 3 }, { piece_quantity: 3 }, { piece_quantity: 3 }]),
      1
    );
  });

  it("bloqueia impressão com saldo de peças e sem peso", () => {
    const vols = [
      { piece_quantity: 3, weight_kg: null },
      { piece_quantity: 3, weight_kg: 1.2 },
      { piece_quantity: 3, weight_kg: 1.2 },
    ];
    const blocked = printReadiness(10, vols);
    assert.equal(blocked.ok, false);

    const stillShort = printReadiness(10, [
      ...vols.map((v) => ({ ...v, weight_kg: 1 })),
    ]);
    assert.equal(stillShort.ok, false);

    const ready = printReadiness(10, [
      { piece_quantity: 3, weight_kg: 1 },
      { piece_quantity: 3, weight_kg: 1 },
      { piece_quantity: 3, weight_kg: 1 },
      { piece_quantity: 1, weight_kg: 0.4 },
    ]);
    assert.equal(ready.ok, true);
  });

  it("editar quantidade devolve diferença ao saldo de peças", () => {
    const remaining = remainingPieces(10, [
      { piece_quantity: 3 },
      { piece_quantity: 3 },
      { piece_quantity: 3 },
    ]);
    const ok = canChangePieceQuantity({
      currentQuantity: 3,
      nextQuantity: 1,
      remaining,
    });
    assert.equal(ok.ok, true);
    const tooMuch = canChangePieceQuantity({
      currentQuantity: 3,
      nextQuantity: 5,
      remaining,
    });
    assert.equal(tooMuch.ok, false);
  });

  it("rótulo de sequência e peso", () => {
    assert.equal(sequenceLabel(3), "Volume 3");
    const w = parsePositiveWeightKg("1,250");
    assert.equal(w.ok, true);
    if (w.ok) assert.equal(w.kg, 1.25);
  });
});
