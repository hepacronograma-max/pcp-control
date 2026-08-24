"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LineItemWithOrder } from "@/components/linha/gantt-calendar";
import { MotorVazaoInputsPanel } from "@/components/linha/motor-vazao-inputs-panel";
import { useMotorVazaoItem } from "@/hooks/use-motor-vazao-item";
import {
  codigoEtiquetaFromItem,
  detectarClasseFiltragem,
  extrairDimensoes,
  gerarLoteEtiqueta,
  medidaEtiquetaFromDescricao,
  parseSeriesReimpressao,
} from "@/lib/utils/etiqueta-filtro";
import type { MotorCamposSalvos } from "@/lib/motor-vazao";
import {
  APROVADORES,
  CERT_PDF_LAYOUT,
  ELABORADORES,
  ELABORADOR_PADRAO,
  normaDoTemplate,
  carregarAssetsCertificado,
  downloadBlob,
  gerarCertificadosSeries,
  openBlobInNewTab,
  rotearCertificado,
} from "@/lib/certificado";

function revokePreviewUrl(url: string | null) {
  if (!url) return;
  const raw = url.split("#")[0];
  if (raw?.startsWith("blob:")) URL.revokeObjectURL(raw);
}

type Props = {
  item: LineItemWithOrder | null;
  open: boolean;
  onClose: () => void;
  onMotorSalvo?: (itemId: string, patch: MotorCamposSalvos) => void;
};

