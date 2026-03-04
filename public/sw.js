// Placeholder de Service Worker para PWA.
// Será refinado nas próximas fases conforme regras de cache do app.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

