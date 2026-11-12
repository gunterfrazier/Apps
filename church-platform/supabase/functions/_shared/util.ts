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
