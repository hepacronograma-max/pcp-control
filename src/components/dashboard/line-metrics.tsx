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

interface LineMetricsProps {
  avgByLine: AvgByLineEntry[];
  occupancyByLine: OccupancyEntry[];
  todayByLine: { name: string; count: number }[];
}

export function LineMetrics({
  avgByLine,
  occupancyByLine,
  todayByLine,
}: LineMetricsProps) {
  const occById = Object.fromEntries(
    occupancyByLine.map((o) => [o.lineId, o.occupancy])
  );

  const avgData = avgByLine;
  const occData = avgByLine.map((l) => ({
    lineName: l.lineName,
    occupancy: occById[l.lineId] ?? 0,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">
          Prazo médio por linha
        </h3>
        {avgData.length === 0 ? (
          <p className="text-xs text-slate-500">
            Ainda não há dados suficientes para calcular prazos médios.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={avgData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="lineName" />
              <YAxis unit=" dias" />
              <Tooltip />
              <Bar
                dataKey="avgDays"
                fill="#2E86C1"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">
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
              <XAxis dataKey="lineName" />
              <YAxis unit="%" domain={[0, 100]} />
              <Tooltip />
              <Bar
                dataKey="occupancy"
                fill="#27AE60"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
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

