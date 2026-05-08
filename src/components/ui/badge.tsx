import * as React from "react";

export function Badge({
  className = "",
  variant = "default",
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" }) {
  const variants = {
    default: "border-transparent bg-slate-100 text-slate-800",
    outline: "border border-slate-200 bg-transparent",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${variants[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
