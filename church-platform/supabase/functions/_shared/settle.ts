// Records payments in the app once a processor reports them: gifts, recurring gifts, event tickets and form fees.
// Every step can run twice (a webhook and the return page both report the same payment), so each checks first.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { notify, patchRecord } from "./util.ts";
import type { PayEvent } from "./payments.ts";

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
  if (m.kind === "gift") {
    const { data: prof } = await db.from("profiles").select("name").eq("id", m.user).maybeSingle();
    await db.from("records").insert({ kind: "gifts", id: payRef, church_id: m.church, owner: m.user,
      data: { by: m.user, name: prof?.name || "Someone", fundId: m.fund, amount, frequency: m.frequency || "once", method: m.method || "card", at, status: "paid", ref: payRef, provider: m.provider || "stripe" } });
    if (subscription && !(await patchRecord(db, "recurring", subscription, { lastAt: at, active: true }))) {
      await db.from("records").insert({ kind: "recurring", id: subscription, church_id: m.church, owner: m.user,
        data: { by: m.user, fundId: m.fund, amount, frequency: m.frequency, method: m.method || "card", at, lastAt: at, active: true, subscriptionId: subscription,
          provider: m.provider || "stripe", ...(m.connect ? { connect: m.connect } : {}) } });
    }
  }
  if (m.kind === "event") {
    await patchRecord(db, "event_regs", m.ref, { paid: { status: "paid", ref: payRef, at } });
    await notify(db, m.church, m.user, { kind: "event", title: "You're in", body: `Payment received: $${amount.toFixed(2)}`, link: `#event-${m.ref.split("~")[0]}` });
  }
  if (m.kind === "form") await patchRecord(db, "formResponses", m.ref, { paid: { status: "paid", ref: payRef, at } });
}

export async function refunded(db: SupabaseClient, church: string, payRef: string) {
  const { data: pay } = await db.from("payments").select("*").eq("id", payRef).eq("church_id", church).maybeSingle();
  if (!pay || pay.status === "refunded") return;
  const at = new Date().toISOString();
  await db.from("payments").update({ status: "refunded" }).eq("id", payRef);
  if (pay.kind === "gift") await patchRecord(db, "gifts", payRef, { status: "refunded" });
  if (pay.kind === "event") await patchRecord(db, "event_regs", pay.ref, { paid: { status: "refunded", ref: payRef, at } });
  if (pay.kind === "form") await patchRecord(db, "formResponses", pay.ref, { paid: { status: "refunded", ref: payRef, at } });
}

export async function ended(db: SupabaseClient, church: string, subscription: string) {
  const { data: rec } = await db.from("records").select("church_id").eq("kind", "recurring").eq("id", subscription).maybeSingle();
  if (rec?.church_id === church) await patchRecord(db, "recurring", subscription, { active: false, endedAt: new Date().toISOString() });
}
