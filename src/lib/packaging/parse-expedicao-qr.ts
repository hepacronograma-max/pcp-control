import { parseVolumeQrToken } from "@/lib/packaging/parse-volume-qr";

const UUID_RE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export type ExpedicaoQrScan =
  | { type: "list"; listId: string }
  | { type: "volume"; token: string };

/** URL do QR principal da packing list (abre a conferência no celular). */
export function packingListQrHref(origin: string, listId: string): string {
  const base = String(origin ?? "").replace(/\/$/, "");
  return `${base}/expedicao?lista=${encodeURIComponent(listId)}`;
}

export function parsePackingListQr(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const fromQuery = t.match(new RegExp(`[?&]lista=(${UUID_RE})`, "i"));
  if (fromQuery?.[1] && /expedicao/i.test(t)) {
    return fromQuery[1].toLowerCase();
  }
  const fromPath = t.match(new RegExp(`embarque\\/lista\\/(${UUID_RE})`, "i"));
  if (fromPath?.[1]) return fromPath[1].toLowerCase();
  return null;
}

export function parseExpedicaoQr(raw: string): ExpedicaoQrScan | null {
  const listId = parsePackingListQr(raw);
  if (listId) return { type: "list", listId };
  const token = parseVolumeQrToken(raw);
  if (token) return { type: "volume", token };
  return null;
}
