import * as React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={
          "flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm " +
          "shadow-sm transition-colors placeholder:text-slate-400 " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4F72] " +
          "disabled:cursor-not-allowed disabled:opacity-60 " +
          className
        }
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

