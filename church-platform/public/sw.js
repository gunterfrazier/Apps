// Keeps the app shell available offline. Bump VERSION whenever you deploy a new build.
const VERSION = "our-faithful-v26";
// Pictures and videos a screen saved so it keeps playing without internet (see 71b-screens.js). Kept across updates.
const MEDIA = "our-faithful-screen-media";
const mediaSaved = new Set();
caches.open(MEDIA).then((c) => c.keys()).then((keys) => keys.forEach((r) => mediaSaved.add(r.url))).catch(() => {});
// This worker sits at the site's root and looks after both the website (/) and the app (/app/). On a church subdomain
// (riverside.ourfaithfulchurch.com) the app is at the root instead, so files that aren't there are simply skipped.
const APP = "./app/";
const SHELL = ["./", APP, `${APP}index.html`, `${APP}manifest.webmanifest`, "./icons/icon-192.png", "./icons/icon-512.png", "./icons/badge-96.png", "./icons/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== MEDIA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // A screen's saved pictures and videos: from the cache first, so an outage doesn't blank the screen.
  if (mediaSaved.has(req.url)) {
    e.respondWith(caches.open(MEDIA).then((c) => c.match(req.url, { ignoreVary: true })).then((r) => r || fetch(req)));
    return;
  }
  // Fonts: cache after first use so the app keeps its type offline.
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(req)) || fetch(req).then((res) => { c.put(req, res.clone()); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // App files: network first so updates arrive, cache when offline.
  // Offline, a page that isn't saved opens the app (or the website) as last saved.
  const fallback = () => req.mode !== "navigate" ? undefined : url.pathname.includes("/app/") ? caches.match(`${APP}index.html`).then((r) => r || caches.match(APP)) : caches.match("./index.html").then((r) => r || caches.match("./"));
  e.respondWith(fetch(req).then((res) => { if (res.ok || res.type === "opaqueredirect") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req).then((r) => r || fallback()).then((r) => r || Response.error())));
});

// Push notifications sent by the server (see supabase/functions/push). Each carries { title, body, url, tag }.
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Our Faithful Church App", { body: d.body || "", tag: d.tag, icon: "./icons/icon-192.png", badge: "./icons/badge-96.png", data: { url: d.url || `${APP}#alerts` } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || `${APP}#alerts`, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(new URL(APP, self.registration.scope).href)) || list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { open.navigate(url); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});

// A screen asks to save everything it might show: { type: "ofc-cache", urls }. Things no longer needed are dropped.
// It answers on the message port with how many are saved.
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "ofc-cache" || !Array.isArray(d.urls)) return;
  e.waitUntil((async () => {
    const c = await caches.open(MEDIA), want = new Set(d.urls.map((u) => new URL(u, self.registration.scope).href));
    for (const r of await c.keys()) if (!want.has(r.url)) { await c.delete(r); mediaSaved.delete(r.url); }
    let saved = 0;
    for (const u of want) {
      if (await c.match(u)) { saved++; mediaSaved.add(u); continue; }
      try {
        const same = new URL(u).origin === location.origin, res = await fetch(u, { mode: same ? "same-origin" : "no-cors", credentials: "omit" });
        if (res.ok || res.type === "opaque") { await c.put(u, res); mediaSaved.add(u); saved++; }
      } catch { /* not reachable now: tried again on the next check-in */ }
    }
    e.ports[0]?.postMessage({ saved, total: want.size });
  })());
});
