// Payment processors. Each church picks one under Admin, Giving: Stripe, PayPal or Square, connected with the church's
// own keys (or, for Stripe, through the platform's Stripe Connect). Every processor answers the same few calls, so
// checkout, the return from the processor, webhooks, refunds and recurring gifts work the same way for all three.
// Keys are kept encrypted in Supabase Vault (payment_key_set / payment_key_get in schema.sql); only these functions read them.
import Stripe from "npm:stripe@16.12.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { env, hmacBase64 } from "./util.ts";

// deno-lint-ignore no-explicit-any
export type Keys = Record<string, any>;
export type Line = { name: string; amount: number; qty: number };
export type Order = {
  id: string; church: { id: string; name: string }; kind: string; title: string; email?: string;
  lines: Line[]; total: number; frequency: "once" | "weekly" | "monthly"; method: string;
  meta: Record<string, string>; successUrl: string; cancelUrl: string; feePercent?: number;
};
/** What a return or a webhook reports. checkout or providerRef finds the checkout row; subscription finds a recurring gift.
 *  payRef is unique across processors and becomes the payment's and the gift's ID. */
export type PayEvent =
  | { type: "paid"; payRef: string; amount: number; checkout?: string; providerRef?: string; subscription?: string }
  | { type: "refunded"; payRef: string }
  | { type: "ended"; subscription: string };
export type Status = { mode: "test" | "live"; account: string; methods: string[]; recurring: boolean };
export type Confirmed = { status: "paid" | "pending" | "unpaid"; events: PayEvent[] };

export interface Processor {
  name: string;
  /** Checks the keys, sets up the processor's payment notices (webhook) and returns what to store. */
  connect(input: Keys, ctx: { webhookUrl: string; previous?: Keys | null }): Promise<{ keys: Keys; status: Status }>;
  disconnect(keys: Keys): Promise<void>;
  checkout(keys: Keys, o: Order): Promise<{ url: string; ref: string; keys?: Keys }>;
  /** After the person comes back from the processor's page: did the payment go through? */
  confirm(keys: Keys, ref: string): Promise<Confirmed>;
  /** null when the signature doesn't check out. */
  webhook(keys: Keys, req: Request, body: string): Promise<PayEvent[] | null>;
  refund(keys: Keys, payRef: string, amount: number): Promise<void>;
  cancel(keys: Keys, subscription: string): Promise<void>;
}

/** A problem to show to the person, in plain words. */
export class PayError extends Error {}

// Tests only: send every processor call to a local stand-in (see test/payments.ts).
const override = () => env("PAYMENTS_API_OVERRIDE");
const at = (url: string) => (override() ? url.replace(/^https:\/\/([^/]+)/, `${override()}/$1`) : url);
const cents = (n: number) => Math.round(n * 100);
const usd = (c: number) => ({ currency_code: "USD", value: (c / 100).toFixed(2) });
// deno-lint-ignore no-explicit-any
const idOf = (v: any): string | undefined => (typeof v === "string" ? v : v?.id) || undefined;

// deno-lint-ignore no-explicit-any
async function call(url: string, init: { method?: string; json?: unknown; body?: string; headers?: Record<string, string> } = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const headers: Record<string, string> = { accept: "application/json", ...init.headers };
  let body = init.body;
  if (init.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(init.json); }
  const res = await fetch(at(url), { method: init.method || "GET", headers, body });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------- Stripe
export function stripeApi(key: string) {
  const o = override(), u = o ? new URL(o) : null;
  return new Stripe(key, {
    apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient(),
    ...(u ? { host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(":", "") as "http" | "https" } : {}),
  });
}
export const cryptoProvider = Stripe.createSubtleCryptoProvider();
const STRIPE_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "invoice.paid", "customer.subscription.deleted", "charge.refunded"];
/** The church's own Stripe account, or its connected account through the platform's Stripe Connect. */
const stripeFor = (keys: Keys) => keys.connect
  ? { s: stripeApi(env("STRIPE_SECRET_KEY")), opt: { stripeAccount: String(keys.connect) } }
  : { s: stripeApi(String(keys.secret)), opt: undefined };
// deno-lint-ignore no-explicit-any
const stripeAuthFailed = (e: any) => e?.type === "StripeAuthenticationError" || e?.statusCode === 401;

