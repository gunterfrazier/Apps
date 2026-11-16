// Email from a person at a church. Signed in.
//   { churchId, userIds, subject, body, audience }           a group, with the "Email groups of people" permission (send.email)
//   { churchId, mode: "member", userIds: [id], subject, body }  one member to another, from Connect, Email
//   ->  { sent, failed }
// Each person gets their own copy at the address they sign in with, so nobody sees anyone else's address. The email comes
// from the sender's name at the app's mail domain (personalFrom) and replies go to the sender's own address.
// A member can only write to members listed in the directory, a few at a time. A line goes in the activity log.
import { admin, caller, can, emailReady, fail, handle, json, personalFrom, sendEmail, uid } from "../_shared/util.ts";
import { emailHtml } from "../_shared/email.ts";

const MAX = 500, HOURLY = 5, MEMBER_MAX = 5, MEMBER_HOURLY = 10;

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first.", 401);
  const { churchId, userIds, subject, body, audience, mode } = await req.json();
  const member = mode === "member";
  const title = String(subject || "").trim().slice(0, 120), text = String(body || "").trim().slice(0, member ? 5000 : 10000);
  if (!churchId || !Array.isArray(userIds) || !title || !text) return fail("Choose who it goes to, and write a subject and a message.");
  if (!member && !(await can(client, churchId, "send.email"))) return fail("Your role doesn't include emailing groups of people.", 403);
  if (!emailReady()) return fail("Email isn't set up for this app yet. Add RESEND_API_KEY and EMAIL_FROM to the server's secrets.", 503);

  const db = admin();
  const { data: church } = await db.from("churches").select("id, name, data").eq("id", churchId).maybeSingle();
  if (!church || church.data?.deactivation?.status === "deactivated") return fail("That church isn't available.", 404);
  const { data: members } = await db.from("memberships").select("user_id, listed").eq("church_id", churchId);
  const mine = (members || []).find((m) => m.user_id === user.id);
  if (!mine) return fail("Join this church first.", 403);
  if (member) {
    if (church.data?.modules?.directory === false) return fail("This church has the directory turned off.", 403);
    if (!(await can(client, churchId, "use.directory"))) return fail("Your role doesn't include the directory.", 403);
  }

  // A few sends an hour keeps a mistake, or a stolen sign-in, from becoming a flood.
  const since = new Date(Date.now() - 3600e3).toISOString();
  const recent = db.from("records").select("id", { count: "exact", head: true }).eq("church_id", churchId).eq("kind", "activity").eq("data->>area", member ? "member-email" : "email").gte("data->>at", since);
  const { count } = member ? await recent.eq("data->>by", user.id) : await recent;
  if ((count || 0) >= (member ? MEMBER_HOURLY : HOURLY)) return fail("That's a lot of email in one hour. Try again a little later.", 429);

  // Group email reaches any member; a member's email only reaches members who list themselves in the directory.
  const allowed = new Set((members || []).filter((m) => !member || m.listed).map((m) => m.user_id));
  const ids = [...new Set(userIds.map(String))].filter((u) => allowed.has(u) && (!member || u !== user.id));
  if (!ids.length) return fail(member ? "That person isn't listed in the directory." : "Nobody in that list is a member of this church.");
  if (ids.length > (member ? MEMBER_MAX : MAX)) return fail(member ? `Write to up to ${MEMBER_MAX} people at a time.` : `That's more than ${MAX} people. Send to smaller groups.`);

  const { data: me } = await db.from("profiles").select("name").eq("id", user.id).maybeSingle();
  const name = me?.name || (member ? "A member" : "A leader");
  const foot = member ? `Sent by ${name}, a member of ${church.name}, through Our Faithful Church App. Reply to write back to ${name}.`
    : `Sent to you by ${name} at ${church.name} through Our Faithful Church App.`;
  // The church's own name and color at the top: it's a message from the church, not from the app.
  const html = emailHtml({ heading: title, paragraphs: [text], footer: foot, preheader: text.slice(0, 120), church: { name: church.name, color: church.data?.color, logo: church.data?.logo } });
  const from = personalFrom(name);
  let sent = 0, failed = 0;
  for (const id of ids) {
    const { data } = await db.auth.admin.getUserById(id);
    const to = data?.user?.email;
    if (to && await sendEmail(to, title, `${text}\n\n${foot}`, html, user.email || undefined, from)) sent++; else failed++;
    await new Promise((r) => setTimeout(r, 120));   // stay under the email service's per-second limit
  }
  const at = new Date().toISOString(), rid = `a-${uid()}`;
  // A member's message is logged without its subject: admins can see that email went out, not what it said.
  await db.from("records").insert({ id: rid, church_id: churchId, kind: "activity", owner: user.id,
    data: { id: rid, churchId, by: user.id, name, area: member ? "member-email" : "email", at,
      what: member ? `Emailed ${sent} ${sent === 1 ? "member" : "members"} through the app` : `Emailed ${sent} ${sent === 1 ? "person" : "people"} (${String(audience || "a list").slice(0, 60)}): ${title}` } });
  if (!sent) return fail("The email couldn't be sent. Check the email service's settings.", 502);
  return json({ sent, failed });
});
