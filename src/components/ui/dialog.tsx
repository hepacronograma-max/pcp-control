"use client";

import * as React from "react";
import { createPortal } from "react-dom";

type DialogCtxValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DialogCtx = React.createContext<DialogCtxValue | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DialogCtx.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogCtx.Provider>
  );
}

export function DialogTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DialogCtx);
  if (!ctx)
    throw new Error("DialogTrigger must be inside Dialog");
  const { onOpenChange } = ctx;

  function openDialog() {
    onOpenChange(true);
  }

  if (
    asChild &&
    React.isValidElement(children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>)
  ) {
    const child = children as React.ReactElement<{
      onClick?: (e: React.MouseEvent) => void;
    }>;
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e);
        openDialog();
      },
    });
  }

  return (
    <button type="button" onClick={openDialog}>
      {children}
    </button>
  );
}

export function DialogContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DialogCtx);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!ctx || !mounted || typeof document === "undefined") return null;
  if (!ctx.open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Fechar"
        onClick={() => ctx.onOpenChange(false)}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`pointer-events-auto relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-lg ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`space-y-1 ${className}`.trim()}>{children}</div>;
}

export function DialogTitle({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      className={`text-lg font-semibold leading-none text-slate-900 ${className}`.trim()}
    >
      {children}
    </h2>
  );
}
