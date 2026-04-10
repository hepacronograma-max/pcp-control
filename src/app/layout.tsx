import type { ReactNode } from "react";
import type { Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "PCP Control",
  description: "Sistema de Planejamento e Controle de Produção",
  appleWebApp: {
    capable: true,
    title: "PCP Control",
    statusBarStyle: "default",
  },
};

/** Escala correta em telemóveis e respeito por áreas seguras (notch / barra home). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#1B4F72",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen min-h-[100dvh] overflow-x-hidden bg-slate-50 antialiased">
        <Toaster position="top-center" richColors />
        {children}
      </body>
    </html>
  );
}


