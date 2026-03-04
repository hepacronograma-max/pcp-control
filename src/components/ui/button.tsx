import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ className = "", ...props }: ButtonProps) {
  return (
    <button
      className={
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors " +
        "bg-[#1B4F72] text-white hover:bg-[#2E86C1] disabled:opacity-60 disabled:cursor-not-allowed " +
        className
      }
      {...props}
    />
  );
}

