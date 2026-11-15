// Email to a group of people at a church. Signed in, with the "Email groups of people" permission (send.email).
//   { churchId, userIds, subject, body, audience }  ->  { sent, failed }
// Each person gets their own copy at the address they sign in with, so nobody sees anyone else's address. Replies go
// to the sender. Only members of the church are emailed, whatever list the app sends. A line goes in the activity log.
import { admin, caller, can, emailReady, fail, handle, json, sendEmail, uid } from "../_shared/util.ts";

const MAX = 500, HOURLY = 5;
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first.", 401);
  const { churchId, userIds, subject, body, audience } = await req.json();
  const title = String(subject || "").trim().slice(0, 120), text = String(body || "").trim().slice(0, 10000);
  if (!churchId || !Array.isArray(userIds) || !title || !text) return fail("Choose who it goes to, and write a subject and a message.");
  if (!(await can(client, churchId, "send.email"))) return fail("Your role doesn't include emailing groups of people.", 403);
  if (!emailReady()) return fail("Email isn't set up for this app yet. Add RESEND_API_KEY and EMAIL_FROM to the server's secrets.", 503);

  const db = admin();
  const { data: church } = await db.from("churches").select("id, name, data").eq("id", churchId).maybeSingle();
  if (!church || church.data?.deactivation?.status === "deactivated") return fail("That church isn't available.", 404);
  // A few sends an hour for each church keeps a mistake, or a stolen sign-in, from becoming a flood.
  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await db.from("records").select("id", { count: "exact", head: true }).eq("church_id", churchId).eq("kind", "activity").eq("data->>area", "email").gte("data->>at", since);
  if ((count || 0) >= HOURLY) return fail("That's a lot of email in one hour. Try again a little later.", 429);

  const { data: members } = await db.from("memberships").select("user_id").eq("church_id", churchId);
  const allowed = new Set((members || []).map((m) => m.user_id)), ids = [...new Set(userIds.map(String))].filter((u) => allowed.has(u));
  if (!ids.length) return fail("Nobody in that list is a member of this church.");
  if (ids.length > MAX) return fail(`That's more than ${MAX} people. Send to smaller groups.`);

  const { data: me } = await db.from("profiles").select("name").eq("id", user.id).maybeSingle();
  const from = me?.name || "A leader", foot = `Sent to you by ${from} at ${church.name} through Our Faithful Church App.`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1c1c1c;max-width:560px">${text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}<p style="color:#666;font-size:14px">${esc(foot)}</p></div>`;
  let sent = 0, failed = 0;
  for (const id of ids) {
    const { data } = await db.auth.admin.getUserById(id);
    const to = data?.user?.email;
    if (to && await sendEmail(to, title, `${text}\n\n${foot}`, html, user.email || undefined)) sent++; else failed++;
    await new Promise((r) => setTimeout(r, 120));   // stay under the email service's per-second limit
  }
  const at = new Date().toISOString(), rid = `a-${uid()}`;
  await db.from("records").insert({ id: rid, church_id: churchId, kind: "activity", owner: user.id,
    data: { id: rid, churchId, by: user.id, name: from, area: "email", at, what: `Emailed ${sent} ${sent === 1 ? "person" : "people"} (${String(audience || "a list").slice(0, 60)}): ${title}` } });
  if (!sent) return fail("The email couldn't be sent. Check the email service's settings.", 502);
  return json({ sent, failed });
});
