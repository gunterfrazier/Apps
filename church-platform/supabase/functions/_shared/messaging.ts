// Texting through each church's own Twilio account, and sending a message the ways a church chose for it.
// A church links Twilio under Admin, Texting (the texting function); the keys are kept in Vault as provider "twilio":
//   { sid, token, from }   from: the church's Twilio number (E.164) or a Messaging Service SID (MG...)
// church.data.texting = { linked, enabled, number, optOut: ["7705550100", ...] }: texts only go out while enabled, and
// never to a number that replied STOP. church.data.messaging says which ways each kind of message goes out.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { emailReady, notify, sendEmail } from "./util.ts";
import { emailHtml } from "./email.ts";

export type Church = { id: string; name: string; data: Record<string, any> }; // deno-lint-ignore no-explicit-any
export type MsgKind = "receipts" | "tickets" | "eventReminders" | "servingReminders" | "groupMessages";
const DEFAULT_ROUTES: Record<MsgKind, string[]> = { receipts: ["email"], tickets: ["push", "email"], eventReminders: ["push"], servingReminders: ["push"], groupMessages: ["email"] };

export const last10 = (s: string) => String(s || "").replace(/\D/g, "").slice(-10);
export function e164(s: string): string {
  const d = String(s || "").replace(/\D/g, "");
  if (String(s).trim().startsWith("+")) return `+${d}`;
  return d.length === 10 ? `+1${d}` : d.length === 11 && d.startsWith("1") ? `+${d}` : `+${d}`;
}
export const textingOn = (c: Church) => !!c.data?.texting?.linked && !!c.data?.texting?.enabled && !c.data?.training;
/** The ways a kind of message goes out at a church: "push", "email", "text". Text only while texting is on. */
export function routeOf(c: Church, kind: MsgKind): string[] {
  const r: string[] = c.data?.messaging?.[kind] || DEFAULT_ROUTES[kind];
  return r.filter((ch) => ch !== "text" || textingOn(c));
}
export async function twilioKeys(db: SupabaseClient, churchId: string): Promise<{ sid: string; token: string; from: string } | null> {
  const { data } = await db.rpc("payment_key_get", { c: churchId, p: "twilio" });
  try { return data ? JSON.parse(data) : null; } catch { return null; }
}
/** Sends one text from the church's number. Returns "" when sent, or why it wasn't. */
export async function sendText(db: SupabaseClient, c: Church, to: string, body: string, keys?: { sid: string; token: string; from: string } | null): Promise<string> {
  if (!textingOn(c)) return "Texting is off for this church.";
  const n = last10(to); if (n.length < 10) return "That mobile number doesn't look right.";
  if ((c.data?.texting?.optOut || []).includes(n)) return "That number replied STOP.";
  const k = keys || await twilioKeys(db, c.id); if (!k) return "Twilio isn't linked.";
  const params = new URLSearchParams({ To: e164(to), Body: body.slice(0, 1500) });
  if (/^MG/i.test(k.from)) params.set("MessagingServiceSid", k.from); else params.set("From", e164(k.from));
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${k.sid}/Messages.json`, { method: "POST",
    headers: { Authorization: `Basic ${btoa(`${k.sid}:${k.token}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  if (r.ok) return "";
  const err = await r.json().catch(() => ({}));
  console.error("text not sent", r.status, err);
  // 21610: the number unsubscribed with Twilio itself.
  if (err?.code === 21610) await optOut(db, c.id, n, true);
  return err?.message || `Twilio said no (${r.status})`;
}
/** Adds or removes a number from the church's do-not-text list. */
export async function optOut(db: SupabaseClient, churchId: string, phone: string, out: boolean) {
  const { data: row } = await db.from("churches").select("data").eq("id", churchId).maybeSingle();
  if (!row) return;
  const t = row.data.texting || {}, n = last10(phone), list: string[] = t.optOut || [];
  const next = out ? [...new Set([...list, n])] : list.filter((x) => x !== n);
  await db.from("churches").update({ data: { ...row.data, texting: { ...t, optOut: next } } }).eq("id", churchId);
}
export async function emailOf(db: SupabaseClient, userId: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(userId || "")) return "";
  const { data } = await db.auth.admin.getUserById(userId); return data?.user?.email || "";
}
export async function phoneOf(db: SupabaseClient, userId: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(userId || "")) return "";
  const { data } = await db.from("contacts").select("phone").eq("user_id", userId).maybeSingle(); return data?.phone || "";
}
/**
 * Sends one message to one person the ways the church chose for this kind of message. to: a user, and/or an email and
 * phone to use instead of what's on file (a walk-in who has no account). Each way is tried on its own. Returns which went.
 */
export async function deliver(db: SupabaseClient, c: Church, kind: MsgKind, to: { userId?: string; email?: string; phone?: string },
  m: { title: string; lines: string[]; link?: string; linkLabel?: string; notifyKind?: string; id?: string }): Promise<string[]> {
  const sent: string[] = [], route = routeOf(c, kind);
  if (route.includes("push") && to.userId && /^[0-9a-f-]{36}$/i.test(to.userId)) {
    await notify(db, c.id, to.userId, { kind: m.notifyKind || "event", title: m.title, body: m.lines[0] || "", link: m.link ? `#${m.link.split("#")[1] || ""}` : "#home" }, m.id); sent.push("push");
  }
  if (route.includes("email") && emailReady()) {
    const email = to.email || (to.userId ? await emailOf(db, to.userId) : "");
    if (email) {
      const html = emailHtml({ heading: m.title, paragraphs: m.lines, button: m.link ? [m.linkLabel || "Open", m.link] : undefined, footer: `${c.name}. Sent through Our Faithful Church App.`,
        preheader: m.lines[0]?.slice(0, 120), church: { name: c.name, color: c.data?.color, logo: c.data?.logo } });
      if (await sendEmail(email, m.title, [m.title, ...m.lines, m.link || ""].join("\n\n"), html)) sent.push("email");
    }
  }
  if (route.includes("text")) {
    const phone = to.phone || (to.userId ? await phoneOf(db, to.userId) : "");
    if (phone && !(await sendText(db, c, phone, `${c.name}: ${m.title}\n${m.lines.join("\n")}${m.link ? `\n${m.link}` : ""}`))) sent.push("text");
  }
  return sent;
}
