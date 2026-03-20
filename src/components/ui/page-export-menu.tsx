"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { exportRowsToPdf, exportRowsToXlsx } from "@/lib/export/export-table";

export interface PageExportMenuProps {
  label?: string;
  fileNameBase: string;
  sheetTitle: string;
  getData: () => { headers: string[]; rows: (string | number | null | undefined)[][] };
  className?: string;
}

export function PageExportMenu({
  label = "Exportar",
  fileNameBase,
  sheetTitle,
  getData,
  className = "",
}: PageExportMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  async function handlePdf(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { headers, rows } = getData();
      if (rows.length === 0 && headers.length === 0) {
        toast.message("Nada para exportar nesta tela.");
        setOpen(false);
        return;
      }
      await exportRowsToPdf(sheetTitle, headers, rows, `${fileNameBase}.pdf`);
      toast.success("PDF gerado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF");
    }
    setOpen(false);
  }

  async function handleXlsx(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { headers, rows } = getData();
      if (rows.length === 0 && headers.length === 0) {
        toast.message("Nada para exportar nesta tela.");
        setOpen(false);
        return;
      }
      await exportRowsToXlsx(
        sheetTitle.slice(0, 31),
        headers,
        rows,
        `${fileNameBase}.xlsx`
      );
      toast.success("Planilha gerada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar Excel");
    }
    setOpen(false);
  }

  return (
    <div className={`relative inline-block ${className}`} ref={wrapRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 shrink-0"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[140px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
            onClick={handlePdf}
          >
            PDF
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-50"
            onClick={handleXlsx}
          >
            Excel
          </button>
        </div>
      )}
    </div>
  );
}
