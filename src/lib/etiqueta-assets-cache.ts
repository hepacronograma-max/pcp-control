import {
  HEPA_LOGO_ETIQUETA_SRC,
  LOGO_CACHE_VERSION,
} from "@/components/linha/etiqueta-filtro-assets";

let cachedForVersion: number | null = null;
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

function resetCacheIfVersionChanged(): void {
  if (cachedForVersion === LOGO_CACHE_VERSION) return;
  cachedForVersion = LOGO_CACHE_VERSION;
  cachedLogoDataUrl = null;
  logoPromise = null;
}

/** Limpa cache em memória após substituir o arquivo PNG manualmente. */
export function invalidateHepaLogoCache(): void {
  cachedLogoDataUrl = null;
  logoPromise = null;
  cachedForVersion = null;
}

/** Pré-carrega o logo HEPA como data URL (cache em memória). */
export function getHepaLogoDataUrl(): Promise<string> {
  resetCacheIfVersionChanged();
  if (cachedLogoDataUrl) return Promise.resolve(cachedLogoDataUrl);
  if (!logoPromise) {
    logoPromise = (async () => {
      const res = await fetch(HEPA_LOGO_ETIQUETA_SRC, { cache: "no-cache" });
      if (!res.ok) {
        throw new Error(
          `Logo da etiqueta não carregou (${res.status}): ${HEPA_LOGO_ETIQUETA_SRC}`
        );
      }
      const url = await blobToDataUrl(await res.blob());
      cachedLogoDataUrl = url;
      return url;
    })();
  }
  return logoPromise;
}
