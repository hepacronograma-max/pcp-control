"use client";

import * as React from "react";
import { createPortal } from "react-dom";

type SheetCtxValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SheetCtx = React.createContext<SheetCtxValue | null>(null);

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <SheetCtx.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetCtx.Provider>
  );
}

export function SheetTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(SheetCtx);
  if (!ctx) throw new Error("SheetTrigger must be inside Sheet");
  const { onOpenChange } = ctx;

  function openSheet() {
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
        openSheet();
      },
    });
  }

  return (
    <button type="button" onClick={openSheet}>
      {children}
    </button>
  );
}

export function SheetContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(SheetCtx);
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
        aria-label="Fechar painel"
        onClick={() => ctx.onOpenChange(false)}
      />
      <aside
        className={`fixed right-0 top-0 flex h-full max-h-screen flex-col border-l border-slate-200 bg-white shadow-xl ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>,
    document.body
  );
}

export function SheetHeader({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border-b border-slate-100 px-4 py-3 ${className}`}>
      {children}
    </div>
  );
}

export function SheetTitle({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2 className={`text-base font-semibold text-slate-900 ${className}`.trim()}>
      {children}
    </h2>
  );
}
