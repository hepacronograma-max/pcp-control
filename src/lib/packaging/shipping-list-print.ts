import { escapeHtml, formatWeightKg } from "@/lib/packaging/print-html";

export type ShippingListPrintLine = {
  sequence: number;
  itemText: string;
  boxLabel: string;
  quantity: number;
  weightKg: number | null;
  qrDataUrl: string;
};

export type ShippingListPrintInput = {
  logoDataUrl: string;
  clientName: string;
  osNumber: string;
  clientOrderNumber: string | null;
  receivedBy: string;
  receivedAtLabel: string;
  lines: ShippingListPrintLine[];
  /** QR principal da packing list (abre a conferência no celular). */
  listQrDataUrl?: string | null;
};

/** Remove sufixo "(2 pç)" — a quantidade vai na coluna Qtde. */
export function stripPieceSuffix(text: string): string {
  return text.replace(/\s*\(\s*\d+\s*p[cç]s?\s*\)\s*$/i, "").trim();
}

/**
 * Texto do item na lista de embarque: descrição do filtro, sem SKU interno
 * (ex. FAPAGNH…) e sem quantidade entre parênteses.
 */
export function shippingListItemText(opts: {
  productCode?: string | null;
  description?: string | null;
}): string {
  const code = String(opts.productCode ?? "").trim();
  let desc = stripPieceSuffix(String(opts.description ?? "").trim());
  if (code && desc) {
    const re = new RegExp(
      `^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[·\\-–]?\\s*`,
      "i"
    );
    desc = desc.replace(re, "").trim();
  }
  return desc || code;
}

export function totalWeightKg(lines: Pick<ShippingListPrintLine, "weightKg">[]): number | null {
  const nums = lines
    .map((l) => l.weightKg)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) * 1000) / 1000;
}

export function buildShippingListPrintHtml(input: ShippingListPrintInput): string {
  const peso = totalWeightKg(input.lines);
  const pesoLabel = peso == null ? "—" : `${formatWeightKg(peso)} kg`;
  const volCount = input.lines.length;
  const clientPo = input.clientOrderNumber?.trim() || "";

  const rows = input.lines
    .map(
      (line) => `<tr>
      <td class="vol">${escapeHtml(String(line.sequence))}</td>
      <td class="item">${escapeHtml(line.itemText)}</td>
      <td>${escapeHtml(line.boxLabel)}</td>
      <td class="num">${escapeHtml(String(line.quantity))}</td>
      <td class="num">${
        line.weightKg == null ? "—" : escapeHtml(formatWeightKg(line.weightKg))
      }</td>
      <td class="qr"><img src="${escapeHtml(line.qrDataUrl)}" alt="QR ${escapeHtml(String(line.sequence))}" /></td>
    </tr>`
    )
    .join("");

  const clientPoCell = clientPo
    ? `<div class="stat">
        <span>Pedido cliente</span>
        <strong>${escapeHtml(clientPo)}</strong>
      </div>`
    : "";

  const listQr = input.listQrDataUrl
    ? `<div class="list-qr">
        <img src="${escapeHtml(input.listQrDataUrl)}" alt="QR conferência da packing list" />
        <span>Bipar para conferir</span>
      </div>`
    : "";

  const docHead = `<div class="doc-head">
    <div class="brand">
      <img src="${escapeHtml(input.logoDataUrl)}" alt="HEPA Filtros" />
      <div>
        <h1>Lista de embarque</h1>
        <div class="client">${escapeHtml(input.clientName)}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat">
        <span>OS / pedido interno</span>
        <strong>${escapeHtml(input.osNumber)}</strong>
      </div>
      ${clientPoCell}
      <div class="stat">
        <span>Volumes</span>
        <strong>${escapeHtml(String(volCount))}</strong>
      </div>
      <div class="stat">
        <span>Peso total</span>
        <strong>${escapeHtml(pesoLabel)}</strong>
      </div>
    </div>
    ${listQr}
  </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Lista de embarque ${escapeHtml(input.osNumber)}</title>
<style>
  @page { size: A4 landscape; margin: 7mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 9px; }
  table.sheet { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tbody tr { page-break-inside: avoid; break-inside: avoid; }
  .doc-head-row td {
    border: none;
    padding: 0 0 6px 0;
    background: #fff;
    color: inherit;
    text-transform: none;
    letter-spacing: normal;
    font-weight: normal;
  }
  .doc-head {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 14px;
    border: 1px solid #1B4F72;
    border-radius: 4px;
    padding: 8px 10px;
    background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  }
  .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .brand img { height: 38px; }
  .brand h1 { font-size: 15px; margin: 0; color: #1B4F72; letter-spacing: 0.02em; }
  .client { margin-top: 2px; font-size: 10px; color: #334155; font-weight: 600; }
  .stats { display: flex; flex-wrap: wrap; align-items: stretch; gap: 8px; }
  .stat {
    min-width: 88px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 4px 8px;
    background: #fff;
  }
  .stat span { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  .stat strong { display: block; margin-top: 1px; font-size: 12px; color: #1B4F72; }
  .list-qr {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 78px;
    border: 1px solid #1B4F72;
    border-radius: 4px;
    padding: 4px 6px;
    background: #fff;
  }
  .list-qr img { width: 68px; height: 68px; }
  .list-qr span {
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #1B4F72;
    font-weight: 700;
  }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: middle; }
  th { background: #1B4F72; color: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
  td.vol { width: 36px; text-align: center; font-weight: 700; }
  td.item { font-size: 8.5px; }
  td.num { text-align: right; width: 48px; }
  td.qr { width: 38px; text-align: center; padding: 2px; }
  td.qr img { width: 32px; height: 32px; }
  .sign-row td {
    border: none;
    padding: 0;
    background: #fff;
  }
  .sign {
    margin-top: 8mm;
    min-height: 32mm;
    padding-top: 18mm;
    display: flex;
    justify-content: space-between;
    gap: 28px;
    font-size: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sign div { flex: 1; border-top: 1px solid #334155; padding-top: 6px; min-height: 14mm; }
</style></head>
<body>
  <table class="sheet">
    <thead>
      <tr class="doc-head-row">
        <td colspan="6">${docHead}</td>
      </tr>
      <tr>
        <th>Vol.</th><th>Item</th><th>Caixa</th>
        <th>Qtde</th><th>Peso (kg)</th><th>QR</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="sign-row">
        <td colspan="6">
          <div class="sign">
            <div>Recebido por: ${escapeHtml(input.receivedBy)}</div>
            <div>Assinatura:</div>
            <div>Data: ${escapeHtml(input.receivedAtLabel)}</div>
          </div>
        </td>
      </tr>
    </tfoot>
  </table>
  <script>
    window.onload = function () { window.focus(); window.print(); };
  </script>
</body></html>`;
}
