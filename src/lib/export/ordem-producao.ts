/**
 * Ordem de Produção (OP) gerada a partir de itens selecionados na tela da linha.
 * Colunas: Pedido, Cliente, Descrição, Qtd, Fim Prod., Feito por (assinatura).
 * Uso apenas no cliente.
 */

export type OrdemProducaoRow = {
  orderNumber: string;
  clientName: string;
  description: string;
  quantity: number | string;
  productionEnd: string | null | undefined;
};

export type OrdemProducaoInput = {
  lineName: string;
  rows: OrdemProducaoRow[];
};

const HEADERS = ["Pedido", "Cliente", "Descrição", "Qtd", "Fim Prod.", "Feito por (assinatura)"];

function formatDateBr(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
}

function nowParts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    stamp: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`,
  };
}

function safeFilePart(s: string): string {
  return s.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "linha";
}

export async function exportOrdemProducaoPdf(input: OrdemProducaoInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const { label, stamp } = nowParts();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("ORDEM DE PRODUÇÃO", 10, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Linha: ${input.lineName}`, 10, 21);
  doc.text(`Emitida em: ${label}`, pageW - 10, 14, { align: "right" });
  doc.text(`Itens: ${input.rows.length}`, pageW - 10, 21, { align: "right" });

  autoTable(doc, {
    head: [HEADERS],
    body: input.rows.map((r) => [
      r.orderNumber,
      r.clientName,
      r.description,
      String(r.quantity ?? ""),
      formatDateBr(r.productionEnd),
      "",
    ]),
    startY: 26,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2, valign: "middle", minCellHeight: 11 },
    headStyles: { fillColor: [27, 79, 114], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 55 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 14, halign: "right" },
      4: { cellWidth: 22, halign: "center" },
      5: { cellWidth: 60 },
    },
    margin: { left: 10, right: 10 },
  });

  const lastY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  const pageH = doc.internal.pageSize.getHeight();
  let y = lastY + 18;
  if (y > pageH - 15) {
    doc.addPage();
    y = 30;
  }
  doc.setFontSize(9);
  doc.line(10, y, 100, y);
  doc.text("Responsável PCP", 10, y + 5);
  doc.line(pageW - 100, y, pageW - 10, y);
  doc.text("Conferido por / data", pageW - 100, y + 5);

  doc.save(`OP-${safeFilePart(input.lineName)}-${stamp}.pdf`);
}

export async function exportOrdemProducaoXlsx(input: OrdemProducaoInput): Promise<void> {
  const XLSX = await import("xlsx");
  const { label, stamp } = nowParts();
  const aoa: (string | number)[][] = [
    ["ORDEM DE PRODUÇÃO"],
    [`Linha: ${input.lineName}`],
    [`Emitida em: ${label}`],
    [],
    HEADERS,
    ...input.rows.map((r) => [
      r.orderNumber,
      r.clientName,
      r.description,
      typeof r.quantity === "number" ? r.quantity : String(r.quantity ?? ""),
      formatDateBr(r.productionEnd),
      "",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 35 },
    { wch: 45 },
    { wch: 7 },
    { wch: 12 },
    { wch: 35 },
  ];
  // Linhas altas para caber a assinatura.
  ws["!rows"] = aoa.map((_, i) => (i >= 5 ? { hpt: 28 } : {}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "OP");
  XLSX.writeFile(wb, `OP-${safeFilePart(input.lineName)}-${stamp}.xlsx`);
}
