"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  gerarLoteEtiqueta,
  medidaEtiquetaFromDescricao,
} from "@/lib/utils/etiqueta-filtro";

const QR_URL = "https://www.hepafiltros.com.br";

const QR_OPTS = {
  width: 120,
  margin: 0,
  errorCorrectionLevel: "M" as const,
  color: { dark: "#000000", light: "#FFFFFF" },
};

/** Exemplo na coluna “completa” do preview dual quando campos técnicos estão vazios. */
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
  const [printing, setPrinting] = useState(false);
  const [printEtiquetas, setPrintEtiquetas] = useState<EtiquetaFiltroData[]>([]);
  const [previewQr, setPreviewQr] = useState<string>("");

  useEffect(() => {
    if (!open || !item) return;
    setClasse(detected ?? "");
    setQuantidade(Math.max(1, Number(item.quantity) || 1));
    setVazao("");
    setPerdaInicial("");
    setPerdaFinal("");
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
    return () => {
      cancelled = true;
    };
  }, [open]);

  const buildEtiquetaBase = useCallback(
    (modeloOverride?: "completa" | "simples") => {
      if (!previewQr || !item) return null;
      const m = modeloOverride ?? modelo;
      return {
        codigo,
        descricaoEtiqueta,
        medida,
        classe: classe.trim() || null,
        modelo: m,
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

  const buildEtiquetaData = useCallback(
    (modeloOverride?: "completa" | "simples"): EtiquetaFiltroData | null => {
      const base = buildEtiquetaBase(modeloOverride);
      if (!base) return null;
      return { ...base, serie: 1, serieTotal: quantidade };
    },
    [buildEtiquetaBase, quantidade]
  );

  const previewSimples = buildEtiquetaData("simples");
  const previewCompletaBase = buildEtiquetaData("completa");
  const previewCompleta = previewCompletaBase
    ? {
        ...previewCompletaBase,
        classe:
          previewCompletaBase.classe?.trim() ||
          detected ||
          PREVIEW_DEMO_FAIXA.classe,
        vazao: previewCompletaBase.vazao || PREVIEW_DEMO_FAIXA.vazao,
        perdaInicial:
          previewCompletaBase.perdaInicial || PREVIEW_DEMO_FAIXA.perdaInicial,
        perdaFinal:
          previewCompletaBase.perdaFinal || PREVIEW_DEMO_FAIXA.perdaFinal,
      }
    : null;

  const handlePrint = useCallback(async () => {
    if (!item || quantidade < 1) return;
    const qrDataUrl = await QRCode.toDataURL(QR_URL, QR_OPTS);
    const base = buildEtiquetaBase();
    if (!base) return;
    const batch = gerarEtiquetasComSeries(
      { ...base, qrDataUrl },
      quantidade
    );
    setPrintEtiquetas(batch);
    setPrinting(true);
  }, [item, quantidade, buildEtiquetaBase]);

  useEffect(() => {
    if (!printing || printEtiquetas.length === 0) return;
    document.body.classList.add("printing-etiquetas");
    const t = window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.body.classList.remove("printing-etiquetas");
        setPrinting(false);
        setPrintEtiquetas([]);
      }, 300);
    }, 150);
    return () => {
      window.clearTimeout(t);
      document.body.classList.remove("printing-etiquetas");
    };
  }, [printing, printEtiquetas]);

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

            {previewSimples && previewCompleta ? (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-600">
                  Impressão deste item:{" "}
                  <strong>
                    {modelo === "completa" ? "completa (F/H)" : "simples"}
                  </strong>
                  . Pré-visualização 100×20 mm (escala ajustada · logo original).
                </p>
                <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 overflow-hidden">
                  <div className="etiqueta-preview-dual">
                    <div className="etiqueta-preview-dual__col">
                      <p className="etiqueta-preview-dual__label">Modelo simples</p>
                      <EtiquetaPrintSheets etiquetas={[previewSimples]} preview />
                    </div>
                    <div className="etiqueta-preview-dual__col">
                      <p className="etiqueta-preview-dual__label">
                        Modelo completa (F/H)
                        <span className="block font-normal text-slate-500 normal-case">
                          Preview com valores de exemplo quando campos vazios
                        </span>
                      </p>
                      <EtiquetaPrintSheets etiquetas={[previewCompleta]} preview />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-[#1B4F72] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#163d58]"
                onClick={() => void handlePrint()}
              >
                Imprimir {quantidade > 1 ? `(${quantidade} etiquetas)` : ""}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {typeof document !== "undefined" &&
        printEtiquetas.length > 0 &&
        createPortal(
          <div className="etiqueta-print-host" aria-hidden={!printing}>
            <EtiquetaPrintSheets etiquetas={printEtiquetas} />
          </div>,
          document.body
        )}
    </>
  );
}
