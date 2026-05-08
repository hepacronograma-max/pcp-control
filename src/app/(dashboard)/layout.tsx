import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ReactQueryProvider>
      <DashboardShell>{children}</DashboardShell>
    </ReactQueryProvider>
  );
}
