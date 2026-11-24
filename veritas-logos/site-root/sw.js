// Veritas Logos moved from the root of veritaslogos.com to /app/, and the root is now its website. This worker
// replaces the app's old one at the root, once: it copies offline downloads (Bibles and study tools) to the app's new
// address so nobody has to download them again, clears the rest of the old offline copy, removes itself, and reloads
// any open page so it's served fresh. The app's own worker lives at /app/sw.js.
const OLD = `veritas-logos-offline-${encodeURIComponent("/")}-`;
const NEW = `veritas-logos-offline-${encodeURIComponent("/app/")}-`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(NEW)) continue;
      if (name.startsWith(OLD) && name.endsWith("-data")) {
        try {
          const from = await caches.open(name), to = await caches.open(NEW + name.slice(OLD.length));
          for (const request of await from.keys()) {
            const url = new URL(request.url);
            if (url.origin !== self.location.origin || url.pathname.startsWith("/app/")) continue;
            const response = await from.match(request);
            if (response) await to.put(new URL(`/app${url.pathname}`, self.location.origin).href, response);
          }
        } catch { /* storage full or gone: the app downloads again when asked */ }
      }
      if (name.startsWith(OLD) || /^veritas-(?:v1|[a-f0-9]{12})$/.test(name)) await caches.delete(name);
    }
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url).catch(() => {});
  })());
});
