// Starts a checkout with the church's payment processor (Stripe, PayPal or Square): gifts (once or recurring),
// event tickets and form fees. Prices for tickets and forms come from the database, never from the request.
// The checkout is saved first, so the payment is recorded from these details when the processor reports it.
import { admin, caller, env, fail, handle, json, uid } from "../_shared/util.ts";
import { PayError, processorFor, saveKeys, type Line } from "../_shared/payments.ts";
import { ticketBalance } from "../_shared/settle.ts";

handle(async (req) => {
  const { user } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const b = await req.json();
  const db = admin();
  const { data: church } = await db.from("churches").select("id, name, data").eq("id", b.churchId).single();
  if (!church) return fail("Church not found", 404);
  if (church.data?.deactivation?.status === "deactivated") return fail("This church's account is deactivated, so it can't take payments.", 409);
  const via = await processorFor(db, church);
  if (!via) return fail("This church isn't set up for online payments yet");

  let lines: Line[] = [], title = "";
  const meta: Record<string, string> = { church: church.id, kind: String(b.kind), ref: String(b.ref || ""), user: user.id, provider: via.provider };
  if (b.kind === "event") {
    const eventId = String(b.ref).split("~")[0];
    const [{ data: ev }, { data: reg }] = await Promise.all([
      db.from("records").select("data").eq("kind", "events").eq("id", eventId).single(),
      db.from("records").select("data, owner").eq("kind", "event_regs").eq("id", b.ref).single()]);
    if (!ev || !reg || reg.owner !== user.id) return fail("Sign up first");
    if (ev.data.payInApp === false) return fail("This event takes payment in person.");
    // The total comes from the tickets; what's owed takes off every payment so far, in the app or in cash and checks.
    // deno-lint-ignore no-explicit-any
    lines = (ev.data.tickets || []).filter((t: any) => reg.data.tickets?.[t.id]).map((t: any) => ({ name: `${ev.data.title}: ${t.name}`, amount: Number(t.price), qty: Number(reg.data.tickets[t.id]) }));
    title = ev.data.title;
    const full = Math.round(lines.reduce((n, l) => n + l.amount * l.qty, 0) * 100) / 100, owed = await ticketBalance(db, String(b.ref));
    if (!(owed > 0)) return fail("These tickets are paid in full.");
    let amount = Math.round(Number(b.amount || owed) * 100) / 100;
    if (!(amount > 0)) return fail("Enter an amount to pay.");
    amount = Math.min(amount, owed);
    if (amount < owed && !ev.data.payPartial) amount = owed;
    const deposit = Number(ev.data.deposit || 0), firstPayment = owed >= full;
    if (firstPayment && deposit && amount < Math.min(deposit, owed)) return fail(`The first payment is at least $${Math.min(deposit, owed).toFixed(2)}.`);
    if (amount < full) lines = [{ name: `${ev.data.title}: payment toward tickets`, amount, qty: 1 }];
  } else if (b.kind === "form") {
    const { data: resp } = await db.from("records").select("data, owner").eq("kind", "formResponses").eq("id", b.ref).single();
    if (!resp || resp.owner !== user.id) return fail("Fill in the form first");
    const { data: form } = await db.from("records").select("data").eq("kind", "forms").eq("id", resp.data.formId).single();
    lines = [{ name: form!.data.title, amount: Number(form!.data.fee), qty: 1 }];
    title = form!.data.title;
  } else if (b.kind === "gift") {
    const amount = Math.round(Number(b.lines?.[0]?.amount) * 100) / 100;
    if (!(amount >= 1 && amount <= 100000)) return fail("Gifts can be $1 to $100,000");
    // deno-lint-ignore no-explicit-any
    const fund = (church.data.funds || []).find((f: any) => f.id === b.ref);
    title = `Gift to ${church.name}${fund ? `: ${fund.name}` : ""}`;
    lines = [{ name: title, amount, qty: 1 }];
    Object.assign(meta, { fund: String(b.ref || ""), frequency: ["weekly", "monthly"].includes(b.frequency) ? b.frequency : "once", method: String(b.method || "card").slice(0, 20) });
  } else return fail("Unknown kind of payment");

  lines = lines.filter((l) => l.qty > 0 && l.amount > 0);
  const total = Math.round(lines.reduce((n, l) => n + l.amount * l.qty, 0) * 100) / 100;
  if (!(total > 0)) return fail("Nothing to pay");
  const frequency = (meta.frequency || "once") as "once" | "weekly" | "monthly";
  if (frequency !== "once" && !via.recurring) return fail(`Recurring gifts aren't available with ${via.p.name}. Choose One time.`);

  const id = `co_${uid()}`;
  meta.checkout = id;
  if (via.keys.connect) meta.connect = String(via.keys.connect);
  // Processors add their own query to the return address, so the app's place goes in the query too, not after a #.
  const back = String(b.origin || env("APP_URL")).split(/[?#]/)[0];
  const to = (q: Record<string, string>) => `${back}?${new URLSearchParams(q)}`;
  const { error } = await db.from("checkouts").insert({ id, church_id: church.id, provider: via.provider, user_id: user.id, kind: meta.kind, ref: meta.ref, amount: total, meta });
  if (error) throw new Error(error.message);
  try {
    const out = await via.p.checkout(via.keys, {
      id, church: { id: church.id, name: church.name }, kind: meta.kind, title, email: b.email || user.email, lines, total, frequency,
      method: meta.method || "card", meta, successUrl: to({ paid: meta.kind, checkout: id }), cancelUrl: to({ unpaid: meta.kind, to: String(b.returnTo || "home") }),
      feePercent: Number(env("PLATFORM_FEE_PERCENT", "0")),
    });
    await db.from("checkouts").update({ provider_ref: out.ref }).eq("id", id);
    if (out.keys) await saveKeys(db, church.id, via.provider, out.keys);
    return json({ url: out.url });
  } catch (e) {
    if (e instanceof PayError) return fail(e.message, 400);
    throw e;
  }
});
