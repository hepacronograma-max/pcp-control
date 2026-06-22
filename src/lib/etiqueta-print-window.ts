import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EtiquetaPrintSheets,
  type EtiquetaFiltroData,
} from "@/components/linha/etiqueta-filtro";
import { ETIQUETA_PRINT_CSS } from "@/lib/etiqueta-print-styles";

const LOAD_TIMEOUT_MS = 12_000;
const WINDOW_CLOSE_FALLBACK_MS = 120_000;

export type EtiquetaPrintResult = { ok: true } | { ok: false; error: string };

export const POPUP_BLOCKED_ERROR =
  "Pop-up bloqueado. Clique no ícone de pop-up bloqueado na barra de endereço, permita pop-ups de pcp-control.vercel.app e tente de novo.";

function tuckPrintWindowAway(win: Window): void {
  try {
    win.moveTo(-32_000, -32_000);
    win.resizeTo(1, 1);
  } catch {
    /* moveTo/resizeTo podem falhar fora do gesto do usuário */
  }
}

/** Abre janela mínima fora da tela — deve ser chamado de forma síncrona no clique. */
export function openEtiquetaPrintWindow(): Window | null {
  const printWin = window.open(
    "about:blank",
    "etiqueta-print-hepa",
    "left=-32000,top=-32000,width=1,height=1,menubar=no,toolbar=no,location=no,status=no,scrollbars=no"
  );
  if (printWin) {
    tuckPrintWindowAway(printWin);
  }
  return printWin;
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

function waitForDocumentReady(win: Window): Promise<void> {
  return new Promise<void>((resolve) => {
    const run = () => {
      void waitForImages(win.document, LOAD_TIMEOUT_MS).then(resolve);
    };
    if (win.document.readyState === "complete") {
      run();
    } else {
      win.addEventListener("load", run, { once: true });
      window.setTimeout(run, LOAD_TIMEOUT_MS);
    }
  });
}

const PRINT_WINDOW_HIDE_SCRIPT = `<script>
(function () {
  function esconder() {
    try {
      window.moveTo(-32000, -32000);
      window.resizeTo(1, 1);
    } catch (e) {}
  }
  esconder();
  document.addEventListener("DOMContentLoaded", esconder);
})();
</script>`;

const PRINT_WINDOW_CLOSE_SCRIPT = `<script>
(function () {
  function fechar() {
    try { window.close(); } catch (e) {}
  }
  window.addEventListener("afterprint", function () {
    setTimeout(fechar, 80);
  });
  if (window.matchMedia) {
    var mq = window.matchMedia("print");
    var fechando = false;
    mq.addEventListener("change", function (ev) {
      if (!ev.matches && !fechando) {
        fechando = true;
        setTimeout(fechar, 120);
      }
    });
  }
  setTimeout(fechar, ${WINDOW_CLOSE_FALLBACK_MS});
})();
</script>`;

function buildPrintDocumentHtml(etiquetas: EtiquetaFiltroData[]): string {
  const sheetsHtml = renderToStaticMarkup(
    createElement(EtiquetaPrintSheets, { etiquetas })
  );
  const bodyHtml = `<div class="etiqueta-print-root">${sheetsHtml}</div>`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Etiqueta HEPA</title>
<style>${ETIQUETA_PRINT_CSS}</style>
${PRINT_WINDOW_HIDE_SCRIPT}
</head>
<body>${bodyHtml}${PRINT_WINDOW_CLOSE_SCRIPT}</body>
</html>`;
}

function scheduleWindowCloseFromParent(printWin: Window): void {
  let closed = false;
  const close = () => {
    if (closed || printWin.closed) return;
    closed = true;
    printWin.removeEventListener("afterprint", onAfterPrint);
    try {
      printWin.close();
    } catch {
      /* ignore */
    }
  };

  const onAfterPrint = () => {
    window.setTimeout(close, 80);
  };

  try {
    printWin.addEventListener("afterprint", onAfterPrint);
    printWin.onafterprint = onAfterPrint;
  } catch {
    /* ignore */
  }

  window.setTimeout(close, WINDOW_CLOSE_FALLBACK_MS);
}

/**
 * Escreve etiquetas na janela já aberta e chama print() nela.
 * Retorna logo após print() — a janela fecha sozinha (afterprint + script interno).
 */
export async function printEtiquetaInWindow(
  printWin: Window,
  etiquetas: EtiquetaFiltroData[]
): Promise<EtiquetaPrintResult> {
  if (printWin.closed) {
    return {
      ok: false,
      error: "A janela de impressão foi fechada antes de concluir.",
    };
  }

  if (etiquetas.length === 0) {
    try {
      printWin.close();
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Nenhuma etiqueta para imprimir." };
  }

  try {
    tuckPrintWindowAway(printWin);

    const html = buildPrintDocumentHtml(etiquetas);
    const doc = printWin.document;
    doc.open();
    doc.write(html);
    doc.close();

    tuckPrintWindowAway(printWin);

    await waitForDocumentReady(printWin);

    tuckPrintWindowAway(printWin);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    // Mantém foco no PCP — evita popup piscar na frente do operador
    window.focus();

    console.log("[etiqueta-print] print() chamado", {
      sheets: etiquetas.length,
      target: "window",
    });
    printWin.print();
    console.log(
      "[etiqueta-print] print() retornou (diálogo pode estar aberto)"
    );

    tuckPrintWindowAway(printWin);
    window.focus();
    scheduleWindowCloseFromParent(printWin);

    return { ok: true };
  } catch (err) {
    console.error("[etiqueta-print] falha na janela de impressão:", err);
    try {
      printWin.close();
    } catch {
      /* ignore */
    }
    const message =
      err instanceof Error ? err.message : "Erro desconhecido ao imprimir.";
    return { ok: false, error: message };
  }
}
