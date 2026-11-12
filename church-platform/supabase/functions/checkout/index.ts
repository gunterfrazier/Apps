// Starts a Stripe Checkout page on the church's own connected account: gifts (once or recurring), event tickets, form fees.
// Prices for tickets and forms come from the database, never from the request.
import { admin, caller, env, fail, handle, json } from "../_shared/util.ts";
import { stripe } from "../_shared/stripe.ts";

handle(async (req) => {
  const { user } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const b = await req.json();
  const db = admin();
  const { data: church } = await db.from("churches").select("id, name, data").eq("id", b.churchId).single();
  const acct = church?.data?.stripe?.accountId;
  if (!acct || !church.data.stripe.chargesEnabled) return fail("This church isn't set up for online payments yet");

  let lines: { name: string; amount: number; qty: number }[] = [];
  let meta: Record<string, string> = { church: church.id, kind: b.kind, ref: String(b.ref || ""), user: user.id };
  if (b.kind === "event") {
    const eventId = String(b.ref).split("~")[0];
    const [{ data: ev }, { data: reg }] = await Promise.all([
      db.from("records").select("data").eq("kind", "events").eq("id", eventId).single(),
      db.from("records").select("data, owner").eq("kind", "event_regs").eq("id", b.ref).single()]);
    if (!ev || !reg || reg.owner !== user.id) return fail("Sign up first");
    lines = (ev.data.tickets || []).filter((t: any) => reg.data.tickets?.[t.id]).map((t: any) => ({ name: `${ev.data.title}: ${t.name}`, amount: Number(t.price), qty: Number(reg.data.tickets[t.id]) }));
  } else if (b.kind === "form") {
    const { data: resp } = await db.from("records").select("data, owner").eq("kind", "formResponses").eq("id", b.ref).single();
    if (!resp || resp.owner !== user.id) return fail("Fill in the form first");
    const { data: form } = await db.from("records").select("data").eq("kind", "forms").eq("id", resp.data.formId).single();
    lines = [{ name: form!.data.title, amount: Number(form!.data.fee), qty: 1 }];
  } else if (b.kind === "gift") {
    const amount = Math.round(Number(b.lines?.[0]?.amount) * 100) / 100;
    if (!(amount >= 1 && amount <= 100000)) return fail("Gifts can be $1 to $100,000");
    const fund = (church.data.funds || []).find((f: any) => f.id === b.ref);
    lines = [{ name: `Gift to ${church.name}${fund ? `: ${fund.name}` : ""}`, amount, qty: 1 }];
    meta = { ...meta, fund: String(b.ref || ""), frequency: ["weekly", "monthly"].includes(b.frequency) ? b.frequency : "once", method: b.method === "bank" ? "bank" : "card" };
  } else return fail("Unknown kind of payment");

  const total = lines.reduce((n, l) => n + l.amount * l.qty, 0);
  if (!(total > 0)) return fail("Nothing to pay");
  const feePct = Number(env("PLATFORM_FEE_PERCENT", "0"));
  const recurring = b.kind === "gift" && meta.frequency !== "once";
  const back = String(b.origin || env("APP_URL"));
  const session = await stripe.checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    payment_method_types: meta.method === "bank" ? ["us_bank_account"] : ["card"],   // card includes Apple Pay and Google Pay
    customer_email: b.email || user.email,
    line_items: lines.map((l) => ({ quantity: l.qty, price_data: { currency: "usd", unit_amount: Math.round(l.amount * 100), product_data: { name: l.name },
      ...(recurring ? { recurring: { interval: meta.frequency === "weekly" ? "week" : "month" } } : {}) } })),
    metadata: meta,
    ...(recurring
      ? { subscription_data: { metadata: meta, ...(feePct ? { application_fee_percent: feePct } : {}) } }
      : { payment_intent_data: { metadata: meta, ...(feePct ? { application_fee_amount: Math.round(total * feePct) } : {}) }, submit_type: b.kind === "gift" ? "donate" : "pay" }),
    success_url: `${back}#paid-${b.kind}`,
    cancel_url: `${back}#${b.returnTo || "home"}`,
  }, { stripeAccount: acct });
  return json({ url: session.url });
});
