// Runs every hour (pg_cron). Adds a reminder the day before someone serves or goes to an event they signed up for.
// Each reminder has a fixed ID, so running twice never sends two.
import { admin, handle, json, notify } from "../_shared/util.ts";

handle(async () => {
  const db = admin(), now = Date.now(), soon = (t: number) => t > now && t - now < 30 * 3600e3;
  let made = 0;
  const { data: asg } = await db.from("records").select("id, church_id, owner, data").eq("kind", "assignments").eq("data->>status", "accepted");
  for (const a of asg || []) {
    const p = a.data._stub; if (!p?.date || !a.owner) continue;
    const t = new Date(`${p.date}T${p.time || "09:00"}`).getTime();
    if (soon(t)) { await notify(db, a.church_id, a.owner, { kind: "serve", title: "You're serving tomorrow", body: `${a.data.position} on the ${a.data.team} team, ${p.title} at ${p.time}`, link: "#serving" }, `rem-serve-${a.id}`); made++; }
  }
  const { data: events } = await db.from("records").select("id, church_id, data").eq("kind", "events").gte("data->>start", new Date(now).toISOString()).lte("data->>start", new Date(now + 30 * 3600e3).toISOString());
  for (const e of events || []) {
    const { data: regs } = await db.from("records").select("id, owner").eq("kind", "event_regs").eq("data->>_parent", e.id);
    for (const r of regs || []) if (r.owner) { await notify(db, e.church_id, r.owner, { kind: "event", title: `Coming up: ${e.data.title}`, body: `${e.data.location || ""}`, link: `#event-${e.id}` }, `rem-event-${r.id}`); made++; }
  }
  return json({ made });
});
