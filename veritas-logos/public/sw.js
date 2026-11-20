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

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(CONFIG.shell.map((path) => new Request(absolute(path), { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((name) => (name === "veritas-v1" && scope.pathname === "/") || (name.startsWith(PREFIX) && name !== SHELL && name !== DATA)).map((name) => caches.delete(name)));
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
  const path = url.pathname.slice(scope.pathname.length);
  const navigation = request.mode === "navigate" && (path === "" || path === "index.html");
  if (navigation || (shellFiles.has(path) && !url.search)) {
    event.respondWith(caches.open(SHELL).then(async (cache) => {
      const cached = await cache.match(navigation ? absolute("index.html") : request);
      return CONFIG.watch && cached ? fetch(request).catch(() => cached) : cached ?? fetch(request);
    }));
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
