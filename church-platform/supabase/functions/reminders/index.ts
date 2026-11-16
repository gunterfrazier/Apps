// Runs every hour (pg_cron). Adds a reminder the day before someone serves or goes to an event they signed up for.
// Each reminder has a fixed ID, so running twice never sends two.
import { admin, fail, fromCron, handle, json } from "../_shared/util.ts";
import { deliver, type Church } from "../_shared/messaging.ts";

handle(async (req) => {
  if (!fromCron(req)) return fail("Not allowed", 401);
  const db = admin(), now = Date.now(), soon = (t: number) => t > now && t - now < 30 * 3600e3;
  let made = 0;
  // A deactivated church sends no reminders.
  const { data: off } = await db.from("churches").select("id").eq("data->deactivation->>status", "deactivated");
  const closed = new Set((off || []).map((x) => x.id));
  // Each church chooses how reminders go out (Admin, Texting): an app notification, email, text. A reminder's fixed ID
  // is checked first, so a second run never sends a second email or text.
  const churches = new Map<string, Church>();
  const churchOf = async (id: string) => { if (!churches.has(id)) { const { data } = await db.from("churches").select("id, name, data").eq("id", id).maybeSingle(); if (data) churches.set(id, data as Church); } return churches.get(id); };
  const once = async (id: string) => !(await db.from("records").select("id").eq("kind", "notifications").eq("id", id).maybeSingle()).data && !(await db.from("records").select("id").eq("kind", "activity").eq("id", `sent-${id}`).maybeSingle()).data;
  const mark = (church: string, id: string) => db.from("records").upsert({ kind: "activity", id: `sent-${id}`, church_id: church, owner: null, data: { id: `sent-${id}`, area: "reminder", at: new Date().toISOString(), what: "Reminder sent", hidden: true } }, { onConflict: "kind,id", ignoreDuplicates: true });
  const { data: asg } = await db.from("records").select("id, church_id, owner, data").eq("kind", "assignments").eq("data->>status", "accepted");
  for (const a of asg || []) {
    const p = a.data._stub; if (!p?.date || !a.owner || closed.has(a.church_id)) continue;
    const t = new Date(`${p.date}T${p.time || "09:00"}`).getTime();
    if (soon(t)) { const id = `rem-serve-${a.id}`, c = await churchOf(a.church_id); if (!c || !(await once(id))) continue;
      await deliver(db, c, "servingReminders", { userId: a.owner }, { title: "You're serving tomorrow", lines: [`${a.data.position} on the ${a.data.team} team, ${p.title} at ${p.time}`], link: `${Deno.env.get("APP_URL") || ""}#serving`, linkLabel: "See your schedule", notifyKind: "serve", id });
      await mark(a.church_id, id); made++; }
  }
  const { data: events } = await db.from("records").select("id, church_id, data").eq("kind", "events").gte("data->>start", new Date(now).toISOString()).lte("data->>start", new Date(now + 30 * 3600e3).toISOString());
  for (const e of events || []) {
    if (closed.has(e.church_id)) continue;
    const { data: regs } = await db.from("records").select("id, owner, data").eq("kind", "event_regs").eq("data->>_parent", e.id);
    for (const r of regs || []) { const id = `rem-event-${r.id}`, c = await churchOf(e.church_id); if (!c || !(await once(id))) continue;
      await deliver(db, c, "eventReminders", { userId: r.owner || "", email: r.data?.email || "", phone: r.data?.phone || "" }, { title: `Coming up: ${e.data.title}`, lines: [[e.data.location, new Date(e.data.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: c.data?.timeZone || "America/New_York" })].filter(Boolean).join(", ")], link: `${Deno.env.get("APP_URL") || ""}#event-${e.id}`, linkLabel: "See the event", notifyKind: "event", id });
      await mark(e.church_id, id); made++; }
  }
  return json({ made });
});
