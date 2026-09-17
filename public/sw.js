self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      const names = await caches.keys();
      await Promise.all(names.map(function (name) {
        return caches.delete(name);
      }));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: "window" });
      for (const client of windows) {
        if (client.url) client.navigate(client.url);
      }
    })()
  );
});
