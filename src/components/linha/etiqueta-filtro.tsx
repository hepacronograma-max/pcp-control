"use client";

import type { ModeloEtiqueta } from "@/lib/utils/etiqueta-filtro";
import "./etiqueta-filtro.css";

export type EtiquetaFiltroData = {
  codigo: string;
  dimensoes: string | null;
  classe: string | null;
  modelo: ModeloEtiqueta;
  dataFabricacao: string;
  garantia: string;
  vazao?: string;
  perdaInicial?: string;
  perdaFinal?: string;
  qrDataUrl: string;
};

type Props = EtiquetaFiltroData & {
  className?: string;
};

export function EtiquetaFiltro100x20({
  codigo,
  dimensoes,
  classe,
  modelo,
  dataFabricacao,
  garantia,
  vazao,
  perdaInicial,
  perdaFinal,
  qrDataUrl,
  className = "",
}: Props) {
  const isCompleta = modelo === "completa";

  return (
    <div
      className={`etiqueta-filtro ${isCompleta ? "etiqueta-filtro--completa" : "etiqueta-filtro--simples"} ${className}`}
    >
      <div className="etiqueta-filtro__main">
        <div className="etiqueta-filtro__fluxo" aria-hidden>
          <span className="etiqueta-filtro__fluxo-arrow">▼</span>
          <span className="etiqueta-filtro__fluxo-text">FLUXO DE AR</span>
        </div>

        <div className="etiqueta-filtro__brand">
          <span className="etiqueta-filtro__logo">HEPA</span>
          <span className="etiqueta-filtro__airflow">AIR FLOW</span>
        </div>

        <div className="etiqueta-filtro__center">
          <div className="etiqueta-filtro__code-box">
            <div className="etiqueta-filtro__code">{codigo}</div>
            {dimensoes ? (
              <div className="etiqueta-filtro__dims">{dimensoes}</div>
            ) : null}
          </div>
        </div>

        <div className="etiqueta-filtro__meta">
          <div className="etiqueta-filtro__meta-label">Fabricação</div>
          <div className="etiqueta-filtro__meta-val">{dataFabricacao}</div>
          <div className="etiqueta-filtro__meta-label">Garantia</div>
          <div className="etiqueta-filtro__meta-val">{garantia}</div>
        </div>

        <div className="etiqueta-filtro__qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR hepafiltros.com.br" />
        </div>
      </div>

      {isCompleta ? (
        <div className="etiqueta-filtro__specs">
          <span>
            <strong>Vazão:</strong> {vazao || "—"} m³/h
          </span>
          <span>
            <strong>Classe:</strong> {classe || "—"}
          </span>
          <span>
            <strong>Perda ini:</strong> {perdaInicial || "—"} Pa
          </span>
          <span>
            <strong>Perda fin:</strong> {perdaFinal || "—"} Pa
          </span>
          <span className="etiqueta-filtro__specs-warn">
            NÃO TORCER OU TOCAR NO MEIO FILTRANTE
          </span>
        </div>
      ) : null}
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
  return (
    <div className={preview ? "etiqueta-preview-wrap" : undefined}>
      {etiquetas.map((data, index) => (
        <div key={index} className="etiqueta-sheet">
          <EtiquetaFiltro100x20 {...data} />
        </div>
      ))}
    </div>
  );
}