function parseNum(s: string): number | null {
  const n = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

type PrintMode = "serie" | "todas";

export function GerarCertificadoModal({
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

  const roteamento = useMemo(
    () => rotearCertificado(productCode, descricao),
    [productCode, descricao]
  );

  const quantidadeTotal = useMemo(
    () => Math.max(1, Math.floor(Number(item?.quantity) || 1)),
    [item?.quantity]
  );

  const pedido = item?.order.order_number?.trim() || "—";

  const [classe, setClasse] = useState("");
  const [reimprimirSeries, setReimprimirSeries] = useState("");
  const [elaborador, setElaborador] = useState(ELABORADOR_PADRAO);
  const [aprovador, setAprovador] = useState<string>(APROVADORES[0]);
  const [orcamento, setOrcamento] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [showMemoria, setShowMemoria] = useState(false);

  const motor = useMotorVazaoItem({
    open,
    item,
    classe,
    onMotorSalvo,
  });

  useEffect(() => {
    if (!open) return;
    setGenError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !item) return;
    setClasse(detected ?? "");
    setReimprimirSeries("");
    setElaborador(ELABORADOR_PADRAO);
    setAprovador(APROVADORES[0]);
    // Orçamento = nº do pedido (editável)
    setOrcamento(item.order.order_number?.trim() || "");
    setShowMemoria(false);
    setPreviewUrl((prev) => {
      revokePreviewUrl(prev);
      return null;
    });
  }, [open, item, detected]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(previewUrl);
    };
  }, [previewUrl]);

  const codigo = item
    ? codigoEtiquetaFromItem(productCode, descricao)
    : "—";
  const medida =
    medidaEtiquetaFromDescricao(descricao) ??
    extrairDimensoes(descricao);
  const lote = item
    ? gerarLoteEtiqueta({
        numeroPedidoVisivel: item.order.order_number,
      })
    : "—";

  const seriesReimpressao = useMemo(
    () => parseSeriesReimpressao(reimprimirSeries, quantidadeTotal),
    [reimprimirSeries, quantidadeTotal]
  );

  const podeGerarSerie = reimprimirSeries.trim().length > 0;
  const contagemSeriesReimpressao =
    seriesReimpressao.ok && seriesReimpressao.numeros.length > 0
      ? seriesReimpressao.numeros.length
      : 0;

  const buildBaseParams = useCallback(async () => {
    if (!item || !roteamento) return null;
    const {
      logoDataUrl,
      fotoDataUrl,
      assinaturaElaboradorDataUrl,
      assinaturaAprovadorDataUrl,
    } = await carregarAssetsCertificado(roteamento.fotoPath, {
      elaborador: elaborador.trim() || ELABORADOR_PADRAO,
      aprovador: aprovador.trim() || APROVADORES[0],
    });
    return {
      roteamento,
      vazao: parseNum(motor.vazao),
      dPi: parseNum(motor.perdaInicial),
      dPf: parseNum(motor.perdaFinal),
      classe: classe.trim() || null,
      elaborador: elaborador.trim() || ELABORADOR_PADRAO,
      aprovador: aprovador.trim() || APROVADORES[0],
      logoDataUrl,
      fotoDataUrl,
      assinaturaElaboradorDataUrl,
      assinaturaAprovadorDataUrl,
      item: {
        product_code: codigo,
        description: descricao,
        dimensoes: medida,
        lote,
        pedido,
        orcamento: orcamento.trim() || pedido,
      },
    };
  }, [
    item,
    roteamento,
    motor.vazao,
    motor.perdaInicial,
    motor.perdaFinal,
    classe,
    elaborador,
    aprovador,
    codigo,
    descricao,
    medida,
    lote,
    pedido,
    orcamento,
  ]);

  const refreshPreview = useCallback(async () => {
    if (!item || !roteamento) return;
    setPreviewBusy(true);
    setGenError(null);
    try {
      const base = await buildBaseParams();
      if (!base) return;
      const results = await gerarCertificadosSeries(base, [1], quantidadeTotal);
      const first = results[0];
      if (!first) return;
      const fresh = `${URL.createObjectURL(first.blob)}#view=FitV&toolbar=0&navpanes=0&t=${Date.now()}&layout=${CERT_PDF_LAYOUT}`;
      setPreviewUrl((prev) => {
        revokePreviewUrl(prev);
        return fresh;
      });
    } catch (err) {
      console.error("[certificado] preview:", err);
      setGenError(
        err instanceof Error
          ? err.message
          : "Não foi possível gerar o preview."
      );
    } finally {
      setPreviewBusy(false);
    }
  }, [item, roteamento, buildBaseParams, quantidadeTotal, CERT_PDF_LAYOUT]);

  useEffect(() => {
    if (!open || !item || !roteamento) return;
    const t = window.setTimeout(() => {
      void refreshPreview();
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    open,
    item,
    roteamento,
    motor.vazao,
    motor.perdaInicial,
    motor.perdaFinal,
    elaborador,
    aprovador,
    orcamento,
    CERT_PDF_LAYOUT,
    refreshPreview,
  ]);

  const runGenerate = useCallback(
    (mode: PrintMode, action: "abrir" | "baixar") => {
      if (!item || !roteamento || quantidadeTotal < 1 || generating) return;
      setGenError(null);

      let batchNumeros: number[] | null = null;
      if (mode === "serie") {
        if (!reimprimirSeries.trim()) {
          setGenError(
            "Digite o número da série que deseja gerar (ex: 2 ou 2,5,7)."
          );
          return;
        }
        const parsed = parseSeriesReimpressao(
          reimprimirSeries,
          quantidadeTotal
        );
        if (!parsed.ok) {
          setGenError(parsed.error);
          return;
        }
        batchNumeros = parsed.numeros;
      } else {
        batchNumeros = Array.from(
          { length: quantidadeTotal },
          (_, i) => i + 1
        );
      }

      setGenerating(true);
      void (async () => {
        try {
          const base = await buildBaseParams();
          if (!base) {
            setGenError("Não foi possível montar o certificado.");
            return;
          }
          const results = await gerarCertificadosSeries(
            base,
            batchNumeros!,
            quantidadeTotal
          );

          if (action === "abrir") {
            const first = results[0];
            if (!first) return;
            const win = openBlobInNewTab(first.blob);
            if (!win) {
              setGenError(
                "Pop-up bloqueado. Permita pop-ups ou use «Baixar PDF»."
              );
              for (const r of results) downloadBlob(r.blob, r.filename);
              return;
            }
            for (const r of results.slice(1)) {
              downloadBlob(r.blob, r.filename);
            }
          } else {
            for (const r of results) downloadBlob(r.blob, r.filename);
          }
        } catch (err) {
          console.error("[certificado] geração:", err);
          setGenError(
            err instanceof Error
              ? err.message
              : "Não foi possível gerar o certificado."
          );
        } finally {
          setGenerating(false);
        }
      })();
    },
    [
      item,
      roteamento,
      quantidadeTotal,
      generating,
      reimprimirSeries,
      buildBaseParams,
    ]
  );

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar certificado de qualidade</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-[#1B4F72]/30 bg-[#1B4F72]/5 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1B4F72]">
              Item
            </p>
            <p className="text-sm font-bold text-slate-900 leading-snug break-words">
              {descricao.trim() || "—"}
            </p>
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Código:</span>{" "}
              {codigo}
              {medida ? (
                <>
                  {" · "}
                  <span className="font-semibold text-slate-700">Medida:</span>{" "}
                  {medida}
                </>
              ) : null}
            </p>
          </div>

          {!roteamento ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Família não mapeada para certificado (só ABSW, ABSP, FFW, FF4W,
              FFP, BSF, GP e PL). Verifique o código do produto.
            </p>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <p>
                <span className="font-semibold text-slate-700">Tipo:</span>{" "}
                {roteamento.tipo} — {roteamento.template.titulo}
                {" · "}
                {roteamento.paginas} página
                {roteamento.paginas > 1 ? "s" : ""}
                {" · foto "}
                {roteamento.foto}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Norma:</span>{" "}
                {normaDoTemplate(roteamento.template.familia)}
              </p>
              <p>
                <span className="font-semibold text-slate-700">
                  Pedido / Nº cert.:
                </span>{" "}
                {pedido}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Lote:</span> {lote}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Série:</span> 1/
                {quantidadeTotal}
              </p>
              {motor.showMotorAssist ? (
                <p>
                  <span className="font-semibold text-slate-700">Motor:</span>{" "}
                  {motor.motorTipo}
                  {motor.motorMode === "ok"
                    ? " · calculado"
                    : motor.motorMode === "invalida"
                      ? " · combinação inválida"
                      : " · aguardando dados"}
                </p>
              ) : null}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Classe (editável)
              {motor.showClasseMotor ? (
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
              Orçamento
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                value={orcamento}
                onChange={(e) => setOrcamento(e.target.value)}
                placeholder="Nº do orçamento / pedido"
              />
              <span className="mt-0.5 block font-normal text-[10px] text-slate-500">
                Pré-preenchido com o nº do pedido (editável).
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Elaborador
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                value={elaborador}
                onChange={(e) => setElaborador(e.target.value)}
              >
                {ELABORADORES.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Aprovador
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                value={aprovador}
                onChange={(e) => setAprovador(e.target.value)}
              >
                {APROVADORES.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs font-medium text-slate-700">
            Série específica
            <input
              type="text"
              inputMode="numeric"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
              value={reimprimirSeries}
              onChange={(e) => setReimprimirSeries(e.target.value)}
              placeholder="Ex.: 2 ou 2,5,7"
              disabled={generating}
            />
            <span className="mt-1 block font-normal text-[10px] leading-snug text-slate-500">
              Vazio = todas as séries (1/{quantidadeTotal} …{" "}
              {quantidadeTotal}/{quantidadeTotal}).
            </span>
          </label>

          {motor.showMotorPanel ? (
            <MotorVazaoInputsPanel
              motorTipo={motor.motorTipo}
              motorMode={motor.motorMode}
              motorMensagem={motor.motorMensagem}
              motorPrecisa={motor.motorPrecisa}
              showPapel={motor.showPapel}
              showMaterial={motor.showMaterial}
              showCoroa={motor.showCoroa}
              showNumElementos={motor.showNumElementos}
              papelOptions={motor.papelOptions}
              coroaOptions={motor.coroaOptions}
              materialOptions={motor.materialOptions}
              motorEspessura={motor.motorEspessura}
              setMotorEspessura={motor.setMotorEspessura}
              motorMaterial={motor.motorMaterial}
              setMotorMaterial={motor.setMotorMaterial}
              motorCoroa={motor.motorCoroa}
              setMotorCoroa={motor.setMotorCoroa}
              motorNumElementos={motor.motorNumElementos}
              setMotorNumElementos={motor.setMotorNumElementos}
              savingMotor={motor.savingMotor}
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-700">
              Vazão (m³/h)
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                value={motor.vazao}
                onChange={(e) => motor.setVazao(e.target.value)}
                placeholder={
                  motor.motorMode === "precisa" ||
                  motor.motorMode === "invalida"
                    ? "aguardando cálculo…"
                    : undefined
                }
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              ΔPi (Pa)
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                value={motor.perdaInicial}
                onChange={(e) => motor.setPerdaInicial(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              ΔPf (Pa)
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                value={motor.perdaFinal}
                onChange={(e) => motor.setPerdaFinal(e.target.value)}
              />
            </label>
          </div>

          {motor.motorMode === "ok" && motor.memoriaCalculo ? (
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
                  {motor.memoriaCalculo}
                </pre>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-600">
                Preview (série 1/{quantidadeTotal})
                {previewBusy ? " · gerando…" : null}
              </p>
              <button
                type="button"
                className="text-[11px] text-[#1B4F72] hover:underline"
                onClick={() => void refreshPreview()}
                disabled={!roteamento || previewBusy}
              >
                Atualizar preview
              </button>
            </div>
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-100 overflow-hidden min-h-[640px]">
              {previewUrl ? (
                <iframe
                  key={previewUrl}
                  title="Preview certificado"
                  src={previewUrl}
                  className="w-full h-[760px] bg-white"
                />
              ) : (
                <p className="p-6 text-center text-xs text-slate-500">
                  {roteamento
                    ? "Gerando preview…"
                    : "Sem template para este produto."}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 pt-1">
            {genError ? (
              <p className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                {genError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={onClose}
                disabled={generating}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => runGenerate("serie", "baixar")}
                disabled={generating || !roteamento || !podeGerarSerie}
              >
                Baixar série
                {contagemSeriesReimpressao > 0
                  ? ` (${contagemSeriesReimpressao})`
                  : ""}
              </button>
              <button
                type="button"
                className="rounded-md border border-[#1B4F72]/40 px-3 py-1.5 text-xs font-medium text-[#1B4F72] hover:bg-[#1B4F72]/5 disabled:opacity-50"
                onClick={() => runGenerate("todas", "baixar")}
                disabled={generating || !roteamento}
              >
                Baixar todas ({quantidadeTotal})
              </button>
              <button
                type="button"
                className="rounded-md bg-[#1B4F72] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163d58] disabled:opacity-60"
                onClick={() =>
                  runGenerate(podeGerarSerie ? "serie" : "todas", "abrir")
                }
                disabled={generating || !roteamento}
              >
                {generating
                  ? "Gerando…"
                  : podeGerarSerie
                    ? "Abrir / imprimir série"
                    : `Abrir / imprimir (${quantidadeTotal})`}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
