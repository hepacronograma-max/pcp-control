"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/hooks/use-user";
import { defaultAppPathForRole, hasPermission } from "@/lib/utils/permissions";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { toast } from "sonner";

type ImportResult = {
  fileName: string;
  success: boolean;
  number?: string;
  supplierName?: string | null;
  error?: string;
  message?: string;
  updated?: boolean;
  linesSaved?: boolean;
  lineCount?: number;
  linesTableMissing?: boolean;
};

export default function ComprasImportarPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const { profile, loading: profileLoading } = useUser();
  const { companyId: effectiveCompanyId } = useEffectiveCompanyId(profile);
  const router = useRouter();

  useEffect(() => {
    if (profileLoading) return;
    if (profile && !hasPermission(profile.role, "importComprasPdfs")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [profileLoading, profile, router]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfs = acceptedFiles.filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    setFiles((prev) => [...prev, ...pdfs]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
  });

  async function processOnePdf(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    if (effectiveCompanyId) {
      formData.append("company_id", effectiveCompanyId);
    }

    const res = await fetch("/api/import-purchase-pdf", {
      method: "POST",
      body: formData,
    });

    let data: {
      success?: boolean;
      error?: string;
      number?: string;
      supplierName?: string | null;
      updated?: boolean;
      message?: string;
      linesSaved?: boolean;
      lineCount?: number;
      linesTableMissing?: boolean;
    };
    try {
      data = await res.json();
    } catch {
      return {
        fileName: file.name,
        success: false,
        error: "Não foi possível ler a resposta da API.",
      };
    }

    if (!res.ok || !data.success) {
      return {
        fileName: file.name,
        success: false,
        error: data?.error ?? "Erro ao processar o PDF.",
        number: data?.number,
      };
    }

    if (data.linesTableMissing && (data.lineCount ?? 0) > 0) {
      toast.warning(
        "Itens do PDF detetados, mas a tabela de linhas não existe. Execute supabase-purchase-order-lines.sql e importe de novo.",
        { duration: 12000 }
      );
    } else if (data.linesSaved === false && (data.lineCount ?? 0) > 0) {
      toast.error(data.message || "Não foi possível gravar as linhas do pedido.", {
        duration: 10000,
      });
    } else if ((data.lineCount ?? 0) > 0 && data.linesSaved) {
      toast.success(
        `Pedido de compra ${data.number} — ${data.lineCount} itens gravados.`
      );
    }

    return {
      fileName: file.name,
      success: true,
      number: data.number,
      supplierName: data.supplierName,
      updated: data.updated,
      message: data.message,
      linesSaved: data.linesSaved,
      lineCount: data.lineCount,
      linesTableMissing: data.linesTableMissing,
    };
  }

  async function handleImport() {
    if (files.length === 0 || processing) return;
    setProcessing(true);
    setResults([]);
    const newResults: ImportResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentIndex(i);
      try {
        const result = await processOnePdf(file);
        newResults.push(result);
        setResults([...newResults]);
      } catch {
        newResults.push({
          fileName: file.name,
          success: false,
          error: "Erro inesperado",
        });
        setResults([...newResults]);
      }
    }
    setProcessing(false);
    setCurrentIndex(null);
    setFiles([]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  if (profileLoading) {
    return <div className="text-sm text-slate-500 py-8">Carregando…</div>;
  }

  if (profile && !hasPermission(profile.role, "importComprasPdfs")) {
    return null;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Importar pedidos de compra</h1>
          <p className="text-sm text-slate-600">
            Envie PDFs de pedidos de compra para criar ou atualizar o cadastro (número, fornecedor e
            previsão são extraídos por heurística — revise em Compras se necessário).
          </p>
        </div>
        <PageExportMenu
          fileNameBase="importar-compras-resultados"
          sheetTitle="Importação compras"
          getData={() => ({
            headers: ["Arquivo", "Sucesso", "Nº PC", "Fornecedor", "Mensagem / Erro"],
            rows: results.map((r) => [
              r.fileName,
              r.success ? "Sim" : "Não",
              r.number ?? "",
              r.supplierName ?? "",
              r.error || r.message || "",
            ]),
          })}
        />
      </div>

      <p className="text-xs text-slate-500">
        <a href="/compras" className="text-[#1B4F72] hover:underline">
          ← Voltar a Compras
        </a>
      </p>

      <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-950 px-3 py-2 text-xs space-y-1">
        <p className="font-medium">Primeiro uso: criar tabelas no Supabase</p>
        <p className="text-amber-900/90">
          Execute no <strong>SQL Editor</strong>, em ordem:{" "}
          <code className="rounded bg-amber-100/80 px-1">supabase-purchase-orders.sql</code> (tabelas de
          PC) e <code className="rounded bg-amber-100/80 px-1">supabase-purchase-order-lines.sql</code> (linhas
          e vínculo por item). Depois reimporte o PDF.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-[#1B4F72] bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:bg-slate-100"
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-3xl mb-2">📄</div>
        <p className="font-medium text-slate-800">Arraste PDFs aqui ou clique para selecionar</p>
        <p className="text-xs text-slate-500 mt-1">Apenas arquivos .pdf</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">Arquivos selecionados</h2>
        {files.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhum arquivo selecionado ainda.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {files.map((file, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span>📄</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-slate-800">{file.name}</span>
                    <span className="text-[11px] text-slate-500">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                </div>
                <button
                  className="text-xs text-slate-400 hover:text-red-500"
                  onClick={() => removeFile(index)}
                  disabled={processing}
                >
                  ❌
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Button
          className="text-sm"
          onClick={() => void handleImport()}
          disabled={processing || files.length === 0}
        >
          {processing
            ? `Importando ${currentIndex !== null ? currentIndex + 1 : ""}/${files.length}`
            : `Importar ${files.length} arquivo${files.length === 1 ? "" : "s"}`}
        </Button>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <h2 className="text-sm font-semibold text-slate-800">Resultado</h2>
        {results.length === 0 ? (
          <p className="text-xs text-slate-500 mt-1">Os resultados aparecerão aqui após a importação.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {results.map((r, index) => (
              <li key={index} className="flex items-start gap-2">
                <span>{r.success ? "✅" : "❌"}</span>
                <div>
                  {r.success ? (
                    <p className="text-slate-700">
                      PC {r.number}
                      {r.supplierName ? ` — ${r.supplierName}` : ""}
                      {r.updated ? " (atualizado)" : " (criado)"}
                    </p>
                  ) : (
                    <p className="text-slate-700">
                      {r.fileName} — {r.error}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
