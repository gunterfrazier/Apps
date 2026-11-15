// Shared helpers for Our Faithful Church App's server functions (Supabase Edge Functions, Deno).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
export const fail = (error: string, status = 400) => json({ error }, status);
export const env = (k: string, fallback = "") => Deno.env.get(k) ?? fallback;

// Supabase gives functions the new keys as JSON ({"default": "sb_..."}) and, until they're retired, the legacy ones.
const named = (k: string) => { try { return JSON.parse(env(k, "{}")).default || ""; } catch { return ""; } };
export const secretKey = () => named("SUPABASE_SECRET_KEYS") || env("SUPABASE_SERVICE_ROLE_KEY");
export const publishableKey = () => named("SUPABASE_PUBLISHABLE_KEYS") || env("SUPABASE_ANON_KEY");

/** Acts as the server: bypasses row-level security. Only use after checking who's asking. */
export const admin = (): SupabaseClient => createClient(env("SUPABASE_URL"), secretKey(), { auth: { persistSession: false } });

/** The signed-in person making the request, and a client that acts as them so security rules apply. */
export async function caller(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const client = createClient(env("SUPABASE_URL"), publishableKey(), { global: { headers: token ? { Authorization: `Bearer ${token}` } : {} }, auth: { persistSession: false } });
  // getUser checks the session token with Supabase Auth, so functions don't need the platform's JWT check.
  const { data } = token && !token.startsWith("sb_") ? await client.auth.getUser(token) : { data: { user: null } };
  return { user: data.user, client };
}
/** Does the caller's role at this church include the permission? Uses the same can() as the security rules. */
export async function can(client: SupabaseClient, church: string, perm: string) {
  const { data } = await client.rpc("can", { c: church, perm });
  return data === true;
}
/** For functions run on a schedule: pg_cron sends the shared CRON_SECRET (see cron.sql). */
export const fromCron = (req: Request) => !!env("CRON_SECRET") && req.headers.get("x-cron-secret") === env("CRON_SECRET");
export function handle(fn: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try { return await fn(req); } catch (e) { console.error(e); return fail((e as Error).message || "Something went wrong", 500); }
  });
}
export const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
export async function hmacHex(secret: string, text: string, hash = "SHA-256") {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function hmacBase64(secret: string, text: string, hash = "SHA-256") {
  const hex = await hmacHex(secret, text, hash);
  return btoa(String.fromCharCode(...hex.match(/../g)!.map((h) => parseInt(h, 16))));
}
/** Merge a patch into one record's data. */
export async function patchRecord(db: SupabaseClient, kind: string, id: string, patch: Record<string, unknown>) {
  const { data: row } = await db.from("records").select("data").eq("kind", kind).eq("id", id).maybeSingle();
  if (!row) return false;
  await db.from("records").update({ data: { ...row.data, ...patch } }).eq("kind", kind).eq("id", id);
  return true;
}
/** Adds a notification for one person; the push function sends it to their devices. */
export async function notify(db: SupabaseClient, church: string, userId: string, n: { kind: string; title: string; body: string; link: string }, id = `n-${uid()}`) {
  await db.from("records").upsert({ kind: "notifications", id, church_id: church, owner: userId, data: { churchId: church, userId, at: new Date().toISOString(), read: false, ...n } }, { onConflict: "kind,id", ignoreDuplicates: true });
}

// ---------- Email ----------
// Server functions send email through one of two senders, set as function secrets:
//   RESEND_API_KEY   an email API (resend.com), or
//   SMTP_HOST, SMTP_USER, SMTP_PASS   a mailbox such as Gmail (smtp.gmail.com with an app password). SMTP_PORT is 465
//                    unless you set it; functions can't reach ports 25 and 587.
// EMAIL_FROM is the sender shown, like "Our Faithful Church App <hello@example.org>"; it defaults to SMTP_USER.
// Email a person sends from the app comes from their own name at EMAIL_PERSONAL_DOMAIN (or EMAIL_FROM's domain), like
// "Gunter Frazier <gunterfrazier@mail.ourfaithfulchurch.com>", with replies to their real address. The domain must be
// verified in Resend. Keep EMAIL_RESERVED and the name rule in step with src/js/84-email.js.
const EMAIL_RESERVED = ["admin", "administrator", "abuse", "postmaster", "hostmaster", "webmaster", "noreply", "support", "security", "billing", "help", "hello", "info", "office", "pastor", "staff", "root", "mailer", "team", "church"];
export function personalFrom(name: string): string | undefined {
  const domain = env("EMAIL_PERSONAL_DOMAIN") || (env("EMAIL_FROM").match(/@([A-Za-z0-9.-]+)>?\s*$/) || [])[1];
  if (!domain) return undefined;
  let local = String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40) || "member";
  if (EMAIL_RESERVED.includes(local)) local += ".member";
  const shown = String(name || "A member").replace(/["<>\r\n]/g, "").slice(0, 60).trim() || "A member";
  return `"${shown}" <${local}@${domain}>`;
}
export const emailReady = () => !!env("RESEND_API_KEY") || (!!env("SMTP_HOST") && !!env("SMTP_USER") && !!env("SMTP_PASS"));
/** Sends one email. False when no sender is set up or the send failed (the reason is in the function's log). */
export async function sendEmail(to: string, subject: string, text: string, html?: string, replyTo?: string, fromOverride?: string): Promise<boolean> {
  // A personal address only works through Resend; a mailbox (SMTP) can only send as itself.
  const from = (env("RESEND_API_KEY") && fromOverride) || env("EMAIL_FROM") || env("SMTP_USER");
  try {
    if (env("RESEND_API_KEY")) {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }) });
      if (!r.ok) console.error("email not sent", r.status, await r.text());
      return r.ok;
    }
    if (!emailReady()) return false;
    const { default: nodemailer } = await import("npm:nodemailer@6.9.16");
    const port = Number(env("SMTP_PORT", "465"));
    const mailer = nodemailer.createTransport({ host: env("SMTP_HOST"), port, secure: port === 465, auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") } });
    await mailer.sendMail({ from, to, subject, text, html, replyTo });
    return true;
  } catch (e) { console.error("email not sent", (e as Error).message); return false; }
}
