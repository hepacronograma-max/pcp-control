import { ETIQUETA_PRINT_CSS } from "@/lib/etiqueta-print-styles";

const LOAD_TIMEOUT_MS = 12_000;
const IFRAME_CLEANUP_MS = 60_000;

export type EtiquetaPrintResult = { ok: true } | { ok: false; error: string };

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Timeout (${label}) após ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

function waitForImages(doc: Document, timeoutMs: number): Promise<void> {
  const imgs = doc.querySelectorAll("img");
  if (imgs.length === 0) return Promise.resolve();

  return Promise.all(
    Array.from(imgs).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, timeoutMs);
        })
    )
  ).then(() => undefined);
}

/** Copia src das imagens do host original (data URLs já resolvidas). */
function syncImagesFromSource(clone: HTMLElement, source: HTMLElement): void {
  const sourceImgs = source.querySelectorAll("img");
  const cloneImgs = clone.querySelectorAll("img");
  cloneImgs.forEach((cloneImg, index) => {
    const sourceImg = sourceImgs[index];
    if (!sourceImg?.src) return;
    cloneImg.src = sourceImg.src;
  });
}

function removeIframe(iframe: HTMLIFrameElement): void {
  if (iframe.isConnected) {
    iframe.remove();
  }
}

function scheduleIframeCleanup(iframe: HTMLIFrameElement, win: Window): void {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    win.removeEventListener("afterprint", onAfterPrint);
    removeIframe(iframe);
  };

  const onAfterPrint = () => cleanup();

  win.addEventListener("afterprint", onAfterPrint);
  window.setTimeout(cleanup, IFRAME_CLEANUP_MS);
}

/**
 * Imprime etiquetas num iframe isolado (100×20 mm).
 * Sem fetch de rede: CSS embutido e imagens já em data URL no host.
 * Retorna logo após chamar print() — limpeza do iframe é assíncrona (afterprint).
 */
export async function printEtiquetaInIframe(
  sourceHost: HTMLElement
): Promise<EtiquetaPrintResult> {
  const sheetCount = sourceHost.querySelectorAll(".etiqueta-sheet").length;
  if (sheetCount === 0) {
    return {
      ok: false,
      error: "Nenhuma etiqueta encontrada para impressão.",
    };
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Impressão etiqueta");
  // Dimensões reais fora da tela: 0×0 ou on-screen bloqueia print() com modal aberto no Edge.
  iframe.style.cssText =
    "position:fixed;left:-12000px;top:0;width:110mm;height:25mm;border:0;opacity:1;pointer-events:none;";

  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    console.error("[etiqueta-print] iframe sem contentWindow/contentDocument");
    removeIframe(iframe);
    return {
      ok: false,
      error: "Não foi possível criar o contexto de impressão.",
    };
  }

  try {
    doc.open();
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta</title></head><body></body></html>'
    );
    doc.close();

    const style = doc.createElement("style");
    style.textContent = ETIQUETA_PRINT_CSS;
    doc.head.appendChild(style);

    const clone = sourceHost.cloneNode(true) as HTMLElement;
    clone.className = "etiqueta-print-root";
    clone.removeAttribute("style");
    syncImagesFromSource(clone, sourceHost);
    doc.body.appendChild(clone);

    await withTimeout(
      waitForImages(doc, LOAD_TIMEOUT_MS),
      LOAD_TIMEOUT_MS,
      "imagens da etiqueta"
    );

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    iframe.focus();
    win.focus();

    console.log("[etiqueta-print] print() chamado", {
      sheets: sheetCount,
      iframeWindow: win === iframe.contentWindow,
    });
    win.print();
    console.log("[etiqueta-print] print() retornou (diálogo pode estar aberto)");

    scheduleIframeCleanup(iframe, win);

    return { ok: true };
  } catch (err) {
    console.error("[etiqueta-print] falha ao imprimir:", err);
    removeIframe(iframe);
    const message =
      err instanceof Error ? err.message : "Erro desconhecido ao imprimir.";
    return { ok: false, error: message };
  }
}
