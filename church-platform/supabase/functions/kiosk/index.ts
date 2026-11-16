// Payment kiosks, card readers and tickets.
// Public (no sign-in):
//   { action: "ticket", t: "<eventId>~<who>~<code>" }   a ticket, for its link: walk-ins open it without an account
// A payment kiosk (a paired kiosk device with payments turned on), or staff trying the kiosk on their own computer:
//   { action: "signup", churchId, eventId, tickets, name, email, phone }   holds tickets for a walk-in -> { regId, total }
//   { action: "find", churchId, q }                     sign-ups by name or ticket code, with what's owed
//   { action: "checkout", churchId, mode: "screen" | "phone", kind: "event" | "gift", regId | fund, amount, name, email, phone, origin }
//                                                       -> { checkout, url }: the processor's page, on the kiosk or the person's phone
//   { action: "reader-start", ... the same }            the amount goes to the kiosk's card reader -> { checkout }
//   { action: "reader-cancel", churchId, checkout }
//   { action: "status", churchId, checkout }            -> { status: "paid" | "pending" | "failed", receipt, ticket }
//   { action: "cash", churchId, kind, regId | fund, amount, method, checkNo, pin, staff, name, email, phone }   with the kiosk's staff code
//   { action: "send", churchId, checkout, email, phone }   a copy of the receipt and ticket
// Staff with "Screens and devices" (manage.devices), for card readers (Admin, Card readers):
//   { action: "reader-register", churchId, provider: "stripe", label, code, address }  a Stripe Terminal reader's pairing code
//   { action: "reader-register", churchId, provider: "square", label }                 a device code to type on a Square Terminal
//   { action: "reader-check", churchId, id }   { action: "reader-remove", churchId, id }
import { admin, caller, can, env, fail, handle, json, sendEmail, emailReady, uid } from "../_shared/util.ts";
import { PayError, processorFor, stripeApi, type Keys } from "../_shared/payments.ts";
import { settle, ticketBalance, appBase } from "../_shared/settle.ts";
import { sendText, textingOn, type Church } from "../_shared/messaging.ts";
import { emailHtml } from "../_shared/email.ts";

