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
import { MotorVazaoInputsPanel } from "@/components/linha/motor-vazao-inputs-panel";
import { useMotorVazaoItem } from "@/hooks/use-motor-vazao-item";
import type { MotorCamposSalvos } from "@/lib/motor-vazao";
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
import {
  getHepaLogoDataUrl,
  invalidateHepaLogoCache,
} from "@/lib/etiqueta-assets-cache";

const QR_URL = "https://www.hepafiltros.com.br";

const QR_OPTS = {
  width: 120,
  margin: 0,
  errorCorrectionLevel: "M" as const,
  color: { dark: "#000000", light: "#FFFFFF" },
};

/** Valores de exemplo no preview completa só quando motor NÃO está ativo. */
const PREVIEW_DEMO_FAIXA = {
  vazao: "280",
  perdaInicial: "250",
  perdaFinal: "400",
  classe: "F8",
} as const;

type PrintMode = "todas" | "serie";

type Props = {
  item: LineItemWithOrder | null;
  open: boolean;
  onClose: () => void;
  onMotorSalvo?: (itemId: string, patch: MotorCamposSalvos) => void;
};

export function GerarEtiquetaModal({
  item,
  open,
  onClose,
  onMotorSalvo,
}: Props) {
  const descricao = item?.description ?? "";
  const productCode = item?.product_code ?? null;

  const detected = useMemo(
    () => detectarClasseFiltragem(descricao, productCode),
    [descricao, productCode]
  );

  const quantidadeTotal = useMemo(
    () => Math.max(1, Math.floor(Number(item?.quantity) || 1)),
    [item?.quantity]
  );

  const [classe, setClasse] = useState("");
  const [reimprimirSeries, setReimprimirSeries] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [previewQr, setPreviewQr] = useState<string>("");
  const [previewLogo, setPreviewLogo] = useState<string>("");
  const [showMemoria, setShowMemoria] = useState(false);

  const {
    motorEspessura,
    setMotorEspessura,
    motorMaterial,
    setMotorMaterial,
    motorCoroa,
    setMotorCoroa,
    motorNumElementos,
    setMotorNumElementos,
    motorPrecisa,
    motorTipo,
    motorMode,
    motorMensagem,
    memoriaCalculo,
    vazao,
    setVazao,
    perdaInicial,
    setPerdaInicial,
    perdaFinal,
    setPerdaFinal,
    savingMotor,
    papelOptions,
    coroaOptions,
    materialOptions,
    showMotorAssist,
    showMotorPanel,
    showPapel,
    showMaterial,
    showCoroa,
    showNumElementos,
    showClasseMotor,
  } = useMotorVazaoItem({ open, item, classe, onMotorSalvo });

  useEffect(() => {
    if (!open) return;
    setPrintError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !item) return;
    setClasse(detected ?? "");
    setReimprimirSeries("");
    setShowMemoria(false);
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
    invalidateHepaLogoCache();
    setPreviewLogo("");
    QRCode.toDataURL(QR_URL, QR_OPTS)
      .then((url) => {
        if (!cancelled) setPreviewQr(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewQr("");
      });
    getHepaLogoDataUrl()
      .then((url) => {
        if (!cancelled) setPreviewLogo(url);
      })
      .catch((err) => {
        console.warn("[etiqueta-print] logo preview:", err);
      });
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
        logoDataUrl: previewLogo || undefined,
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
      previewLogo,
    ]
  );

  const buildEtiquetaData = useCallback((): EtiquetaFiltroData | null => {
      const base = buildEtiquetaBase();
      if (!base) return null;
      return { ...base, serie: 1, serieTotal: quantidadeTotal };
    },
    [buildEtiquetaBase, quantidadeTotal]
  );

  const usarDemoPreview = motorMode === "off";

  const previewBase = buildEtiquetaData();
  const previewEtiqueta =
    previewBase && modelo === "completa"
      ? {
          ...previewBase,
          classe:
            previewBase.classe?.trim() ||
            detected ||
            (usarDemoPreview ? PREVIEW_DEMO_FAIXA.classe : previewBase.classe),
          vazao: previewBase.vazao
            ? previewBase.vazao
            : usarDemoPreview
              ? PREVIEW_DEMO_FAIXA.vazao
              : "",
          perdaInicial: previewBase.perdaInicial
            ? previewBase.perdaInicial
            : usarDemoPreview
              ? PREVIEW_DEMO_FAIXA.perdaInicial
              : "",
          perdaFinal: previewBase.perdaFinal
            ? previewBase.perdaFinal
            : usarDemoPreview
              ? PREVIEW_DEMO_FAIXA.perdaFinal
              : "",
        }
      : previewBase;

  const seriesReimpressao = useMemo(
    () => parseSeriesReimpressao(reimprimirSeries, quantidadeTotal),
    [reimprimirSeries, quantidadeTotal]
  );

  const podeImprimirSerie = reimprimirSeries.trim().length > 0;

  const contagemSeriesReimpressao =
    seriesReimpressao.ok && seriesReimpressao.numeros.length > 0
      ? seriesReimpressao.numeros.length
      : 0;

  const showMotorPanelVisible =
    modelo === "completa" &&
    (showMotorPanel || motorMode === "invalida");

  const runPrint = useCallback(
    (mode: PrintMode) => {
      if (!item || quantidadeTotal < 1 || printing) return;
      setPrintError(null);

      let batchNumeros: number[] | null = null;

      if (mode === "serie") {
        if (!reimprimirSeries.trim()) {
          setPrintError(
            "Digite o número da série que deseja reimprimir (ex: 2 ou 2,5,7)."
          );
          return;
        }
        const parsed = parseSeriesReimpressao(
          reimprimirSeries,
          quantidadeTotal
        );
        if (!parsed.ok) {
          setPrintError(parsed.error);
          return;
        }
        batchNumeros = parsed.numeros;
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
            previewLogo
              ? Promise.resolve(previewLogo)
              : getHepaLogoDataUrl(),
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
            mode === "todas"
              ? gerarEtiquetasComSeries(base, quantidadeTotal)
              : gerarEtiquetasSeriesEspecificas(
                  base,
                  batchNumeros!,
                  quantidadeTotal
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
    },
    [
      item,
      quantidadeTotal,
      printing,
      reimprimirSeries,
      codigo,
      descricaoEtiqueta,
      medida,
      classe,
      modelo,
      lote,
      vazao,
      perdaInicial,
      perdaFinal,
      previewLogo,
    ]
  );

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
              <div className="rounded-md border border-[#1B4F72]/30 bg-[#1B4F72]/8 px-2.5 py-2 mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1B4F72]">
                  Código
                </p>
                <p className="text-sm font-bold text-slate-900 leading-snug">
                  {codigo}
                </p>
                <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#1B4F72]">
                  Descrição completa
                </p>
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  {descricao.trim() || "—"}
                </p>
              </div>
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
                1/{quantidadeTotal}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Modelo:</span>{" "}
                {modelo === "completa"
                  ? "Completa (F/H)"
                  : "Simples (G/M ou sem classe)"}
              </p>
              {showMotorAssist ? (
                <p>
                  <span className="font-semibold text-slate-700">Motor:</span>{" "}
                  {motorTipo}
                  {motorMode === "ok"
                    ? " · calculado"
                    : motorMode === "invalida"
                      ? " · combinação inválida"
                      : " · aguardando dados"}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-700">
                Classe (editável)
                {showClasseMotor ? (
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={classe}
                    onChange={(e) => setClasse(e.target.value)}
                  >
                    <option value="">— selecione F7 / F8 / F9 —</option>
                    <option value="F7">F7</option>
                    <option value="F8">F8</option>
                    <option value="F9">F9</option>
                  </select>
                ) : (
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={classe}
                    onChange={(e) => setClasse(e.target.value)}
                    placeholder="Ex.: F8, G4, H14"
                  />
                )}
              </label>
              <label className="text-xs font-medium text-slate-700">
                Quantidade do pedido (total da série)
                <input
                  type="text"
                  readOnly
                  tabIndex={-1}
                  className="mt-1 w-full cursor-default rounded-md border border-slate-200 bg-slate-100 px-2 py-1.5 text-xs text-slate-800"
                  value={`${quantidadeTotal} peça${quantidadeTotal !== 1 ? "s" : ""} → séries 1/${quantidadeTotal} … ${quantidadeTotal}/${quantidadeTotal}`}
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              Série específica (reimpressão)
              <input
                type="text"
                inputMode="numeric"
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                value={reimprimirSeries}
                onChange={(e) => setReimprimirSeries(e.target.value)}
                placeholder="Ex.: 2 ou 2,5,7"
                disabled={printing}
              />
              <span className="mt-1 block font-normal text-[10px] leading-snug text-slate-500">
                Use só se uma etiqueta estragou. Digite o número da série (ex:{" "}
                <strong>2</strong> → imprime <strong>2/{quantidadeTotal}</strong>
                ). Vários números separados por vírgula (ex:{" "}
                <strong>2,5,7</strong>). O total /{quantidadeTotal} vem sempre
                da quantidade do pedido acima.
              </span>
            </label>

            {showMotorPanelVisible ? (
              <MotorVazaoInputsPanel
                motorTipo={motorTipo}
                motorMode={motorMode}
                motorMensagem={motorMensagem}
                motorPrecisa={motorPrecisa}
                showPapel={showPapel}
                showMaterial={showMaterial}
                showCoroa={showCoroa}
                showNumElementos={showNumElementos}
                papelOptions={papelOptions}
                coroaOptions={coroaOptions}
                materialOptions={materialOptions}
                motorEspessura={motorEspessura}
                setMotorEspessura={setMotorEspessura}
                motorMaterial={motorMaterial}
                setMotorMaterial={setMotorMaterial}
                motorCoroa={motorCoroa}
                setMotorCoroa={setMotorCoroa}
                motorNumElementos={motorNumElementos}
                setMotorNumElementos={setMotorNumElementos}
                savingMotor={savingMotor}
              />
            ) : null}

            {modelo === "completa" ? (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-700">
                    Vazão (m³/h)
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                      value={vazao}
                      onChange={(e) => setVazao(e.target.value)}
                      placeholder={
                        motorMode === "precisa" || motorMode === "invalida"
                          ? "aguardando cálculo…"
                          : undefined
                      }
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    ΔPi (Pa)
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                      value={perdaInicial}
                      onChange={(e) => setPerdaInicial(e.target.value)}
                      placeholder={
                        motorMode === "precisa" || motorMode === "invalida"
                          ? "aguardando cálculo…"
                          : undefined
                      }
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    ΔPf (Pa)
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                      value={perdaFinal}
                      onChange={(e) => setPerdaFinal(e.target.value)}
                      placeholder={
                        motorMode === "precisa" || motorMode === "invalida"
                          ? "aguardando cálculo…"
                          : undefined
                      }
                    />
                  </label>
                </div>
                {motorMode === "ok" && memoriaCalculo ? (
                  <div>
                    <button
                      type="button"
                      className="text-[11px] text-[#1B4F72] hover:underline"
                      onClick={() => setShowMemoria((v) => !v)}
                    >
                      {showMemoria ? "ocultar cálculo" : "ver cálculo"}
                    </button>
                    {showMemoria ? (
                      <pre className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-700 font-mono">
                        {memoriaCalculo}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
                {motorMode === "ok" ? (
                  <p className="text-[10px] text-slate-500">
                    Valores calculados pelo motor — você pode editar antes de
                    imprimir.
                  </p>
                ) : null}
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
                  usarDemoPreview &&
                  !vazao.trim() &&
                  !perdaInicial.trim() &&
                  !perdaFinal.trim()
                    ? " · faixa técnica com valores de exemplo enquanto campos vazios"
                    : null}
                  {modelo === "completa" &&
                  (motorMode === "precisa" || motorMode === "invalida")
                    ? " · preencha os dados do motor para calcular"
                    : null}
                  {" · "}escala ajustada · logo P&B.
                </p>
                <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 overflow-hidden">
                  <EtiquetaPrintSheets etiquetas={[previewEtiqueta]} preview />
                </div>
              </div>
            ) : null}

            <div className="flex flex-col items-stretch gap-2 pt-1">
              {printError ? (
                <p className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                  {printError}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
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
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => runPrint("serie")}
                  disabled={printing || !podeImprimirSerie}
                  title={
                    !reimprimirSeries.trim()
                      ? "Digite o número da série acima"
                      : undefined
                  }
                >
                  {printing
                    ? "Abrindo impressão…"
                    : `Imprimir série específica${
                        contagemSeriesReimpressao > 0
                          ? ` (${contagemSeriesReimpressao})`
                          : ""
                      }`}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[#1B4F72] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163d58] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => runPrint("todas")}
                  disabled={printing}
                >
                  {printing
                    ? "Abrindo impressão…"
                    : `Imprimir todas (${quantidadeTotal} etiqueta${quantidadeTotal !== 1 ? "s" : ""})`}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
