// Shared helpers for Koinonia's server functions (Supabase Edge Functions, Deno).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
export const fail = (error: string, status = 400) => json({ error }, status);
export const env = (k: string, fallback = "") => Deno.env.get(k) ?? fallback;

/** Acts as the server: bypasses row-level security. Only use after checking who's asking. */
export const admin = (): SupabaseClient => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** The signed-in person making the request, and a client that acts as them so security rules apply. */
export async function caller(req: Request) {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data } = await client.auth.getUser();
  return { user: data.user, client };
}
/** Does the caller's role at this church include the permission? Uses the same can() as the security rules. */
export async function can(client: SupabaseClient, church: string, perm: string) {
  const { data } = await client.rpc("can", { c: church, perm });
  return data === true;
}
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
