"use client";

import { useEffect } from "react";

/**
 * Builds antigos do next-pwa deixavam um service worker servindo HTML/JS velho
 * (ex.: tela de usuários só com um cargo). Remove o SW e o cache do browser.
 */
export function UnregisterLegacySw() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
    }
    if (typeof caches !== "undefined") {
      void caches.keys().then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key)))
      );
    }
  }, []);
  return null;
}
