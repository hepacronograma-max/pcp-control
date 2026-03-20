'use client';

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { createClient } from "@/lib/supabase/client";
interface ImportResult {
  fileName: string;
  success: boolean;
  orderNumber?: string;
  clientName?: string;
  itemCount?: number;
  error?: string;
  message?: string;
  updated?: boolean;
  deliverySaved?: boolean;
}

export default function ImportPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const { profile } = useUser();
  const { companyId: effectiveCompanyId } = useEffectiveCompanyId(profile);

  // Tenta adicionar colunas de prazo ao carregar (se DATABASE_URL estiver configurado)
  useEffect(() => {
    fetch("/api/setup-delivery-columns", { method: "POST" }).catch(() => {});
  }, []);

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

    // Envia pasta matriz para a API salvar o PDF (quando configurada)
    const supabase = createClient();
    if (supabase && effectiveCompanyId) {
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("orders_path, import_path")
          .eq("id", effectiveCompanyId)
          .maybeSingle();
        const path = company?.orders_path || company?.import_path;
        if (path?.trim()) formData.append("orders_path", path.trim());
      } catch {
        // ignore
      }
    }

    const useSupabaseApi = supabase !== null;
    const url = "/api/import-pdf";

    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      return {
        fileName: file.name,
        success: false,
        error: useSupabaseApi
          ? "Erro ao ler resposta da API."
          : "Erro ao ler resposta do leitor de PDF local.",
      };
    }

    if (!res.ok || !data.success) {
      return {
        fileName: file.name,
        success: false,
        error:
          data?.error ??
          (useSupabaseApi
            ? "Erro ao processar PDF na API."
            : "Erro ao ler o PDF no servidor local. Verifique se o leitor de PDF está em execução."),
        orderNumber: data.orderNumber,
        clientName: data.clientName,
        itemCount: data.itemCount,
      };
    }

    if (data.savedToSupabase) {
      return {
        fileName: file.name,
        success: true,
        orderNumber: data.orderNumber,
        clientName: data.clientName,
        itemCount: data.itemCount ?? data.items?.length ?? 0,
        message: data.message,
        updated: data.updated,
        deliverySaved: data.deliverySaved,
      };
    }

    return {
      fileName: file.name,
      success: false,
      error: data?.error ?? "Configure a empresa e o Supabase para importar pedidos.",
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
          error: "Erro inesperado ao processar PDF",
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

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Importar Pedidos
          </h1>
          <p className="text-sm text-slate-600">
            Envie arquivos PDF de pedidos de venda (TOTVS, Omie) para criar pedidos e
            itens automaticamente. O prazo de entrega é extraído do PDF.
          </p>
        </div>
        <PageExportMenu
          fileNameBase="importar-resultados"
          sheetTitle="Importação — resultados"
          getData={() => ({
            headers: [
              "Arquivo",
              "Sucesso",
              "Pedido",
              "Cliente",
              "Itens",
              "Mensagem / Erro",
            ],
            rows: results.map((r) => [
              r.fileName,
              r.success ? "Sim" : "Não",
              r.orderNumber ?? "",
              r.clientName ?? "",
              r.itemCount ?? "",
              r.error || r.message || "",
            ]),
          })}
        />
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
        <p className="font-medium text-slate-800">
          Arraste PDFs aqui ou clique para selecionar
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Formatos aceitos: .pdf
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">
          Arquivos selecionados
        </h2>
        {files.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nenhum arquivo selecionado ainda.
          </p>
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
                    <span className="text-xs font-medium text-slate-800">
                      {file.name}
                    </span>
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
          onClick={handleImport}
          disabled={processing || files.length === 0}
        >
          {processing
            ? `Importando ${currentIndex !== null ? currentIndex + 1 : ""}/${
                files.length
              }`
            : `Importar ${files.length} pedido${
                files.length === 1 ? "" : "s"
              }`}
        </Button>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Resultado da importação
        </h2>
        {results.length === 0 ? (
          <p className="text-xs text-slate-500 mt-1">
            Os resultados aparecerão aqui após a importação.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {results.map((r, index) => (
              <li key={index} className="flex items-start gap-2">
                <span>
                  {r.success ? "✅" : "❌"}
                </span>
                <div>
                  {r.success ? (
                    <div>
                      <p className="text-slate-700">
                        Pedido {r.orderNumber} - {r.clientName}
                        {r.updated ? (
                          <> - {r.message ?? "Atualizado"}</>
                        ) : (
                          <> - Importado ({r.itemCount} itens)</>
                        )}
                      </p>
                      {r.deliverySaved === false && r.message && (
                        <p className="text-amber-600 text-[11px] mt-0.5">{r.message}</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-slate-700">
                        {r.fileName} - Erro: {r.error}
                      </p>
                    </div>
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

