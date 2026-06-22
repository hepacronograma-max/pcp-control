"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LineItemWithOrder } from "@/components/linha/gantt-calendar";
import {
  EtiquetaPrintSheets,
  type EtiquetaFiltroData,
} from "@/components/linha/etiqueta-filtro";
import {
  codigoEtiquetaFromItem,
  decidirModeloEtiqueta,
  descricaoSemMedida,
  detectarClasseFiltragem,
  gerarEtiquetasComSeries,
  gerarEtiquetasSeriesEspecificas,
  gerarLoteEtiqueta,
  medidaEtiquetaFromDescricao,
  parseSeriesReimpressao,
} from "@/lib/utils/etiqueta-filtro";
import {
  openEtiquetaPrintWindow,
  POPUP_BLOCKED_ERROR,
  printEtiquetaInWindow,
} from "@/lib/etiqueta-print-window";
import { getHepaLogoDataUrl } from "@/lib/etiqueta-assets-cache";

const QR_URL = "https://www.hepafiltros.com.br";

const QR_OPTS = {
  width: 120,
  margin: 0,
  errorCorrectionLevel: "M" as const,
  color: { dark: "#000000", light: "#FFFFFF" },
};

/** Valores de exemplo no preview completa quando campos técnicos estão vazios. */
const PREVIEW_DEMO_FAIXA = {
  vazao: "280",
  perdaInicial: "250",
  perdaFinal: "400",
  classe: "F8",
} as const;

type Props = {
  item: LineItemWithOrder | null;
  open: boolean;
  onClose: () => void;
};

