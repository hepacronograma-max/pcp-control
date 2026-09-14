/** Extrai o token do QR da etiqueta (`/embarque/bipar/{uuid}` ou o uuid puro). */
export function parseVolumeQrToken(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const fromUrl = t.match(/embarque\/bipar\/([0-9a-f-]{36})/i);
  if (fromUrl?.[1]) return fromUrl[1].toLowerCase();
  const uuid = t.match(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  if (uuid) return t.toLowerCase();
  return null;
}
