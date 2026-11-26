// Records payments in the app once a processor reports them: gifts, recurring gifts, event tickets and form fees.
// Every step can run twice (a webhook and the return page both report the same payment), so each checks first.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { env, patchRecord } from "./util.ts";
import type { PayEvent } from "./payments.ts";
import { deliver, routeOf, type Church } from "./messaging.ts";
import { dateText, zoneOf } from "./tz.ts";

const money = (n: number) => `$${Number(n || 0).toFixed(2).replace(/\.00$/, "")}`;
/** Where links in receipts and tickets point: the app's own address. */
export const appBase = (origin?: string) => { const u = String(origin || env("APP_URL") || "").split(/[?#]/)[0]; return u; };

export type Meta = Record<string, string>;

/** What a payment was for: from the checkout it came from, or for later payments of a recurring gift, from that gift. */
async function metaFor(db: SupabaseClient, provider: string, e: Extract<PayEvent, { type: "paid" }>): Promise<Meta | null> {
  const find = async (col: string, v?: string) => {
    if (!v) return null;
    let q = db.from("checkouts").select("meta").eq(col, v);
    if (col === "provider_ref") q = q.eq("provider", provider);
    const { data } = await q.maybeSingle();
    return (data?.meta as Meta) || null;
  };
  const m = (await find("id", e.checkout)) || (await find("provider_ref", e.providerRef)) || (await find("provider_ref", e.subscription));
  if (m) return m;
  if (!e.subscription) return null;
  const { data: rec } = await db.from("records").select("church_id, owner, data").eq("kind", "recurring").eq("id", e.subscription).maybeSingle();
  if (!rec) return null;
  return { church: rec.church_id, kind: "gift", ref: rec.data.fundId, fund: rec.data.fundId, user: rec.owner, frequency: rec.data.frequency, method: rec.data.method || "card",
    provider, ...(rec.data.connect ? { connect: rec.data.connect } : {}) };
}

/** Applies what a processor reported for one church. Events about another church's payments are ignored. */
export async function apply(db: SupabaseClient, church: string, provider: string, events: PayEvent[]) {
  for (const e of events) {
    if (e.type === "paid") {
      const m = await metaFor(db, provider, e);
      if (!m || m.church !== church) { console.warn("payment for an unknown checkout", church, e); continue; }
      await settle(db, m, e.amount, e.payRef, e.subscription);
    } else if (e.type === "refunded") await refunded(db, church, e.payRef);
    else if (e.type === "ended") await ended(db, church, e.subscription);
  }
}

export async function settle(db: SupabaseClient, m: Meta, amount: number, payRef: string, subscription?: string) {
  if (!m?.church || !payRef) return;
  const at = new Date().toISOString();
  const { error } = await db.from("payments").insert({ id: payRef, church_id: m.church, kind: m.kind, ref: m.ref, user_id: m.user || null, amount, status: "paid", data: m });
  if (error?.code === "23505") return;   // already recorded
  if (error) throw new Error(error.message);
  if (m.checkout) await db.from("checkouts").update({ status: "paid" }).eq("id", m.checkout);
  const { data: church } = await db.from("churches").select("id, name, data").eq("id", m.church).maybeSingle();
  const to = { userId: m.user || "", email: m.email || "", phone: m.phone || "" };
  if (m.kind === "gift") {
    // A gift at a kiosk may have no account behind it: it carries the name they typed, if any.
    const { data: prof } = m.user ? await db.from("profiles").select("name").eq("id", m.user).maybeSingle() : { data: null };
    await db.from("records").insert({ kind: "gifts", id: payRef, church_id: m.church, owner: m.user || null,
      data: { by: m.user || null, name: prof?.name || m.name || "A kiosk gift", fundId: m.fund, amount, frequency: m.frequency || "once", method: m.method || "card", at, status: "paid", ref: payRef, provider: m.provider || "stripe", ...(m.kiosk ? { kiosk: m.kiosk } : {}) } });
    // deno-lint-ignore no-explicit-any
    const fund = (church?.data?.funds || []).find((f: any) => f.id === m.fund)?.name || "General fund";
    if (church) await deliver(db, church as Church, "receipts", to, { title: `Thank you for your ${money(amount)} gift`, notifyKind: "give", id: `n-rcpt-${payRef}`,
      lines: [`We received your ${money(amount)} gift to ${fund}${m.frequency && m.frequency !== "once" ? ` (${m.frequency})` : ""} on ${dateText(at, zoneOf(church))}.`, `Receipt ${payRef.replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase()}.`, church.data?.taxId ? `${church.name} is tax-exempt (EIN ${church.data.taxId}). No goods or services were provided in exchange for this gift.` : ""].filter(Boolean),
      link: m.user ? `${appBase(m.origin)}#receipt-gift~${payRef}` : "", linkLabel: "See your receipt" }).catch((e) => console.error("receipt not sent", e));
    if (subscription && !(await patchRecord(db, "recurring", subscription, { lastAt: at, active: true }))) {
      await db.from("records").insert({ kind: "recurring", id: subscription, church_id: m.church, owner: m.user,
        data: { by: m.user, fundId: m.fund, amount, frequency: m.frequency, method: m.method || "card", at, lastAt: at, active: true, subscriptionId: subscription,
          provider: m.provider || "stripe", ...(m.connect ? { connect: m.connect } : {}) } });
    }
  }
  if (m.kind === "event") {
    // Each payment toward tickets is its own record, so a part now and the rest later (or in cash) add up.
    // A walk-in who paid at a kiosk is the payer; m.user is only set for someone with an account.
    const eventId = m.ref.split("~")[0], payer = m.payer || m.user;
    await db.from("records").upsert({ kind: "ticketPayments", id: payRef, church_id: m.church, owner: payer,
      data: { id: payRef, churchId: m.church, eventId, regId: m.ref, payerId: payer, amount, method: "app", status: "paid", at, ref: payRef, provider: m.provider || "stripe", receipts: [], ...(m.kiosk ? { kiosk: m.kiosk, via: m.via || "" } : {}) } },
      { onConflict: "kind,id", ignoreDuplicates: true });
    const left = await ticketBalance(db, m.ref);
    const { data: reg } = await db.from("records").select("data").eq("kind", "event_regs").eq("id", m.ref).maybeSingle();
    const code = reg?.data?.code || Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => "ACDEFHJKLMNPQRTUVWXY34679"[b % 25]).join("");
    await patchRecord(db, "event_regs", m.ref, { paid: { status: left > 0.004 ? "partial" : "paid", ref: payRef, at, tracked: true }, code, held: false });
    const { data: ev } = await db.from("records").select("data").eq("kind", "events").eq("id", eventId).maybeSingle();
    if (church) {
      const who = { ...to, email: to.email || reg?.data?.email || "", phone: to.phone || reg?.data?.phone || "" }, link = `${appBase(m.origin)}#ticket-${eventId}~${payer}~${code}`;
      await deliver(db, church as Church, "receipts", who, { title: left > 0.004 ? "Payment received" : "You're in", notifyKind: "event", id: `n-rcpt-${payRef}`,
        lines: [`We received ${money(amount)} for ${ev?.data?.title || "your tickets"}.${left > 0.004 ? ` ${money(left)} left to pay.` : " Paid in full."}`, `Receipt ${payRef.replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase()}.`],
        link, linkLabel: "Your ticket" }).catch((e) => console.error("receipt not sent", e));
      // The receipt carries the ticket link, so the ticket only goes separately by ways the receipt didn't use.
      const sentWith = routeOf(church as Church, "receipts"), ticketWays = routeOf(church as Church, "tickets").filter((ch) => ch !== "push" && !sentWith.includes(ch));
      if (ticketWays.length) await deliver(db, { ...church, data: { ...church.data, messaging: { ...church.data?.messaging, tickets: ticketWays } } } as Church, "tickets", who,
        { title: `Your ticket: ${ev?.data?.title || "event"}`, id: `n-tkt-${payRef}`, lines: [`Show this ticket at the door. Ticket code ${code}.`], link, linkLabel: "Open your ticket" }).catch((e) => console.error("ticket not sent", e));
    }
  }
  if (m.kind === "form") await patchRecord(db, "formResponses", m.ref, { paid: { status: "paid", ref: payRef, at } });
}

export async function refunded(db: SupabaseClient, church: string, payRef: string) {
  const { data: pay } = await db.from("payments").select("*").eq("id", payRef).eq("church_id", church).maybeSingle();
  if (!pay || pay.status === "refunded") return;
  const at = new Date().toISOString();
  await db.from("payments").update({ status: "refunded" }).eq("id", payRef);
  if (pay.kind === "gift") await patchRecord(db, "gifts", payRef, { status: "refunded" });
  if (pay.kind === "event") {
    await patchRecord(db, "ticketPayments", payRef, { status: "refunded", refundedAt: at });
    const left = await ticketBalance(db, pay.ref), { data: reg } = await db.from("records").select("data").eq("kind", "event_regs").eq("id", pay.ref).maybeSingle();
    const total = Number(reg?.data?.total || 0);
    await patchRecord(db, "event_regs", pay.ref, { paid: { status: left <= 0.004 ? "paid" : left < total ? "partial" : "refunded", ref: payRef, at, tracked: true } });
  }
  if (pay.kind === "form") await patchRecord(db, "formResponses", pay.ref, { paid: { status: "refunded", ref: payRef, at } });
}

export async function ended(db: SupabaseClient, church: string, subscription: string) {
  const { data: rec } = await db.from("records").select("church_id").eq("kind", "recurring").eq("id", subscription).maybeSingle();
  if (rec?.church_id === church) await patchRecord(db, "recurring", subscription, { active: false, endedAt: new Date().toISOString() });
}

/** What's still owed on one sign-up: its tickets' total less every payment that counts (in the app, cash and checks). */
export async function ticketBalance(db: SupabaseClient, regId: string): Promise<number> {
  const [{ data: reg }, { data: pays }] = await Promise.all([
    db.from("records").select("data").eq("kind", "event_regs").eq("id", regId).maybeSingle(),
    db.from("records").select("data").eq("kind", "ticketPayments").eq("data->>regId", regId)]);
  if (!reg) return 0;
  // deno-lint-ignore no-explicit-any
  const paid = (pays || []).map((p: any) => p.data).filter((p: any) => p.status === "paid" || p.status === "test").reduce((n: number, p: any) => n + Number(p.amount || 0), 0);
  const d = reg.data, legacy = !d.paid?.tracked && d.paid?.status === "paid" && !(pays || []).length ? Number(d.total || 0) : 0;
  return Math.max(0, Math.round((Number(d.total || 0) - paid - legacy) * 100) / 100);
}