/** Turns a Stripe event into payment events. Shared by the church's own webhook and the platform's Connect webhook. */
// deno-lint-ignore no-explicit-any
export function stripeEvents(ev: any): PayEvent[] {
  const o = ev.data.object;
  switch (ev.type) {
    case "checkout.session.completed":
      if (o.payment_status !== "paid") return [];   // bank payments finish later, on async_payment_succeeded
      // falls through
    case "checkout.session.async_payment_succeeded":
      // A recurring gift's payments are known by their invoice, so the first one isn't counted twice with invoice.paid.
      return [{ type: "paid", checkout: o.client_reference_id || o.metadata?.checkout, payRef: o.mode === "subscription" ? idOf(o.invoice)! : idOf(o.payment_intent)!,
        amount: (o.amount_total || 0) / 100, subscription: idOf(o.subscription) }].filter((e) => e.payRef) as PayEvent[];
    case "invoice.paid":
      if (!o.subscription) return [];
      return [{ type: "paid", checkout: o.subscription_details?.metadata?.checkout, subscription: idOf(o.subscription), payRef: o.id, amount: (o.amount_paid || 0) / 100 }];
    case "customer.subscription.deleted": return [{ type: "ended", subscription: o.id }];
    case "charge.refunded": return [idOf(o.payment_intent), idOf(o.invoice)].filter(Boolean).map((payRef) => ({ type: "refunded", payRef: payRef! }));
  }
  return [];
}

export const stripeProcessor: Processor = {
  name: "Stripe",
  async connect(input, { webhookUrl, previous }) {
    const secret = String(input.secret || "").trim();
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(secret)) throw new PayError("That doesn't look like a Stripe secret key. It starts with sk_live_ (or sk_test_ for testing).");
    const s = stripeApi(secret), live = secret.includes("_live_");
    // deno-lint-ignore no-explicit-any
    let acct: any = null;
    try { acct = await s.accounts.retrieve(); }
    catch (e) { if (stripeAuthFailed(e)) throw new PayError("Stripe didn't accept that key. Copy it again from Stripe: Developers, API keys."); }   // a restricted key may not read the account; that's fine
    if (acct && live && acct.charges_enabled === false) throw new PayError("Stripe hasn't turned on payments for this account yet. Finish activating it in Stripe, then connect again.");
    if (previous?.webhookId && previous.secret) await stripeApi(previous.secret).webhookEndpoints.del(previous.webhookId).catch(() => {});
    let hook;
    try {
      // deno-lint-ignore no-explicit-any
      hook = await s.webhookEndpoints.create({ url: webhookUrl, enabled_events: STRIPE_EVENTS as any, api_version: "2024-06-20" as any, description: "Our Faithful Church App: records gifts and payments" });
    } catch (e) {
      if (stripeAuthFailed(e)) throw new PayError("Stripe didn't accept that key. Copy it again from Stripe: Developers, API keys.");
      throw new PayError("This key can't set up payment notices. Use the account's secret key, or give the restricted key write access to Webhook Endpoints.");
    }
    const account = acct?.settings?.dashboard?.display_name || acct?.business_profile?.name || acct?.email || "Stripe account";
    return { keys: { secret, account: acct?.id || "", webhookId: hook.id, webhookSecret: hook.secret }, status: { mode: live ? "live" : "test", account, methods: ["card", "bank"], recurring: true } };
  },
  async disconnect(keys) { if (keys.webhookId && keys.secret) await stripeApi(keys.secret).webhookEndpoints.del(keys.webhookId).catch(() => {}); },
  async checkout(keys, o) {
    const { s, opt } = stripeFor(keys), recurring = o.frequency !== "once";
    const fee = keys.connect && o.feePercent ? o.feePercent : 0;   // a platform fee only applies through Stripe Connect
    const session = await s.checkout.sessions.create({
      mode: recurring ? "subscription" : "payment",
      payment_method_types: o.method === "bank" ? ["us_bank_account"] : ["card"],   // card includes Apple Pay and Google Pay
      customer_email: o.email || undefined,
      client_reference_id: o.id,
      line_items: o.lines.map((l) => ({ quantity: l.qty, price_data: { currency: "usd", unit_amount: cents(l.amount), product_data: { name: l.name.slice(0, 250) },
        ...(recurring ? { recurring: { interval: o.frequency === "weekly" ? "week" as const : "month" as const } } : {}) } })),
      metadata: o.meta,
      ...(recurring
        ? { subscription_data: { metadata: o.meta, ...(fee ? { application_fee_percent: fee } : {}) } }
        : { payment_intent_data: { metadata: o.meta, ...(fee ? { application_fee_amount: Math.round(o.total * fee) } : {}) }, submit_type: o.kind === "gift" ? "donate" as const : "pay" as const }),
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
    }, opt);
    return { url: session.url!, ref: session.id };
  },
  async confirm(keys, ref) {
    const { s, opt } = stripeFor(keys);
    const x = await s.checkout.sessions.retrieve(ref, undefined, opt);
    if (x.status !== "complete") return { status: "unpaid", events: [] };
    if (x.payment_status !== "paid") return { status: "pending", events: [] };   // bank payments clear in a few days
    return { status: "paid", events: stripeEvents({ type: "checkout.session.completed", data: { object: x } }) };
  },
  async webhook(keys, req, body) {
    try {
      const ev = await stripeApi(String(keys.secret)).webhooks.constructEventAsync(body, req.headers.get("stripe-signature") ?? "", String(keys.webhookSecret), undefined, cryptoProvider);
      return stripeEvents(ev);
    } catch { return null; }
  },
  async refund(keys, payRef) {
    const { s, opt } = stripeFor(keys);
    const pi = payRef.startsWith("in_") ? idOf((await s.invoices.retrieve(payRef, undefined, opt)).payment_intent) : payRef;
    if (!pi) throw new PayError("Stripe has no payment to refund for this gift yet.");
    await s.refunds.create({ payment_intent: pi }, opt);
  },
  async cancel(keys, subscription) {
    const { s, opt } = stripeFor(keys);
    await s.subscriptions.cancel(subscription, undefined, opt);
  },
};

