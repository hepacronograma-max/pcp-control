/**
 * PDFs como `260184_4.pdf` ou `260184-4.pdf` representam a N-ésima parte do pedido
 * (ex.: 4ª parte) e devem ser armazenados como `260184/4`, não como duplicata de `260184`.
 */
export function orderNumberFromPdfFileName(fileName: string): string | null {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  const m = base.match(/^(\d+)[_\-](\d+)$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}`.slice(0, 50);
}
