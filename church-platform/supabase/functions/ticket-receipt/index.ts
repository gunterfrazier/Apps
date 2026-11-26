// Sends a receipt for one ticket payment, by email or text. Signed in.
//   { churchId, paymentId, via: "email" | "text", to }  ->  { ok: true }
// Only people who can take payments for that event may send one: the "Take cash and check payments" or "Announcements
// and events" permission, or being named on the event to take its payments. The receipt says what was paid, how and
// to whom, and what's left. "to" defaults to what's on file: the sign-up's own email or phone, then the account's.
// Texts go out from the church's own Twilio number once it's linked and texting is on (Admin, Texting); otherwise
// this answers 503 and the app opens the text on the sender's phone instead.
import { admin, caller, can, emailReady, fail, handle, json, sendEmail } from "../_shared/util.ts";
import { emailHtml } from "../_shared/email.ts";
import { sendText, textingOn } from "../_shared/messaging.ts";
import { dateText, locationZones, zoneOf } from "../_shared/tz.ts";

const money = (n: number) => `$${Number(n || 0).toFixed(2).replace(/\.00$/, "")}`;

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first.", 401);
  const { churchId, paymentId, via, to } = await req.json();
  if (!churchId || !paymentId || !["email", "text"].includes(via)) return fail("Choose a payment and how to send the receipt.");
  const db = admin();
  const { data: payRow } = await db.from("records").select("data").eq("kind", "ticketPayments").eq("id", paymentId).eq("church_id", churchId).maybeSingle();
  if (!payRow) return fail("That payment wasn't found.", 404);
  const p = payRow.data;
  const [{ data: evRow }, { data: regRow }, { data: church }] = await Promise.all([
    db.from("records").select("data").eq("kind", "events").eq("id", p.eventId).maybeSingle(),
    db.from("records").select("data, owner").eq("kind", "event_regs").eq("id", p.regId).maybeSingle(),
    db.from("churches").select("id, name, data").eq("id", churchId).maybeSingle()]);
  if (!evRow || !regRow || !church) return fail("That sign-up wasn't found.", 404);
  const ev = evRow.data, reg = regRow.data;
  // Dates in the church's zone, or the event's campus's when it has its own.
  const zone = (ev.locationId && (await locationZones(db, churchId)).get(ev.locationId)) || zoneOf(church), day = (s: string) => dateText(s, zone);
  const allowed = (await can(client, churchId, "take.payments")) || (await can(client, churchId, "manage.content")) || (ev.collectors || []).includes(user.id);
  if (!allowed) return fail("Your role doesn't include taking payments for this event.", 403);

  // What's on file, if "to" wasn't given.
  let dest = String(to || "").trim();
  if (!dest && via === "email") dest = reg.email || (regRow.owner && !String(regRow.owner).startsWith("walkin-") ? (await db.auth.admin.getUserById(regRow.owner)).data?.user?.email || "" : "");
  if (!dest && via === "text") dest = reg.phone || (regRow.owner ? (await db.from("contacts").select("phone").eq("user_id", regRow.owner).maybeSingle()).data?.phone || "" : "");
  if (!dest) return fail(via === "email" ? "There's no email on file for them." : "There's no mobile number on file for them.");

  const { data: pays } = await db.from("records").select("data").eq("kind", "ticketPayments").eq("data->>regId", p.regId);
  // deno-lint-ignore no-explicit-any
  const paid = (pays || []).map((x: any) => x.data).filter((x: any) => x.status === "paid" || x.status === "test").reduce((n: number, x: any) => n + Number(x.amount || 0), 0);
  const total = Number(reg.total || 0), left = Math.max(0, Math.round((total - paid) * 100) / 100);
  // deno-lint-ignore no-explicit-any
  const tickets = (ev.tickets || []).filter((t: any) => reg.tickets?.[t.id]).map((t: any) => `${reg.tickets[t.id]} ${t.name}`).join(", ");
  const how = p.method === "app" ? "in the app" : p.method === "check" ? `by check${p.checkNo ? ` #${p.checkNo}` : ""}` : "in cash";
  const lines = [`${reg.name}, thank you! We received ${money(p.amount)} ${how} on ${day(p.at)}${p.method !== "app" && p.receivedByName ? `, received by ${p.receivedByName}` : ""}.`,
    `For: ${ev.title}, ${day(ev.start)}${tickets ? ` (${tickets})` : ""}.`,
    `Total ${money(total)}. Paid so far ${money(paid)}. ${left ? `Balance ${money(left)}.` : "Paid in full."}`,
    `Receipt ${String(paymentId).slice(-8).toUpperCase()}`];

  if (via === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) return fail("That email address doesn't look right.");
    if (!emailReady()) return fail("Email isn't set up for this app yet.", 503);
    const subject = `Receipt: ${ev.title}`;
    const html = emailHtml({ heading: "Payment received", paragraphs: lines, footer: `${church.name}. Keep this email as your receipt.`, preheader: lines[0].slice(0, 120),
      church: { name: church.name, color: church.data?.color, logo: church.data?.logo } });
    if (!(await sendEmail(dest, subject, `${church.name}: receipt\n\n${lines.join("\n")}`, html))) return fail("The receipt email couldn't be sent.", 502);
  } else {
    if (!textingOn(church)) return fail("Texting isn't turned on for this church", 503);
    const why = await sendText(db, church, dest, `${church.name}: receipt\n${lines.join("\n")}`);
    if (why) return fail(why, 502);
  }
  const receipts = [...(p.receipts || []), { via, to: dest, at: new Date().toISOString(), by: user.id }].slice(-20);
  await db.from("records").update({ data: { ...p, receipts } }).eq("kind", "ticketPayments").eq("id", paymentId);
  return json({ ok: true });
});
