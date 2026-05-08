"use client";

import * as React from "react";

export function ScrollArea({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`overflow-y-auto overscroll-contain ${className}`.trim()}>
      {children}
    </div>
  );
}
