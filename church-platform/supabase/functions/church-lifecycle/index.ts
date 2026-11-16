// Deactivated church accounts: the emails, and the clean-up the database can't do by itself.
// The database does the rest on its own (church_lifecycle_tick in schema.sql): the in-app reminders, and removing a
// church's data once it has been deactivated for a year.
//   From the hourly schedule (a one-time pass in x-cron-token, or CRON_SECRET in x-cron-secret): whatever is due, for every church.
//   From the app, signed in: { churchId }, right after someone asks, deactivates or reactivates, so the email goes out now.
// What it sends, always to the sign-in email address of the church's primary account holder:
//   someone asked to deactivate the account; the account is deactivated; reminders with 180, 90, 30, 14, 7, 3 and 1
//   days left; the account is active again; the data has been deleted.
// It also stops the church's recurring gifts when the account is deactivated, and deletes its uploaded files at the end.
import { admin, caller, emailReady, env, fail, fromCron, handle, json, sendEmail } from "../_shared/util.ts";
import { emailHtml, emailText } from "../_shared/email.ts";
import { keysFor, PROCESSORS } from "../_shared/payments.ts";
import { DEFAULT_TZ, longDateText, zoneOf } from "../_shared/tz.ts";

const MARKS = [180, 90, 30, 14, 7, 3, 1], DAY = 86400e3;
// Dates in the church's own zone (a purged church's settings are gone, so those use the default).
const day = (iso: string, z: string = DEFAULT_TZ) => longDateText(iso, z);
const appUrl = () => { const u = env("APP_URL"); return u ? (u.endsWith("/") ? u : `${u}/`) : ""; };
const APP = "Our Faithful Church App";

type Db = ReturnType<typeof admin>;
type Church = { id: string; name: string; owner_id: string | null; data: any };
type Mail = { subject: string; lines: string[]; button?: [string, string] };
type Sent = "sent" | "already" | "off" | "failed";

// In the app's own design (_shared/email.ts): the subject as the heading, and the button when there is one.
const NO_LINK = `To act on this, open ${APP} and sign in with this email address.`;
const asEmail = (m: Mail) => ({ heading: m.subject, paragraphs: m.button ? m.lines : [...m.lines, NO_LINK], button: m.button, preheader: m.lines[0],
  footer: `You're getting this because you're the primary account holder for this church in ${APP}.` });
const asText = (m: Mail) => emailText(asEmail(m));
const asHtml = (m: Mail) => emailHtml(asEmail(m));

/** Notes that something was done for a church, once. False when it was already noted. */
async function once(db: Db, churchId: string, key: string, note = ""): Promise<boolean> {
  const { error } = await db.from("lifecycle_emails").insert({ church_id: churchId, key, note });
  return !error;
}
/** Emails the primary account holder, once per key. A failed send is forgotten so the next hour tries again. */
async function mail(db: Db, churchId: string, key: string, ownerId: string | null, m: Mail): Promise<Sent> {
  if (!emailReady()) return "off";
  if (!(await once(db, churchId, key))) return "already";
  const to = ownerId ? (await db.auth.admin.getUserById(ownerId)).data.user?.email : null;
  if (to && await sendEmail(to, m.subject, asText(m), asHtml(m))) return "sent";
  await db.from("lifecycle_emails").delete().eq("church_id", churchId).eq("key", key);
  return "failed";
}

