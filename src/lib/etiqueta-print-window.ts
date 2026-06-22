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

function maximizePrintWindow(win: Window): void {
  try {
    const { availWidth, availHeight } = window.screen;
    win.moveTo(0, 0);
    win.resizeTo(availWidth, availHeight);
  } catch {
    /* moveTo/resizeTo podem falhar em alguns navegadores */
  }
}

/** Abre janela maximizada — deve ser chamado de forma síncrona no clique. */
export function openEtiquetaPrintWindow(): Window | null {
  const { availWidth, availHeight } = window.screen;
  const printWin = window.open(
    "about:blank",
    "etiqueta-print-hepa",
    `width=${availWidth},height=${availHeight},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`
  );
  if (printWin) {
    maximizePrintWindow(printWin);
  }
  return printWin;
}

/** Script na janela popup: aguarda imagens, chama print(), fecha após afterprint. */
const PRINT_WINDOW_SCRIPT = `<script>
(function () {
  var printed = false;
  var fechando = false;

  function fechar() {
    if (fechando) return;
    fechando = true;
    try { window.close(); } catch (e) {}
  }

  function doPrint() {
    if (printed) return;
    printed = true;
    try {
      console.log("[etiqueta-print] print() chamado (janela)");
      window.focus();
      window.print();
      console.log("[etiqueta-print] print() retornou (diálogo pode estar aberto)");
    } catch (e) {
      console.error("[etiqueta-print] print() falhou:", e);
    }
  }

  function schedulePrint() {
    requestAnimationFrame(function () {
      requestAnimationFrame(doPrint);
    });
  }

  function whenReady() {
    var imgs = document.querySelectorAll("img");
    var pending = 0;
    imgs.forEach(function (img) {
      if (!img.complete) {
        pending++;
        var check = function () {
          pending--;
          if (pending <= 0) schedulePrint();
        };
        img.addEventListener("load", check, { once: true });
        img.addEventListener("error", check, { once: true });
      }
    });
    if (pending === 0) schedulePrint();
  }

  window.addEventListener("afterprint", function () {
    setTimeout(fechar, 80);
  });

  if (window.matchMedia) {
    var mq = window.matchMedia("print");
    mq.addEventListener("change", function (ev) {
      if (!ev.matches) setTimeout(fechar, 120);
    });
  }

  setTimeout(fechar, ${WINDOW_CLOSE_FALLBACK_MS});

  if (document.readyState === "complete") {
    whenReady();
  } else {
    window.addEventListener("load", whenReady, { once: true });
  }

  setTimeout(function () {
    if (!printed) whenReady();
  }, 600);
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
</head>
<body>${bodyHtml}${PRINT_WINDOW_SCRIPT}</body>
</html>`;
}

/**
 * Escreve etiquetas na janela já aberta.
 * O print() roda DENTRO da popup (script inline) — o opener perde o gesto do usuário após await.
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
    const html = buildPrintDocumentHtml(etiquetas);
    const doc = printWin.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Aguarda sinal de que o documento montou (print dispara no script da popup).
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, LOAD_TIMEOUT_MS);
      const done = () => {
        window.clearTimeout(timer);
        resolve();
      };
      if (printWin.document.readyState === "complete") {
        window.setTimeout(done, 400);
      } else {
        printWin.addEventListener("load", () => window.setTimeout(done, 400), {
          once: true,
        });
      }
    });

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
