// Church web addresses on their own subdomain: riverside.ourfaithfulchurch.com shows Riverside's landing page.
// Cloudflare Pages can't serve a wildcard subdomain, so this Worker answers *.ourfaithfulchurch.com and fetches the app
// from the main address's /app/; the app sees the subdomain and opens that church's page (CHURCH_SITE in 00-util.js).
// It also answers an optional short domain (SHORT_DOMAIN, like ofc.church/riverside), forwarding to the full address.
// Setup: SETUP.md, "Church web addresses".

const KEEP = new Set(["www", "app", "mail", "api", "admin", "help", "status"]);   // the platform's own names pass through

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const site = (env.SITE_DOMAIN || "ourfaithfulchurch.com").toLowerCase();
    const host = url.hostname.toLowerCase();

    // The short domain: ofc.church/riverside forwards to the church's page; the bare short domain to the app.
    if (env.SHORT_DOMAIN && host === env.SHORT_DOMAIN.toLowerCase()) {
      const handle = url.pathname.split("/")[1]?.toLowerCase() || "";
      const to = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle) ? `https://${site}/${handle}` : `https://${site}/`;
      return Response.redirect(to, 301);
    }

    if (!host.endsWith(`.${site}`)) return fetch(request);
    const sub = host.slice(0, -site.length - 1);
    if (sub.includes(".") || KEEP.has(sub)) return fetch(request);

    // Anything but the page itself and its files belongs on the main address (sign-in links, pairing, deep links).
    if (url.pathname !== "/" && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      return Response.redirect(`https://${site}/app${url.pathname}${url.search}`, 302);
    }

    // Fetch the app from the main address (it lives at /app/ there; the root is the website). The page and its files
    // are the same for every church.
    const upstream = new URL(`/app${url.pathname}${url.search}`, `https://${site}`);
    const headers = new Headers(request.headers); headers.delete("host");
    const res = await fetch(upstream, { method: request.method, headers, redirect: "manual" });
    const out = new Response(res.body, res);
    out.headers.set("x-church-site", sub);
    return out;
  },
};
