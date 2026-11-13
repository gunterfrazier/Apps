// Runs the built app the way the published site runs: under a sub-path (/Apps/, like GitHub Pages) and connected to
// Supabase. Supabase itself is simulated here (sign-in codes and an in-memory copy of the tables), so this checks the
// app's own live-mode wiring: signing in, a new account, registering a church, data surviving a reload, signing out.
// It doesn't check the real project's security rules or server functions; SETUP.md step 12 lists those checks.
// Run: node build.mjs && node test/live.mjs   (needs Playwright, and npm to fetch supabase-js the first time)
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(join(process.env.PLAYWRIGHT_DIR || "/opt/npm-tools/node_modules", "playwright")); }
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..", "dist"), shots = join(here, "..", ".shots");
mkdirSync(shots, { recursive: true });

// The app loads supabase-js from jsDelivr; serve the same version from npm instead.
const backendSrc = readFileSync(join(here, "..", "src", "js", "70-backend.js"), "utf8");
const version = backendSrc.match(/supabase-js@([\d.]+)/)[1];
const cache = join(tmpdir(), `supabase-js-${version}`), bundle = join(cache, "supabase.esm.js");
if (!existsSync(bundle)) {
  mkdirSync(cache, { recursive: true });
  execSync(`npm install --silent --prefix "${cache}" @supabase/supabase-js@${version} esbuild`, { stdio: "inherit" });
  execSync(`"${join(cache, "node_modules", ".bin", "esbuild")}" "${join(cache, "node_modules", "@supabase", "supabase-js")}" --bundle --format=esm --platform=browser --outfile="${bundle}" --log-level=warning`, { stdio: "inherit" });
}
const config = readFileSync(join(root, "config.js"), "utf8");
const supabaseUrl = (config.match(/supabaseUrl:\s*"([^"]+)"/) || [])[1];
if (!supabaseUrl) { console.log("dist/config.js doesn't name a Supabase project, so there's no live mode to test."); process.exit(0); }
const supaHost = new URL(supabaseUrl).host;

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!path.startsWith("/Apps/")) { res.writeHead(404); return res.end(); }
  const p = join(root, path.slice(6).replace(/^$|\/$/, "index.html"));
  if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${server.address().port}/Apps/`;

// ----- A small stand-in for Supabase: auth codes, and tables kept in memory -----
const db = {};
const keys = { records: ["kind", "id"], memberships: ["church_id", "user_id"], roles: ["church_id", "key"], profile_private: ["user_id"], families: ["user_id"], push_subscriptions: ["endpoint"] };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const uid = "11111111-2222-4333-8444-555555555555", exp = Math.floor(Date.now() / 1000) + 3600;
const user = { id: uid, aud: "authenticated", role: "authenticated", email: "tester@example.com", email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() };
const users = { [uid]: user }, passwords = {};
// People's accounts by email. tester@example.com doesn't exist until the test creates it with "I'm new here".
const accounts = {};
function account(email, create) {
  if (!accounts[email] && create) {
    const u = email === user.email ? user : { ...user, id: `aaaaaaaa-0000-4000-8000-${String(Object.keys(users).length).padStart(12, "0")}`, email, user_metadata: {} };
    users[u.id] = u; accounts[email] = { user: u, password: null };
  }
  return accounts[email] || null;
}
const body = (req) => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } };
const payCalls = [];   // what the app asked the checkout function for
const sessionFor = (u) => ({ access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, exp, role: "authenticated", aud: "authenticated", email: u.email })}.x`, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: `r-${u.id}`, user: u });
const session = sessionFor(user);
const caller = (req) => { try { return users[JSON.parse(Buffer.from((req.headers().authorization || "").split(".")[1] || "", "base64url").toString()).sub] || null; } catch { return null; } };
// What the device-pair server function does: a new account for the device, with a device membership.
function pairDevice(code) {
  const dev = (db.records || []).find((r) => r.kind === "devices" && r.data.code === code);
  if (!dev) return [404, { error: "That code didn't work." }];
  const id = `dddddddd-0000-4000-8000-${String(Object.keys(users).length).padStart(12, "0")}`, email = `device-${dev.id}@devices.our-faithful.invalid`;
  users[id] = { ...user, id, email }; passwords[email] = { id, password: "pw" };
  (db.profiles ||= []).push({ id, name: dev.data.name });
  (db.profile_private ||= []).push({ user_id: id, data: { current: dev.church_id } });
  (db.memberships ||= []).push({ church_id: dev.church_id, user_id: id, role_key: `device:${dev.data.type}`, locations: "all", listed: false });
  Object.assign(dev, { owner: id, data: { ...dev.data, status: "paired", deviceUser: id, code: null, pairedAt: new Date().toISOString(), lastSeen: new Date().toISOString() } });
  return [200, { email, password: "pw", deviceId: dev.id }];
}
const filterRows = (rows, params) => {
  for (const [col, v] of params) {
    if (["select", "order", "offset", "limit", "on_conflict", "columns"].includes(col)) continue;
    if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[col]) === v.slice(3));
    else if (v.startsWith("in.(")) { const set = v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")); rows = rows.filter((r) => set.includes(String(r[col]))); }
  }
  return rows;
};
const calls = new Set();
let supaCalls = 0;   // every request the app makes to Supabase
async function supabase(route) {
  supaCalls++;
  const req = route.request(), u = new URL(req.url()), m = req.method();
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
  if (m === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const json = (status, body, extra = {}) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json", ...extra }, body: body === undefined ? "" : JSON.stringify(body) });
  const p = u.pathname; calls.add(`${m} ${p.replace(/\/rest\/v1\//, "/")}`);
  if (p === "/auth/v1/otp") { const b = body(req); return account(b.email, b.create_user !== false) ? json(200, {}) : json(422, { code: "otp_disabled", error_code: "otp_disabled", msg: "Signups not allowed for otp" }); }
  if (p === "/auth/v1/verify") { const a = account(body(req).email, false); return a ? json(200, sessionFor(a.user)) : json(403, { code: "otp_expired", msg: "Token has expired or is invalid" }); }
  if (p === "/auth/v1/token") {
    if (u.searchParams.get("grant_type") !== "password") return json(200, session);
    const b = body(req), a = accounts[b.email], d = passwords[b.email];
    if (a && a.password && a.password === b.password) return json(200, sessionFor(a.user));
    if (d && d.password === b.password) return json(200, sessionFor(users[d.id]));
    return json(400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
  if (p === "/auth/v1/user" && m === "PUT") {
    const who = caller(req), b = body(req); if (!who) return json(401, { msg: "not signed in" });
    const a = accounts[who.email]; if (b.password) { if (a && a.password === b.password) return json(422, { code: "same_password", msg: "New password should be different from the old password." }); if (a) a.password = b.password; }
    if (b.data) who.user_metadata = { ...who.user_metadata, ...b.data };
    return json(200, who);
  }
  if (p === "/auth/v1/user") return json(200, caller(req) || user);
  if (p === "/auth/v1/logout") return route.fulfill({ status: 204, headers: cors });
  if (p === "/rest/v1/rpc/reset_training_church") { const c = body(req).c; db.records = (db.records || []).filter((r) => r.church_id !== c); return json(200, null); }
  if (p.startsWith("/rest/v1/rpc/")) return json(200, []);
  if (p === "/functions/v1/device-pair") { const b = JSON.parse(req.postData() || "{}"); if (b.action === "pair") { const [status, body] = pairDevice(String(b.code).toUpperCase()); return json(status, body); } return json(200, { ok: true }); }
  if (p === "/functions/v1/payments-setup") {
    const b = body(req), church = (db.churches || []).find((c) => c.id === b.churchId);
    if (b.action === "options") return json(200, { stripeConnect: false, providers: ["stripe", "paypal", "square"] });
    if (b.action === "connect") {
      if (b.provider !== "paypal" || b.keys?.clientId !== "pp-client" || b.keys?.secret !== "pp-secret") return json(400, { error: "PayPal didn't accept that Client ID and Secret. Copy them again from your app under Apps and Credentials." });
      church.data = { ...church.data, payments: { provider: "paypal", ready: true, mode: "test", account: "", methods: ["paypal"], recurring: true } };
      return json(200, { payments: church.data.payments });
    }
    if (b.action === "disconnect") { delete church.data.payments; return json(200, { ok: true }); }
  }
  if (p === "/functions/v1/checkout") { payCalls.push(body(req)); const b = body(req); return json(200, { url: `${b.origin}?paid=${b.kind}&checkout=co_live1&token=PAYPALORDER` }); }
  if (p === "/functions/v1/pay-confirm") {
    const b = body(req), last = payCalls.at(-1);
    if (b.checkout !== "co_live1" || !last) return json(404, { error: "Payment not found" });
    (db.records ||= []).push({ kind: "gifts", id: "paypal_CAP1", church_id: last.churchId, owner: uid, data: { by: uid, name: "Test Person", fundId: last.ref, amount: last.lines[0].amount, frequency: last.frequency, method: last.method, at: new Date().toISOString(), status: "paid", provider: "paypal" } });
    return json(200, { status: "paid", kind: "gift" });
  }
  if (p.startsWith("/functions/v1/")) return json(200, { ok: true });
  if (!p.startsWith("/rest/v1/")) return json(404, { message: "not simulated" });
  const table = p.slice(9), rows = (db[table] ||= []), params = [...u.searchParams];
  if (m === "GET") {
    const out = filterRows(rows, params), off = +(u.searchParams.get("offset") || 0), lim = u.searchParams.get("limit");
    const page = lim ? out.slice(off, off + +lim) : out.slice(off);
    if ((req.headers().accept || "").includes("vnd.pgrst.object")) return page.length === 1 ? json(200, page[0]) : json(406, { code: "PGRST116", details: `The result contains ${page.length} rows`, message: "JSON object requested, multiple (or no) rows returned" });
    return json(200, page, { "content-range": `${off}-${off + page.length - 1}/*` });
  }
  if (m === "POST") {
    const body = [].concat(JSON.parse(req.postData() || "[]")), cols = (u.searchParams.get("on_conflict") || (keys[table] || ["id"]).join(",")).split(",");
    for (const r of body) { const at = rows.findIndex((x) => cols.every((c) => String(x[c]) === String(r[c]))); if (at >= 0) rows[at] = { ...rows[at], ...r }; else rows.push(r); }
    return json(201, (req.headers().prefer || "").includes("return=representation") ? body : undefined);
  }
  if (m === "PATCH") { const body = JSON.parse(req.postData() || "{}"); filterRows(rows, params).forEach((r) => Object.assign(r, body)); return json(204); }
  if (m === "DELETE") { const gone = new Set(filterRows(rows, params)); db[table] = rows.filter((r) => !gone.has(r)); return json(204); }
  return json(405, { message: "method not simulated" });
}

const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// Playwright tries the newest route first, so the catch-all goes in first: nothing leaves this machine.
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: readFileSync(bundle) }));
await ctx.route((url) => url.host === supaHost, supabase);
const page = await ctx.newPage();
page.setDefaultTimeout(+process.env.STEP_TIMEOUT || 10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|WebSocket|realtime/i.test(m.text())) errors.push(`console: ${m.text()}`); });
let failed = 0;
const shot = (name) => page.screenshot({ path: join(shots, `live-${name}.png`) });
async function step(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split("\n")[0]}`); await shot(`fail-${name.replace(/\W+/g, "-")}`).catch(() => {}); }
}
const appText = () => page.textContent("#app");

await step("opens at /Apps/ and asks: new here, or have an account?", async () => {
  await page.goto(base + "?debug");
  await page.waitForSelector(".signin-choice");
  if (await page.$("form[data-form=welcome]")) throw new Error("shows the browser-only welcome form");
  if (!(await page.title()).includes("Our Faithful")) throw new Error(`title is ${await page.title()}`);
  await shot("1-signin");
});
await step("app files load under the sub-path", async () => {
  for (const f of ["manifest.webmanifest", "icons/icon-192.png", "sw.js", "config.js", "bible/BSB-nt.json"]) { const r = await page.request.get(base + f); if (!r.ok()) throw new Error(`${f}: ${r.status()}`); }
  const scope = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then((r) => r.scope), new Promise((ok) => setTimeout(() => ok("not ready"), 8000))]));
  if (!scope.endsWith("/Apps/")) throw new Error(`service worker scope: ${scope}`);
});
await step("device pairing opens without signing in", async () => {
  await page.click("a[href='#pair']"); await page.waitForSelector("form[data-form=pair]");
  await page.goBack(); await page.waitForSelector(".signin-choice");
});
await step("creates an account: email code, then name and password", async () => {
  await page.click("[data-act=signin-mode][data-mode=new]");
  await page.fill("form[data-form=signin-email] input[name=email]", "Tester@Example.com "); await page.click("form[data-form=signin-email] button.btn");
  await page.waitForSelector("form[data-form=signin-code]"); await shot("2-code");
  await page.fill("form[data-form=signin-code] input[name=code]", "123456"); await page.click("form[data-form=signin-code] button.btn");
  await page.waitForSelector("form[data-form=account-setup]"); // then a name and a password
  await page.fill("form[data-form=account-setup] input[name=name]", "Test Person");
  await page.fill("form[data-form=account-setup] input[name=password]", "grace and peace");
  await page.fill("form[data-form=account-setup] input[name=password2]", "grace and pease"); await page.click("form[data-form=account-setup] button.btn");
  await page.waitForSelector("text=The two passwords don't match");
  await page.fill("form[data-form=account-setup] input[name=password2]", "grace and peace"); await shot("2b-setup");
  await page.click("form[data-form=account-setup] button.btn");
  await page.waitForFunction(() => /church/i.test(document.querySelector("#app").textContent) && !document.querySelector("form[data-form=account-setup], form[data-form=welcome]"));
  if (accounts["tester@example.com"]?.password !== "grace and peace" || !user.user_metadata.password_set) throw new Error("the password wasn't saved");
  await shot("3-churches");
});
await step("registers a church and it saves to the database", async () => {
  await page.evaluate(() => { location.hash = "start"; });
  await page.fill("input[name=name]", "Test Fellowship"); await page.fill("input[name=locName0]", "Main"); await page.fill("input[name=locCode0]", "MAIN");
  await page.click("form[data-form=start-church] button.btn:not([type=button])"); await page.waitForSelector("text=Getting started");
  await page.waitForFunction(() => true); await page.waitForTimeout(1500); // sync runs shortly after a change
  if (!(db.churches || []).some((c) => /Test Fellowship/.test(JSON.stringify(c)))) {
    const st = await page.evaluate(async () => { const B = __app.Backend; let err = null; try { B.pushing = false; await B.flush(); } catch (e) { err = String(e.stack || e).slice(0, 500); } return { ready: B.ready, on: B.on, user: !!B.user, snap: B.snap?.size, rows: (() => { try { return B.rows().length; } catch (e) { return "rows threw: " + e.message; } })(), err }; });
    throw new Error(`church not saved; tables: ${Object.keys(db).join(", ")}; ${JSON.stringify(st)}`);
  }
  if (!(db.memberships || []).some((m) => m.user_id === uid)) throw new Error("membership not saved");
  if (!(db.profiles || []).some((p) => p.id === uid && /Test Person/.test(JSON.stringify(p)))) throw new Error("profile name not saved");
  await shot("4-church");
});
await step("adds an announcement, which survives a reload", async () => {
  await page.evaluate(() => { location.hash = "admin-news"; }); await page.waitForTimeout(400);
  const add = await page.$("[data-act=admin-new], [data-act=news-new], button:has-text('Add')"); if (!add) throw new Error("no add button on the announcements screen");
  await add.click(); await page.waitForSelector("#scrim form");
  await page.fill("#scrim input[name=title]", "Coffee after the service"); const body = await page.$("#scrim textarea[name=body]"); if (body) await body.fill("Join us in the lobby.");
  await page.click("#scrim form button.btn:not([type=button]):not(.danger)"); await page.waitForSelector("#scrim", { state: "detached" }); await page.waitForTimeout(1500);
  if (!(db.records || []).some((r) => r.kind === "news" && /Coffee after the service/.test(JSON.stringify(r.data)))) throw new Error("announcement not saved");
  await page.reload(); await page.waitForSelector(".home-top, .tabbar, nav", { timeout: 15000 });
  await page.evaluate(() => { location.hash = "home"; }); await page.waitForTimeout(800);
  if (!(await appText()).includes("Coffee after the service")) throw new Error("announcement missing after reload");
  if (!(await appText()).includes("Test Fellowship")) throw new Error("church missing after reload");
  await shot("5-after-reload");
});
// For checking the real security rules: the rows the app wrote, as it would send them to Supabase.
if (process.env.DUMP_DB) (await import("node:fs")).writeFileSync(process.env.DUMP_DB, JSON.stringify({ uid, db }, null, 1));
await step("pairs a presentation screen as a device", async () => {
  await page.evaluate(() => { location.hash = "devices"; }); await page.click("[data-act=device-new]");
  await page.locator("#scrim input[name=type][value=display]").evaluate((el) => el.click());
  await page.click("#scrim form button.btn:not([type=button])"); await page.waitForSelector("#scrim .pair-code");
  const code = (await page.textContent("#scrim .pair-code")).trim(); await page.waitForTimeout(1200); // saved to the database
  await page.click("#scrim [data-act=close-sheet]");
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx2.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx2.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: readFileSync(bundle) }));
  await ctx2.route((url) => url.host === supaHost, supabase);
  const tv = await ctx2.newPage(); tv.on("pageerror", (e) => errors.push(`device: ${e.message}`));
  await tv.goto(base + `#pair-${code}`); await tv.waitForSelector("form[data-form=pair]"); await tv.click("form[data-form=pair] button.btn");
  await tv.waitForSelector(".display .slide", { timeout: 15000 });
  if ((await tv.evaluate(() => location.hash)) !== "#display-follow") throw new Error(`device went to ${await tv.evaluate(() => location.hash)}`);
  await tv.evaluate(() => { location.hash = "admin"; }); await tv.waitForTimeout(400);
  if ((await tv.evaluate(() => location.hash)) !== "#display-follow") throw new Error("the device left its screen");
  await tv.screenshot({ path: join(shots, "live-6-device.png") });
  await page.waitForTimeout(300); await page.reload(); await page.evaluate(() => { location.hash = "devices"; }); await page.waitForTimeout(800);
  if (!/Online/.test(await appText())) throw new Error("the admin doesn't see the device online");
  await ctx2.close();
});
const freshPage = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await c.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await c.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: readFileSync(bundle) }));
  await c.route((url) => url.host === supaHost, supabase);
  const p = await c.newPage(); p.on("pageerror", (e) => errors.push(`link page: ${e.message}`)); return p;
};
await step("connects PayPal from Admin, Giving", async () => {
  await page.evaluate(() => { location.hash = "admin-giving"; }); await page.waitForSelector(".proc-list");
  await page.click("[data-act=processor-pick][data-p=paypal]"); await page.waitForSelector("form[data-form=processor-connect]");
  await page.fill("#scrim input[name=clientId]", "pp-client"); await page.fill("#scrim input[name=secret]", "wrong secret");
  await page.click("form[data-form=processor-connect] button.btn.block"); await page.waitForSelector("#scrim .err:has-text(\"didn't accept\")");
  await page.fill("#scrim input[name=secret]", "pp-secret"); await page.click("form[data-form=processor-connect] button.btn.block");
  await page.waitForSelector(".proc-head .proc-mark.paypal"); await page.waitForSelector("text=Test mode"); await shot("9-paypal-connected");
});
await step("gives through PayPal and comes back to a thank-you", async () => {
  await page.evaluate(() => { location.hash = "give"; }); await page.waitForSelector("#give-btn");
  if (await page.$("input[name=method][type=radio]")) throw new Error("PayPal has one way to pay; no choice should show");
  await page.waitForSelector("text=You'll finish on PayPal's secure page"); await shot("10-give-paypal");
  await page.click("[data-act=give-preset][data-n='100']"); await page.locator("input[name=frequency][value=monthly]").evaluate((el) => el.click());
  await page.click("#give-btn");
  await page.waitForSelector("text=Thank you!", { timeout: 15000 });
  const sent = payCalls.at(-1);
  if (sent.kind !== "gift" || sent.lines[0].amount !== 100 || sent.method !== "paypal" || sent.frequency !== "monthly" || !/\/Apps\/$/.test(sent.origin)) throw new Error(`checkout got ${JSON.stringify(sent)}`);
  if (await page.evaluate(() => location.search.includes("checkout"))) throw new Error("the address still has the checkout in it");
  await shot("11-paid");
  await page.evaluate(() => { location.hash = "history"; }); await page.waitForSelector("#main .row:has-text('PayPal')");
});
await step("cancelling at PayPal comes back to the Give screen", async () => {
  await page.goto(base + "?unpaid=gift&to=give&token=PAYPALORDER"); await page.waitForSelector("#give-btn", { timeout: 15000 });
  await page.waitForSelector("text=Payment was cancelled");
  if ((await page.evaluate(() => location.hash)) !== "#give") throw new Error("didn't go back to Give");
});
let trainingId = "";
await step("creates a shared training church from a copy of the real one", async () => {
  await page.goto(base + "?debug#admin"); await page.waitForSelector("a[href='#admin-training']", { timeout: 15000 });
  await page.click("a[href='#admin-training']"); await page.waitForSelector("form[data-form=training-create]");
  await page.locator("input[name=source][value=copy]").evaluate((el) => el.click());
  await page.click("form[data-form=training-create] button.btn.block");
  await page.waitForSelector(".training-bar", { timeout: 15000 }); await page.waitForTimeout(1200);
  const t = (db.churches || []).find((c) => c.data?.training);
  if (!t) throw new Error("no training church in the database");
  trainingId = t.id;
  const real = db.churches.find((c) => c.id === t.data.training.of);
  if (real?.data?.trainingChurch !== t.id) throw new Error("the real church doesn't point to its training church");
  if (t.data.defaults?.roleId !== "admin") throw new Error("people who join should be able to practise everything");
  const copied = (db.records || []).filter((r) => r.church_id === t.id && r.kind === "news");
  if (!copied.some((r) => /Coffee after the service/.test(r.data.title))) throw new Error("the announcement wasn't copied");
  if (copied.some((r) => (db.records || []).some((x) => x !== r && x.kind === r.kind && x.id === r.id))) throw new Error("copied records reused the real church's IDs");
  if ((db.records || []).some((r) => r.church_id === t.id && ["gifts", "prayers", "event_regs"].includes(r.kind))) throw new Error("personal records were copied");
  await shot("16-training-church");
});
await step("a teammate joins the training church and the team sees each other's changes", async () => {
  const p = await freshPage(); await p.goto(base);
  await p.click("[data-act=signin-mode][data-mode=new]");
  await p.fill("form[data-form=signin-email] input[name=email]", "teammate@example.com"); await p.click("form[data-form=signin-email] button.btn");
  await p.fill("form[data-form=signin-code] input[name=code]", "123456"); await p.click("form[data-form=signin-code] button.btn");
  await p.fill("form[data-form=account-setup] input[name=name]", "Terry Teammate"); await p.fill("input[name=password]", "practice makes"); await p.fill("input[name=password2]", "practice makes");
  await p.click("form[data-form=account-setup] button.btn"); await p.waitForFunction(() => !document.querySelector("form[data-form=account-setup]"));
  await p.evaluate(() => { location.hash = "churches"; }); await p.waitForSelector("#church-list");
  if (/Training/.test(await p.textContent("#church-list"))) throw new Error("the training church shows in Find your church");
  await p.evaluate((id) => { location.hash = `church-${id}`; }, trainingId); await p.click("[data-act=join-church]", { timeout: 15000 });
  await p.waitForSelector(".training-bar", { timeout: 15000 });
  for (let i = 0; i < 30 && !(db.memberships || []).some((x) => x.church_id === trainingId && x.user_id !== uid); i++) await p.waitForTimeout(200);   // saved a moment later
  const m = (db.memberships || []).find((x) => x.church_id === trainingId && x.user_id !== uid);
  if (m?.role_key !== "admin") throw new Error(`the teammate joined as ${m?.role_key}`);
  await p.evaluate(() => { location.hash = "connect"; }); await p.click("[data-act=prayer-new]");
  await p.fill("#scrim textarea[name=text]", "Terry's practice prayer"); await p.click("#scrim form button.btn:not([type=button])");
  await p.waitForSelector("text=Terry's practice prayer"); await p.waitForTimeout(1200);
  await p.context().close();
  await page.reload(); await page.waitForSelector(".training-bar", { timeout: 15000 });
  await page.evaluate(() => { location.hash = "connect"; }); await page.waitForSelector("text=Terry's practice prayer");
});
await step("resets the training church to sample content", async () => {
  await page.evaluate(() => { location.hash = "admin-training"; }); await page.waitForSelector("form[data-form=training-reset]");
  await page.locator("form[data-form=training-reset] input[name=source][value=sample]").evaluate((el) => el.click());
  await page.click("form[data-form=training-reset] button.btn"); await page.click("#scrim [data-act=training-reset-yes]");
  await page.waitForSelector("text=starts fresh", { timeout: 15000 }); await page.waitForTimeout(1500);
  const recs = (db.records || []).filter((r) => r.church_id === trainingId);
  if (recs.some((r) => /Terry's practice prayer/.test(JSON.stringify(r.data)))) throw new Error("the teammate's prayer survived the reset");
  if (!recs.some((r) => r.kind === "news" && /Parking lot/.test(r.data.title))) throw new Error("sample content didn't arrive");
  if (!(db.memberships || []).some((x) => x.church_id === trainingId && x.user_id !== uid)) throw new Error("the reset removed the teammate");
});
await step("deletes the training church; the real church is untouched", async () => {
  const realId = db.churches.find((c) => c.id === trainingId).data.training.of;
  const realNews = (db.records || []).filter((r) => r.church_id === realId).length;
  await page.evaluate(() => { location.hash = "admin-training"; }); await page.click("[data-act=training-delete]"); await page.click("#scrim [data-act=training-delete-yes]");
  await page.waitForFunction(() => !document.querySelector(".training-bar"), null, { timeout: 15000 }); await page.waitForTimeout(1500);
  if ((db.churches || []).some((c) => c.id === trainingId)) throw new Error("the training church is still there");
  if (db.churches.find((c) => c.id === realId).data.trainingChurch) throw new Error("the real church still points to it");
  if ((db.records || []).filter((r) => r.church_id === realId).length !== realNews) throw new Error("the real church's records changed");
});
await step("staff can practice on a copy of their church", async () => {
  await page.goto(base + "?debug#me"); await page.waitForSelector("[data-act=train-open]", { timeout: 15000 }); await page.click("[data-act=train-open]");
  await page.click("#scrim [data-act=train-copy]"); await page.waitForSelector(".sandbox-bar", { timeout: 15000 });
  await page.waitForSelector("text=Practice copy of Test Fellowship");
  const calls = supaCalls;
  await page.evaluate(() => { location.hash = "admin-news"; }); await page.waitForTimeout(300);
  await page.evaluate(() => { const S = __app.S; S.add("news", { title: "Practice only", body: "Not real", urgent: false, locationId: null, at: new Date().toISOString() }); S.flush(); __app.render(); });
  await page.waitForTimeout(800);
  if (supaCalls !== calls) throw new Error(`training reached Supabase ${supaCalls - calls} time(s)`);
  if ((db.records || []).some((r) => r.data?.title === "Practice only")) throw new Error("practice data reached the database");
  await shot("12-training-copy");
  await page.click(".sandbox-bar [data-act=sandbox-exit]"); await page.waitForFunction(() => !document.querySelector(".sandbox-bar") && /Test Fellowship/.test(document.querySelector("#app").textContent), null, { timeout: 15000 });
  if (await page.evaluate(() => /Practice only/.test(document.querySelector("#app").textContent))) throw new Error("practice data showed in the live app");
});
await step("an expired email link says what to do", async () => {
  const p = await freshPage();
  await p.goto(base + "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await p.waitForSelector(".signin-choice"); await p.waitForSelector("text=expired or was already used");
  if (/error/.test(await p.evaluate(() => location.href))) throw new Error("the error stayed in the address");
  await p.screenshot({ path: join(shots, "live-7-expired-link.png") }); await p.context().close();
});
await step("the email link signs you in", async () => {
  const p = await freshPage();
  await p.goto(base + `#access_token=${session.access_token}&expires_at=${exp}&expires_in=3600&refresh_token=r1&token_type=bearer&type=signup`);
  await p.waitForFunction(() => !document.querySelector("form[data-form^=signin]") && !/Signing you in/.test(document.querySelector("#app").textContent) && /Test Fellowship|Find your church/.test(document.querySelector("#app").textContent), null, { timeout: 15000 });
  if (/access_token/.test(await p.evaluate(() => location.href))) throw new Error("the sign-in token stayed in the address");
  await p.context().close();
});
await step("signing in with a code instead, typed with a space", async () => {
  const p = await freshPage(); await p.goto(base); await p.click("[data-act=signin-mode][data-mode=existing]");
  await p.fill("form[data-form=signin-password] input[name=email]", "tester@example.com"); await p.click("[data-act=signin-code-instead]");
  await p.waitForSelector("form[data-form=signin-code]"); await p.fill("input[name=code]", "123 456"); await p.click("form[data-form=signin-code] button.btn");
  await p.waitForFunction(() => !document.querySelector("form[data-form^=signin], form[data-form=account-setup]") && /Test Fellowship/.test(document.querySelector("#app").textContent), null, { timeout: 15000 });
  await p.context().close();
});
await step("a code can't create an account from the sign-in side", async () => {
  const p = await freshPage(); await p.goto(base); await p.click("[data-act=signin-mode][data-mode=existing]");
  await p.fill("form[data-form=signin-password] input[name=email]", "nobody@example.com"); await p.click("[data-act=signin-code-instead]");
  await p.waitForSelector("text=There's no account with that email yet");
  if (accounts["nobody@example.com"]) throw new Error("an account was created"); await p.context().close();
});
await step("an account made before passwords is asked to choose one", async () => {
  account("early@example.com", true); // signed up with a code only
  const p = await freshPage(); await p.goto(base); await p.click("[data-act=signin-mode][data-mode=existing]");
  await p.fill("form[data-form=signin-password] input[name=email]", "early@example.com"); await p.fill("form[data-form=signin-password] input[name=password]", "anything");
  await p.click("form[data-form=signin-password] button.btn"); await p.waitForSelector("text=don't match");
  await p.click("[data-act=signin-code-instead]"); await p.waitForSelector("form[data-form=signin-code]");
  await p.fill("input[name=code]", "123456"); await p.click("form[data-form=signin-code] button.btn");
  await p.waitForSelector("form[data-form=account-setup] input[name=name]");
  await p.fill("input[name=name]", "Early Member"); await p.fill("input[name=password]", "first light"); await p.fill("input[name=password2]", "first light");
  await p.click("form[data-form=account-setup] button.btn"); await p.waitForFunction(() => !document.querySelector("form[data-form=account-setup]"));
  if (accounts["early@example.com"].password !== "first light") throw new Error("password not saved"); await p.context().close();
});
await step("the demo runs on a sample church without touching the database", async () => {
  const p = await freshPage(); await p.goto(base + "?debug"); await p.waitForSelector(".signin-choice");
  const calls = supaCalls;
  await p.click(".signin-try a[href='?demo']"); await p.waitForSelector(".sandbox-bar", { timeout: 15000 });
  if (/demo/.test(await p.evaluate(() => location.search))) throw new Error("the address still says ?demo");
  await p.waitForSelector("text=Riverside"); await p.screenshot({ path: join(shots, "live-13-demo.png") });
  await p.evaluate(() => { location.hash = "connect"; }); await p.click("[data-act=prayer-new]");
  await p.fill("#scrim textarea[name=text]", "Demo prayer for the retreat"); await p.click("#scrim form button.btn:not([type=button])");
  await p.waitForSelector("text=Demo prayer for the retreat");
  await p.evaluate(() => { location.hash = "admin"; }); await p.waitForSelector("text=Account details");   // the primary account holder sees everything
  await p.click(".sandbox-bar [data-act=demo-role]"); await p.click("#scrim [data-act=demo-role-set][data-id=member]");
  await p.waitForSelector("text=You're now: Member");
  await p.reload(); await p.waitForSelector(".sandbox-bar");
  await p.evaluate(() => { location.hash = "connect"; }); await p.waitForSelector("text=Demo prayer for the retreat");   // kept across a reload
  if (supaCalls !== calls) throw new Error(`the demo reached Supabase ${supaCalls - calls} time(s)`);
  await p.click(".sandbox-bar [data-act=sandbox-reset]"); await p.click("#scrim [data-act=sandbox-reset-yes]");
  await p.waitForSelector(".sandbox-bar"); await p.evaluate(() => { location.hash = "connect"; }); await p.waitForTimeout(400);
  if (await p.$("text=Demo prayer for the retreat")) throw new Error("Reset didn't clear the demo");
  await p.click(".sandbox-bar [data-act=sandbox-exit]"); await p.waitForSelector(".signin-choice", { timeout: 15000 });
  if (await p.$(".sandbox-bar")) throw new Error("still in the demo after Exit");
  await p.context().close();
});
await step("training ticks off exercises as they're done", async () => {
  const p = await freshPage(); await p.goto(base + "?training"); await p.waitForSelector("text=Training", { timeout: 15000 });
  await p.waitForSelector(".train-row"); const total = await p.$$eval(".train-row", (r) => r.length);
  if (!(await p.textContent(".sandbox-bar")).includes(`0 of ${total} done`)) throw new Error("the checklist didn't start at 0");
  await p.screenshot({ path: join(shots, "live-14-training.png") });
  await p.click(".train-row[href='#connect']"); await p.click("[data-act=prayer-new]");
  await p.fill("#scrim textarea[name=text]", "Practice prayer"); await p.click("#scrim form button.btn:not([type=button])");
  await p.waitForSelector("text=Done: Share a prayer request");
  await p.waitForSelector(`.sandbox-bar >> text=1 of ${total} done`);
  await p.evaluate(() => { location.hash = "training"; }); await p.waitForSelector(".train-row.done >> text=Share a prayer request");
  await p.screenshot({ path: join(shots, "live-15-training-progress.png") });
  await p.context().close();
});
await step("signs out", async () => {
  await page.evaluate(() => window.__signOutForTest?.() || null);
  await page.evaluate(() => { location.hash = "me"; }); await page.waitForTimeout(400);
  const out = await page.$("[data-act=signout], [data-act=sign-out], button:has-text('Sign out')"); if (!out) throw new Error("no sign-out button on Me");
  await out.click(); const yes = await page.$("#scrim [data-act=signout-yes], #scrim button:has-text('Sign out')"); if (yes) await yes.click();
  await page.waitForSelector(".signin-choice");
});
await step("signs back in with email and password", async () => {
  await page.click("[data-act=signin-mode][data-mode=existing]");
  await page.fill("form[data-form=signin-password] input[name=email]", "tester@example.com"); await page.fill("form[data-form=signin-password] input[name=password]", "wrong one");
  await page.click("form[data-form=signin-password] button.btn"); await page.waitForSelector("text=don't match"); await shot("8-signin-password");
  await page.fill("form[data-form=signin-password] input[name=password]", "grace and peace"); await page.click("form[data-form=signin-password] button.btn");
  await page.waitForFunction(() => /Test Fellowship/.test(document.querySelector("#app").textContent) && !document.querySelector("form[data-form^=signin]"), null, { timeout: 15000 });
});
await step("resets a forgotten password", async () => {
  await page.evaluate(() => { location.hash = "me"; }); await page.waitForTimeout(300); await page.click("[data-act=sign-out]");
  const yes = await page.$("#scrim [data-act=signout-yes], #scrim button:has-text('Sign out')"); if (yes) await yes.click();
  await page.waitForSelector(".signin-choice"); await page.click("[data-act=signin-mode][data-mode=existing]");
  await page.fill("form[data-form=signin-password] input[name=email]", "tester@example.com"); await page.click("[data-act=signin-forgot]");
  await page.waitForSelector("text=Reset your password");
  if ((await page.inputValue("form[data-form=signin-email] input[name=email]")) !== "tester@example.com") throw new Error("the email wasn't carried over");
  await page.click("form[data-form=signin-email] button.btn"); await page.waitForSelector("form[data-form=signin-code]");
  await page.fill("input[name=code]", "123456"); await page.click("form[data-form=signin-code] button.btn");
  await page.waitForSelector("text=Choose a new password"); if (await page.$("form[data-form=account-setup] input[name=name]")) throw new Error("asked for a name again");
  await page.fill("input[name=password]", "grace and peace"); await page.fill("input[name=password2]", "grace and peace"); await page.click("form[data-form=account-setup] button.btn");
  await page.waitForSelector("text=That's already your password");
  await page.fill("input[name=password]", "peace be with you"); await page.fill("input[name=password2]", "peace be with you"); await page.click("form[data-form=account-setup] button.btn");
  await page.waitForFunction(() => /Test Fellowship/.test(document.querySelector("#app").textContent) && !document.querySelector("form[data-form=account-setup]"), null, { timeout: 15000 });
  if (accounts["tester@example.com"].password !== "peace be with you") throw new Error("new password not saved");
});

console.log(`\nSupabase calls: ${[...calls].sort().join(", ")}`);
if (errors.length) { console.log(`\nPage errors:\n${[...new Set(errors)].join("\n")}`); failed++; }
await browser.close(); server.close();
console.log(failed ? `\n${failed} problem(s).` : "\nLive mode works end to end against the simulated Supabase.");
process.exit(failed ? 1 : 0);
