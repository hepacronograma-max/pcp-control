"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createAppQueryClient } from "@/lib/query-client";

function WithClient({ children }: { children: ReactNode }) {
  const [client] = useState(() => createAppQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Evita novo QueryClient a cada hidratação (padrão TanStack para Next/App Router). */
export function ReactQueryProvider({ children }: { children: ReactNode }) {
  return <WithClient>{children}</WithClient>;
}