/** Stops the church's recurring gifts with their payment processors: givers can't see or stop them in the app any more. */
async function stopRecurring(db: Db, c: Church, at: string): Promise<string> {
  const key = `recurring-${at}`;
  if (!(await once(db, c.id, key))) return (await db.from("lifecycle_emails").select("note").eq("church_id", c.id).eq("key", key).maybeSingle()).data?.note || "";
  const { data: recs } = await db.from("records").select("id, data").eq("kind", "recurring").eq("church_id", c.id);
  let stopped = 0, failed = 0;
  for (const r of recs || []) {
    if (r.data?.active === false) continue;
    try {
      if (!r.data?.test) {   // a practice gift has nothing at a processor
        const provider = r.data?.provider || "stripe", keys = await keysFor(db, c, r.data);
        if (!keys || !PROCESSORS[provider]) throw new Error(`${provider} is not connected`);
        await PROCESSORS[provider].cancel(keys, r.id);
      }
      await db.from("records").update({ data: { ...r.data, active: false, endedAt: new Date().toISOString(), endedBy: "deactivation" } }).eq("kind", "recurring").eq("id", r.id);
      stopped++;
    } catch (e) { failed++; console.error("recurring gift not stopped", r.id, (e as Error).message); }
  }
  const note = failed ? `${failed}` : "";
  if (note) await db.from("lifecycle_emails").update({ note }).eq("church_id", c.id).eq("key", key);
  console.log(`recurring gifts at ${c.id}: ${stopped} stopped, ${failed} failed`);
  return note;
}

/** Everything due for one church. */
async function tend(db: Db, c: Church) {
  const d = c.data?.deactivation, out: Record<string, string> = {}, link = appUrl();
  if (!d) return out;
  if (d.status === "requested") {
    out.email = await mail(db, c.id, `ask-${d.requestedAt}`, c.owner_id, {
      subject: `${d.requestedByName || "An administrator"} asked to deactivate ${c.name}`,
      lines: [`${d.requestedByName || "An administrator"} asked to deactivate the church account for ${c.name} in ${APP}.${d.reason ? ` Their reason: "${d.reason}"` : ""}`,
        "Nothing changes unless you approve it. If you approve, the church is hidden from everyone but you, and removed from the list of churches in the app. You could reactivate it for one year; after that its data is permanently deleted."],
      button: link ? ["Review the request", `${link}#admin-deactivate`] : undefined });
  } else if (d.status === "deactivated") {
    const unstopped = await stopRecurring(db, c, d.at);
    out.email = await mail(db, c.id, `done-${d.at}`, c.owner_id, {
      subject: `${c.name} is deactivated`,
      lines: [`The church account for ${c.name} in ${APP} was deactivated on ${day(d.at, zoneOf(c))}.`,
        "It is now hidden from everyone but you, and no longer in the list of churches in the app. Its recurring gifts have been stopped.",
        ...(unstopped ? [`${unstopped} recurring ${unstopped === "1" ? "gift" : "gifts"} could not be stopped automatically. Please stop ${unstopped === "1" ? "it" : "them"} in your payment processor's dashboard.`] : []),
        `You can reactivate it any time before ${day(d.purgeAt, zoneOf(c))}. On that date, everything in the account is permanently deleted and cannot be brought back.`,
        "We will remind you by email and in the app before then."],
      button: link ? ["Reactivate the account", `${link}#reactivate-${c.id}`] : undefined });
    const left = Math.ceil((new Date(d.purgeAt).getTime() - Date.now()) / DAY), mark = MARKS.filter((m) => m >= left).sort((a, b) => a - b)[0];
    if (left > 0 && mark) out.reminder = await mail(db, c.id, `m${mark}-${d.at}`, c.owner_id, {
      subject: `${c.name} will be permanently deleted in ${left} ${left === 1 ? "day" : "days"}`,
      lines: [`The church account for ${c.name} in ${APP} has been deactivated since ${day(d.at, zoneOf(c))}.`,
        `On ${day(d.purgeAt, zoneOf(c))}, ${left === 1 ? "tomorrow" : `${left} days from now`}, everything in it is permanently deleted from the app: members, giving records, sermons, events, groups and all the rest. This cannot be undone.`,
        "To keep the account, reactivate it before then. Everything comes back as it was."],
      button: link ? ["Reactivate the account", `${link}#reactivate-${c.id}`] : undefined });
  } else if (d.status === "active" && d.reactivatedAt && Date.now() - new Date(d.reactivatedAt).getTime() < 2 * DAY) {
    out.email = await mail(db, c.id, `back-${d.reactivatedAt}`, c.owner_id, {
      subject: `${c.name} is active again`,
      lines: [`The church account for ${c.name} in ${APP} was reactivated on ${day(d.reactivatedAt, zoneOf(c))}. Members can see it again and it is back in the list of churches.`,
        "Recurring gifts were stopped when the account was deactivated, so givers will need to set them up again. Screens and kiosks need to be paired again."],
      button: link ? ["Open the app", link] : undefined });
  }
  return out;
}

