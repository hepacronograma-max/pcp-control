import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface WeeklyOnTimeEntry {
  week: string;
  rate: number;
}

export function OnTimeChart({
  data,
}: {
  data: WeeklyOnTimeEntry[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800 mb-2">
        Taxa de entrega no prazo (últimos 90 dias)
      </h3>
      {data.length === 0 ? (
        <p className="text-xs text-slate-500">
          Ainda não há dados suficientes para calcular a série temporal.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" />
            <YAxis unit="%" domain={[0, 100]} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#27AE60"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

