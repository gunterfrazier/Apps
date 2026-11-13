// Connects a church to Stripe: creates its Stripe account the first time, then sends staff to Stripe's onboarding.
import { admin, caller, can, env, fail, handle, json } from "../_shared/util.ts";
import { platformStripe } from "../_shared/stripe.ts";

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const { churchId, returnTo } = await req.json();
  if (!(await can(client, churchId, "manage.church"))) return fail("Ask someone who manages the church account to connect Stripe", 403);
  if (!env("STRIPE_SECRET_KEY")) return fail("Stripe Connect isn't set up for this app. Connect the church's own Stripe keys instead.");
  const db = admin();
  const { data: c } = await db.from("churches").select("id, name, data").eq("id", churchId).single();
  let acct = c!.data?.stripe?.accountId;
  if (!acct) {
    const a = await platformStripe().accounts.create({ type: "standard", email: c!.data?.email || user.email, business_profile: { name: c!.name, url: c!.data?.website || undefined }, metadata: { church: churchId } });
    acct = a.id;
    await db.from("churches").update({ data: { ...c!.data, stripe: { accountId: acct, chargesEnabled: false } } }).eq("id", churchId);
  } else if (c!.data.stripe.chargesEnabled) return json({ url: "https://dashboard.stripe.com/" });
  const link = await platformStripe().accountLinks.create({ account: acct, refresh_url: returnTo, return_url: returnTo, type: "account_onboarding" });
  return json({ url: link.url });
});