// ---------------------------------------------------------------- PayPal
const PAYPAL = { live: "https://api-m.paypal.com", test: "https://api-m.sandbox.paypal.com" } as const;
const PAYPAL_EVENTS = ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.SALE.COMPLETED", "PAYMENT.SALE.REFUNDED",
  "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED", "BILLING.SUBSCRIPTION.SUSPENDED"];
const paypalTokens = new Map<string, string>();
async function paypalToken(clientId: string, secret: string, mode: "live" | "test") {
  const k = `${mode}:${clientId}:${secret}`;
  if (paypalTokens.has(k)) return paypalTokens.get(k)!;
  const r = await call(`${PAYPAL[mode]}/v1/oauth2/token`, { method: "POST", body: "grant_type=client_credentials",
    headers: { authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "content-type": "application/x-www-form-urlencoded" } });
  if (!r.ok || !r.data?.access_token) return null;
  paypalTokens.set(k, r.data.access_token);
  return r.data.access_token as string;
}
async function paypal(keys: Keys, path: string, init: { method?: string; json?: unknown; requestId?: string } = {}) {
  const mode = keys.mode === "live" ? "live" : "test";
  const token = await paypalToken(keys.clientId, keys.secret, mode);
  if (!token) throw new PayError("PayPal no longer accepts this church's Client ID and Secret. Connect PayPal again under Admin, Giving.");
  return call(`${PAYPAL[mode]}${path}`, { method: init.method, json: init.json,
    headers: { authorization: `Bearer ${token}`, ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}) } });
}
// deno-lint-ignore no-explicit-any
const paypalSays = (r: { status: number; data: any }) => r.data?.details?.[0]?.description || r.data?.message || r.data?.error_description || `error ${r.status}`;
// deno-lint-ignore no-explicit-any
const approveLink = (d: any) => (d?.links || []).find((l: { rel: string }) => l.rel === "payer-action" || l.rel === "approve")?.href as string | undefined;

