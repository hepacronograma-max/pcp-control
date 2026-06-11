"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
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
  detectarClasseFiltragem,
  extrairDimensoes,
} from "@/lib/utils/etiqueta-filtro";

const QR_URL = "https://www.hepafiltros.com.br";

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
  const [garantia, setGarantia] = useState("3 meses");
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
    setGarantia("3 meses");
    setVazao("");
    setPerdaInicial("");
    setPerdaFinal("");
  }, [open, item, detected]);

  const modelo = decidirModeloEtiqueta(classe.trim() || null);
  const codigo = item
    ? codigoEtiquetaFromItem(productCode, descricao)
    : "—";
  const dimensoes = extrairDimensoes(descricao);
  const dataFabricacao = format(new Date(), "dd/MM/yyyy");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(QR_URL, { width: 120, margin: 0, errorCorrectionLevel: "M" })
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

  const previewData: EtiquetaFiltroData | null =
    previewQr && item
      ? {
          codigo,
          dimensoes,
          classe: classe.trim() || null,
          modelo,
          dataFabricacao,
          garantia: garantia.trim() || "3 meses",
          vazao: vazao.trim(),
          perdaInicial: perdaInicial.trim(),
          perdaFinal: perdaFinal.trim(),
          qrDataUrl: previewQr,
        }
      : null;

  const handlePrint = useCallback(async () => {
    if (!item || quantidade < 1) return;
    const qrDataUrl = await QRCode.toDataURL(QR_URL, {
      width: 120,
      margin: 0,
      errorCorrectionLevel: "M",
    });
    const data: EtiquetaFiltroData = {
      codigo,
      dimensoes,
      classe: classe.trim() || null,
      modelo,
      dataFabricacao,
      garantia: garantia.trim() || "3 meses",
      vazao: vazao.trim(),
      perdaInicial: perdaInicial.trim(),
      perdaFinal: perdaFinal.trim(),
      qrDataUrl,
    };
    const batch = Array.from({ length: quantidade }, () => ({ ...data }));
    setPrintEtiquetas(batch);
    setPrinting(true);
  }, [
    item,
    quantidade,
    codigo,
    dimensoes,
    classe,
    modelo,
    dataFabricacao,
    garantia,
    vazao,
    perdaInicial,
    perdaFinal,
  ]);

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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                {descricao}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Modelo:</span>{" "}
                {modelo === "completa" ? "Completa (F/H)" : "Simples (G/M ou sem classe)"}
              </p>
              {dimensoes ? (
                <p>
                  <span className="font-semibold text-slate-700">Dimensões:</span>{" "}
                  {dimensoes}
                </p>
              ) : null}
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
                  Garantia
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={garantia}
                    onChange={(e) => setGarantia(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Perda inicial (Pa)
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={perdaInicial}
                    onChange={(e) => setPerdaInicial(e.target.value)}
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Perda final (Pa)
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    value={perdaFinal}
                    onChange={(e) => setPerdaFinal(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <label className="block text-xs font-medium text-slate-700">
                Garantia
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  value={garantia}
                  onChange={(e) => setGarantia(e.target.value)}
                />
              </label>
            )}

            {previewData ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 overflow-auto">
                <p className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                  Pré-visualização (ampliada — impressão 100×20 mm)
                </p>
                <EtiquetaPrintSheets etiquetas={[previewData]} preview />
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
