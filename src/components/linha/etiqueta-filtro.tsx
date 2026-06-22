"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  formatSerieEtiqueta,
  ROTULO_DPI_FAIXA,
  ROTULO_DPF_FAIXA,
  type ModeloEtiqueta,
} from "@/lib/utils/etiqueta-filtro";
import {
  FluxoDeArSeta,
  HEPA_LOGO_ETIQUETA_SRC,
} from "@/components/linha/etiqueta-filtro-assets";
import "./etiqueta-filtro.css";

export type EtiquetaFiltroData = {
  codigo: string;
  descricaoEtiqueta: string;
  medida: string | null;
  classe: string | null;
  modelo: ModeloEtiqueta;
  lote: string;
  serie: number;
  serieTotal: number;
  vazao?: string;
  perdaInicial?: string;
  perdaFinal?: string;
  qrDataUrl: string;
  /** Data URL do logo — impressão usa só memória, sem rede no iframe. */
  logoDataUrl?: string;
};

type Props = EtiquetaFiltroData & {
  className?: string;
};

export function EtiquetaFiltro100x20({
  codigo,
  descricaoEtiqueta,
  medida,
  classe,
  modelo,
  lote,
  serie,
  serieTotal,
  vazao,
  perdaInicial,
  perdaFinal,
  qrDataUrl,
  logoDataUrl,
  className = "",
}: Props) {
  const isCompleta = modelo === "completa";

  return (
    <div
      className={`etiqueta-filtro ${isCompleta ? "etiqueta-filtro--completa" : "etiqueta-filtro--simples"} ${className}`}
    >
      <div className="etiqueta-filtro__main">
        <div className="etiqueta-filtro__logo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoDataUrl ?? HEPA_LOGO_ETIQUETA_SRC}
            alt=""
            className="etiqueta-filtro__logo-img"
          />
        </div>

        <div className="etiqueta-filtro__center-col">
          {isCompleta ? (
            <div className="etiqueta-filtro__center-stack">
              <div className="etiqueta-filtro__text-block">
                <div className="etiqueta-filtro__line etiqueta-filtro__line--code-desc">
                  {codigo} {descricaoEtiqueta}
                </div>
                {medida ? (
                  <div className="etiqueta-filtro__line etiqueta-filtro__line--medida">
                    {medida}
                  </div>
                ) : null}
              </div>

              <div className="etiqueta-filtro__specs">
                <span>
                  <strong>Vazão:</strong> {vazao || "—"} m³/h
                </span>
                <span>
                  <strong>Classe:</strong> {classe || "—"}
                </span>
                <span>
                  <strong>{ROTULO_DPI_FAIXA}:</strong> {perdaInicial || "—"} Pa
                </span>
                <span>
                  <strong>{ROTULO_DPF_FAIXA}:</strong> {perdaFinal || "—"} Pa
                </span>
              </div>

              <div className="etiqueta-filtro__trace">
                <span>
                  SÉRIE: {formatSerieEtiqueta(serie, serieTotal)} · LOTE: {lote}
                </span>
              </div>

              <div className="etiqueta-filtro__warn">
                <span>NÃO TORCER OU TOCAR</span>
                <span>NO MEIO FILTRANTE</span>
              </div>
            </div>
          ) : (
            <>
              <div className="etiqueta-filtro__text-block">
                <div className="etiqueta-filtro__line">{codigo}</div>
                <div className="etiqueta-filtro__line">{descricaoEtiqueta}</div>
                {medida ? (
                  <div className="etiqueta-filtro__line">{medida}</div>
                ) : null}
              </div>

              <div className="etiqueta-filtro__trace">
                <span>LOTE: {lote}</span>
                <span>SÉRIE: {formatSerieEtiqueta(serie, serieTotal)}</span>
              </div>
            </>
          )}
        </div>

        <div className="etiqueta-filtro__right">
          <div className="etiqueta-filtro__qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR hepafiltros.com.br" />
          </div>
        </div>

        <div className="etiqueta-filtro__fluxo" aria-hidden>
          <FluxoDeArSeta />
        </div>
      </div>
    </div>
  );
}

const LABEL_W_MM = 100;
const LABEL_H_MM = 20;
const MM_TO_PX = 96 / 25.4;

function EtiquetaPreviewSheet({ data }: { data: EtiquetaFiltroData }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const w = host.clientWidth;
      const targetPx = LABEL_W_MM * MM_TO_PX;
      setScale(w > 0 ? w / targetPx : 1);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="etiqueta-sheet etiqueta-sheet--preview">
      <div
        className="etiqueta-preview-scale"
        style={{ transform: `scale(${scale})` }}
      >
        <EtiquetaFiltro100x20 {...data} />
      </div>
    </div>
  );
}

export function EtiquetaPrintSheets({
  etiquetas,
  preview = false,
}: {
  etiquetas: EtiquetaFiltroData[];
  preview?: boolean;
}) {
  if (preview) {
    return (
      <div className="etiqueta-preview-wrap etiqueta-preview-wrap--fit">
        {etiquetas.map((data, index) => (
          <EtiquetaPreviewSheet key={index} data={data} />
        ))}
      </div>
    );
  }

  return (
    <>
      {etiquetas.map((data, index) => (
        <div key={`${data.lote}-${data.serie}`} className="etiqueta-sheet">
          <EtiquetaFiltro100x20 {...data} />
        </div>
      ))}
    </>
  );
}