/** Deletes every file a church uploaded (they live under a folder named for the church). */
async function clearFiles(db: Db, churchId: string): Promise<boolean> {
  const bucket = db.storage.from("media"), paths: string[] = [], folders = [churchId];
  while (folders.length) {
    const dir = folders.pop()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(dir, { limit: 1000, offset });
      if (error) { console.error("files not listed", dir, error.message); return false; }
      for (const f of data || []) (f.id ? paths : folders).push(`${dir}/${f.name}`);
      if ((data || []).length < 1000) break;
    }
  }
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await bucket.remove(paths.slice(i, i + 100));
    if (error) { console.error("files not removed", churchId, error.message); return false; }
  }
  return true;
}
/** Churches whose data the database has already removed: clear their files and tell the primary account holder. */
async function finish(db: Db) {
  const { data: gone } = await db.from("purged_churches").select("*");
  let finished = 0;
  for (const g of gone || []) {
    let { emailed, files_removed } = g;
    if (!files_removed && await clearFiles(db, g.id)) files_removed = true;
    if (!emailed) {
      const sent = await mail(db, g.id, "gone", g.owner_id, {
        subject: `${g.name} has been permanently deleted`,
        lines: [`The church account for ${g.name} in ${APP} was deactivated${g.deactivated_at ? ` on ${day(g.deactivated_at)}` : ""} and was not reactivated within a year.`,
          "As we said it would be, everything in the account has now been permanently deleted. It cannot be brought back.",
          "Your own sign-in still works, and you are welcome to register the church again."] });
      emailed = sent !== "failed";   // with no email sender set up there is nothing to send
    }
    if (emailed && files_removed) { await db.from("lifecycle_emails").delete().eq("church_id", g.id); await db.from("purged_churches").delete().eq("id", g.id); finished++; }
    else await db.from("purged_churches").update({ emailed, files_removed }).eq("id", g.id);
  }
  return finished;
}

handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  const db = admin();
  // The hourly schedule proves itself with a pass the database made a moment ago (used once), or the shared CRON_SECRET.
  let scheduled = fromCron(req);
  const pass = req.headers.get("x-cron-token") || "";
  if (!scheduled && /^[0-9a-f-]{36}$/i.test(pass)) {
    const { data } = await db.from("cron_calls").delete().eq("token", pass).gte("at", new Date(Date.now() - 10 * 60e3).toISOString()).select("token");
    scheduled = !!data?.length;
  }
  if (scheduled) {
    const { data: churches } = await db.from("churches").select("id, name, owner_id, data").in("data->deactivation->>status", ["requested", "deactivated", "active"]);
    const results: Record<string, unknown> = {};
    for (const c of churches || []) { const r = await tend(db, c); if (Object.keys(r).length) results[c.id] = r; }
    return json({ churches: results, finished: await finish(db), emailReady: emailReady() });
  }
  // From the app: one church, for someone who belongs to it.
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const { data: c } = await db.from("churches").select("id, name, owner_id, data").eq("id", String(body.churchId || "")).maybeSingle();
  if (!c) return fail("Church not found", 404);
  if (c.owner_id !== user.id && (await client.rpc("is_member", { c: c.id })).data !== true) return fail("That isn't your church", 403);
  return json({ ...(await tend(db, c)), emailReady: emailReady() });
});
