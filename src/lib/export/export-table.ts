/**
 * Exportação de tabelas para PDF e Excel (uso apenas no cliente).
 */

export async function exportRowsToPdf(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  filename: string
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(11);
  doc.text(title, 14, 12);
  const body = rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
  autoTable(doc, {
    head: [headers],
    body,
    startY: 16,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [27, 79, 114] },
    margin: { left: 10, right: 10 },
  });
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export async function exportRowsToXlsx(
  sheetName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  filename: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const safeSheet = sheetName.replace(/[/\\?*[\]]/g, "").slice(0, 31) || "Dados";
  const aoa = [
    headers,
    ...rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : c))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);
  const fn = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, fn);
}
