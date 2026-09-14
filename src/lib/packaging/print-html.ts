import { formatBoxDimensions, isAvulsaBoxCode } from "@/lib/packaging/boxes";
import { sequenceLabel } from "@/lib/packaging/allocation";
import type { PackagingBox } from "@/lib/types/database";

export type EmbalagemLabelItem = {
  productCode: string | null;
  description: string;
  pieceQuantity: number;
};

export type EmbalagemLabelInput = {
  sequence: number;
  clientName: string;
  orderNumber: string;
  productCode: string | null;
  description: string;
  pieceQuantity: number;
  items?: EmbalagemLabelItem[];
  boxLabel: string;
  weightKg: number;
  qrDataUrl: string;
  logoDataUrl: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatWeightKg(kg: number): string {
  const n = Math.round(kg * 1000) / 1000;
  return String(n).replace(".", ",");
}

export function volumeBoxLabel(box: PackagingBox | undefined): string {
  if (!box) return "Caixa";
  const kind = isAvulsaBoxCode(box.code) ? "Avulsa" : box.code;
  return `${kind} · ${formatBoxDimensions(box)}`;
}

function sheetHtml(label: EmbalagemLabelInput): string {
  const rows = (label.items && label.items.length > 0
    ? label.items
    : [
        {
          productCode: label.productCode,
          description: label.description,
          pieceQuantity: label.pieceQuantity,
        },
      ]
  )
    .map((row, index) => {
      const code = row.productCode?.trim()
        ? `<span class="emb-code">${escapeHtml(row.productCode.trim())}</span>`
        : "";
      return `<tr>
          <td class="emb-num">${index + 1}</td>
          <td class="emb-desc">${code}${escapeHtml(row.description)}</td>
          <td class="emb-qty">${escapeHtml(String(row.pieceQuantity))}</td>
        </tr>`;
    })
    .join("");
  return `<article class="embalagem-sheet">
  <header class="emb-head">
    <img class="emb-logo" src="${escapeHtml(label.logoDataUrl)}" alt="HEPA Filtros" />
    <div class="emb-vol">
      <div class="emb-vol-k">VOLUME</div>
      <div class="emb-vol-n">${escapeHtml(String(label.sequence))}</div>
    </div>
  </header>
  <div class="emb-meta">
    <div><strong>Cliente:</strong> ${escapeHtml(label.clientName)}</div>
    <div><strong>Pedido:</strong> ${escapeHtml(label.orderNumber)}</div>
    <div><strong>Caixa:</strong> ${escapeHtml(label.boxLabel)} &nbsp; <strong>Peso:</strong> ${escapeHtml(formatWeightKg(label.weightKg))} kg</div>
  </div>
  <div class="emb-table-wrap">
    <table class="emb-table">
      <thead>
        <tr>
          <th class="emb-num">#</th>
          <th>Descrição</th>
          <th class="emb-qty">Peças</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
  <footer class="emb-foot">
    <img class="emb-qr" src="${escapeHtml(label.qrDataUrl)}" alt="${escapeHtml(sequenceLabel(label.sequence))}" />
    <div class="emb-brand">
      <span class="emb-brand-name">HEPA FILTROS</span>
      <span class="emb-brand-sub">Bipar o QR para conferência</span>
    </div>
  </footer>
</article>`;
}

export function buildEmbalagemSheetsHtml(labels: EmbalagemLabelInput[]): string {
  return `<div class="embalagem-print-root">${labels.map(sheetHtml).join("")}</div>`;
}
