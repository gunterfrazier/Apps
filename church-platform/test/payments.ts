// Runs the payment server functions against stand-ins for Supabase, Stripe, PayPal and Square, and checks that gifts,
// recurring gifts, tickets, refunds and webhooks are recorded once each, for every processor.
// Run: deno run -A test/payments.ts   (needs Deno; nothing leaves this computer)
import { hmacBase64, hmacHex } from "../supabase/functions/_shared/util.ts";

const realServe = Deno.serve.bind(Deno);
let failures = 0;
const ok = (name: string, cond: unknown, detail?: unknown) => {
  if (cond) console.log(`ok   ${name}`);
  else { failures++; console.log(`FAIL ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)); }
};

// ---------------------------------------------------------------- Supabase stand-in: auth, a few tables, rpc
type Row = Record<string, any>;
const tables: Record<string, Row[]> = { churches: [], checkouts: [], payments: [], records: [], profiles: [], payment_keys: [] };
const pkeys: Record<string, string[]> = { records: ["kind", "id"], payment_keys: ["church_id", "provider"] };
const vault = new Map<string, string>();
const users: Record<string, { id: string; email: string }> = {};
const perms: Record<string, string[]> = {};   // user id -> permissions at the church
const pathGet = (row: Row, key: string) => {
  const parts = key.split(/->>?/);
  let v: any = row;
  for (const p of parts) v = v?.[p];
  return v;
};
function filtered(rows: Row[], q: URLSearchParams) {
  let out = rows;
  for (const [k, v] of q) {
    if (["select", "on_conflict", "order", "limit"].includes(k)) continue;
    if (v.startsWith("eq.")) out = out.filter((r) => String(pathGet(r, k)) === v.slice(3));
    else if (v === "is.null") out = out.filter((r) => pathGet(r, k) == null);
  }
  return out;
}
const sbJson = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bearer = (req: Request) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
const supabase = realServe({ port: 0, onListen() {} }, async (req) => {
  const u = new URL(req.url), p = u.pathname;
  if (p === "/auth/v1/user") { const who = users[bearer(req)]; return who ? sbJson(200, { ...who, aud: "authenticated", role: "authenticated" }) : sbJson(401, { msg: "bad token" }); }
  if (p.startsWith("/rest/v1/rpc/")) {
    const fn = p.slice(13), a = await req.json();
    if (fn === "can") { const who = users[bearer(req)]; return sbJson(200, !!who && (perms[who.id] || []).includes(a.perm)); }
    if (fn === "payment_key_get") return sbJson(200, vault.get(`${a.c}/${a.p}`) ?? null);
    if (fn === "payment_key_set") { vault.set(`${a.c}/${a.p}`, a.s); if (!tables.payment_keys.some((r) => r.church_id === a.c && r.provider === a.p)) tables.payment_keys.push({ church_id: a.c, provider: a.p }); return sbJson(200, null); }
    return sbJson(404, { message: `no rpc ${fn}` });
  }
  const table = p.replace("/rest/v1/", ""), rows = tables[table];
  if (!rows) return sbJson(404, { message: `no table ${table}` });
  const single = (req.headers.get("accept") || "").includes("vnd.pgrst.object");
  if (req.method === "GET") {
    const hit = filtered(rows, u.searchParams);
    if (single) return hit.length === 1 ? sbJson(200, hit[0]) : sbJson(406, { code: "PGRST116", message: `${hit.length} rows` });
    return sbJson(200, hit);
  }
  if (req.method === "POST") {
    const body = [].concat(await req.json()) as Row[], keys = (u.searchParams.get("on_conflict") || (pkeys[table] || ["id"]).join(",")).split(",");
    const merge = (req.headers.get("prefer") || "").includes("merge-duplicates"), ignore = (req.headers.get("prefer") || "").includes("ignore-duplicates");
    for (const r of body) {
      const dup = rows.find((x) => keys.every((k) => x[k] === r[k]));
      if (dup && merge) Object.assign(dup, r);
      else if (dup && !ignore) return sbJson(409, { code: "23505", message: "duplicate key value violates unique constraint" });
      else if (!dup) rows.push(structuredClone(r));
    }
    return sbJson(201);
  }
  if (req.method === "PATCH") { const body = await req.json(); filtered(rows, u.searchParams).forEach((r) => Object.assign(r, body)); return sbJson(204); }
  if (req.method === "DELETE") {
    const gone = new Set(filtered(rows, u.searchParams));
    tables[table] = rows.filter((r) => !gone.has(r));
    if (table === "payment_keys") gone.forEach((r) => vault.delete(`${r.church_id}/${r.provider}`));
    return sbJson(204);
  }
  return sbJson(405);
});

// ---------------------------------------------------------------- Processor stand-ins
const calls: { host: string; method: string; path: string; body: any }[] = [];
const seen = (host: string, method: string, path: RegExp) => calls.filter((c) => c.host === host && c.method === method && path.test(c.path));
// Stripe's library sends form fields like line_items[0][price_data][currency]=usd.
function parseForm(text: string) {
  const out: any = {};
  for (const [k, v] of new URLSearchParams(text)) {
    const path = k.replace(/\]/g, "").split("[");
    let o = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) o[part] = v;
      else o = o[part] ??= /^\d+$/.test(path[i + 1]) ? [] : {};
    });
  }
  return out;
}
const sj = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const stripe = { sessions: {} as Record<string, any>, n: 0, hooks: {} as Record<string, any>, refunds: [] as any[], cancelled: [] as string[] };
const paypal = { orders: {} as Record<string, any>, subs: {} as Record<string, any>, hooks: {} as Record<string, any>, n: 0 };
const squareState = { links: {} as Record<string, any>, payments: {} as Record<string, any>, hooks: {} as Record<string, any>, n: 0 };

const processors = realServe({ port: 0, onListen() {} }, async (req) => {
  const u = new URL(req.url), text = await req.text();
  const auth = req.headers.get("authorization") || "";
  // Stripe calls come straight in (/v1/...); PayPal and Square calls keep their host as the first part of the path.
  const [host, path] = u.pathname.startsWith("/v1/") ? ["api.stripe.com", u.pathname] : [u.pathname.split("/")[1], "/" + u.pathname.split("/").slice(2).join("/")];
  let body: any = null;
  try { body = (req.headers.get("content-type") || "").includes("json") ? JSON.parse(text || "null") : parseForm(text); } catch { body = text; }
  calls.push({ host, method: req.method, path: path + u.search, body });

  if (host === "api.stripe.com") {
    if (!/^Bearer (sk|rk)_test_good/.test(auth)) return sj(401, { error: { type: "invalid_request_error", message: "Invalid API Key provided" } });
    if (path === "/v1/account") return sj(200, { id: "acct_church", object: "account", charges_enabled: true, settings: { dashboard: { display_name: "Grace and Peace Church" } } });
    if (path === "/v1/webhook_endpoints" && req.method === "POST") { const id = `we_${++stripe.n}`; stripe.hooks[id] = { id, url: body.url, secret: `whsec_${id}` }; return sj(200, stripe.hooks[id]); }
    if (path.startsWith("/v1/webhook_endpoints/") && req.method === "DELETE") { delete stripe.hooks[path.split("/")[3]]; return sj(200, { deleted: true }); }
    if (path === "/v1/checkout/sessions" && req.method === "POST") {
      const id = `cs_${++stripe.n}`;
      stripe.sessions[id] = { id, object: "checkout.session", url: `https://checkout.stripe.com/c/${id}`, status: "open", payment_status: "unpaid", mode: body.mode, client_reference_id: body.client_reference_id, metadata: body.metadata, amount_total: body.line_items.reduce((n: number, l: any) => n + Number(l.price_data.unit_amount) * Number(l.quantity), 0), request: body };
      return sj(200, stripe.sessions[id]);
    }
    if (path.startsWith("/v1/checkout/sessions/")) return sj(200, stripe.sessions[path.split("/")[4]]);
    if (path.startsWith("/v1/invoices/")) return sj(200, { id: path.split("/")[3], object: "invoice", payment_intent: `pi_for_${path.split("/")[3]}` });
    if (path === "/v1/refunds") { stripe.refunds.push(body); return sj(200, { id: "re_1", object: "refund" }); }
    if (path.startsWith("/v1/subscriptions/") && req.method === "DELETE") { stripe.cancelled.push(path.split("/")[3]); return sj(200, { id: path.split("/")[3], object: "subscription", status: "canceled" }); }
  }

  if (host === "api-m.sandbox.paypal.com" || host === "api-m.paypal.com") {
    if (path === "/v1/oauth2/token") return auth === `Basic ${btoa("pp-client:pp-secret")}` && host === "api-m.sandbox.paypal.com" ? sj(200, { access_token: "pp-token" }) : sj(401, { error: "invalid_client" });
    if (auth !== "Bearer pp-token") return sj(401, { name: "AUTHENTICATION_FAILURE" });
    if (path === "/v1/notifications/webhooks" && req.method === "POST") {
      if (Object.values(paypal.hooks).some((h: any) => h.url === body.url)) return sj(400, { name: "WEBHOOK_URL_ALREADY_EXISTS" });
      const id = `WH-${++paypal.n}`; paypal.hooks[id] = { id, url: body.url, event_types: body.event_types }; return sj(201, paypal.hooks[id]);
    }
    if (path === "/v1/notifications/webhooks") return sj(200, { webhooks: Object.values(paypal.hooks) });
    if (path.startsWith("/v1/notifications/webhooks/") && req.method === "DELETE") { delete paypal.hooks[path.split("/")[4]]; return sj(204); }
    if (path === "/v1/notifications/verify-webhook-signature") return sj(200, { verification_status: body.transmission_sig === "good" && paypal.hooks[body.webhook_id] ? "SUCCESS" : "FAILURE" });
    if (path === "/v2/checkout/orders" && req.method === "POST") {
      const id = `ORDER${++paypal.n}`; paypal.orders[id] = { id, status: "PAYER_ACTION_REQUIRED", request: body, links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] };
      return sj(200, paypal.orders[id]);
    }
    const order = path.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
    if (order) {
      const o = paypal.orders[order[1]];
      if (order[2]) {
        if (o.status === "PAYER_ACTION_REQUIRED") return sj(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_NOT_APPROVED", description: "Payer has not yet approved the Order for payment." }] });
        if (o.status === "COMPLETED") return sj(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
        o.status = "COMPLETED";
        o.purchase_units = [{ payments: { captures: [{ id: `CAP${o.id}`, status: "COMPLETED", amount: { value: o.request.purchase_units[0].amount.value } }] } }];
      }
      return sj(200, o);
    }
    if (path === "/v1/catalogs/products") return sj(201, { id: "PROD-1" });
    if (path === "/v1/billing/plans") return sj(201, { id: `P-${++paypal.n}`, request: body });
    if (path === "/v1/billing/subscriptions" && req.method === "POST") {
      const id = `I-SUB${++paypal.n}`; paypal.subs[id] = { id, status: "APPROVAL_PENDING", request: body, transactions: [], links: [{ rel: "approve", href: `https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=${id}` }] };
      return sj(201, paypal.subs[id]);
    }
    const sub = path.match(/^\/v1\/billing\/subscriptions\/([^/?]+)(\/transactions|\/cancel)?/);
    if (sub) {
      const s = paypal.subs[sub[1]];
      if (sub[2] === "/transactions") return sj(200, { transactions: s.transactions });
      if (sub[2] === "/cancel") { s.status = "CANCELLED"; return sj(204); }
      return sj(200, s);
    }
    const cap = path.match(/^\/v2\/payments\/captures\/([^/]+)\/refund$/);
    if (cap) return cap[1].startsWith("CAP") ? sj(201, { id: "REFUND-1", status: "COMPLETED" }) : sj(404, { name: "RESOURCE_NOT_FOUND" });
    if (/^\/v1\/payments\/sale\/[^/]+\/refund$/.test(path)) return sj(201, { id: "REFUND-2", state: "completed" });
  }

  if (host === "connect.squareup.com" || host === "connect.squareupsandbox.com") {
    if (auth !== "Bearer sq-sandbox-token" || host !== "connect.squareupsandbox.com") return sj(401, { errors: [{ category: "AUTHENTICATION_ERROR", code: "UNAUTHORIZED" }] });
    if (path === "/v2/locations") return sj(200, { locations: [{ id: "L-CLOSED", status: "INACTIVE", capabilities: [] }, { id: "L-MAIN", status: "ACTIVE", capabilities: ["CREDIT_CARD_PROCESSING"], currency: "USD", business_name: "Grace and Peace Church" }] });
    if (path === "/v2/webhooks/subscriptions" && req.method === "POST") { const id = `wbhk_${++squareState.n}`; squareState.hooks[id] = { id, ...body.subscription, signature_key: `sig_${id}` }; return sj(200, { subscription: squareState.hooks[id] }); }
    if (path.startsWith("/v2/webhooks/subscriptions/") && req.method === "DELETE") { delete squareState.hooks[path.split("/")[4]]; return sj(200, {}); }
    if (path === "/v2/online-checkout/payment-links") {
      const order_id = `SQORDER${++squareState.n}`;
      squareState.links[order_id] = { order_id, url: `https://square.link/u/${order_id}`, request: body, tenders: [] };
      return sj(200, { payment_link: { id: `PL${squareState.n}`, url: squareState.links[order_id].url, order_id } });
    }
    if (path.startsWith("/v2/orders/")) { const l = squareState.links[path.split("/")[3]]; return sj(200, { order: { id: l.order_id, state: l.tenders.length ? "COMPLETED" : "OPEN", tenders: l.tenders } }); }
    if (path.startsWith("/v2/payments/")) return sj(200, { payment: squareState.payments[path.split("/")[3]] });
    if (path === "/v2/refunds") return sj(200, { refund: { id: "SQREFUND", status: "PENDING", payment_id: body.payment_id } });
  }
  return sj(404, { message: `stand-in has no ${req.method} ${host}${path}` });
});

