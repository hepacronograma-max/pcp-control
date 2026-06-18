const ETIQUETA_PRINT_CSS = "/etiquetas/etiqueta-print.css";

function waitForImages(doc: Document): Promise<void> {
  const imgs = doc.querySelectorAll("img");
  return Promise.all(
    Array.from(imgs).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  ).then(() => undefined);
}

function waitForStylesheet(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    if (link.sheet) {
      resolve();
      return;
    }
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
  });
}

function absolutizeImages(root: ParentNode, origin: string): void {
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src?.startsWith("/")) {
      img.src = `${origin}${src}`;
    }
  });
}

/**
 * Imprime etiquetas num iframe isolado (100×20 mm) para evitar que o layout
 * da aplicação e o driver Argox distorçam @page do documento principal.
 */
export async function printEtiquetaInIframe(
  sourceHost: HTMLElement,
  onFinished: () => void
): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Impressão etiqueta");
  iframe.style.cssText =
    "position:fixed;border:0;width:0;height:0;visibility:hidden";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    onFinished();
    return;
  }

  const origin = window.location.origin;

  doc.open();
  doc.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta</title></head><body></body></html>'
  );
  doc.close();

  const inlinePage = doc.createElement("style");
  inlinePage.textContent = `
    @page { size: 100mm 20mm; margin: 0; }
    html, body { margin: 0; padding: 0; width: 100mm; background: #fff; }
  `;
  doc.head.appendChild(inlinePage);

  const base = doc.createElement("base");
  base.href = `${origin}/`;
  doc.head.appendChild(base);

  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = `${origin}${ETIQUETA_PRINT_CSS}`;
  doc.head.appendChild(link);
  await waitForStylesheet(link);

  const clone = sourceHost.cloneNode(true) as HTMLElement;
  clone.className = "etiqueta-print-root";
  clone.removeAttribute("style");
  absolutizeImages(clone, origin);
  doc.body.appendChild(clone);

  await waitForImages(doc);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const cleanup = () => {
    win.removeEventListener("afterprint", cleanup);
    iframe.remove();
    onFinished();
  };

  win.addEventListener("afterprint", cleanup);
  win.focus();
  win.print();

  window.setTimeout(() => {
    if (iframe.isConnected) cleanup();
  }, 120_000);
}
