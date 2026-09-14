/** CSS da etiqueta de embalagem 100×150 mm — embutido para impressão sem fetch. */
export const EMBALAGEM_PRINT_CSS = `*, *::before, *::after { box-sizing: border-box; }

@page {
  size: 100mm 150mm;
  margin: 0;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100mm;
  background: #fff;
  color: #1B4F72;
  font-family: Arial, Helvetica, sans-serif;
}

.embalagem-print-root {
  margin: 0;
  padding: 0;
  width: 100mm;
}

.embalagem-sheet {
  display: flex;
  flex-direction: column;
  width: 100mm;
  height: 150mm;
  min-height: 150mm;
  max-height: 150mm;
  margin: 0;
  padding: 4mm;
  overflow: hidden;
  border: 0.6mm solid #1B4F72;
  page-break-inside: avoid;
  break-inside: avoid;
  page-break-after: always;
  break-after: page;
}

.embalagem-sheet:last-child {
  page-break-after: auto;
  break-after: auto;
}

.embalagem-sheet + .embalagem-sheet {
  page-break-before: always;
  break-before: page;
}

.emb-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 3mm;
  border-bottom: 0.5mm solid #1B4F72;
  padding-bottom: 2.5mm;
  margin-bottom: 2.5mm;
  flex-shrink: 0;
}

.emb-logo {
  height: 12mm;
  width: auto;
  max-width: 52mm;
  object-fit: contain;
}

.emb-vol {
  border: 0.5mm solid #1B4F72;
  min-width: 18mm;
  padding: 1mm 2.5mm;
  text-align: center;
}

.emb-vol-k {
  font-size: 2.4mm;
  letter-spacing: 0.3mm;
  font-weight: 700;
  line-height: 1;
}

.emb-vol-n {
  font-size: 9mm;
  font-weight: 800;
  line-height: 1;
  margin-top: 0.6mm;
}

.emb-meta {
  font-size: 3.2mm;
  line-height: 1.35;
  flex-shrink: 0;
  margin-bottom: 2.5mm;
}

.emb-meta strong { font-weight: 700; }

.emb-table-wrap {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.emb-table {
  width: 100%;
  border-collapse: collapse;
}

.emb-table th,
.emb-table td {
  border: 0.3mm solid #1B4F72;
  padding: 1.2mm 1.4mm;
  vertical-align: top;
  text-align: left;
}

.emb-table th {
  background: #1B4F72;
  color: #fff;
  font-size: 2.6mm;
  font-weight: 700;
}

.emb-table td {
  font-size: 3mm;
  color: #0f172a;
}

.emb-num { text-align: center; width: 8mm; }
.emb-qty { text-align: center; width: 14mm; font-weight: 700; }
.emb-desc { word-break: break-word; }

.emb-code {
  font-weight: 700;
  display: block;
  margin-bottom: 0.6mm;
}

.emb-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 3mm;
  border-top: 0.5mm solid #1B4F72;
  padding-top: 2.5mm;
  margin-top: auto;
  flex-shrink: 0;
}

.emb-qr {
  width: 22mm;
  height: 22mm;
}

.emb-brand {
  flex: 1;
  text-align: center;
}

.emb-brand-name {
  display: block;
  font-size: 3.6mm;
  font-weight: 800;
  color: #1B4F72;
}

.emb-brand-sub {
  display: block;
  font-size: 2.4mm;
  margin-top: 0.8mm;
  color: #334155;
}

@media screen {
  html, body {
    margin: 0;
    padding: 16px;
    min-height: 100vh;
    width: auto;
    background: #e2e8f0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .embalagem-print-root { width: auto; }

  .embalagem-sheet {
    margin: 0 0 12px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
    background: #fff;
  }

  .embalagem-sheet + .embalagem-sheet {
    page-break-before: auto;
    break-before: auto;
  }
}
`;
