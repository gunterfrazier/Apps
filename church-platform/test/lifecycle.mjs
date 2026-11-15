// Runs the church-lifecycle server function against stand-ins for Supabase, the email sender and the payment
// processors, and checks who may call it, that each email goes out once, that recurring gifts are stopped and that a
// deleted church's files are cleared. Run: node test/lifecycle.mjs   (nothing leaves this computer)
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
const require = createRequire(import.meta.url);
const esbuild = require(join(process.env.PLAYWRIGHT_DIR || "/opt/npm-tools/node_modules", "esbuild"));
const here = dirname(fileURLToPath(import.meta.url)), fn = join(here, "..", "supabase", "functions", "church-lifecycle", "index.ts");

// ----- Stand-ins -----
const db = {}, people = {}, files = new Set(), sent = [], cancelled = [];
let emailWorks = true, members = new Set();
const at = (row, col) => col.split(/->>?/).reduce((v, k) => (v == null ? v : v[k]), row);
class Query {
  constructor(t) { this.t = t; this.tests = []; this.op = "select"; }
  select() { return this; } not() { return this; }
  insert(row) { this.op = "insert"; this.row = row; return this; }
  update(patch) { this.op = "update"; this.patch = patch; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.tests.push((r) => at(r, c) === v); return this; }
  gte(c, v) { this.tests.push((r) => at(r, c) >= v); return this; }
  in(c, list) { this.tests.push((r) => list.includes(at(r, c))); return this; }
  maybeSingle() { this.one = true; return this; }
  then(ok, no) { return Promise.resolve(this.run()).then(ok, no); }
  run() {
    const rows = (db[this.t] ||= []);
    if (this.op === "insert") {
      if (this.t === "lifecycle_emails" && rows.some((r) => r.church_id === this.row.church_id && r.key === this.row.key)) return { data: null, error: { code: "23505", message: "duplicate" } };
      rows.push({ ...this.row }); return { data: null, error: null };
    }
    const hit = rows.filter((r) => this.tests.every((f) => f(r)));
    if (this.op === "update") hit.forEach((r) => Object.assign(r, this.patch));
    if (this.op === "delete") db[this.t] = rows.filter((r) => !hit.includes(r));
    return { data: this.one ? hit[0] || null : hit, error: null };
  }
}
const client = (token) => ({
  from: (t) => new Query(t),
  rpc: async (name, args) => ({ data: name === "is_member" ? members.has(`${args.c}|${token}`) : null }),
  auth: { getUser: async (t) => ({ data: { user: people[t] ? { id: t, email: people[t] } : null } }), admin: { getUserById: async (id) => ({ data: { user: people[id] ? { id, email: people[id] } : null } }) } },
  storage: { from: () => ({
    list: async (dir) => { const out = new Map(); for (const f of files) if (f.startsWith(`${dir}/`)) { const [name, ...rest] = f.slice(dir.length + 1).split("/"); out.set(name, { name, id: rest.length ? null : "file" }); } return { data: [...out.values()], error: null }; },
    remove: async (paths) => { paths.forEach((p) => files.delete(p)); return { data: [], error: null }; } }) },
});
globalThis.__fake = { createClient: (url, key, opts) => client((opts?.global?.headers?.Authorization || "").replace(/^Bearer\s+/, "")), cancelled };
const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service", SUPABASE_ANON_KEY: "anon", APP_URL: "https://ourfaithfulchurch.com" };
let serve;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { serve = h; } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("api.resend.com")) { if (!emailWorks) return new Response("no", { status: 500 }); sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
  return realFetch(url, init);
};

