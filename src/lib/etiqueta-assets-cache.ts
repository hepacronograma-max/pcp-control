import { HEPA_LOGO_ETIQUETA_SRC } from "@/components/linha/etiqueta-filtro-assets";

let cachedLogoDataUrl: string | null = null;
let cachedLogoPrintDataUrl: string | null = null;
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

/** Escurece/contrasta o logo para impressão térmica (preto mais sólido). */
function processLogoForThermalPrint(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.filter = "contrast(1.6) brightness(0.86) saturate(1.1)";
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Pré-carrega o logo HEPA como data URL (cache em memória). */
export function getHepaLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return Promise.resolve(cachedLogoDataUrl);
  if (!logoPromise) {
    logoPromise = (async () => {
      const res = await fetch(HEPA_LOGO_ETIQUETA_SRC, { cache: "force-cache" });
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

/** Logo otimizado para térmica — mais escuro/contrastado que o preview. */
export async function getHepaLogoDataUrlForPrint(): Promise<string> {
  if (cachedLogoPrintDataUrl) return cachedLogoPrintDataUrl;
  const base = await getHepaLogoDataUrl();
  const processed = await processLogoForThermalPrint(base);
  cachedLogoPrintDataUrl = processed;
  return processed;
}