const money = (n: number) => `$${Number(n || 0).toFixed(2).replace(/\.00$/, "")}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const CODE = "ACDEFHJKLMNPQRTUVWXY34679", newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CODE[b % CODE.length]).join("");
const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const when = (iso: string, tz: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
const SQUARE = { live: "https://connect.squareup.com", test: "https://connect.squareupsandbox.com" } as const;
// deno-lint-ignore no-explicit-any
async function square(keys: Keys, path: string, init: { method?: string; json?: unknown } = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await fetch(`${SQUARE[keys.mode === "live" ? "live" : "test"]}${path}`, { method: init.method || "GET", headers: { authorization: `Bearer ${keys.token}`, "content-type": "application/json", accept: "application/json" }, body: init.json ? JSON.stringify(init.json) : undefined });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}
const squareSays = (r: { status: number; data: any }) => r.data?.errors?.[0]?.detail || `error ${r.status}`; // deno-lint-ignore no-explicit-any
const stripeFor = (keys: Keys) => keys.connect ? { s: stripeApi(env("STRIPE_SECRET_KEY")), opt: { stripeAccount: String(keys.connect) } } : { s: stripeApi(String(keys.secret)), opt: undefined };

// deno-lint-ignore no-explicit-any
type Row = { id: string; church_id: string; owner: string | null; data: any };

handle(async (req) => {
  const b = await req.json().catch(() => ({}));
  const db = admin();

  // ----- A ticket, for anyone with its link -----
  if (b.action === "ticket") {
    const [eventId, by, code] = String(b.t || "").split("~");
    const [{ data: ev }, { data: reg }] = await Promise.all([
      db.from("records").select("church_id, data").eq("kind", "events").eq("id", eventId).maybeSingle(),
      db.from("records").select("data").eq("kind", "event_regs").eq("id", `${eventId}~${by}`).maybeSingle()]);
    if (!ev || !reg || !reg.data.code || reg.data.code !== String(code || "").toUpperCase()) { await new Promise((r) => setTimeout(r, 600)); return fail("This ticket wasn't found.", 404); }
    const { data: church } = await db.from("churches").select("id, name, data").eq("id", ev.church_id).maybeSingle();
    if (!church || church.data?.deactivation?.status === "deactivated") return fail("This ticket wasn't found.", 404);
    const left = await ticketBalance(db, `${eventId}~${by}`);
    return json({ church: { name: church.name, color: church.data?.color }, ticket: ticketOf(ev.data, eventId, reg.data, left, church.data?.timeZone || "America/New_York", appBase(b.origin)) });
  }

  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first.", 401);
  const { data: church } = await db.from("churches").select("id, name, data").eq("id", String(b.churchId || "")).maybeSingle();
  if (!church || church.data?.deactivation?.status === "deactivated") return fail("That church isn't available.", 404);
  const tz = church.data?.timeZone || "America/New_York";
  const saveChurch = (patch: Record<string, unknown>) => db.from("churches").update({ data: { ...church.data, ...patch } }).eq("id", church.id);

  // ----- Card readers: staff -----
  if (String(b.action || "").startsWith("reader-") && b.action !== "reader-start" && b.action !== "reader-cancel") {
    if (!(await can(client, church.id, "manage.devices"))) return fail("Your role doesn't include screens and devices.", 403);
    const via = await processorFor(db, church);
    const readers: Record<string, any>[] = church.data.cardReaders || []; // deno-lint-ignore no-explicit-any
    try {
      if (b.action === "reader-register") {
        const label = String(b.label || "Card reader").slice(0, 40);
        if (b.provider === "stripe") {
          if (via?.provider !== "stripe") return fail("Connect Stripe under Admin, Giving first.");
          const { s, opt } = stripeFor(via.keys);
          let loc = church.data.terminalLocation;
          if (!loc) {
            const a = b.address || {};
            if (!a.line1 || !a.city || !a.state || !a.postal_code) return fail("Enter the street, city, state and ZIP where the readers are used.");
            loc = (await s.terminal.locations.create({ display_name: church.name.slice(0, 100), address: { line1: a.line1, city: a.city, state: a.state, postal_code: a.postal_code, country: "US" } }, opt)).id;
          }
          const r = await s.terminal.readers.create({ registration_code: String(b.code || "").trim().toLowerCase(), label, location: loc }, opt);
          await saveChurch({ terminalLocation: loc, cardReaders: [...readers, { id: `rdr_${uid()}`, provider: "stripe", readerId: r.id, label, status: "ready", serial: r.serial_number || "" }] });
          return json({ ok: true });
        }
        if (b.provider === "square") {
          if (via?.provider !== "square") return fail("Connect Square under Admin, Giving first.");
          const r = await square(via.keys, "/v2/devices/codes", { method: "POST", json: { idempotency_key: crypto.randomUUID(), device_code: { product_type: "TERMINAL_API", location_id: via.keys.locationId, name: label } } });
          if (!r.ok) return fail(`Square couldn't make a pairing code: ${squareSays(r)}`);
          await saveChurch({ cardReaders: [...readers, { id: `rdr_${uid()}`, provider: "square", codeId: r.data.device_code.id, code: r.data.device_code.code, label, status: "pairing" }] });
          return json({ ok: true, code: r.data.device_code.code });
        }
        return fail("Card readers work with Stripe or Square.");
      }
      const rd = readers.find((x) => x.id === b.id); if (!rd) return fail("That reader wasn't found.", 404);
      if (b.action === "reader-check") {
        if (rd.provider !== "square" || via?.provider !== "square") return json({ ok: true });
        const r = await square(via.keys, `/v2/devices/codes/${rd.codeId}`);
        if (r.data?.device_code?.status === "PAIRED") { Object.assign(rd, { status: "ready", deviceId: r.data.device_code.device_id, code: "" }); await saveChurch({ cardReaders: readers }); return json({ ok: true, paired: true }); }
        return fail(r.data?.device_code?.status === "EXPIRED" ? "The code expired. Remove this reader and pair it again." : "Not paired yet. Enter the code on the Square Terminal.");
      }
      if (b.action === "reader-remove") {
        if (rd.provider === "stripe" && rd.readerId && via?.provider === "stripe") { const { s, opt } = stripeFor(via.keys); await s.terminal.readers.del(rd.readerId, undefined, opt).catch(() => {}); }
        await saveChurch({ cardReaders: readers.filter((x) => x.id !== rd.id) });
        return json({ ok: true });
      }
    } catch (e) {
      // deno-lint-ignore no-explicit-any
      const msg = (e as any)?.raw?.message || (e as Error).message;
      return fail(/registration code/i.test(msg) ? "That pairing code didn't work. Make a new one on the reader and type all three words." : msg);
    }
    return fail("Unknown action");
  }

  // ----- Everything else is the kiosk: a paired kiosk device with payments on, or staff trying it -----
  const { data: devRow } = await db.from("records").select("id, data").eq("kind", "devices").eq("church_id", church.id).eq("data->>deviceUser", user.id).maybeSingle();
  const dev = devRow && devRow.data.type === "kiosk" && (devRow.data.settings?.kioskMode === "pay" || devRow.data.settings?.payButton) ? devRow : null;
  const staff = !dev && ((await can(client, church.id, "manage.devices")) || (await can(client, church.id, "take.payments")));
  if (!dev && !staff) return fail("This device isn't set up to take payments.", 403);
  const pay = dev?.data.settings?.pay || { ways: { screen: true, phone: true }, give: true, partial: true, events: "all" };
  const kioskId = dev?.id || `staff:${user.id}`, kioskName = dev?.data.name || "a kiosk";
  const origin = appBase(b.origin);

  if (b.action === "signup") {
    const { data: ev } = await db.from("records").select("data, location_id").eq("kind", "events").eq("id", String(b.eventId)).eq("church_id", church.id).maybeSingle();
    if (!ev || !ev.data.signup || !(ev.data.tickets || []).length) return fail("That event isn't selling tickets.");
    if (Array.isArray(pay.events) && !pay.events.includes(String(b.eventId))) return fail("This kiosk doesn't sell tickets for that event.");
    const { data: regs } = await db.from("records").select("data").eq("kind", "event_regs").eq("data->>_parent", String(b.eventId));
    const sold = (tid: string) => (regs || []).reduce((n, r) => n + (Number(r.data.tickets?.[tid]) || 0), 0);
    const tickets: Record<string, number> = {};
    for (const t of ev.data.tickets) { const n = Math.max(0, Math.min(20, Math.floor(Number(b.tickets?.[t.id]) || 0))); if (n) { if (t.limit && sold(t.id) + n > t.limit) return fail(`Only ${Math.max(0, t.limit - sold(t.id))} ${t.name.toLowerCase()} tickets are left.`); tickets[t.id] = n; } }
    const count = Object.values(tickets).reduce((n, x) => n + x, 0);
    if (!count) return fail("Choose your tickets.");
    if (ev.data.capacity && (regs || []).reduce((n, r) => n + (Number(r.data.count) || 1), 0) + count > ev.data.capacity) return fail("There aren't that many spots left.");
    const name = String(b.name || "").trim().slice(0, 80); if (!name) return fail("Enter your name.");
    // deno-lint-ignore no-explicit-any
    const total = round2(ev.data.tickets.reduce((n: number, t: any) => n + (tickets[t.id] || 0) * Number(t.price), 0));
    const by = `walkin-${uid()}`, id = `${b.eventId}~${by}`, at = new Date().toISOString();
    const data = { id, by, name, email: String(b.email || "").trim().slice(0, 120), phone: String(b.phone || "").trim().slice(0, 30), count, kids: [], tickets, total, at, code: newCode(),
      paid: { status: "door", tracked: true }, kiosk: kioskId, held: true, _parent: String(b.eventId) };
    const { error } = await db.from("records").insert({ kind: "event_regs", id, church_id: church.id, location_id: ev.location_id || null, owner: by, data });
    if (error) return fail(error.message, 500);
    return json({ regId: id, total, code: data.code });
  }

  if (b.action === "release") {
    // Tickets this kiosk held for someone who left without paying.
    const { data: reg } = await db.from("records").select("data").eq("kind", "event_regs").eq("id", String(b.regId || "")).eq("church_id", church.id).maybeSingle();
    if (reg?.data?.held && reg.data.kiosk === kioskId && (await ticketBalance(db, String(b.regId))) >= Number(reg.data.total || 0)) await db.from("records").delete().eq("kind", "event_regs").eq("id", String(b.regId));
    return json({ ok: true });
  }

  if (b.action === "find") {
    const q = String(b.q || "").trim(); if (q.length < 2) return fail("Type at least two letters.");
    const now = new Date(Date.now() - 86400e3).toISOString();
    const { data: evs } = await db.from("records").select("id, data").eq("kind", "events").eq("church_id", church.id).gte("data->>start", now);
    // deno-lint-ignore no-explicit-any
    const ticketed = (evs || []).filter((e) => (e.data.tickets || []).length), code = q.toUpperCase().replace(/[^A-Z0-9]/g, ""), words = q.toLowerCase().split(/\s+/);
    const found = [];
    for (const e of ticketed) {
      const { data: regs } = await db.from("records").select("id, data").eq("kind", "event_regs").eq("data->>_parent", e.id);
      for (const r of regs || []) {
        const hit = (r.data.code && r.data.code === code) || words.every((w) => String(r.data.name || "").toLowerCase().split(/\s+/).some((x) => x.startsWith(w)));
        if (hit && r.data.total) found.push({ regId: r.id, name: r.data.name, title: e.data.title, balance: await ticketBalance(db, r.id) });
        if (found.length >= 8) break;
      }
    }
    return json({ found });
  }

  /** What's being paid for: an event sign-up and how much is owed, or a gift to a fund. */
  async function target() {
    const amount = round2(Number(b.amount) || 0);
    if (b.kind === "gift") {
      if (pay.give === false) throw new PayError("This kiosk doesn't take gifts.");
      if (!(amount >= 1 && amount <= 100000)) throw new PayError("Gifts here can be $1 to $100,000.");
      const fund = (church.data.funds || []).find((f: { id: string }) => f.id === b.fund) || church.data.funds?.[0];
      return { kind: "gift", ref: fund?.id || "", amount, title: `Gift to ${church.name}${fund ? `: ${fund.name}` : ""}`, user: "", payer: "", label: fund?.name || "Gift" };
    }
    const regId = String(b.regId || ""), eventId = regId.split("~")[0];
    const [{ data: reg }, { data: ev }] = await Promise.all([db.from("records").select("owner, data").eq("kind", "event_regs").eq("id", regId).eq("church_id", church.id).maybeSingle(),
      db.from("records").select("data").eq("kind", "events").eq("id", eventId).maybeSingle()]);
    if (!reg || !ev) throw new PayError("That sign-up wasn't found.");
    const owed = await ticketBalance(db, regId);
    if (!(owed > 0)) throw new PayError("Those tickets are paid in full.");
    let a = Math.min(amount || owed, owed);
    if (a < owed && pay.partial === false) a = owed;
    if (!(a > 0)) throw new PayError("Enter an amount.");
    const isUser = /^[0-9a-f-]{36}$/i.test(reg.owner || "");
    return { kind: "event", ref: regId, amount: round2(a), title: ev.data.title, user: isUser ? reg.owner! : "", payer: reg.owner || reg.data.by, label: `Payment toward ${ev.data.title}` };
  }
  const metaOf = (t: Awaited<ReturnType<typeof target>>, provider: string, via: string) => ({ church: church.id, kind: t.kind, ref: t.ref, user: t.user, payer: t.payer, provider, kiosk: kioskId, via,
    name: String(b.name || "").slice(0, 80), email: String(b.email || "").slice(0, 120), phone: String(b.phone || "").slice(0, 30), origin, ...(t.kind === "gift" ? { fund: t.ref, frequency: "once", method: via === "reader" ? "reader" : "kiosk" } : {}) });

  try {
    if (b.action === "checkout") {
      const mode = b.mode === "phone" ? "phone" : "screen";
      if (!pay.ways?.[mode]) return fail("This kiosk doesn't offer that way to pay.");
      const via = await processorFor(db, church); if (!via) return fail("This church isn't set up for online payments yet.");
      const t = await target(), id = `co_${uid()}`, meta: Record<string, string> = { ...metaOf(t, via.provider, mode), checkout: id };
      if (via.keys.connect) meta.connect = String(via.keys.connect);
      const { error } = await db.from("checkouts").insert({ id, church_id: church.id, provider: via.provider, user_id: t.user || null, kind: t.kind, ref: t.ref, amount: t.amount, meta });
      if (error) throw new Error(error.message);
      // On the kiosk, the processor sends them back to the kiosk; on a phone, to a thank-you page.
      const success = mode === "screen" ? `${origin}?kpaid=${id}` : `${origin}#thanks`, cancel = mode === "screen" ? `${origin}?kunpaid=${id}` : `${origin}#thanks-cancelled`;
      const out = await via.p.checkout(via.keys, { id, church: { id: church.id, name: church.name }, kind: t.kind, title: t.title, email: meta.email || undefined, lines: [{ name: t.label, amount: t.amount, qty: 1 }],
        total: t.amount, frequency: "once", method: "card", meta, successUrl: success, cancelUrl: cancel, feePercent: Number(env("PLATFORM_FEE_PERCENT", "0")) });
      await db.from("checkouts").update({ provider_ref: out.ref }).eq("id", id);
      return json({ checkout: id, url: out.url });
    }

    if (b.action === "reader-start") {
      if (!dev || !pay.ways?.reader || !pay.readerId) return fail("This kiosk has no card reader.");
      const rd = (church.data.cardReaders || []).find((x: { id: string }) => x.id === pay.readerId);
      if (!rd || rd.status !== "ready") return fail("The card reader isn't paired yet.");
      const via = await processorFor(db, church); if (!via || via.provider !== rd.provider) return fail(`The card reader needs the church's ${rd.provider === "square" ? "Square" : "Stripe"} account connected.`);
      const t = await target(), id = `co_${uid()}`, meta: Record<string, string> = { ...metaOf(t, via.provider, "reader"), checkout: id, reader: rd.id, terminal: rd.provider };
      if (via.keys.connect) meta.connect = String(via.keys.connect);
      let ref = "";
      if (rd.provider === "stripe") {
        const { s, opt } = stripeFor(via.keys);
        const pi = await s.paymentIntents.create({ amount: Math.round(t.amount * 100), currency: "usd", payment_method_types: ["card_present"], capture_method: "automatic", description: t.title.slice(0, 200), metadata: meta }, opt);
        await s.terminal.readers.processPaymentIntent(rd.readerId, { payment_intent: pi.id }, opt);
        ref = pi.id;
      } else {
        const r = await square(via.keys, "/v2/terminals/checkouts", { method: "POST", json: { idempotency_key: id, checkout: { amount_money: { amount: Math.round(t.amount * 100), currency: "USD" }, device_options: { device_id: rd.deviceId }, reference_id: id, note: t.title.slice(0, 250) } } });
        if (!r.ok) return fail(`The Square Terminal didn't take it: ${squareSays(r)}`);
        ref = r.data.checkout.id;
      }
      const { error } = await db.from("checkouts").insert({ id, church_id: church.id, provider: via.provider, provider_ref: ref, user_id: t.user || null, kind: t.kind, ref: t.ref, amount: t.amount, meta });
      if (error) throw new Error(error.message);
      return json({ checkout: id });
    }

    if (b.action === "reader-cancel" || b.action === "status" || b.action === "send") {
      const cashId = String(b.checkout || "").startsWith("cash:") ? String(b.checkout).slice(5) : "";
      if (cashId) {
        const [kind, rid] = cashId.split("|");
        const out = await receiptFor(kind === "gift" ? "gifts" : "ticketPayments", rid);
        if (!out) return fail("That payment wasn't found.", 404);
        if (b.action === "send") return json(await sendCopy(out));
        return json({ status: "paid", ...out });
      }
      const { data: co } = await db.from("checkouts").select("*").eq("id", String(b.checkout || "")).eq("church_id", church.id).maybeSingle();
      if (!co || co.meta?.kiosk !== kioskId) return fail("That payment wasn't found.", 404);
      const via = await processorFor(db, church);
      if (b.action === "reader-cancel") {
        if (co.status !== "paid" && via) {
          if (co.meta.terminal === "stripe") { const { s, opt } = stripeFor(via.keys); const rd = (church.data.cardReaders || []).find((x: { id: string }) => x.id === co.meta.reader); if (rd) await s.terminal.readers.cancelAction(rd.readerId, {}, opt).catch(() => {}); await s.paymentIntents.cancel(co.provider_ref, undefined, opt).catch(() => {}); }
          if (co.meta.terminal === "square") await square(via.keys, `/v2/terminals/checkouts/${co.provider_ref}/cancel`, { method: "POST" }).catch(() => {});
          await db.from("checkouts").update({ status: "cancelled" }).eq("id", co.id);
        }
        return json({ ok: true });
      }
      if (co.status !== "paid" && via && co.provider_ref) {
        if (co.meta.terminal === "stripe") {
          const { s, opt } = stripeFor(via.keys), pi = await s.paymentIntents.retrieve(co.provider_ref, undefined, opt);
          if (pi.status === "succeeded") await settle(db, co.meta, pi.amount_received / 100, pi.id);
          else if (pi.last_payment_error || pi.status === "canceled") return json({ status: "failed", error: pi.last_payment_error?.message || "The card didn't go through. Nothing was charged." });
        } else if (co.meta.terminal === "square") {
          const r = await square(via.keys, `/v2/terminals/checkouts/${co.provider_ref}`), ck = r.data?.checkout;
          if (ck?.status === "COMPLETED" && ck.payment_ids?.[0]) await settle(db, co.meta, (ck.amount_money?.amount || 0) / 100, `square_${ck.payment_ids[0]}`);
          else if (ck?.status === "CANCELED") return json({ status: "failed", error: "The payment was cancelled on the Terminal. Nothing was charged." });
        } else {
          const c = await via.p.confirm(via.keys, co.provider_ref);
          for (const e of c.events) if (e.type === "paid") await settle(db, co.meta, e.amount, e.payRef);
          if (c.status === "pending") return json({ status: "pending" });
        }
      }
      const { data: p } = await db.from("payments").select("id").eq("data->>checkout", co.id).maybeSingle();
      if (!p) return json({ status: "pending" });
      const out = await receiptFor(co.kind === "gift" ? "gifts" : "ticketPayments", p.id);
      if (!out) return json({ status: "pending" });
      if (b.action === "send") return json(await sendCopy(out));
      return json({ status: "paid", ...out });
    }

    if (b.action === "cash") {
      if (!dev || !pay.ways?.cash || !pay.cashPinHash) return fail("This kiosk doesn't take cash or checks.");
      if ((await sha256(`cashpin:${church.id}:${String(b.pin || "")}`)) !== pay.cashPinHash) { await new Promise((r) => setTimeout(r, 900)); return fail("That's not the staff code."); }
      const t = await target(), at = new Date().toISOString(), method = b.method === "check" ? "check" : "cash", staffName = String(b.staff || "").trim().slice(0, 60) || "Staff";
      const id = `kc${uid()}`, receivedByName = `${staffName} at ${kioskName}`;
      if (t.kind === "gift") {
        await db.from("records").insert({ kind: "gifts", id, church_id: church.id, owner: null, data: { by: null, name: String(b.name || "").trim() || "A kiosk gift", fundId: t.ref, amount: t.amount, frequency: "once", method, at, status: "paid", ref: id, kiosk: kioskId, receivedByName, checkNo: method === "check" ? String(b.checkNo || "") : "" } });
      } else {
        await db.from("records").insert({ kind: "ticketPayments", id, church_id: church.id, owner: t.payer, data: { id, churchId: church.id, eventId: t.ref.split("~")[0], regId: t.ref, payerId: t.payer, amount: t.amount, method, status: "paid", at,
          checkNo: method === "check" ? String(b.checkNo || "").slice(0, 20) : "", receivedBy: "", receivedByName, recordedBy: user.id, kiosk: kioskId, note: "", receipts: [] } });
        const left = await ticketBalance(db, t.ref), { data: reg } = await db.from("records").select("data").eq("kind", "event_regs").eq("id", t.ref).maybeSingle();
        if (reg) await db.from("records").update({ data: { ...reg.data, held: false, code: reg.data.code || newCode(), paid: { status: left > 0.004 ? "partial" : "paid", at, tracked: true } } }).eq("kind", "event_regs").eq("id", t.ref);
      }
      const out = await receiptFor(t.kind === "gift" ? "gifts" : "ticketPayments", id);
      return json({ status: "paid", checkout: `cash:${t.kind}|${id}`, ...out });
    }
  } catch (e) {
    if (e instanceof PayError) return fail(e.message);
    // deno-lint-ignore no-explicit-any
    const msg = (e as any)?.raw?.message; if (msg) return fail(msg);
    throw e;
  }
  return fail("Unknown action");

  // ----- Receipts and tickets, in the same shape the app draws -----
  async function receiptFor(kind: "gifts" | "ticketPayments", id: string) {
    const { data: row } = await db.from("records").select("data").eq("kind", kind).eq("id", id).eq("church_id", church!.id).maybeSingle();
    if (!row) return null;
    const d = row.data, base = { church: { name: church!.name, color: church!.data?.color }, number: id.replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase(), at: d.at, test: d.status === "test" };
    const method = ({ cash: "Cash", check: "Check", reader: "Card (in person)", kiosk: "Card at a kiosk", app: "Card" } as Record<string, string>)[d.method] || "Card";
    if (kind === "gifts") {
      const fund = (church!.data.funds || []).find((f: { id: string }) => f.id === d.fundId)?.name || "General fund";
      return { receipt: { ...base, kind: "gift", title: `Gift to ${church!.name}`, lines: [[fund, d.amount]], amount: d.amount, method: `${method}${d.checkNo ? ` #${d.checkNo}` : ""}`, payer: d.name, receivedBy: d.receivedByName || "",
        qr: `${origin}#receipt-gift~${id}`, note: church!.data.taxId ? `${church!.name} is a tax-exempt organization (EIN ${church!.data.taxId}). No goods or services were provided in exchange for this gift.` : "Thank you for your generosity." }, email: "", phone: "" };
    }
    const [{ data: reg }, { data: ev }] = await Promise.all([db.from("records").select("data").eq("kind", "event_regs").eq("id", d.regId).maybeSingle(), db.from("records").select("data").eq("kind", "events").eq("id", d.eventId).maybeSingle()]);
    if (!reg || !ev) return null;
    const left = await ticketBalance(db, d.regId);
    // deno-lint-ignore no-explicit-any
    const summary = (ev.data.tickets || []).filter((t: any) => reg.data.tickets?.[t.id]).map((t: any) => `${reg.data.tickets[t.id]} ${String(t.name).toLowerCase()}`).join(", ");
    const ticket = ticketOf(ev.data, d.eventId, reg.data, left, tz, origin);
    const paidBefore = round2(Number(reg.data.total || 0) - left - d.amount);
    return { receipt: { ...base, kind: "ticket", title: ev.data.title, lines: [[summary || "Tickets", reg.data.total], ...(paidBefore > 0.004 ? [["Paid before", -paidBefore]] : [])], amount: d.amount,
      method: `${d.via === "reader" ? "Card (in person)" : d.method === "app" ? "Card" : method}${d.checkNo ? ` #${d.checkNo}` : ""}`, payer: reg.data.name, receivedBy: d.method === "app" ? "" : d.receivedByName || "", balance: left, qr: ticket.link, ticket },
      ticket, email: reg.data.email || "", phone: reg.data.phone || "" };
  }
  // deno-lint-ignore no-explicit-any
  async function sendCopy(out: any) {
    const email = String(b.email || out.email || "").trim(), phone = String(b.phone || out.phone || "").trim(), r = out.receipt, sent: string[] = [];
    const lines = [`We received ${money(r.amount)} for ${r.title} on ${new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })}, paid with ${r.method}.`,
      ...(r.balance ? [`${money(r.balance)} left to pay.`] : []), `Receipt ${r.number}.`, ...(r.ticket ? [`Your ticket code is ${r.ticket.code}. Show the ticket at the door.`] : [])];
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && emailReady()) {
      const html = emailHtml({ heading: r.ticket ? `Your receipt and ticket: ${r.title}` : `Your receipt from ${church!.name}`, paragraphs: lines, button: r.ticket ? ["Open your ticket", r.ticket.link] : undefined,
        footer: `${church!.name}. Keep this email as your receipt.`, church: { name: church!.name, color: church!.data?.color, logo: church!.data?.logo } });
      if (await sendEmail(email, r.ticket ? `Your ticket: ${r.title}` : `Receipt from ${church!.name}`, [...lines, r.ticket?.link || ""].join("\n\n"), html)) sent.push("email");
    }
    if (phone && textingOn(church as Church) && !(await sendText(db, church as Church, phone, `${church!.name}: ${lines.join(" ")}${r.ticket ? `\n${r.ticket.link}` : ""}`))) sent.push("text");
    return { sent };
  }
});

// deno-lint-ignore no-explicit-any
function ticketOf(ev: any, eventId: string, reg: any, left: number, tz: string, origin: string) {
  // deno-lint-ignore no-explicit-any
  const summary = (ev.tickets || []).filter((t: any) => reg.tickets?.[t.id]).map((t: any) => `${reg.tickets[t.id]} ${String(t.name).toLowerCase()}`).join(", ");
  const admits = reg.count || Object.values(reg.tickets || {}).reduce((n: number, x) => n + Number(x), 0) || 1;
  return { title: ev.title, when: when(ev.start, tz), where: ev.location || "", name: reg.name, summary: summary || `${admits} ${admits === 1 ? "person" : "people"}`, admits, code: reg.code,
    link: `${origin}#ticket-${eventId}~${reg.by}~${reg.code}`, eventId, regId: `${eventId}~${reg.by}`, paid: !reg.total ? "Free" : left > 0.004 ? `${money(left)} still due` : "Paid in full" };
}
