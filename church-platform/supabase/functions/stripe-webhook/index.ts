// The platform's Stripe Connect webhook (optional; see SETUP.md). Stripe calls it for every church connected through
// the platform when money moves, and when a church's Stripe account changes. Churches that connect their own keys
// get their own webhook instead (pay-webhook).
import { admin, env, fail, json } from "../_shared/util.ts";
import { cryptoProvider, platformStripe } from "../_shared/stripe.ts";
import { stripeEvents } from "../_shared/payments.ts";
import { apply } from "../_shared/settle.ts";

Deno.serve(async (req) => {
  let event;
  try { event = await platformStripe().webhooks.constructEventAsync(await req.text(), req.headers.get("stripe-signature") ?? "", env("STRIPE_WEBHOOK_SECRET"), undefined, cryptoProvider); }
  catch (e) { return fail(`Bad signature: ${(e as Error).message}`, 400); }
  const db = admin(), acct = event.account;
  // deno-lint-ignore no-explicit-any
  const o: any = event.data.object;
  if (event.type === "account.updated") {
    const { data: c } = await db.from("churches").select("id, data").eq("data->stripe->>accountId", o.id).maybeSingle();
    if (c) await db.from("churches").update({ data: { ...c.data, stripe: { accountId: o.id, chargesEnabled: !!o.charges_enabled, payoutsEnabled: !!o.payouts_enabled } } }).eq("id", c.id);
    return json({ received: true });
  }
  const { data: c } = await db.from("churches").select("id").eq("data->stripe->>accountId", acct).maybeSingle();
  if (c) await apply(db, c.id, "stripe", stripeEvents(event));
  return json({ received: true });
});
