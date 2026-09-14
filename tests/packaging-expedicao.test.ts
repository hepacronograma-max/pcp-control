import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseExpedicaoQr,
  packingListQrHref,
} from "../src/lib/packaging/parse-expedicao-qr";
import { parseVolumeQrToken } from "../src/lib/packaging/parse-volume-qr";
import { canFinishLoading, expedicaoStationOf } from "../src/lib/packaging/expedicao";

describe("parseVolumeQrToken", () => {
  it("lê uuid na URL da etiqueta", () => {
    assert.equal(
      parseVolumeQrToken(
        "http://localhost:3000/embarque/bipar/11111111-1111-4111-8111-111111111111"
      ),
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("aceita uuid puro", () => {
    assert.equal(
      parseVolumeQrToken("11111111-1111-4111-8111-111111111111"),
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("rejeita lixo", () => {
    assert.equal(parseVolumeQrToken("FAPAGNH1400001"), null);
  });
});

describe("QR da packing list", () => {
  const listId = "22222222-2222-4222-8222-222222222222";

  it("monta URL da conferência", () => {
    assert.equal(
      packingListQrHref("http://localhost:3000", listId),
      `http://localhost:3000/expedicao?lista=${listId}`
    );
  });

  it("lê QR principal da packing list", () => {
    assert.deepEqual(
      parseExpedicaoQr(`http://localhost:3000/expedicao?lista=${listId}`),
      { type: "list", listId }
    );
    assert.deepEqual(
      parseExpedicaoQr(`/embarque/lista/${listId}`),
      { type: "list", listId }
    );
  });

  it("não confunde packing list com caixa", () => {
    assert.deepEqual(
      parseExpedicaoQr(
        "http://localhost:3000/embarque/bipar/11111111-1111-4111-8111-111111111111"
      ),
      { type: "volume", token: "11111111-1111-4111-8111-111111111111" }
    );
  });
});

describe("expedição", () => {
  it("três abas: material pronto / nota / coletado", () => {
    assert.equal(expedicaoStationOf({ invoiced_at: null, collected_at: null }), "ready");
    assert.equal(
      expedicaoStationOf({ invoiced_at: "x", collected_at: null }),
      "invoiced"
    );
    assert.equal(
      expedicaoStationOf({ invoiced_at: "x", collected_at: "y" }),
      "finished"
    );
  });

  it("só finaliza com todos bipados e foto", () => {
    const vols = [{ status: "scanned" as const }, { status: "scanned" as const }];
    assert.equal(
      canFinishLoading({ cargo_photo_url: null, collected_at: null }, vols).ok,
      false
    );
    assert.equal(
      canFinishLoading(
        { cargo_photo_url: "https://x/foto.jpg", collected_at: null },
        [{ status: "printed" }]
      ).ok,
      false
    );
    assert.equal(
      canFinishLoading(
        { cargo_photo_url: "https://x/foto.jpg", collected_at: null },
        vols
      ).ok,
      true
    );
  });
});
