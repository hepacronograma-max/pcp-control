"use client";

import * as React from "react";
import { createPortal } from "react-dom";

type DropdownCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
};

const DropdownMenuCtx = React.createContext<DropdownCtx | null>(null);

export function DropdownMenu({
  open: openProp,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : internalOpen;
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (!controlled) setInternalOpen(v);
      onOpenChange?.(v);
    },
    [controlled, onOpenChange]
  );
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const value = React.useMemo(
    () => ({ open, setOpen, triggerRef }),
    [open, setOpen]
  );

  return (
    <DropdownMenuCtx.Provider value={value}>
      {children}
    </DropdownMenuCtx.Provider>
  );
}

export function DropdownMenuTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DropdownMenuCtx);
  if (!ctx) throw new Error("DropdownMenuTrigger must be inside DropdownMenu");
  const { setOpen, open, triggerRef } = ctx;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(!open);
  }

  function setRef(node: HTMLElement | null) {
    (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
  }

  if (
    asChild &&
    React.isValidElement(
      children as React.ReactElement<{
        onClick?: (e: React.MouseEvent) => void;
        ref?: React.Ref<HTMLElement>;
      }>
    )
  ) {
    const child = children as React.ReactElement<{
      onClick?: (e: React.MouseEvent) => void;
      ref?: React.Ref<HTMLElement>;
    }>;
    return React.cloneElement(child, {
      ref: (node: HTMLElement | null) => {
        setRef(node);
        const r = child.props.ref;
        if (typeof r === "function") r(node);
        else if (r && typeof r === "object")
          (r as React.MutableRefObject<HTMLElement | null>).current = node;
      },
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e);
        toggle(e);
      },
      "aria-expanded": open,
      "aria-haspopup": "menu",
    } as Parameters<typeof React.cloneElement>[1]);
  }

  return (
    <button
      type="button"
      ref={setRef as React.RefCallback<HTMLButtonElement>}
      onClick={toggle}
      aria-expanded={open}
      aria-haspopup="menu"
    >
      {children}
    </button>
  );
}

type ContentAlign = "start" | "end";

export function DropdownMenuContent({
  className = "",
  align = "start",
  children,
  sideOffset = 4,
}: {
  className?: string;
  align?: ContentAlign;
  children: React.ReactNode;
  sideOffset?: number;
}) {
  const ctx = React.useContext(DropdownMenuCtx);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const reposition = React.useCallback(() => {
    if (!ctx?.open || !ctx.triggerRef.current) return;
    const el = ctx.triggerRef.current;
    const r = el.getBoundingClientRect();
    const w = Math.min(320, Math.max(220, window.innerWidth - 16));
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const top = Math.min(r.bottom + sideOffset, window.innerHeight - 8);
    setPos({ top, left, width: w });
  }, [ctx, align, sideOffset]);

  React.useEffect(() => {
    if (!ctx?.open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [ctx?.open, reposition]);

  React.useEffect(() => {
    if (!ctx?.open || !ctx) return;
    const menu = ctx;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") menu.setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ctx?.open, ctx]);

  React.useEffect(() => {
    if (!ctx?.open || !ctx) return;
    const menu = ctx;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      const tr = menu.triggerRef.current;
      if (tr?.contains(t) || contentRef.current?.contains(t)) return;
      menu.setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ctx?.open, ctx]);

  if (!ctx || !mounted || typeof document === "undefined" || !ctx.open)
    return null;

  return createPortal(
    <div
      ref={contentRef}
      role="menu"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 80,
      }}
      className={`rounded-lg border border-slate-200 bg-white py-1 shadow-lg max-h-[min(70vh,360px)] overflow-y-auto overscroll-contain ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

export function DropdownMenuItem({
  className = "",
  disabled,
  onSelect,
  children,
}: {
  className?: string;
  disabled?: boolean;
  onSelect?: () => void;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DropdownMenuCtx);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none ${className}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onSelect?.();
        ctx?.setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator({ className = "" }: { className?: string }) {
  return <div className={`my-1 h-px bg-slate-100 ${className}`.trim()} role="separator" />;
}

export function DropdownMenuLabel({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
