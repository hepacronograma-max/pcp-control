/** CSS completo da etiqueta 100×20 mm — embutido para impressão sem fetch de rede. */
export const ETIQUETA_PRINT_CSS = `/* Etiqueta 100×20 mm — janela de impressão (1:1, sem scale do preview). */

*, *::before, *::after {
  box-sizing: border-box;
}

/* 100mm ≈ 3.937in · 20mm ≈ 0.787in — polegadas ajudam drivers Argox/Térmica */
@page {
  size: 100mm 20mm;
  margin: 0;
}

@page {
  size: 3.937in 0.787in;
  margin: 0;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 100mm;
  background: #fff;
}

body {
  min-height: 0;
}

.etiqueta-print-root {
  margin: 0;
  padding: 0;
  width: 100mm;
}

.etiqueta-sheet {
  display: block;
  width: 100mm;
  height: 20mm;
  min-height: 20mm;
  max-height: 20mm;
  margin: 0;
  padding: 0;
  overflow: hidden;
  box-sizing: border-box;
  page-break-inside: avoid;
  break-inside: avoid;
  page-break-after: always;
  break-after: page;
}

.etiqueta-sheet:last-child {
  page-break-after: auto;
  break-after: auto;
}

.etiqueta-sheet + .etiqueta-sheet {
  page-break-before: always;
  break-before: page;
}

@media screen {
  html,
  body {
    margin: 0;
    padding: 24px;
    min-height: 100vh;
    box-sizing: border-box;
    background: #e2e8f0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .etiqueta-print-root {
    width: 100mm;
  }

  .etiqueta-sheet {
    width: 100mm;
    height: 20mm;
    margin-bottom: 4mm;
    background: #fff;
    box-shadow: 0 0 0 1px #cbd5e1;
  }
}

@media print {
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100mm !important;
    min-width: 100mm !important;
    max-width: 100mm !important;
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
    zoom: 1 !important;
    transform: none !important;
  }

  .etiqueta-print-root {
    margin: 0 !important;
    padding: 0 !important;
    width: 100mm !important;
    visibility: visible !important;
  }

  .etiqueta-sheet {
    display: block !important;
    width: 100mm !important;
    height: 20mm !important;
    min-width: 100mm !important;
    min-height: 20mm !important;
    max-width: 100mm !important;
    max-height: 20mm !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    visibility: visible !important;
    transform: none !important;
    zoom: 1 !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: always !important;
    break-after: page !important;
  }

  .etiqueta-sheet:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }

  .etiqueta-sheet + .etiqueta-sheet {
    page-break-before: always !important;
    break-before: page !important;
  }

  .etiqueta-preview-scale,
  .etiqueta-sheet--preview {
    transform: none !important;
    width: 100mm !important;
    height: 20mm !important;
  }
}

.etiqueta-filtro,
.etiqueta-filtro * {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.etiqueta-filtro {
  width: 100mm;
  height: 20mm;
  box-sizing: border-box;
  border: none;
  font-family: Arial, Helvetica, sans-serif;
  color: #000;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  margin: 0;
}

.etiqueta-filtro__main {
  width: 100mm;
  height: 20mm;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  flex-wrap: nowrap;
  gap: 0;
}

.etiqueta-filtro__logo-wrap {
  width: 26mm;
  flex: 0 0 26mm;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5mm 0.4mm;
  box-sizing: border-box;
}

.etiqueta-filtro__logo-img {
  display: block;
  max-width: 100%;
  max-height: 16mm;
  width: auto;
  height: auto;
  object-fit: contain;
}

.etiqueta-filtro__center-col {
  width: 43mm;
  flex: 0 0 43mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.3mm;
  padding: 0.5mm 1mm;
  box-sizing: border-box;
  overflow: hidden;
}

.etiqueta-filtro__text-block {
  line-height: 1.08;
  flex-shrink: 0;
}

.etiqueta-filtro__line {
  font-size: 7.5pt;
  font-weight: 700;
  color: #000;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.etiqueta-filtro__trace {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.8mm 2mm;
  margin-top: 0.35mm;
  font-size: 7.5pt;
  font-weight: 700;
  line-height: 1.1;
  color: #000;
  text-transform: uppercase;
}

.etiqueta-filtro__trace span {
  white-space: nowrap;
}

.etiqueta-filtro__specs {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: start;
  font-size: 4.8pt;
  line-height: 1.2;
  padding-top: 0.4mm;
  gap: 0.35mm 1mm;
  width: 100%;
  color: #000;
}

.etiqueta-filtro__specs span {
  white-space: nowrap;
  color: #000;
}

.etiqueta-filtro--completa .etiqueta-filtro__specs span {
  overflow: visible;
  text-overflow: unset;
}

.etiqueta-filtro:not(.etiqueta-filtro--completa) .etiqueta-filtro__specs span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.etiqueta-filtro__specs strong {
  font-weight: 800;
}

.etiqueta-filtro__right {
  width: 20mm;
  flex: 0 0 20mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.4mm 0.3mm;
  box-sizing: border-box;
}

.etiqueta-filtro__qr {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.etiqueta-filtro__qr img {
  width: 12mm;
  height: 12mm;
  display: block;
}

.etiqueta-filtro__fluxo {
  width: 11mm;
  flex: 0 0 11mm;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 0.3mm 0.5mm 0.3mm 0.2mm;
  box-sizing: border-box;
  overflow: visible;
}

.etiqueta-filtro__fluxo-svg {
  display: block;
  width: 100%;
  height: 100%;
  shape-rendering: geometricPrecision;
}

.etiqueta-filtro--completa .etiqueta-filtro__center-col {
  justify-content: flex-start;
  padding-top: 0.3mm;
  padding-bottom: 0.25mm;
  gap: 0.1mm;
}

.etiqueta-filtro--completa .etiqueta-filtro__line,
.etiqueta-filtro--completa .etiqueta-filtro__trace,
.etiqueta-filtro--completa .etiqueta-filtro__specs,
.etiqueta-filtro--completa .etiqueta-filtro__warn {
  line-height: 1.02;
}

.etiqueta-filtro--completa .etiqueta-filtro__specs {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  font-size: 7.5pt;
  padding-top: 0;
  gap: 0 0.6mm;
}

.etiqueta-filtro--completa .etiqueta-filtro__specs--duas-linhas {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  row-gap: 0.08mm;
  column-gap: 1mm;
}

.etiqueta-filtro--completa .etiqueta-filtro__trace {
  margin-top: 0;
}

.etiqueta-filtro--completa .etiqueta-filtro__warn {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  font-size: 7.5pt;
  font-weight: 700;
  line-height: 1;
  color: #000;
  text-transform: uppercase;
  letter-spacing: 0.01em;
}

.etiqueta-filtro--completa .etiqueta-filtro__warn span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.etiqueta-filtro--completa .etiqueta-filtro__logo-img {
  max-height: 15mm;
}

.etiqueta-filtro--completa .etiqueta-filtro__qr img {
  width: 10.5mm;
  height: 10.5mm;
}

@media print {
  .etiqueta-filtro,
  .etiqueta-filtro__main {
    width: 100mm !important;
    height: 20mm !important;
    max-width: 100mm !important;
    max-height: 20mm !important;
    transform: none !important;
    zoom: 1 !important;
  }

  .etiqueta-filtro__fluxo-svg {
    filter: contrast(1.35);
  }
}
`;
