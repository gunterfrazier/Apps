// Texting for a church, through the church's own Twilio account. Signed in.
//   { action: "link", churchId, sid, token, from }   manage.church: checks the keys with Twilio, points the number's
//                                                     incoming texts at the sms function, saves the keys in Vault
//   { action: "unlink", churchId }                    manage.church: forgets the keys and turns texting off
//   { action: "test", churchId, to }                  manage.church: one test text
//   { action: "send", churchId, userIds, eventId?, body, audience }   send.texts: a text to each person (and, for an
//                                                     event, walk-ins who left a number), skipping numbers that replied STOP
import { admin, caller, can, env, fail, handle, json, uid } from "../_shared/util.ts";
import { e164, last10, phoneOf, sendText, textingOn, twilioKeys } from "../_shared/messaging.ts";

const MAX = 500, HOURLY = 5;

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first.", 401);
  const b = await req.json();
  const db = admin();
  const { data: church } = await db.from("churches").select("id, name, data").eq("id", b.churchId).maybeSingle();
  if (!church || church.data?.deactivation?.status === "deactivated") return fail("That church isn't available.", 404);
  if (church.data?.training) return fail("A training church can't link a real texting account.", 409);
  const save = (texting: Record<string, unknown>) => db.from("churches").update({ data: { ...church.data, texting } }).eq("id", church.id);

  if (b.action === "link") {
    if (!(await can(client, church.id, "manage.church"))) return fail("Your role doesn't include the church account.", 403);
    const sid = String(b.sid || "").trim(), token = String(b.token || "").trim(), from = String(b.from || "").trim();
    if (!/^AC[0-9a-f]{32}$/i.test(sid) || token.length < 20) return fail("Check the Account SID and Auth Token.");
    const auth = { Authorization: `Basic ${btoa(`${sid}:${token}`)}` }, api = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;
    const acct = await fetch(`${api}.json`, { headers: auth });
    if (acct.status === 401) return fail("Twilio didn't accept that Account SID and Auth Token. Copy them again from the Twilio console.");
    if (!acct.ok) return fail(`Twilio couldn't be reached (${acct.status}). Try again.`, 502);
    const account = (await acct.json()).friendly_name || "Twilio account";
    let number = from;
    // Incoming texts (STOP, START, HELP, Text to give) come to the sms function for this church.
    const inbound = `${env("SUPABASE_URL")}/functions/v1/sms?church=${encodeURIComponent(church.id)}`;
    if (/^MG/i.test(from)) {
      const ms = await fetch(`https://messaging.twilio.com/v1/Services/${from}`, { headers: auth });
      if (!ms.ok) return fail("That Messaging Service wasn't found in this Twilio account.");
      await fetch(`https://messaging.twilio.com/v1/Services/${from}`, { method: "POST", headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ InboundRequestUrl: inbound, InboundMethod: "POST" }) });
      number = (await ms.json()).friendly_name || from;
    } else {
      const found = await fetch(`${api}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164(from))}`, { headers: auth });
      const n = (await found.json().catch(() => ({})))?.incoming_phone_numbers?.[0];
      if (!n) return fail("That phone number isn't in this Twilio account. Use one listed under Phone Numbers, Active numbers.");
      if (n.capabilities && n.capabilities.sms === false) return fail("That number can't send texts. Choose a number with SMS.");
      await fetch(`${api}/IncomingPhoneNumbers/${n.sid}.json`, { method: "POST", headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ SmsUrl: inbound, SmsMethod: "POST" }) });
      const d = last10(n.phone_number); number = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    const { error } = await db.rpc("payment_key_set", { c: church.id, p: "twilio", s: JSON.stringify({ sid, token, from: /^MG/i.test(from) ? from : e164(from) }) });
    if (error) return fail(error.message, 500);
    await save({ ...(church.data.texting || {}), linked: true, number, account, practice: false, linkedAt: new Date().toISOString() });
    return json({ ok: true, number, account });
  }

  if (b.action === "unlink") {
    if (!(await can(client, church.id, "manage.church"))) return fail("Your role doesn't include the church account.", 403);
    await db.from("payment_keys").delete().eq("church_id", church.id).eq("provider", "twilio");
    await save({ optOut: church.data.texting?.optOut || [] });
    return json({ ok: true });
  }

  if (b.action === "test") {
    if (!(await can(client, church.id, "manage.church"))) return fail("Your role doesn't include the church account.", 403);
    const why = await sendText(db, church, String(b.to || ""), `${church.name}: this is a test text from Our Faithful Church App. Texting works!`);
    return why ? fail(why) : json({ ok: true });
  }

  if (b.action === "send") {
    if (!textingOn(church)) return fail("Texting is off for this church.", 409);
    if (!(await can(client, church.id, "send.texts"))) return fail("Your role doesn't include texting groups of people.", 403);
    const body = String(b.body || "").trim().slice(0, 640);
    if (!body) return fail("Write the message.");
    // A few sends an hour keeps a mistake, or a stolen sign-in, from becoming a flood.
    const since = new Date(Date.now() - 3600e3).toISOString();
    const { count } = await db.from("records").select("id", { count: "exact", head: true }).eq("church_id", church.id).eq("kind", "activity").eq("data->>area", "text").gte("data->>at", since);
    if ((count || 0) >= HOURLY) return fail("That's a lot of texts in one hour. Try again a little later.", 429);
    const { data: members } = await db.from("memberships").select("user_id").eq("church_id", church.id);
    const inChurch = new Set((members || []).map((m) => m.user_id));
    const ids = [...new Set((b.userIds || []).map(String))].filter((u) => inChurch.has(u));
    const phones = new Map<string, string>();
    for (const id of ids) { const p = await phoneOf(db, id); if (p) phones.set(last10(p), p); }
    if (b.eventId) {
      // Walk-ins who signed up at a kiosk or the door and left a mobile number.
      const { data: regs } = await db.from("records").select("data").eq("kind", "event_regs").eq("church_id", church.id).eq("data->>_parent", String(b.eventId));
      for (const r of regs || []) if (r.data.phone && !inChurch.has(r.data.by)) phones.set(last10(r.data.phone), r.data.phone);
    }
    if (!phones.size) return fail("Nobody in that list has a mobile number on file.");
    if (phones.size > MAX) return fail(`That's more than ${MAX} people. Send to smaller groups.`);
    const keys = await twilioKeys(db, church.id);
    let sent = 0, skipped = 0;
    for (const p of phones.values()) {
      const why = await sendText(db, church, p, `${church.name}: ${body}\nReply STOP to opt out.`, keys);
      if (why) skipped++; else sent++;
      await new Promise((r) => setTimeout(r, 60));
    }
    const { data: me } = await db.from("profiles").select("name").eq("id", user.id).maybeSingle();
    const at = new Date().toISOString(), id = `a-${uid()}`;
    await db.from("records").insert({ kind: "activity", id, church_id: church.id, owner: user.id,
      data: { id, churchId: church.id, by: user.id, name: me?.name || "Someone", area: "text", at, what: `Texted ${sent} ${sent === 1 ? "person" : "people"} (${String(b.audience || "a group").slice(0, 60)}): ${body.slice(0, 60)}` } });
    return json({ sent, skipped });
  }
  return fail("Unknown action");
});
