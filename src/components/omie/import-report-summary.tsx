import type { OmieImportReport } from "@/lib/omie/types";

export function summarizeOmieImportReport(report: OmieImportReport): {
  title: string;
  description?: string;
  level: "success" | "warning" | "info";
} {
  if (report.erros.length > 0) {
    return {
      level: "warning",
      title: `Importação com ${report.erros.length} erro(s)`,
      description: report.erros.map((e) => e.message).join(" · "),
    };
  }

  if (report.skipped_reason === "locked") {
    return {
      level: "info",
      title: "Importação em andamento",
      description: "Outra importação Omie já está rodando. Tente de novo em alguns segundos.",
    };
  }

  const parts: string[] = [];
  if (report.encontrados === 0) {
    parts.push("Nenhum pedido na etapa 20 do Omie.");
  } else {
    parts.push(`${report.encontrados} pedido(s) na etapa 20`);
    if (report.pedidos_novos > 0) parts.push(`${report.pedidos_novos} criado(s)`);
    if (report.pedidos_sincronizados > 0) {
      parts.push(`${report.pedidos_sincronizados} sincronizado(s)`);
    }
    const itemChanges =
      report.itens_adicionados + report.itens_atualizados + report.itens_removidos;
    if (itemChanges > 0) {
      parts.push(
        `itens +${report.itens_adicionados} ~${report.itens_atualizados} -${report.itens_removidos}`
      );
    }
  }

  const alertCount =
    report.itens_marcados_divergente_no_omie + report.itens_marcados_removido_no_omie;
  if (alertCount > 0) {
    parts.push(`${alertCount} alerta(s) de sincronização`);
  }

  const hasChanges =
    report.pedidos_novos > 0 ||
    report.pedidos_sincronizados > 0 ||
    report.itens_adicionados > 0 ||
    report.itens_atualizados > 0 ||
    report.itens_removidos > 0;

  return {
    level: alertCount > 0 ? "warning" : hasChanges || report.encontrados > 0 ? "success" : "info",
    title: hasChanges ? "Importação Omie concluída" : "Importação Omie concluída (sem alterações)",
    description: parts.join(" · "),
  };
}

export function ImportReportSummary({
  report,
  compact = false,
}: {
  report: OmieImportReport;
  compact?: boolean;
}) {
  const totalItens =
    report.itens_adicionados +
    report.itens_atualizados +
    report.itens_removidos;

  const hasAlertas =
    report.itens_marcados_divergente_no_omie > 0 ||
    report.itens_marcados_removido_no_omie > 0 ||
    (report.pedido_sync_resumos ?? []).some((p) => p.alertas.length > 0);

  return (
    <div className={`${compact ? "mt-2" : "mt-4"} space-y-4`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Pedidos na etapa 20" value={report.encontrados} />
        <SummaryStat label="Pedidos criados" value={report.pedidos_novos} />
        <SummaryStat label="Pedidos atualizados" value={report.pedidos_sincronizados} />
        <SummaryStat
          label="Itens (add / upd / rem)"
          value={`${report.itens_adicionados} / ${report.itens_atualizados} / ${report.itens_removidos}`}
          sub={totalItens === 0 ? "nenhuma alteração de item" : undefined}
        />
      </div>

      {hasAlertas && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">Alertas de sincronização</p>
          <ul className="mt-1 list-inside list-disc">
            {report.itens_marcados_divergente_no_omie > 0 && (
              <li>{report.itens_marcados_divergente_no_omie} item(ns) divergente(s) no Omie</li>
            )}
            {report.itens_marcados_removido_no_omie > 0 && (
              <li>{report.itens_marcados_removido_no_omie} item(ns) removido(s) no Omie</li>
            )}
          </ul>
        </div>
      )}

      {report.erros.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-medium">Erros ({report.erros.length})</p>
          <ul className="mt-1 space-y-1">
            {report.erros.map((e, i) => (
              <li key={i}>
                {e.omie_codigo_pedido ? `Pedido ${e.omie_codigo_pedido}: ` : ""}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.encontrados === 0 && report.erros.length === 0 && (
        <p className="text-sm text-slate-600">
          Nenhum pedido na etapa 20 do Omie neste momento — importação concluída sem dados novos.
        </p>
      )}

      {(report.pedido_sync_resumos ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b bg-slate-50 text-slate-700">
              <tr>
                <th className="px-2 py-2">Pedido</th>
                <th className="px-2 py-2">Itens Omie</th>
                <th className="px-2 py-2">+ / ~ / −</th>
                <th className="px-2 py-2">Diverg.</th>
                <th className="px-2 py-2">Remov.</th>
                <th className="px-2 py-2">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {report.pedido_sync_resumos!.map((p, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="px-2 py-2 font-mono">
                    {p.order_number ?? p.omie_codigo_pedido ?? "—"}
                  </td>
                  <td className="px-2 py-2">{p.total_itens_omie}</td>
                  <td className="px-2 py-2">
                    {p.itens_adicionados} / {p.itens_atualizados} / {p.itens_removidos}
                  </td>
                  <td className="px-2 py-2">{p.itens_marcados_divergente_no_omie}</td>
                  <td className="px-2 py-2">{p.itens_marcados_removido_no_omie}</td>
                  <td className="px-2 py-2">
                    {p.alertas.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {p.alertas.map((a, j) => (
                          <li key={j} className="text-amber-800">
                            {a.motivo}
                            {a.omie_codigo_item != null && ` (item ${a.omie_codigo_item})`}
                            {a.product_code && ` [${a.product_code}]`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!compact && report.modo === "shadow" && (report.shadow_logs ?? []).length > 0 && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer font-medium">
            Log shadow ({report.shadow_logs!.length})
          </summary>
          <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-100 p-2">
            {report.shadow_logs!.join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
