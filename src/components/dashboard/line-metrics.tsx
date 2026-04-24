import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AvgByLineEntry {
  lineId: string;
  lineName: string;
  avgDays: number;
}

interface OccupancyEntry {
  lineId: string;
  occupancy: number;
}

interface SuggestedPrazoEntry {
  lineId: string;
  lineName: string;
  sugeridaIso: string | null;
  sugeridaLabel: string;
}

interface LineMetricsProps {
  /** Duração em dias do ciclo início–fim de produção, por item. */
  avgByLine: AvgByLineEntry[];
  /** Média de dias (criado → finalizado) por pedido, por linha (90d). */
  orderLeadTimeByLine: AvgByLineEntry[];
  suggestedPrazoNovosItensByLine: SuggestedPrazoEntry[];
  occupancyByLine: OccupancyEntry[];
  todayByLine: { name: string; count: number }[];
}

export function LineMetrics({
  avgByLine,
  orderLeadTimeByLine,
  suggestedPrazoNovosItensByLine,
  occupancyByLine,
  todayByLine,
}: LineMetricsProps) {
  const occById = Object.fromEntries(
    occupancyByLine.map((o) => [o.lineId, o.occupancy])
  );

  const occData = orderLeadTimeByLine.length
    ? orderLeadTimeByLine.map((l) => ({
        lineName: l.lineName,
        occupancy: occById[l.lineId] ?? 0,
      }))
    : avgByLine.map((l) => ({
        lineName: l.lineName,
        occupancy: occById[l.lineId] ?? 0,
      }));

  const noAvg = avgByLine.length === 0;
  const noLead = orderLeadTimeByLine.length === 0;
  const noOcc = occData.length === 0;
  const allThreeLineChartsEmpty = noAvg && noLead && noOcc;

  return (
    <div className="space-y-4">
      {allThreeLineChartsEmpty ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">
            Indicadores em construção
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Ainda não há dados para{" "}
            <span className="font-medium text-slate-600">
              duração média de produção
            </span>
            ,{" "}
            <span className="font-medium text-slate-600">
              lead time do pedido por linha
            </span>{" "}
            e{" "}
            <span className="font-medium text-slate-600">
              ocupação por linha
            </span>
            . Conforme houver itens e pedidos no período, os gráficos serão
            exibidos aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              Duração média de produção por linha
            </h3>
            <p className="text-[11px] text-slate-500 mb-2">
              Média de dias (início → fim) dos itens já programados com as duas
              datas.
            </p>
            {avgByLine.length === 0 ? (
              <p className="text-xs text-slate-500">
                Ainda não há dados suficientes para calcular duração média.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={avgByLine}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="lineName" tick={{ fontSize: 10 }} />
                  <YAxis unit=" d" width={32} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar
                    dataKey="avgDays"
                    name="Dias"
                    fill="#2E86C1"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              Lead time do pedido por linha
            </h3>
            <p className="text-[11px] text-slate-500 mb-2">
              Média de dias da criação do pedido à finalização; só pedidos
              finalizados nos últimos 90 dias, por linha em que o pedido teve
              itens.
            </p>
            {orderLeadTimeByLine.length === 0 ? (
              <p className="text-xs text-slate-500">
                Ainda não há pedidos finalizados no período com itens nessas
                linhas.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={orderLeadTimeByLine}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="lineName" tick={{ fontSize: 10 }} />
                  <YAxis unit=" d" width={32} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar
                    dataKey="avgDays"
                    name="Dias (pedido)"
                    fill="#1B4F72"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${
            allThreeLineChartsEmpty ? "lg:col-span-2" : ""
          }`}
        >
          <h3 className="text-sm font-semibold text-slate-800 mb-1">
            Prazo sugerido para novos itens (por linha)
          </h3>
          <p className="text-[11px] text-slate-500 mb-2">
            Para cada linha, considera o item em aberto com maior fim de
            produção; o prazo alvo soma 2 dias corridos ao Prazo de Vendas (ou
            PCP se não houver). Se não houver itens na fila, usa hoje + 2 corridos.{" "}
            A coluna mostra a margem em{" "}
            <span className="font-medium text-slate-600">dias úteis</span>{" "}
            (segunda a sexta, fora os feriados cadastrados) de hoje até essa
            data; o mínimo exibido é <span className="font-medium text-slate-600">2 dias úteis</span>{" "}
            (a regra soma sempre 2 dias corridos à data de referência).
          </p>
          {suggestedPrazoNovosItensByLine.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma linha cadastrada.</p>
          ) : (
            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-1.5 pr-2 font-medium">Linha</th>
                    <th className="py-1.5 font-medium">Prazo sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestedPrazoNovosItensByLine.map((row) => (
                    <tr
                      key={row.lineId}
                      className="border-b border-slate-100 text-slate-800"
                    >
                      <td className="py-1.5 pr-2">{row.lineName}</td>
                      <td className="py-1.5 font-medium tabular-nums">
                        {row.sugeridaLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!allThreeLineChartsEmpty && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              Ocupação por linha (próximos 30 dias)
            </h3>
            {occData.length === 0 ? (
              <p className="text-xs text-slate-500">
                Não há itens agendados nas próximas semanas.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={occData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="lineName" tick={{ fontSize: 10 }} />
                  <YAxis
                    unit="%"
                    domain={[0, 100]}
                    width={36}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="occupancy"
                    name="Ocupação"
                    fill="#27AE60"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">
          Itens em produção hoje
        </h3>
        {todayByLine.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nenhum item está em produção hoje.
          </p>
        ) : (
          <div className="text-xs text-slate-700 space-y-1">
            {todayByLine.map((l, idx) => (
              <p key={idx}>
                <span className="font-medium">{l.name || "Linha"}</span>:{" "}
                {l.count} item{l.count === 1 ? "" : "s"}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
