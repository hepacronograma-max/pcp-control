/** Gera um PDF no layout da cotação Zenith (modelo de importação manual). */
import { jsPDF } from "jspdf";
import type { ManualImportKind } from "@/lib/pdf/apply-manual-import";

export function downloadPcpManualPdfExample(kind: ManualImportKind) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const estoque = kind === "estoque";
  const pedido = estoque ? "ZH-EST-001" : "ZH-260026";
  const cliente = estoque ? "ESTOQUE HEPA" : "COLD CONTROL AR CONDICIONADO";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Cotação #   " + pedido, 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("DATA   27/08/2026", 20, 28);
  doc.text("Nome da empresa   " + cliente, 20, 36);
  doc.text("ITEM   QTD   Modelo   Dimensão (mm)   Preço Unit   Preço Total", 20, 48);
  doc.text("1   4   HF-GP-G4   660x150x25   12,31   49,25 R$", 20, 56);
  doc.text("2   1   HF-GP-G4   1350x200x25   24,81   24,81 R$", 20, 64);
  doc.text("A) Prazo de entrega:   10 dias úteis, a contar da data útil subsequente a confirmação do pedido.", 20, 80);
  doc.text("ZENITH HVAC ENGINEERING LTDA", 20, 92);
  doc.save(estoque ? "modelo-estoque-zenith.pdf" : "modelo-cotacao-zenith.pdf");
}
