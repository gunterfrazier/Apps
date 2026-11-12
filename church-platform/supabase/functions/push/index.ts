// Sends a push notification to someone's devices when a notification record is added for them.
// Set up as a Database Webhook on records (insert) with the header x-hook-secret (see SETUP.md).
import webpush from "npm:web-push@3.6.7";
import { admin, env, fail, json } from "../_shared/util.ts";

webpush.setVapidDetails(env("VAPID_SUBJECT", "mailto:admin@example.com"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

Deno.serve(async (req) => {
  if (req.headers.get("x-hook-secret") !== env("PUSH_HOOK_SECRET")) return fail("Not allowed", 401);
  const { record } = await req.json();
  if (record?.kind !== "notifications" || !record.owner) return json({ skipped: true });
  const db = admin(), n = record.data;
  const [{ data: subs }, { data: priv }] = await Promise.all([
    db.from("push_subscriptions").select("*").eq("user_id", record.owner),
    db.from("profile_private").select("data").eq("user_id", record.owner).maybeSingle()]);
  const prefs = priv?.data?.prefs || {};
  if (prefs.push === false) return json({ skipped: "off" });
  const group = ({ serve: "serve", chat: "chat", news: "news", event: "event", form: "staff", follow: "staff", room: "staff" } as Record<string, string>)[n.kind];
  if (group && prefs.notify?.[group] === false) return json({ skipped: "muted" });
  // Quiet hours use the church's time zone if it has one.
  const { data: c } = await db.from("churches").select("data").eq("id", record.church_id).maybeSingle();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: c?.data?.timeZone || "America/New_York" }).format(new Date()));
  if (prefs.quiet && (hour >= 21 || hour < 7)) return json({ skipped: "quiet" });
  const payload = JSON.stringify({ title: n.title, body: n.body, url: `${env("APP_URL")}${n.link || "#alerts"}`, tag: record.id });
  let sent = 0;
  for (const s of subs || []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 60 * 60 * 12 }); sent++; }
    catch (e: any) { if (e.statusCode === 404 || e.statusCode === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint); }
  }
  return json({ sent });
});
