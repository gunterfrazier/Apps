// The build supplies the published asset list and revision.
const CONFIG = /* OFFLINE_CONFIG */ null;
const scope = new URL(self.registration.scope);
const PREFIX = `veritas-logos-offline-${encodeURIComponent(scope.pathname)}-`;
const SHELL = `${PREFIX}${CONFIG.version}-shell`;
const DATA = `${PREFIX}${CONFIG.dataVersion}-data`;
const absolute = (path) => new URL(path, scope).href;
const shellFiles = new Set(CONFIG.shell);
const publicData = new Set(CONFIG.data);
const warming = new Map();
// Pages redirects index.html to the directory URL. Cached redirects cannot answer a navigation.
const shellDocument = absolute("");

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(CONFIG.shell.map((path) => new Request(
      path === "index.html" ? shellDocument : absolute(path), { cache: "reload", redirect: "error" }
    )));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((name) => (scope.pathname === "/" && /^veritas-(?:v1|[a-f0-9]{12})$/.test(name)) || (name.startsWith(PREFIX) && name !== SHELL && name !== DATA)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

const jsonResponse = (response) => response.ok && !response.redirected && /\bjson\b/i.test(response.headers.get("content-type") ?? "");

async function saveData(cache, path) {
  if (warming.has(path)) return warming.get(path);
  const task = (async () => {
    const url = absolute(path);
    if (await cache.match(url)) return;
    const response = await fetch(url);
    if (!jsonResponse(response)) throw new Error(`Could not save ${path}`);
    await cache.put(url, response);
  })().finally(() => warming.delete(path));
  warming.set(path, task);
  return task;
}

self.addEventListener("message", (event) => {
  const { type, translation } = event.data ?? {};
  const reply = event.ports[0];
  if (type !== "prepare-study" || !reply) return;
  event.waitUntil((async () => {
    try {
      if (typeof translation !== "string" || !Object.hasOwn(CONFIG.translations, translation)) throw new Error("Unknown Bible translation.");
      const paths = [...CONFIG.study, ...CONFIG.translations[translation]];
      const cache = await caches.open(DATA);
      // Bound concurrent downloads and skip files that are already on the device.
      for (let i = 0; i < paths.length; i += 6) {
        await Promise.all(paths.slice(i, i + 6).map((path) => saveData(cache, path)));
      }
      reply.postMessage({ ready: true });
    } catch {
      reply.postMessage({ ready: false });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // Authentication callbacks must go to the network with their query intact.
  if (request.mode === "navigate" && url.search) return;
  const path = url.pathname.slice(scope.pathname.length);
  const navigation = request.mode === "navigate" && (path === "" || path === "index.html");
  if (navigation || (shellFiles.has(path) && !url.search)) {
    event.respondWith((async () => {
      const key = navigation || path === "index.html" ? shellDocument : request;
      const cached = await caches.match(key, { cacheName: SHELL }).catch(() => undefined);
      if (!cached?.ok || cached.redirected) return fetch(request);
      return CONFIG.watch ? fetch(request).catch(() => cached) : cached;
    })());
  } else if (publicData.has(path) && !url.search) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (jsonResponse(response)) {
        try { await cache.put(request, response.clone()); } catch { /* Reading online still works if storage is full. */ }
      }
      return response;
    })());
  }
});
