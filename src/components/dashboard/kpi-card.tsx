import type { ReactNode } from "react";

interface KPICardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  variant?: "default" | "danger" | "success" | "warning";
}

export function KPICard({
  title,
  value,
  icon,
  trend,
  trendValue,
  variant = "default",
}: KPICardProps) {
  const variantClasses =
    variant === "danger"
      ? "bg-red-50 border-red-200"
      : variant === "success"
      ? "bg-emerald-50 border-emerald-200"
      : variant === "warning"
      ? "bg-yellow-50 border-yellow-200"
      : "bg-white border-slate-200";

  const trendIcon =
    trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "neutral" ? "→" : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-sm ${variantClasses}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {title}
        </p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
      </div>
      {trend && trendValue && (
        <div className="flex flex-col items-end text-xs">
          <span
            className={
              trend === "up"
                ? "text-emerald-600"
                : trend === "down"
                ? "text-red-600"
                : "text-slate-500"
            }
          >
            {trendIcon} {trendValue}
          </span>
          <span className="text-[11px] text-slate-400">vs. período anterior</span>
        </div>
      )}
    </div>
  );
}