export const paypalProcessor: Processor = {
  name: "PayPal",
  async connect(input, { webhookUrl, previous }) {
    const clientId = String(input.clientId || "").trim(), secret = String(input.secret || "").trim();
    if (!clientId || !secret) throw new PayError("Enter both the Client ID and the Secret from your PayPal app.");
    let mode: "live" | "test" = "live";
    if (!(await paypalToken(clientId, secret, "live"))) {
      mode = "test";
      if (!(await paypalToken(clientId, secret, "test"))) throw new PayError("PayPal didn't accept that Client ID and Secret. Copy them again from your app under Apps and Credentials.");
    }
    const keys: Keys = { clientId, secret, mode };
    if (previous?.webhookId && (previous.clientId !== clientId || previous.mode !== mode)) await paypal(previous, `/v1/notifications/webhooks/${previous.webhookId}`, { method: "DELETE" }).catch(() => {});
    const r = await paypal(keys, "/v1/notifications/webhooks", { method: "POST", json: { url: webhookUrl, event_types: PAYPAL_EVENTS.map((name) => ({ name })) } });
    let webhookId = r.ok ? r.data?.id : null;
    if (!webhookId && r.data?.name === "WEBHOOK_URL_ALREADY_EXISTS") {
      const list = await paypal(keys, "/v1/notifications/webhooks");
      webhookId = (list.data?.webhooks || []).find((w: { url: string }) => w.url === webhookUrl)?.id;
    }
    if (!webhookId) throw new PayError(`PayPal couldn't set up payment notices: ${paypalSays(r)}`);
    return { keys: { ...keys, webhookId }, status: { mode, account: "", methods: ["paypal"], recurring: true } };
  },
  async disconnect(keys) { if (keys.webhookId) await paypal(keys, `/v1/notifications/webhooks/${keys.webhookId}`, { method: "DELETE" }).catch(() => {}); },
  async checkout(keys, o) {
    const total = o.lines.reduce((n, l) => n + cents(l.amount) * l.qty, 0);
    const back = { brand_name: o.church.name.slice(0, 127), shipping_preference: "NO_SHIPPING", return_url: o.successUrl, cancel_url: o.cancelUrl };
    if (o.frequency === "once") {
      const r = await paypal(keys, "/v2/checkout/orders", { method: "POST", requestId: o.id, json: {
        intent: "CAPTURE",
        purchase_units: [{ reference_id: o.id, custom_id: o.id, invoice_id: o.id, description: o.title.slice(0, 127),
          amount: { ...usd(total), breakdown: { item_total: usd(total) } },
          items: o.lines.map((l) => ({ name: l.name.slice(0, 127), quantity: String(l.qty), unit_amount: usd(cents(l.amount)) })) }],
        payment_source: { paypal: { experience_context: { ...back, user_action: "PAY_NOW" } } },
      } });
      const url = approveLink(r.data);
      if (!r.ok || !url) throw new PayError(`PayPal couldn't start the payment: ${paypalSays(r)}`);
      return { url, ref: r.data.id };
    }
    // Recurring gifts: a PayPal subscription with its own plan for this amount and how often.
    let productId = keys.productId, saved: Keys | undefined;
    if (!productId) {
      const p = await paypal(keys, "/v1/catalogs/products", { method: "POST", json: { name: `Gifts to ${o.church.name}`.slice(0, 127), type: "SERVICE" } });
      if (!p.ok) throw new PayError(`PayPal couldn't set up recurring gifts: ${paypalSays(p)}`);
      productId = p.data.id; saved = { ...keys, productId };
    }
    const plan = await paypal(keys, "/v1/billing/plans", { method: "POST", json: {
      product_id: productId, name: `${o.title}, ${o.frequency}`.slice(0, 127), status: "ACTIVE",
      billing_cycles: [{ frequency: { interval_unit: o.frequency === "weekly" ? "WEEK" : "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0,
        pricing_scheme: { fixed_price: usd(total) } }],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
    } });
    if (!plan.ok) throw new PayError(`PayPal couldn't set up the recurring gift: ${paypalSays(plan)}`);
    const sub = await paypal(keys, "/v1/billing/subscriptions", { method: "POST", json: {
      plan_id: plan.data.id, custom_id: o.id, ...(o.email ? { subscriber: { email_address: o.email } } : {}),
      application_context: { ...back, user_action: "SUBSCRIBE_NOW" },
    } });
    const url = approveLink(sub.data);
    if (!sub.ok || !url) throw new PayError(`PayPal couldn't start the recurring gift: ${paypalSays(sub)}`);
    return { url, ref: sub.data.id, keys: saved };
  },
  async confirm(keys, ref) {
    if (ref.startsWith("I-")) {   // a subscription: its payments so far
      const r = await paypal(keys, `/v1/billing/subscriptions/${ref}`);
      if (!r.ok) throw new PayError(`PayPal couldn't find the recurring gift: ${paypalSays(r)}`);
      if (r.data.status === "APPROVAL_PENDING") return { status: "unpaid", events: [] };
      const from = new Date(Date.now() - 2 * 864e5).toISOString(), to = new Date(Date.now() + 864e5).toISOString();
      const t = await paypal(keys, `/v1/billing/subscriptions/${ref}/transactions?start_time=${from}&end_time=${to}`);
      const done = (t.data?.transactions || []).filter((x: { status: string }) => x.status === "COMPLETED");
      return { status: done.length ? "paid" : "pending", events: done.map((x: { id: string; amount_with_breakdown?: { gross_amount?: { value: string } } }) =>
        ({ type: "paid", providerRef: ref, subscription: ref, payRef: `paypal_${x.id}`, amount: Number(x.amount_with_breakdown?.gross_amount?.value || 0) })) };
    }
    let r = await paypal(keys, `/v2/checkout/orders/${ref}/capture`, { method: "POST", json: {}, requestId: `capture-${ref}` });
    const issue = r.data?.details?.[0]?.issue;
    if (!r.ok && issue === "ORDER_NOT_APPROVED") return { status: "unpaid", events: [] };
    if (!r.ok && issue === "ORDER_ALREADY_CAPTURED") r = await paypal(keys, `/v2/checkout/orders/${ref}`);
    if (!r.ok) throw new PayError(`PayPal couldn't finish the payment: ${paypalSays(r)}`);
    const cap = r.data.purchase_units?.[0]?.payments?.captures?.[0];
    if (!cap) return { status: "unpaid", events: [] };
    if (cap.status !== "COMPLETED") return { status: cap.status === "PENDING" ? "pending" : "unpaid", events: [] };   // eChecks clear later
    return { status: "paid", events: [{ type: "paid", providerRef: ref, payRef: `paypal_${cap.id}`, amount: Number(cap.amount?.value || 0) }] };
  },
  async webhook(keys, req, body) {
    // deno-lint-ignore no-explicit-any
    let ev: any;
    try { ev = JSON.parse(body); } catch { return null; }
    const h = (n: string) => req.headers.get(n) || "";
    const v = await paypal(keys, "/v1/notifications/verify-webhook-signature", { method: "POST", json: {
      auth_algo: h("paypal-auth-algo"), cert_url: h("paypal-cert-url"), transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"), transmission_time: h("paypal-transmission-time"), webhook_id: keys.webhookId, webhook_event: ev,
    } });
    if (v.data?.verification_status !== "SUCCESS") return null;
    const r = ev.resource || {};
    switch (ev.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        return [{ type: "paid", checkout: r.custom_id, providerRef: r.supplementary_data?.related_ids?.order_id, payRef: `paypal_${r.id}`, amount: Number(r.amount?.value || 0) }];
      case "PAYMENT.CAPTURE.REFUNDED": {
        const up: string = (r.links || []).find((l: { rel: string }) => l.rel === "up")?.href || "";
        const id = up.split("/captures/")[1]?.split(/[/?]/)[0];
        return id ? [{ type: "refunded", payRef: `paypal_${id}` }] : [];
      }
      case "PAYMENT.SALE.COMPLETED":
        return r.billing_agreement_id ? [{ type: "paid", checkout: r.custom || undefined, subscription: r.billing_agreement_id, providerRef: r.billing_agreement_id, payRef: `paypal_${r.id}`, amount: Number(r.amount?.total || 0) }] : [];
      case "PAYMENT.SALE.REFUNDED": return r.sale_id ? [{ type: "refunded", payRef: `paypal_${r.sale_id}` }] : [];
      case "BILLING.SUBSCRIPTION.CANCELLED": case "BILLING.SUBSCRIPTION.EXPIRED": case "BILLING.SUBSCRIPTION.SUSPENDED":
        return [{ type: "ended", subscription: r.id }];
    }
    return [];
  },
  async refund(keys, payRef) {
    const id = payRef.replace(/^paypal_/, "");
    let r = await paypal(keys, `/v2/payments/captures/${id}/refund`, { method: "POST", json: {}, requestId: `refund-${id}` });
    if (r.status === 404) r = await paypal(keys, `/v1/payments/sale/${id}/refund`, { method: "POST", json: {} });   // a recurring gift's payment
    if (!r.ok) throw new PayError(`PayPal couldn't refund it: ${paypalSays(r)}`);
  },
  async cancel(keys, subscription) {
    const r = await paypal(keys, `/v1/billing/subscriptions/${subscription}/cancel`, { method: "POST", json: { reason: "Stopped in the church app" } });
    if (!r.ok && r.data?.details?.[0]?.issue !== "SUBSCRIPTION_STATUS_INVALID") throw new PayError(`PayPal couldn't stop it: ${paypalSays(r)}`);
  },
};

// ---------------------------------------------------------------- Square
const SQUARE = { live: "https://connect.squareup.com", test: "https://connect.squareupsandbox.com" } as const;
const square = (keys: Keys, path: string, init: { method?: string; json?: unknown } = {}) =>
  call(`${SQUARE[keys.mode === "live" ? "live" : "test"]}${path}`, { ...init, headers: { authorization: `Bearer ${keys.token}` } });
// deno-lint-ignore no-explicit-any
const squareSays = (r: { status: number; data: any }) => r.data?.errors?.[0]?.detail || r.data?.message || `error ${r.status}`;
const timingSafeEqual = (a: string, b: string) => a.length === b.length && [...a].reduce((n, ch, i) => n | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

export const squareProcessor: Processor = {
  name: "Square",
  async connect(input, { webhookUrl, previous }) {
    const token = String(input.token || "").trim();
    if (!token) throw new PayError("Enter the access token from your Square app.");
    let mode: "live" | "test" = "live";
    let r = await square({ token, mode }, "/v2/locations");
    if (r.status === 401) { mode = "test"; r = await square({ token, mode }, "/v2/locations"); }
    if (r.status === 401) throw new PayError("Square didn't accept that access token. Copy the Production access token from your app's Credentials page.");
    if (!r.ok) throw new PayError(`Square couldn't read your locations: ${squareSays(r)}`);
    // deno-lint-ignore no-explicit-any
    const places = (r.data?.locations || []).filter((l: any) => l.status === "ACTIVE" && (l.capabilities || []).includes("CREDIT_CARD_PROCESSING"));
    const want = String(input.locationId || "").trim();
    const loc = want ? places.find((l: { id: string }) => l.id === want) : places[0];
    if (!loc) throw new PayError(want ? "That location ID isn't an active Square location that takes cards." : "This Square account has no location that takes card payments yet.");
    if (loc.currency && loc.currency !== "USD") throw new PayError(`This Square location takes payments in ${loc.currency}. The app charges in US dollars.`);
    if (previous?.webhookId && previous.token) await square(previous, `/v2/webhooks/subscriptions/${previous.webhookId}`, { method: "DELETE" }).catch(() => {});
    const w = await square({ token, mode }, "/v2/webhooks/subscriptions", { method: "POST", json: {
      idempotency_key: crypto.randomUUID(),
      subscription: { name: "Our Faithful Church App", event_types: ["payment.updated", "refund.updated"], notification_url: webhookUrl, enabled: true },
    } });
    if (!w.ok || !w.data?.subscription?.signature_key) throw new PayError(`Square couldn't set up payment notices: ${squareSays(w)}. Use your application's own access token from the Credentials page.`);
    return {
      keys: { token, mode, locationId: loc.id, webhookId: w.data.subscription.id, signatureKey: w.data.subscription.signature_key, webhookUrl },
      status: { mode, account: loc.business_name || loc.name || "Square account", methods: ["card"], recurring: false },
    };
  },
  async disconnect(keys) { if (keys.webhookId) await square(keys, `/v2/webhooks/subscriptions/${keys.webhookId}`, { method: "DELETE" }).catch(() => {}); },
  async checkout(keys, o) {
    if (o.frequency !== "once") throw new PayError("Recurring gifts aren't available with Square. Choose One time.");
    const r = await square(keys, "/v2/online-checkout/payment-links", { method: "POST", json: {
      idempotency_key: o.id,
      order: { location_id: keys.locationId, reference_id: o.id,
        line_items: o.lines.map((l) => ({ name: l.name.slice(0, 512), quantity: String(l.qty), base_price_money: { amount: cents(l.amount), currency: "USD" } })) },
      checkout_options: { redirect_url: o.successUrl, ask_for_shipping_address: false },
      ...(o.email ? { pre_populated_data: { buyer_email: o.email } } : {}),
      payment_note: o.title.slice(0, 500),
    } });
    if (!r.ok || !r.data?.payment_link?.url) throw new PayError(`Square couldn't start the payment: ${squareSays(r)}`);
    return { url: r.data.payment_link.url, ref: r.data.payment_link.order_id };
  },
  async confirm(keys, ref) {
    const r = await square(keys, `/v2/orders/${ref}`);
    if (!r.ok) throw new PayError(`Square couldn't find the payment: ${squareSays(r)}`);
    const paymentId = r.data?.order?.tenders?.[0]?.payment_id;
    if (!paymentId) return { status: "unpaid", events: [] };
    const p = await square(keys, `/v2/payments/${paymentId}`), pay = p.data?.payment;
    if (pay?.status === "COMPLETED") return { status: "paid", events: [{ type: "paid", providerRef: ref, payRef: `square_${pay.id}`, amount: (pay.amount_money?.amount || 0) / 100 }] };
    return { status: ["APPROVED", "PENDING"].includes(pay?.status) ? "pending" : "unpaid", events: [] };
  },
  async webhook(keys, req, body) {
    // Square signs the notification URL followed by the body.
    const expected = await hmacBase64(String(keys.signatureKey), String(keys.webhookUrl) + body);
    if (!timingSafeEqual(req.headers.get("x-square-hmacsha256-signature") || "", expected)) return null;
    // deno-lint-ignore no-explicit-any
    let ev: any;
    try { ev = JSON.parse(body); } catch { return null; }
    const o = ev.data?.object || {};
    if (ev.type === "payment.updated" && o.payment?.status === "COMPLETED" && o.payment.order_id)
      return [{ type: "paid", providerRef: o.payment.order_id, payRef: `square_${o.payment.id}`, amount: (o.payment.amount_money?.amount || 0) / 100 }];
    if (ev.type === "refund.updated" && o.refund?.status === "COMPLETED" && o.refund.payment_id) return [{ type: "refunded", payRef: `square_${o.refund.payment_id}` }];
    return [];
  },
  async refund(keys, payRef, amount) {
    const id = payRef.replace(/^square_/, "");
    const r = await square(keys, "/v2/refunds", { method: "POST", json: { idempotency_key: `refund-${id}`, payment_id: id, amount_money: { amount: cents(amount), currency: "USD" }, reason: "Refunded by the church" } });
    if (!r.ok) throw new PayError(`Square couldn't refund it: ${squareSays(r)}`);
  },
  async cancel() { throw new PayError("Recurring gifts aren't available with Square."); },
};

export const PROCESSORS: Record<string, Processor> = { stripe: stripeProcessor, paypal: paypalProcessor, square: squareProcessor };

// ---------------------------------------------------------------- Keys and which processor a church uses
export async function loadKeys(db: SupabaseClient, church: string, provider: string): Promise<Keys | null> {
  const { data, error } = await db.rpc("payment_key_get", { c: church, p: provider });
  if (error) throw new Error(error.message);
  return data ? JSON.parse(data) : null;
}
export async function saveKeys(db: SupabaseClient, church: string, provider: string, keys: Keys) {
  const { error } = await db.rpc("payment_key_set", { c: church, p: provider, s: JSON.stringify(keys) });
  if (error) throw new Error(error.message);
}
export const webhookUrl = (church: string, provider: string) =>
  `${env("SUPABASE_URL")}/functions/v1/pay-webhook?church=${encodeURIComponent(church)}&provider=${provider}`;

/** The processor a church takes payments with now: its own keys, or Stripe Connect through the platform. */
// deno-lint-ignore no-explicit-any
export async function processorFor(db: SupabaseClient, church: { id: string; data: any }) {
  const pay = church.data?.payments;
  if (pay?.ready && PROCESSORS[pay.provider]) {
    const keys = await loadKeys(db, church.id, pay.provider);
    if (keys) return { provider: pay.provider as string, p: PROCESSORS[pay.provider], keys, recurring: !!pay.recurring };
  }
  const acct = church.data?.stripe;
  if (acct?.chargesEnabled && acct.accountId && env("STRIPE_SECRET_KEY")) return { provider: "stripe", p: stripeProcessor, keys: { connect: acct.accountId } as Keys, recurring: true };
  return null;
}
/** The keys for an earlier payment or recurring gift, which may have gone through a processor the church has since changed. */
// deno-lint-ignore no-explicit-any
export async function keysFor(db: SupabaseClient, church: { id: string; data: any }, d: { provider?: string; connect?: string } | null) {
  if (d?.connect) return { connect: d.connect } as Keys;
  if (d?.provider) return await loadKeys(db, church.id, d.provider);
  return church.data?.stripe?.accountId ? { connect: church.data.stripe.accountId } as Keys : null;   // made before churches chose a processor
}