export function GerarEtiquetaModal({ item, open, onClose }: Props) {
  const descricao = item?.description ?? "";
  const productCode = item?.product_code ?? null;

  const detected = useMemo(
    () => detectarClasseFiltragem(descricao, productCode),
    [descricao, productCode]
  );

  const [classe, setClasse] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [vazao, setVazao] = useState("");
  const [perdaInicial, setPerdaInicial] = useState("");
  const [perdaFinal, setPerdaFinal] = useState("");
  const [reimprimirSeries, setReimprimirSeries] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [previewQr, setPreviewQr] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setPrintError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !item) return;
    setClasse(detected ?? "");
    setQuantidade(Math.max(1, Number(item.quantity) || 1));
    setVazao("");
    setPerdaInicial("");
    setPerdaFinal("");
    setReimprimirSeries("");
  }, [open, item, detected]);

  const modelo = decidirModeloEtiqueta(classe.trim() || null);
  const codigo = item
    ? codigoEtiquetaFromItem(productCode, descricao)
    : "—";
  const descricaoEtiqueta = descricaoSemMedida(descricao) || descricao.trim();
  const medida = medidaEtiquetaFromDescricao(descricao);
  const lote = item
    ? gerarLoteEtiqueta({
        numeroPedidoVisivel: item.order.order_number,
      })
    : "—";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(QR_URL, QR_OPTS)
      .then((url) => {
        if (!cancelled) setPreviewQr(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewQr("");
      });
    void getHepaLogoDataUrl().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const buildEtiquetaBase = useCallback(() => {
      if (!previewQr || !item) return null;
      return {
        codigo,
        descricaoEtiqueta,
        medida,
        classe: classe.trim() || null,
        modelo,
        lote,
        vazao: vazao.trim(),
        perdaInicial: perdaInicial.trim(),
        perdaFinal: perdaFinal.trim(),
        qrDataUrl: previewQr,
      };
    },
    [
      previewQr,
      item,
      modelo,
      codigo,
      descricaoEtiqueta,
      medida,
      classe,
      lote,
      vazao,
      perdaInicial,
      perdaFinal,
    ]
  );

  const buildEtiquetaData = useCallback((): EtiquetaFiltroData | null => {
      const base = buildEtiquetaBase();
      if (!base) return null;
      return { ...base, serie: 1, serieTotal: quantidade };
    },
    [buildEtiquetaBase, quantidade]
  );

  const previewBase = buildEtiquetaData();
  const previewEtiqueta =
    previewBase && modelo === "completa"
      ? {
          ...previewBase,
          classe:
            previewBase.classe?.trim() ||
            detected ||
            PREVIEW_DEMO_FAIXA.classe,
          vazao: previewBase.vazao || PREVIEW_DEMO_FAIXA.vazao,
          perdaInicial:
            previewBase.perdaInicial || PREVIEW_DEMO_FAIXA.perdaInicial,
          perdaFinal:
            previewBase.perdaFinal || PREVIEW_DEMO_FAIXA.perdaFinal,
        }
      : previewBase;

  const seriesReimpressao = useMemo(
    () => parseSeriesReimpressao(reimprimirSeries, quantidade),
    [reimprimirSeries, quantidade]
  );

  const quantidadeImpressao = useMemo(() => {
    if (!seriesReimpressao.ok || seriesReimpressao.numeros.length === 0) {
      return quantidade;
    }
    return seriesReimpressao.numeros.length;
  }, [seriesReimpressao, quantidade]);

  const handlePrint = useCallback(() => {
    if (!item || quantidade < 1 || printing) return;
    setPrintError(null);

    const parsed = parseSeriesReimpressao(reimprimirSeries, quantidade);
    if (!parsed.ok) {
      setPrintError(parsed.error);
      return;
    }

    const printWin = openEtiquetaPrintWindow();
    if (!printWin) {
      setPrintError(POPUP_BLOCKED_ERROR);
      return;
    }

    setPrinting(true);

    void (async () => {
      try {
        const [qrDataUrl, logoDataUrl] = await Promise.all([
          QRCode.toDataURL(QR_URL, QR_OPTS),
          getHepaLogoDataUrl(),
        ]);
        const base = {
          codigo,
          descricaoEtiqueta,
          medida,
          classe: classe.trim() || null,
          modelo,
          lote,
          vazao: vazao.trim(),
          perdaInicial: perdaInicial.trim(),
          perdaFinal: perdaFinal.trim(),
          qrDataUrl,
          logoDataUrl,
        };
        const batch =
          parsed.numeros.length === 0
            ? gerarEtiquetasComSeries(base, quantidade)
            : gerarEtiquetasSeriesEspecificas(
                base,
                parsed.numeros,
                quantidade
              );
        const result = await printEtiquetaInWindow(printWin, batch);
        if (!result.ok) {
          setPrintError(result.error);
        }
      } catch (err) {
        console.error("[etiqueta-print] preparação:", err);
        setPrintError(
          err instanceof Error
            ? err.message
            : "Não foi possível preparar a impressão."
        );
        try {
          printWin.close();
        } catch {
          /* ignore */
        }
      } finally {
        setPrinting(false);
      }
    })();
  }, [
    item,
    quantidade,
    printing,
    codigo,
    descricaoEtiqueta,
    medida,
    classe,
    modelo,
    lote,
    vazao,
    perdaInicial,
    perdaFinal,
    reimprimirSeries,
  ]);

  if (!item) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar etiqueta de filtro</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <p>
                <span className="font-semibold text-slate-700">Código:</span>{" "}
                {codigo}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Descrição:</span>{" "}
                {descricaoEtiqueta}
              </p>
              {medida ? (
                <p>
                  <span className="font-semibold text-slate-700">Medida:</span>{" "}
                  {medida}
                </p>
              ) : null}
              <p>
                <span className="font-semibold text-slate-700">Lote:</span>{" "}
                {lote}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Série (preview):</span>{" "}
                1/{quantidade}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Modelo:</span>{" "}
                {modelo === "completa"
                  ? "Completa (F/H)"
                  : "Simples (G/M ou sem classe)"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-700">
                Classe (editável)
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={classe}
                  onChange={(e) => setClasse(e.target.value)}
                  placeholder="Ex.: F8, G4, H14"
                />
              </label>
              <label className="text-xs font-medium text-slate-700">
                Quantidade (etiquetas)
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={quantidade}
                  onChange={(e) =>
                    setQuantidade(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              Reimprimir série específica (opcional)
              <input
                type="text"
                inputMode="numeric"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                value={reimprimirSeries}
                onChange={(e) => setReimprimirSeries(e.target.value)}
                placeholder="Ex.: 7 ou 7,12,15"
                disabled={printing}
              />
              <span className="mt-1 block font-normal text-[10px] leading-snug text-slate-500">
                Deixe em branco para imprimir todas ({quantidade} etiquetas, séries
                1/{quantidade} até {quantidade}/{quantidade}). Para reimprimir
                etiquetas que estragaram, digite o número da série (ex:{" "}
                <strong>7</strong> ou <strong>7,12</strong>) — sai como 7/
                {quantidade}, mantendo o mesmo lote.
              </span>
            </label>

            {modelo === "completa" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-700">
                  Vazão (m³/h)
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={vazao}
                    onChange={(e) => setVazao(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  ΔPi (Pa)
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={perdaInicial}
                    onChange={(e) => setPerdaInicial(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  ΔPf (Pa)
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={perdaFinal}
                    onChange={(e) => setPerdaFinal(e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            {previewEtiqueta ? (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-600">
                  Pré-visualização 100×20 mm —{" "}
                  <strong>
                    {modelo === "completa"
                      ? "modelo completa (F/H)"
                      : "modelo simples (G/M)"}
                  </strong>
                  {modelo === "completa" &&
                  !vazao.trim() &&
                  !perdaInicial.trim() &&
                  !perdaFinal.trim()
                    ? " · faixa técnica com valores de exemplo enquanto campos vazios"
                    : null}
                  {" · "}escala ajustada · logo original.
                </p>
                <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 overflow-hidden">
                  <EtiquetaPrintSheets etiquetas={[previewEtiqueta]} preview />
                </div>
              </div>
            ) : null}

            <div className="flex flex-col items-end gap-2 pt-1">
              {printError ? (
                <p className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                  {printError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={onClose}
                disabled={printing}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-[#1B4F72] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163d58] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handlePrint}
                disabled={printing}
              >
                {printing ? "Abrindo impressão…" : "Imprimir"}
                {!printing && quantidadeImpressao > 1
                  ? ` (${quantidadeImpressao} etiquetas)`
                  : !printing && quantidadeImpressao === 1 && reimprimirSeries.trim()
                    ? " (1 etiqueta — reimpressão)"
                    : ""}
              </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
