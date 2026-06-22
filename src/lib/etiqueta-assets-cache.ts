import { HEPA_LOGO_ETIQUETA_SRC } from "@/components/linha/etiqueta-filtro-assets";

let cachedLogoDataUrl: string | null = null;
let logoPromise: Promise<string> | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler logo da etiqueta."));
    reader.readAsDataURL(blob);
  });
}

/** Limpa cache em memória após substituir o arquivo PNG manualmente. */
export function invalidateHepaLogoCache(): void {
  cachedLogoDataUrl = null;
  logoPromise = null;
}

/** Pré-carrega o logo HEPA como data URL (cache em memória). */
export function getHepaLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return Promise.resolve(cachedLogoDataUrl);
  if (!logoPromise) {
    logoPromise = (async () => {
      const res = await fetch(HEPA_LOGO_ETIQUETA_SRC, { cache: "no-cache" });
      if (!res.ok) {
        throw new Error(`Logo da etiqueta não carregou (${res.status}).`);
      }
      const url = await blobToDataUrl(await res.blob());
      cachedLogoDataUrl = url;
      return url;
    })();
  }
  return logoPromise;
}
