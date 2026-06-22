const ETIQUETA_PRINT_CSS = "/etiquetas/etiqueta-print.css";
const LOAD_TIMEOUT_MS = 12_000;
const IFRAME_CLEANUP_MS = 60_000;

const FALLBACK_PRINT_CSS = `
@page { size: 100mm 20mm; margin: 0; }
html, body { margin: 0; padding: 0; width: 100mm; background: #fff; }
.etiqueta-sheet { width: 100mm; height: 20mm; overflow: hidden; page-break-after: always; }
.etiqueta-filtro { width: 100mm; height: 20mm; font-family: Arial, Helvetica, sans-serif; }
`;

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
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          if (img.complete && img.naturalHeight === 0) {
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

async function loadPrintCss(origin: string): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}${ETIQUETA_PRINT_CSS}`, {
      signal: controller.signal,
      cache: "force-cache",
    });
    if (!res.ok) {
      console.warn(
        "[etiqueta-print] CSS não carregou, usando fallback:",
        res.status
      );
      return FALLBACK_PRINT_CSS;
    }
    return await res.text();
  } catch (err) {
    console.warn("[etiqueta-print] fetch CSS falhou, usando fallback:", err);
    return FALLBACK_PRINT_CSS;
  } finally {
    window.clearTimeout(timer);
  }
}

function absolutizeImages(root: ParentNode, origin: string): void {
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src?.startsWith("/")) {
      img.src = `${origin}${src}`;
    }
  });
}

function removeIframe(iframe: HTMLIFrameElement): void {
  if (iframe.isConnected) {
    iframe.remove();
  }
}

/**
 * Imprime etiquetas num iframe isolado (100×20 mm).
 * Retorna após chamar print() — limpeza do iframe é assíncrona (afterprint).
 */
export async function printEtiquetaInIframe(
  sourceHost: HTMLElement
): Promise<EtiquetaPrintResult> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Impressão etiqueta");
  // Dimensões reais fora da tela: iframe 0×0 oculto impede print() no Edge/Chrome.
  iframe.style.cssText =
    "position:fixed;left:-12000px;top:0;width:110mm;height:25mm;border:0;opacity:0;pointer-events:none;";

  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    console.error("[etiqueta-print] iframe sem contentWindow/contentDocument");
    removeIframe(iframe);
    return { ok: false, error: "Não foi possível criar o contexto de impressão." };
  }

  try {
    const origin = window.location.origin;

    doc.open();
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta</title></head><body></body></html>'
    );
    doc.close();

    const base = doc.createElement("base");
    base.href = `${origin}/`;
    doc.head.appendChild(base);

    const cssText = await loadPrintCss(origin);
    const style = doc.createElement("style");
    style.textContent = cssText;
    doc.head.appendChild(style);

    const clone = sourceHost.cloneNode(true) as HTMLElement;
    clone.className = "etiqueta-print-root";
    clone.removeAttribute("style");
    absolutizeImages(clone, origin);
    doc.body.appendChild(clone);

    await withTimeout(
      waitForImages(doc, LOAD_TIMEOUT_MS),
      LOAD_TIMEOUT_MS,
      "imagens da etiqueta"
    );

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const cleanupIframe = () => {
      win.removeEventListener("afterprint", cleanupIframe);
      removeIframe(iframe);
    };

    win.addEventListener("afterprint", cleanupIframe);
    window.setTimeout(cleanupIframe, IFRAME_CLEANUP_MS);

    win.focus();
    win.print();

    return { ok: true };
  } catch (err) {
    console.error("[etiqueta-print] falha ao imprimir:", err);
    removeIframe(iframe);
    const message =
      err instanceof Error ? err.message : "Erro desconhecido ao imprimir.";
    return { ok: false, error: message };
  }
}