// ---------------------------------------------------------------- The functions, all served from one place
const sbUrl = `http://localhost:${supabase.addr.port}`;
Deno.env.set("SUPABASE_URL", sbUrl);
Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "sb_secret_test" }));
Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ default: "sb_publishable_test" }));
Deno.env.set("PAYMENTS_API_OVERRIDE", `http://localhost:${processors.addr.port}`);
Deno.env.set("APP_URL", "https://example.org/Apps/");
const handlers: Record<string, (req: Request) => Response | Promise<Response>> = {};
let loading = "";
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (a: any, b: any) => { handlers[loading] = typeof a === "function" ? a : b; return { finished: Promise.resolve(), shutdown() {} }; };
for (const name of ["payments-setup", "checkout", "pay-confirm", "pay-webhook", "refund", "recurring"]) { loading = name; await import(`../supabase/functions/${name}/index.ts`); }

async function fn(name: string, body: unknown, who?: string) {
  const res = await handlers[name](new Request(`${sbUrl}/functions/v1/${name}`, { method: "POST", headers: { "content-type": "application/json", ...(who ? { authorization: `Bearer ${who}` } : {}) }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}
async function hook(church: string, provider: string, body: string, headers: Record<string, string>) {
  const res = await handlers["pay-webhook"](new Request(`${sbUrl}/functions/v1/pay-webhook?church=${church}&provider=${provider}`, { method: "POST", headers, body }));
  return { status: res.status, body: await res.json() };
}
const rec = (kind: string, id: string) => tables.records.find((r) => r.kind === kind && r.id === id);
const gifts = () => tables.records.filter((r) => r.kind === "gifts");
const church = () => tables.churches.find((c) => c.id === "gp")!;
const keysOf = (p: string) => JSON.parse(vault.get(`gp/${p}`) || "null");

// People and a church
users["tok-admin"] = { id: "11111111-0000-4000-8000-000000000001", email: "admin@example.org" };
users["tok-member"] = { id: "11111111-0000-4000-8000-000000000002", email: "member@example.org" };
perms[users["tok-admin"].id] = ["manage.church", "view.giving"];
perms[users["tok-member"].id] = [];
const member = users["tok-member"].id;
tables.profiles.push({ id: member, name: "Mary Member" });
tables.churches.push({ id: "gp", name: "Grace and Peace", data: { funds: [{ id: "general", name: "General fund" }], email: "office@example.org" } });
tables.churches.push({ id: "other", name: "Other Church", data: { funds: [] } });
tables.records.push({ kind: "events", id: "ev1", church_id: "gp", data: { title: "Retreat", tickets: [{ id: "adult", name: "Adult", price: 40 }, { id: "kid", name: "Child", price: 15 }] } });
tables.records.push({ kind: "event_regs", id: "ev1~r1", church_id: "gp", owner: member, data: { tickets: { adult: 2, kid: 1 } } });
const giftBody = (extra = {}) => ({ churchId: "gp", kind: "gift", ref: "general", lines: [{ amount: 50 }], frequency: "once", method: "card", origin: "https://example.org/Apps/", returnTo: "give", ...extra });

// ---------------------------------------------------------------- Stripe, with the church's own key
{
  let r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "stripe", keys: { secret: "sk_test_good" } }, "tok-member");
  ok("stripe: a member can't connect a processor", r.status === 403, r);
  r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "stripe", keys: { secret: "pk_test_123" } }, "tok-admin");
  ok("stripe: a publishable key is turned away with a clear message", r.status === 400 && /secret key/.test(r.body.error), r);
  r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "stripe", keys: { secret: "sk_test_wrong" } }, "tok-admin");
  ok("stripe: a wrong key is turned away", r.status === 400 && /didn't accept/.test(r.body.error), r);
  r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "stripe", keys: { secret: "sk_test_good" } }, "tok-admin");
  ok("stripe: connects with the church's secret key", r.status === 200 && church().data.payments?.provider === "stripe" && church().data.payments.mode === "test" && church().data.payments.account === "Grace and Peace Church", r);
  ok("stripe: sets up its webhook and keeps the keys out of the church's settings", keysOf("stripe")?.webhookSecret === "whsec_we_1" && !JSON.stringify(church().data).includes("sk_test")
    && stripe.hooks.we_1?.url === `${sbUrl}/functions/v1/pay-webhook?church=gp&provider=stripe`, keysOf("stripe"));

  r = await fn("checkout", giftBody(), "tok-member");
  const co1 = tables.checkouts.at(-1)!;
  ok("stripe: a gift opens Stripe Checkout", r.status === 200 && r.body.url.includes("checkout.stripe.com") && co1.provider_ref === "cs_2" && co1.amount === 50, r);
  const sess = stripe.sessions.cs_2.request;
  ok("stripe: the checkout carries its ID and comes back to the app", sess.client_reference_id === co1.id && sess.metadata.checkout === co1.id && sess.submit_type === "donate"
    && sess.success_url === `https://example.org/Apps/?paid=gift&checkout=${co1.id}` && sess.cancel_url === "https://example.org/Apps/?unpaid=gift&to=give", sess);
  r = await fn("pay-confirm", { checkout: co1.id }, "tok-member");
  ok("stripe: coming back without paying records nothing", r.body.status === "unpaid" && gifts().length === 0, r);
  r = await fn("pay-confirm", { checkout: co1.id }, "tok-admin");
  ok("stripe: someone else can't check another person's payment", r.status === 404, r);
  Object.assign(stripe.sessions.cs_2, { status: "complete", payment_status: "paid", payment_intent: "pi_1" });
  r = await fn("pay-confirm", { checkout: co1.id }, "tok-member");
  ok("stripe: the return page records the gift", r.body.status === "paid" && rec("gifts", "pi_1")?.data.amount === 50 && rec("gifts", "pi_1")?.data.name === "Mary Member", r);
  const sign = (payload: string, secret: string) => hmacHex(secret, `100.${payload}`).then((h) => `t=100,v1=${h}`);
  // Stripe's library refuses old timestamps, so sign with the current time.
  const signNow = async (payload: string) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${await hmacHex("whsec_we_1", `${t}.${payload}`)}`; };
  let ev = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { ...stripe.sessions.cs_2, request: undefined } } });
  r = await hook("gp", "stripe", ev, { "stripe-signature": await signNow(ev) });
  ok("stripe: the webhook for the same payment doesn't add it twice", r.status === 200 && gifts().length === 1 && tables.payments.length === 1, r);
  r = await hook("gp", "stripe", ev, { "stripe-signature": await sign(ev, "whsec_wrong") });
  ok("stripe: a webhook with a bad signature is refused", r.status === 400, r);

  r = await fn("checkout", giftBody({ frequency: "monthly", method: "bank" }), "tok-member");
  const co2 = tables.checkouts.at(-1)!, s2 = stripe.sessions[co2.provider_ref];
  ok("stripe: a monthly gift by bank is a subscription", s2.request.mode === "subscription" && s2.request.payment_method_types[0] === "us_bank_account" && s2.request.line_items[0].price_data.recurring.interval === "month", s2.request);
  Object.assign(s2, { status: "complete", payment_status: "unpaid", subscription: "sub_1" });
  r = await fn("pay-confirm", { checkout: co2.id }, "tok-member");
  ok("stripe: a bank payment that hasn't cleared is pending", r.body.status === "pending" && !rec("recurring", "sub_1"), r);
  ev = JSON.stringify({ id: "evt_2", type: "checkout.session.async_payment_succeeded", data: { object: { ...s2, request: undefined, payment_status: "paid", invoice: "in_1" } } });
  r = await hook("gp", "stripe", ev, { "stripe-signature": await signNow(ev) });
  ok("stripe: when it clears, the gift and the recurring gift are recorded", rec("gifts", "in_1")?.data.frequency === "monthly" && rec("recurring", "sub_1")?.data.active === true && rec("recurring", "sub_1")?.data.provider === "stripe", r);
  ev = JSON.stringify({ id: "evt_3", type: "invoice.paid", data: { object: { id: "in_1", subscription: "sub_1", amount_paid: 5000, billing_reason: "subscription_create", subscription_details: { metadata: { checkout: co2.id } } } } });
  await hook("gp", "stripe", ev, { "stripe-signature": await signNow(ev) });
  ev = JSON.stringify({ id: "evt_4", type: "invoice.paid", data: { object: { id: "in_2", subscription: "sub_1", amount_paid: 5000, billing_reason: "subscription_cycle", subscription_details: { metadata: { checkout: co2.id } } } } });
  await hook("gp", "stripe", ev, { "stripe-signature": await signNow(ev) });
  ok("stripe: next month's payment is a new gift; the first isn't counted twice", gifts().length === 3 && !!rec("gifts", "in_2") && rec("recurring", "sub_1")!.data.at !== undefined, gifts().map((g) => g.id));

  r = await fn("refund", { ref: "pi_1" }, "tok-member");
  ok("stripe: a member can't refund a gift", r.status === 403, r);
  r = await fn("refund", { ref: "pi_1" }, "tok-admin");
  ok("stripe: giving staff refund a gift", r.status === 200 && stripe.refunds[0]?.payment_intent === "pi_1" && rec("gifts", "pi_1")?.data.status === "refunded", r);
  ev = JSON.stringify({ id: "evt_5", type: "charge.refunded", data: { object: { payment_intent: "pi_for_in_2", invoice: "in_2" } } });
  await hook("gp", "stripe", ev, { "stripe-signature": await signNow(ev) });
  ok("stripe: a refund made in Stripe shows up in the app", rec("gifts", "in_2")?.data.status === "refunded");
  r = await fn("recurring", { action: "cancel", subscriptionId: "sub_1", churchId: "gp" }, "tok-member");
  ok("stripe: the giver stops their recurring gift", r.status === 200 && stripe.cancelled.includes("sub_1") && rec("recurring", "sub_1")?.data.active === false, r);
}

// ---------------------------------------------------------------- PayPal
{
  let r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "paypal", keys: { clientId: "pp-client", secret: "nope" } }, "tok-admin");
  ok("paypal: wrong credentials are turned away", r.status === 400 && /didn't accept/.test(r.body.error), r);
  r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "paypal", keys: { clientId: "pp-client", secret: "pp-secret" } }, "tok-admin");
  ok("paypal: connects with sandbox credentials and becomes the church's processor", r.status === 200 && church().data.payments?.provider === "paypal" && church().data.payments.mode === "test" && keysOf("paypal")?.webhookId === "WH-1", r);
  ok("paypal: switching keeps Stripe's keys for the recurring gifts already there", !!keysOf("stripe"));
  r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "paypal", keys: { clientId: "pp-client", secret: "pp-secret" } }, "tok-admin");
  ok("paypal: connecting again reuses the webhook", r.status === 200 && keysOf("paypal")?.webhookId === "WH-1" && Object.keys(paypal.hooks).length === 1, r);

  r = await fn("checkout", giftBody({ lines: [{ amount: 25.5 }], method: "paypal" }), "tok-member");
  const co = tables.checkouts.at(-1)!, order = paypal.orders[co.provider_ref];
  ok("paypal: a gift opens PayPal", r.status === 200 && r.body.url.includes("paypal.com") && order.request.purchase_units[0].amount.value === "25.50" && order.request.purchase_units[0].custom_id === co.id
    && order.request.payment_source.paypal.experience_context.return_url === `https://example.org/Apps/?paid=gift&checkout=${co.id}`, order?.request);
  r = await fn("pay-confirm", { checkout: co.id }, "tok-member");
  ok("paypal: not approved yet, nothing recorded", r.body.status === "unpaid" && !rec("gifts", `paypal_CAP${order.id}`), r);
  order.status = "APPROVED";
  r = await fn("pay-confirm", { checkout: co.id }, "tok-member");
  ok("paypal: the return page captures the payment and records the gift", r.body.status === "paid" && rec("gifts", `paypal_CAP${order.id}`)?.data.amount === 25.5 && rec("gifts", `paypal_CAP${order.id}`)?.data.provider === "paypal", r);
  r = await fn("pay-confirm", { checkout: co.id }, "tok-member");
  ok("paypal: checking again is harmless", r.body.status === "paid" && gifts().filter((g) => g.id.startsWith("paypal_")).length === 1, r);
  const ppHook = (body: unknown, sig = "good") => hook("gp", "paypal", JSON.stringify(body), { "paypal-transmission-sig": sig, "paypal-transmission-id": "t1", "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/cert", "paypal-transmission-time": new Date().toISOString() });
  r = await ppHook({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: `CAP${order.id}`, custom_id: co.id, amount: { value: "25.50" } } });
  ok("paypal: the webhook for the same payment doesn't add it twice", r.status === 200 && gifts().filter((g) => g.id.startsWith("paypal_")).length === 1, r);
  r = await ppHook({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAPFAKE", custom_id: co.id, amount: { value: "999" } } }, "forged");
  ok("paypal: a forged webhook is refused", r.status === 400 && !rec("gifts", "paypal_CAPFAKE"), r);

  r = await fn("checkout", giftBody({ frequency: "weekly", method: "paypal" }), "tok-member");
  const cw = tables.checkouts.at(-1)!, sub = paypal.subs[cw.provider_ref];
  ok("paypal: a weekly gift is a PayPal subscription", r.status === 200 && sub && sub.request.custom_id === cw.id && keysOf("paypal").productId === "PROD-1"
    && seen("api-m.sandbox.paypal.com", "POST", /^\/v1\/billing\/plans/).at(-1)?.body.billing_cycles[0].frequency.interval_unit === "WEEK", r);
  Object.assign(sub, { status: "ACTIVE", transactions: [{ id: "SALE1", status: "COMPLETED", amount_with_breakdown: { gross_amount: { value: "50.00" } } }] });
  r = await fn("pay-confirm", { checkout: cw.id }, "tok-member");
  ok("paypal: the first weekly payment and the recurring gift are recorded", r.body.status === "paid" && !!rec("gifts", "paypal_SALE1") && rec("recurring", sub.id)?.data.frequency === "weekly", r);
  r = await ppHook({ event_type: "PAYMENT.SALE.COMPLETED", resource: { id: "SALE2", billing_agreement_id: sub.id, custom: cw.id, amount: { total: "50.00" } } });
  ok("paypal: next week's payment comes in by webhook", r.status === 200 && !!rec("gifts", "paypal_SALE2"), r);
  r = await fn("refund", { ref: "paypal_SALE1" }, "tok-admin");
  ok("paypal: a recurring payment is refunded as a sale", r.status === 200 && seen("api-m.sandbox.paypal.com", "POST", /\/v1\/payments\/sale\/SALE1\/refund/).length === 1 && rec("gifts", "paypal_SALE1")?.data.status === "refunded", r);
  r = await fn("refund", { ref: `paypal_CAP${order.id}` }, "tok-admin");
  ok("paypal: a one-time gift is refunded as a capture", r.status === 200 && rec("gifts", `paypal_CAP${order.id}`)?.data.status === "refunded", r);
  r = await fn("recurring", { action: "cancel", subscriptionId: sub.id, churchId: "gp" }, "tok-member");
  ok("paypal: the giver stops the weekly gift", r.status === 200 && sub.status === "CANCELLED" && rec("recurring", sub.id)?.data.active === false, r);
  const before = gifts().length;
  vault.set("other/paypal", vault.get("gp/paypal")!);   // even with keys that check out, another church's webhook can't record this church's checkout
  r = await hook("other", "paypal", JSON.stringify({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAPX", custom_id: co.id, amount: { value: "1" } } }), { "paypal-transmission-sig": "good" });
  ok("paypal: a webhook for another church can't touch this church's payments", gifts().length === before && !rec("gifts", "paypal_CAPX"), r);
}

// ---------------------------------------------------------------- Square
{
  let r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "square", keys: { token: "sq-wrong" } }, "tok-admin");
  ok("square: a wrong token is turned away", r.status === 400 && /didn't accept/.test(r.body.error), r);
  r = await fn("payments-setup", { action: "connect", churchId: "gp", provider: "square", keys: { token: "sq-sandbox-token" } }, "tok-admin");
  const k = keysOf("square");
  ok("square: connects, picks the location that takes cards and sets up its webhook", r.status === 200 && church().data.payments?.provider === "square" && church().data.payments.recurring === false
    && church().data.payments.account === "Grace and Peace Church" && k?.locationId === "L-MAIN" && k?.signatureKey === "sig_wbhk_1", r);
  r = await fn("checkout", giftBody({ frequency: "monthly" }), "tok-member");
  ok("square: recurring gifts are turned away clearly", r.status === 400 && /Recurring gifts aren't available with Square/.test(r.body.error), r);
  r = await fn("checkout", { churchId: "gp", kind: "event", ref: "ev1~r1", origin: "https://example.org/Apps/", returnTo: "event-ev1" }, "tok-member");
  const co = tables.checkouts.at(-1)!, link = squareState.links[co.provider_ref];
  ok("square: tickets open a Square payment link priced from the database", r.status === 200 && r.body.url.includes("square.link") && co.amount === 95
    && link.request.order.line_items.length === 2 && link.request.order.line_items[0].base_price_money.amount === 4000 && link.request.order.line_items[0].quantity === "2"
    && link.request.order.reference_id === co.id && link.request.checkout_options.redirect_url === `https://example.org/Apps/?paid=event&checkout=${co.id}`, link?.request);
  r = await fn("pay-confirm", { checkout: co.id }, "tok-member");
  ok("square: not paid yet, nothing recorded", r.body.status === "unpaid", r);
  link.tenders = [{ payment_id: "SQPAY1" }];
  squareState.payments.SQPAY1 = { id: "SQPAY1", status: "COMPLETED", order_id: link.order_id, amount_money: { amount: 9500, currency: "USD" } };
  r = await fn("pay-confirm", { checkout: co.id }, "tok-member");
  ok("square: the return page marks the tickets paid", r.body.status === "paid" && rec("event_regs", "ev1~r1")?.data.paid?.status === "paid" && rec("event_regs", "ev1~r1")?.data.paid?.ref === "square_SQPAY1", r);
  const body = JSON.stringify({ type: "payment.updated", data: { object: { payment: squareState.payments.SQPAY1 } } });
  r = await hook("gp", "square", body, { "x-square-hmacsha256-signature": await hmacBase64(k.signatureKey, k.webhookUrl + body) });
  ok("square: the signed webhook for the same payment changes nothing", r.status === 200 && tables.payments.filter((p) => p.id === "square_SQPAY1").length === 1, r);
  r = await hook("gp", "square", body, { "x-square-hmacsha256-signature": "forged" });
  ok("square: a forged webhook is refused", r.status === 400, r);
  r = await fn("refund", { ref: "square_SQPAY1" }, "tok-member");
  ok("square: the person who bought tickets can refund them", r.status === 200 && seen("connect.squareupsandbox.com", "POST", /^\/v2\/refunds/).at(-1)?.body.amount_money.amount === 9500
    && rec("event_regs", "ev1~r1")?.data.paid?.status === "refunded", r);

  r = await fn("payments-setup", { action: "disconnect", churchId: "gp", provider: "square" }, "tok-admin");
  ok("square: disconnecting removes its webhook, its keys and the church's processor", r.status === 200 && !keysOf("square") && !church().data.payments && Object.keys(squareState.hooks).length === 0, r);
  r = await fn("checkout", giftBody(), "tok-member");
  ok("after disconnecting, checkout says payments aren't set up", r.status === 400 && /isn't set up/.test(r.body.error), r);
}

console.log(failures ? `\n${failures} payment check(s) failed.` : "\nPayments work with Stripe, PayPal and Square against the stand-ins.");
await supabase.shutdown(); await processors.shutdown();
Deno.exit(failures ? 1 : 0);
