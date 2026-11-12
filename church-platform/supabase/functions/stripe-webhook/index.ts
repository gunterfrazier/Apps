// Stripe calls this (as a Connect webhook) when money moves. It records gifts, marks tickets and form fees paid,
// keeps recurring gifts in step, and notes refunds and each church's Stripe status.
import { admin, env, fail, json, notify, patchRecord } from "../_shared/util.ts";
import { cryptoProvider, stripe } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  let event;
  try { event = await stripe.webhooks.constructEventAsync(await req.text(), req.headers.get("stripe-signature") ?? "", env("STRIPE_WEBHOOK_SECRET"), undefined, cryptoProvider); }
  catch (e) { return fail(`Bad signature: ${(e as Error).message}`, 400); }
  const db = admin(), acct = event.account;
  const o: any = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      if (o.payment_status !== "paid" && o.mode !== "subscription") break;   // bank payments finish later, on checkout.session.async_payment_succeeded
      await settle(db, o.metadata, o.amount_total / 100, o.payment_intent || o.invoice, o.subscription);
      break;
    }
    case "checkout.session.async_payment_succeeded": await settle(db, o.metadata, o.amount_total / 100, o.payment_intent, o.subscription); break;
    case "invoice.paid": {
      if (!o.subscription || o.billing_reason === "subscription_create") break;   // the first payment came with checkout
      const sub = await stripe.subscriptions.retrieve(o.subscription, { stripeAccount: acct });
      await settle(db, sub.metadata, o.amount_paid / 100, o.payment_intent, o.subscription);
      break;
    }
    case "customer.subscription.deleted": await patchRecord(db, "recurring", o.id, { active: false, endedAt: new Date().toISOString() }); break;
    case "charge.refunded": {
      const pi = o.payment_intent;
      const { data: pay } = await db.from("payments").select("*").eq("id", pi).maybeSingle();
      if (pay) {
        await db.from("payments").update({ status: "refunded" }).eq("id", pi);
        if (pay.kind === "gift") await patchRecord(db, "gifts", pi, { status: "refunded" });
        if (pay.kind === "event") await patchRecord(db, "event_regs", pay.ref, { paid: { status: "refunded", ref: pi, at: new Date().toISOString() } });
        if (pay.kind === "form") await patchRecord(db, "formResponses", pay.ref, { paid: { status: "refunded", ref: pi, at: new Date().toISOString() } });
      }
      break;
    }
    case "account.updated": {
      const { data: c } = await db.from("churches").select("id, data").eq("data->stripe->>accountId", o.id).maybeSingle();
      if (c) await db.from("churches").update({ data: { ...c.data, stripe: { accountId: o.id, chargesEnabled: !!o.charges_enabled, payoutsEnabled: !!o.payouts_enabled } } }).eq("id", c.id);
      break;
    }
  }
  return json({ received: true });
});

async function settle(db: any, m: Record<string, string>, amount: number, payRef: string, subscription?: string) {
  if (!m?.church || !payRef) return;
  const at = new Date().toISOString();
  const { error } = await db.from("payments").insert({ id: payRef, church_id: m.church, kind: m.kind, ref: m.ref, user_id: m.user, amount, status: "paid", data: m });
  if (error?.code === "23505") return;   // already recorded: Stripe can send an event twice
  if (m.kind === "gift") {
    const { data: prof } = await db.from("profiles").select("name").eq("id", m.user).maybeSingle();
    await db.from("records").insert({ kind: "gifts", id: payRef, church_id: m.church, owner: m.user,
      data: { by: m.user, name: prof?.name || "Someone", fundId: m.fund, amount, frequency: m.frequency || "once", method: m.method || "card", at, status: "paid", ref: payRef } });
    if (subscription) await db.from("records").upsert({ kind: "recurring", id: subscription, church_id: m.church, owner: m.user,
      data: { by: m.user, fundId: m.fund, amount, frequency: m.frequency, method: m.method || "card", at, lastAt: at, active: true, subscriptionId: subscription } }, { onConflict: "kind,id" });
  }
  if (m.kind === "event") {
    await patchRecord(db, "event_regs", m.ref, { paid: { status: "paid", ref: payRef, at } });
    await notify(db, m.church, m.user, { kind: "event", title: "You're in", body: `Payment received: $${amount.toFixed(2)}`, link: `#event-${m.ref.split("~")[0]}` });
  }
  if (m.kind === "form") await patchRecord(db, "formResponses", m.ref, { paid: { status: "paid", ref: payRef, at } });
}
