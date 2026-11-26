// Sends a push notification to someone's devices when a notification record is added for them.
// A trigger on records (supabase/push.sql) calls it for each new notification, with the header x-hook-secret.
//
// Keys: the first time it runs, it makes its own VAPID key pair and keeps it in Supabase Vault (push_keys_save), so
// there's nothing to generate or paste. The app asks it for the public key (GET) to subscribe people's devices.
// Keys set as function secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_HOOK_SECRET, the older setup) still win.
import webpush from "npm:web-push@3.6.7";
import { admin, cors, env, fail, json } from "../_shared/util.ts";
import { hourIn, validTz, zoneOf } from "../_shared/tz.ts";

type Config = { hooks: string[]; publicKey: string; privateKey: string };
let config: Config | null = null;
async function loadConfig(): Promise<Config> {
  if (config) return config;
  const db = admin();
  let { data } = await db.rpc("push_config");
  let keys = data?.keys;
  if (!env("VAPID_PRIVATE_KEY") && !keys?.privateKey) {
    const made = webpush.generateVAPIDKeys();
    await db.rpc("push_keys_save", { k: { publicKey: made.publicKey, privateKey: made.privateKey } });   // only the first one made is kept
    ({ data } = await db.rpc("push_config"));
    keys = data?.keys;
  }
  const publicKey = env("VAPID_PUBLIC_KEY") || keys?.publicKey || "", privateKey = env("VAPID_PRIVATE_KEY") || keys?.privateKey || "";
  const app = env("APP_URL");
  if (publicKey && privateKey) webpush.setVapidDetails(env("VAPID_SUBJECT") || (/^https:\/\//.test(app) ? app.replace(/\/$/, "") : "mailto:admin@example.com"), publicKey, privateKey);
  config = { hooks: [env("PUSH_HOOK_SECRET"), data?.hook].filter(Boolean), publicKey, privateKey };
  return config;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const cfg = await loadConfig();
  // The public key is public by design: devices need it to subscribe.
  if (req.method === "GET") return json({ publicKey: cfg.publicKey });
  if (!cfg.hooks.length || !cfg.hooks.includes(req.headers.get("x-hook-secret") || "")) return fail("Not allowed", 401);
  if (!cfg.privateKey) return fail("Push keys aren't set up", 503);
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
  // Quiet hours follow the person's own clock (the zone of the phone they last used), else the church's.
  const { data: c } = await db.from("churches").select("data").eq("id", record.church_id).maybeSingle();
  const hour = hourIn(validTz(prefs.phoneTz) ? prefs.phoneTz : zoneOf(c));
  if (prefs.quiet && (hour >= 21 || hour < 7)) return json({ skipped: "quiet" });
  const payload = JSON.stringify({ title: c?.data?.training ? `Training: ${n.title}` : n.title, body: n.body, url: `${env("APP_URL")}${n.link || "#alerts"}`, tag: record.id });
  let sent = 0;
  for (const s of subs || []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 60 * 60 * 12 }); sent++; }
    // deno-lint-ignore no-explicit-any
    catch (e: any) { if (e.statusCode === 404 || e.statusCode === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint); }
  }
  return json({ sent });
});
