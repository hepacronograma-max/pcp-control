export type OmieIntegrationMode = "shadow" | "active";

export function getOmieIntegrationMode(): OmieIntegrationMode {
  const raw = (process.env.OMIE_INTEGRATION_MODE ?? "shadow").trim().toLowerCase();
  return raw === "active" ? "active" : "shadow";
}

export function isShadowMode(): boolean {
  return getOmieIntegrationMode() !== "active";
}
