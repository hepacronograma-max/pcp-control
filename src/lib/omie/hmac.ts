import { createHmac, timingSafeEqual } from "crypto";

export function verifyOmieWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const provided = signatureHeader
    .replace(/^sha256=/i, "")
    .trim()
    .toLowerCase();

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return expected === provided;
  }
}
