import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scannedVolumeCount,
  shippingStationLabel,
  shippingStationOf,
} from "../src/lib/packaging/shipping-stations";

describe("estações de faturamento", () => {
  it("PCP finalizar → Liberado para faturar", () => {
    assert.equal(
      shippingStationOf({ status: "finalized", finalized_at: "2026-09-10", invoiced_at: null, collected_at: null }, true),
      "ready_to_invoice"
    );
    assert.equal(shippingStationLabel("ready_to_invoice"), "Liberado para faturar");
  });

  it("com invoiced_at → Faturado", () => {
    assert.equal(
      shippingStationOf(
        { status: "finalized", finalized_at: "x", invoiced_at: "y", collected_at: null },
        true
      ),
      "invoiced"
    );
  });

  it("com collected_at → Coletado", () => {
    assert.equal(
      shippingStationOf(
        { status: "finalized", finalized_at: "x", invoiced_at: "y", collected_at: "z" },
        true
      ),
      "collected"
    );
  });

  it("só marca allScanned quando todos os volumes foram bipados", () => {
    assert.equal(scannedVolumeCount([]).allScanned, false);
    assert.equal(
      scannedVolumeCount([{ status: "printed" }, { status: "scanned" }]).allScanned,
      false
    );
    assert.equal(
      scannedVolumeCount([{ status: "scanned" }, { status: "scanned" }]).allScanned,
      true
    );
  });
});