// ----- Build the function with those stand-ins in place of its npm packages -----
const dir = mkdtempSync(join(tmpdir(), "lifecycle-"));
writeFileSync(join(dir, "supabase.mjs"), "export const createClient = (...a) => globalThis.__fake.createClient(...a);");
writeFileSync(join(dir, "payments.mjs"), `export const keysFor = async (db, church, d) => (d.provider === "gone" ? null : { key: "k" });
export const PROCESSORS = { stripe: { cancel: async (keys, id) => { if (id === "sub-stuck") throw new Error("stuck"); globalThis.__fake.cancelled.push(id); } } };`);
await esbuild.build({ entryPoints: [fn], bundle: true, format: "esm", platform: "node", outfile: join(dir, "fn.mjs"), logLevel: "silent", plugins: [{ name: "stand-ins", setup(b) {
  b.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: join(dir, "supabase.mjs") }));
  b.onResolve({ filter: /payments\.ts$/ }, () => ({ path: join(dir, "payments.mjs") }));
  b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, external: true }));
} }] });
await import(pathToFileURL(join(dir, "fn.mjs")));

// ----- Checks -----
let failures = 0;
const ok = (name, cond, detail) => { if (cond) console.log(`ok   ${name}`); else { failures++; console.log(`FAIL ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 300)); } };
const call = async (headers = {}, body = {}) => { const r = await serve(new Request("https://x/functions/v1/church-lifecycle", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
const pass = () => { const token = crypto.randomUUID(); (db.cron_calls ||= []).push({ token, at: new Date().toISOString() }); return { "x-cron-token": token }; };
const days = (n) => new Date(Date.now() + n * 86400e3).toISOString();
const quiet = console.error; console.error = () => {}; const log = console.log;

people.owner = "primary@example.org"; people.admin = "admin@example.org"; people.stranger = "stranger@example.org";
members.add("grace|admin");
db.churches = [{ id: "grace", name: "Grace Church", owner_id: "owner", data: { deactivation: { status: "requested", requestedBy: "admin", requestedByName: "Pat Admin", requestedAt: days(0), reason: "We merged" } } },
  { id: "other", name: "Other Church", owner_id: "stranger", data: {} }];
const grace = db.churches[0];

// Who may call it
ok("no sign-in and no pass is refused", (await call()).status === 401);
ok("a made-up pass is refused", (await call({ "x-cron-token": crypto.randomUUID() })).status === 401);
(db.cron_calls ||= []).push({ token: "11111111-1111-4111-8111-111111111111", at: days(-1) });
ok("an old pass is refused", (await call({ "x-cron-token": "11111111-1111-4111-8111-111111111111" })).status === 401);
ok("someone from another church is refused", (await call({ Authorization: "Bearer stranger" }, { churchId: "grace" })).status === 403);

// No email sender set up: nothing is sent, and nothing is marked as sent
let r = await call({ Authorization: "Bearer admin" }, { churchId: "grace" });
ok("with no email sender it says so and sends nothing", r.status === 200 && r.body.email === "off" && r.body.emailReady === false && !sent.length && !(db.lifecycle_emails || []).length, r);

// A request: the primary account holder is emailed, once
env.RESEND_API_KEY = "re_test"; env.EMAIL_FROM = "Our Faithful Church App <hello@example.org>";
r = await call({ Authorization: "Bearer admin" }, { churchId: "grace" });
ok("the admin's request emails the primary account holder", r.body.email === "sent" && sent.length === 1 && sent[0].to[0] === "primary@example.org" && /Pat Admin asked to deactivate Grace Church/.test(sent[0].subject) && /We merged/.test(sent[0].text) && sent[0].text.includes("https://ourfaithfulchurch.com/#admin-deactivate"), sent[0]);
const headers = pass(); r = await call(headers);
ok("the hourly schedule doesn't send it twice", r.status === 200 && sent.length === 1 && r.body.churches.grace.email === "already", r);
ok("a pass works once", (await call(headers)).status === 401);

// Deactivated: recurring gifts stop, a confirmation goes out, and no reminder yet
db.records = [{ kind: "recurring", id: "sub-1", church_id: "grace", data: { active: true, provider: "stripe" } }, { kind: "recurring", id: "sub-practice", church_id: "grace", data: { active: true, test: true } },
  { kind: "recurring", id: "sub-stuck", church_id: "grace", data: { active: true, provider: "stripe" } }, { kind: "recurring", id: "sub-old", church_id: "grace", data: { active: false } },
  { kind: "recurring", id: "sub-elsewhere", church_id: "other", data: { active: true, provider: "stripe" } }];
grace.data.deactivation = { status: "deactivated", by: "owner", at: days(0), purgeAt: days(365) };
emailWorks = false; r = await call({ Authorization: "Bearer owner" }, { churchId: "grace" });
ok("a send that fails is reported and not marked as sent", r.body.email === "failed" && sent.length === 1 && !db.lifecycle_emails.some((x) => x.key.startsWith("done-")), r);
emailWorks = true; r = await call(pass());
const gifts = Object.fromEntries(db.records.map((x) => [x.id, x.data.active]));
ok("recurring gifts are stopped with the processor, once", cancelled.join() === "sub-1" && gifts["sub-1"] === false && gifts["sub-practice"] === false && gifts["sub-stuck"] === true && gifts["sub-elsewhere"] === true, { cancelled, gifts });
ok("the confirmation gives the deletion date, the way back, and the gift that couldn't be stopped", sent.length === 2 && /Grace Church is deactivated/.test(sent[1].subject) && sent[1].text.includes("#reactivate-grace") && /1 recurring gift could not be stopped/.test(sent[1].text) && /permanently deleted/.test(sent[1].text), sent[1]);
ok("no reminder with a year to go", !r.body.churches.grace.reminder && sent.length === 2, r);

// Reminders at the set marks, one each
grace.data.deactivation.purgeAt = days(29); await call(pass()); await call(pass());
ok("with 29 days left, one reminder", sent.length === 3 && /will be permanently deleted in 29 days/.test(sent[2].subject) && sent[2].html.includes("Reactivate the account"), sent.slice(2).map((m) => m.subject));
grace.data.deactivation.purgeAt = days(25); await call(pass());
ok("no second reminder before the next mark", sent.length === 3);
grace.data.deactivation.purgeAt = days(0.9); await call(pass());
ok("the last reminder says tomorrow", sent.length === 4 && /in 1 day$/.test(sent[3].subject) && /tomorrow/.test(sent[3].text), sent[3]?.subject);

// Reactivated
grace.data.deactivation = { status: "active", reactivatedAt: days(0) }; await call({ Authorization: "Bearer owner" }, { churchId: "grace" }); await call(pass());
ok("reactivating sends one note that it's active again", sent.length === 5 && /Grace Church is active again/.test(sent[4].subject), sent.slice(4).map((m) => m.subject));

// The end of the year: the database has removed the church; its files go and the primary is told
db.churches = db.churches.filter((c) => c.id !== "grace");
db.purged_churches = [{ id: "grace", name: "Grace Church", owner_id: "owner", deactivated_at: days(-366), emailed: false, files_removed: false }];
["grace/logo.png", "grace/sermons/a.jpg", "grace/sermons/2026/b.jpg", "other/logo.png"].forEach((f) => files.add(f));
r = await call(pass());
ok("a deleted church's files are cleared, and nobody else's", [...files].join() === "other/logo.png", [...files]);
ok("the primary is told the data is gone", sent.length === 6 && /Grace Church has been permanently deleted/.test(sent[5].subject) && sent[5].to[0] === "primary@example.org", sent[5]?.subject);
ok("nothing about the church is left behind", r.body.finished === 1 && !db.purged_churches.length && !db.lifecycle_emails.some((x) => x.church_id === "grace"), { left: db.purged_churches, log: db.lifecycle_emails });
delete env.RESEND_API_KEY;
db.purged_churches = [{ id: "quiet", name: "Quiet Church", owner_id: "owner", deactivated_at: days(-366), emailed: false, files_removed: false }];
r = await call(pass());
ok("with no email sender the clean-up still finishes", r.body.finished === 1 && !db.purged_churches.length && sent.length === 6, r);

console.error = quiet;
log(failures ? `\n${failures} problem${failures === 1 ? "" : "s"}` : "\nChurch lifecycle function: all checks passed");
process.exit(failures ? 1 : 0);
