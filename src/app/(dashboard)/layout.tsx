import type { ReactNode } from "react";
import "../globals.css";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50">
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}

