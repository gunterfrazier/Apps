// Two tabs of the preview (no server) saving at the same time: nothing either one adds may be lost.
// (mergeSaved in src/js/20-store.js.) Run after `node build.mjs`: node test/tabs.mjs
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(join(process.env.PLAYWRIGHT_DIR || "/opt/npm-tools/node_modules", "playwright")); }
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!p.startsWith(root) || !existsSync(p) || p.endsWith("config.js")) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${server.address().port}/app/?debug`;
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined) });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let failed = 0;
try {
  const a = await ctx.newPage(); await a.goto(`${base}#home`); await a.waitForFunction(() => !!window.__app?.S?.state);
  const b = await ctx.newPage(); await b.goto(`${base}#home`); await b.waitForFunction(() => !!window.__app?.S?.state);
  const rounds = +(process.env.ROUNDS || 60);
  // Each tab adds its own records with random gaps, so their saves overlap in every order.
  const run = (p, kind, tag) => p.evaluate(async ({ rounds, kind, tag }) => {
    const S = window.__app.S, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < rounds; i++) {
      if (kind === "docs") S.state.docs.push({ id: `${tag}-${i}`, churchId: S.state.current, kind: "sermon", title: `${tag} ${i}`, blocks: [], authorId: S.me().id, published: false });
      else S.state.notifications.push({ id: `${tag}-${i}`, userId: S.me().id, kind: "test", title: `${tag} ${i}`, at: new Date().toISOString(), read: false });
      if (i % 7 === 0) S.state.me.name = `${S.state.me.name.split(" #")[0]} #${tag}${i}`; // both sides change the same value too
      S.save();
      await wait(Math.random() * 120);
    }
    S.flush();
  }, { rounds, kind, tag });
  await Promise.all([run(a, "docs", "a"), run(b, "notes", "b")]);
  await a.waitForTimeout(800);
  const want = rounds;
  for (const [name, p] of [["tab A", a], ["tab B", b]]) {
    const got = await p.evaluate(() => {
      const S = window.__app.S, saved = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("our-faithful"))));
      return { mem: [S.state.docs.filter((d) => /^a-\d+$/.test(d.id)).length, S.state.notifications.filter((n) => /^b-\d+$/.test(n.id)).length],
        disk: [saved.docs.filter((d) => /^a-\d+$/.test(d.id)).length, saved.notifications.filter((n) => /^b-\d+$/.test(n.id)).length] };
    });
    const ok = [...got.mem, ...got.disk].every((n) => n === want);
    console.log(`${ok ? "ok" : "FAILED"} ${name}: in memory ${got.mem.join("/")}, saved ${got.disk.join("/")} (want ${want}/${want})`);
    if (!ok) failed++;
  }
  // A tab adds a record and saves, and a new tab opens straight away. Browsers pass the save to other tabs a moment
  // late, so the new tab may start from the copy before it, and then save. The first tab must not lose its record.
  const lost = [];
  for (let i = 0; i < +(process.env.OPENS || 12); i++) {
    await a.evaluate((i) => { const S = window.__app.S; S.state.docs.push({ id: `open-${i}`, churchId: S.state.current, kind: "sermon", title: `Open ${i}`, blocks: [], authorId: S.me().id, published: false }); S.save(); S.flush(); }, i);
    const c = await ctx.newPage(); await c.goto(`${base}#home`); await c.waitForFunction(() => !!window.__app?.S?.state);
    await c.evaluate((i) => { const S = window.__app.S; S.state.notifications.push({ id: `c-${i}`, userId: S.me().id, kind: "test", title: "c", at: new Date().toISOString(), read: false }); S.save(); S.flush(); }, i);
    await c.waitForTimeout(300);
    const got = await a.evaluate((i) => [window.__app.S.state.docs.some((d) => d.id === `open-${i}`), window.__app.S.state.notifications.some((n) => n.id === `c-${i}`)], i);
    const gotC = await c.evaluate((i) => window.__app.S.state.docs.some((d) => d.id === `open-${i}`), i);
    if (!got[0] || !got[1] || !gotC) lost.push(`${i}: first tab has its record ${got[0]}, the new tab's ${got[1]}; new tab has the first's ${gotC}`);
    await c.close();
  }
  console.log(lost.length ? `FAILED a new tab opened right after a save:\n  ${lost.join("\n  ")}` : "ok a new tab opened right after a save: nothing lost");
  if (lost.length) failed++;
} finally { await browser.close(); server.close(); }
if (failed) process.exit(1);
console.log("Two tabs saving at once lost nothing.");
