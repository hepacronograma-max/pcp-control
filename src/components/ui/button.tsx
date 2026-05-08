import * as React from "react";

type Variant = "default" | "outline" | "ghost";
type Size = "default" | "sm";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  className = "",
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
  const sizes = {
    default: "px-4 py-2 text-sm gap-2",
    sm: "h-8 px-2 text-xs gap-1",
  } as const;
  const variants = {
    default:
      "bg-[#1B4F72] text-white hover:bg-[#2E86C1]",
    outline:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
  } as const;
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`.trim()}
      {...props}
    />
  );
}

