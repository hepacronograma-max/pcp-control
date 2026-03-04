import type { ReactNode } from "react";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "PCP Control",
  description: "Sistema de Planejamento e Controle de Produção",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1B4F72" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
        <meta name="apple-mobile-web-app-title" content="PCP Control" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <Toaster position="top-right" richColors />
        {children}
      </body>
    </html>
  );
}


