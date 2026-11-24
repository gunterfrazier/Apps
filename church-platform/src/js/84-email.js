// ---------- Email on the Connect page: write to another member, or (with "Email groups of people") to a group ----------
// Email goes out under the sender's own name at the app's mail domain, like wesparker@mail.ourfaithfulchurch.com,
// and replies go straight to the sender's own inbox. Nobody sees the other person's address unless they reply.
// supabase/functions/send-email picks the address the same way (keep EMAIL_RESERVED and emailLocalPart in step).
const EMAIL_RESERVED = ["admin", "administrator", "abuse", "postmaster", "hostmaster", "webmaster", "noreply", "support", "security", "billing", "help", "hello", "info", "office", "pastor", "staff", "root", "mailer", "team", "church"];
function emailLocalPart(name) {
  const s = String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40) || "member";
  return EMAIL_RESERVED.includes(s) ? `${s}.member` : s;
}
const myEmailAddress = () => PLATFORM.emailDomain ? `${emailLocalPart(S.me().name)}@${PLATFORM.emailDomain}` : "";
const emailFromNote = () => html`<p class="faint" style="margin:6px 0 12px">${myEmailAddress() ? html`It comes from <b>${S.me().name}</b> &lt;${myEmailAddress()}&gt;. ` : ""}Replies go to your own email${S.me().email ? ` (${S.me().email})` : ""}, so the people who reply will see that address.</p>`;
const canMemberEmail = () => S.isMember() && S.on("directory") && S.can("use.directory");

let emailPick = "";
Screens.email = (tail = "") => {
  if (!S.church()) return { redirect: "churches" };
  if (!S.isMember()) return { title: "Connect", tab: "connect", body: html`${seg(connectSeg(), "email")}${needMember("email other members")}` };
  if (!canMemberEmail() && !canEmail()) return { redirect: "connect" };
  if (tail) emailPick = tail;
  const people = canMemberEmail() ? directoryEntries().filter((p) => !p.isMe) : [];
  const practice = Backend.on ? "" : html`<p class="room-msg warn" role="note">${icon("info")}<span>This is ${practicePlace()}, so nothing is really sent. On your church's own site the email goes out through its email service.</span></p>`;
  return { title: "Connect", tab: "connect", body: html`${seg(connectSeg(), "email")}${practice}
    ${canMemberEmail() ? html`<section class="sec"><div class="sec-head"><h2>Email a member</h2></div>
      ${people.length ? html`<form data-form="email-member" class="panel" novalidate>
        <label class="field"><span>To</span><select name="to" required><option value="">Choose someone</option>${people.map((p) => html`<option value="${p.id}" ${attr(p.id === emailPick, "selected")}>${p.name}</option>`)}</select><small>Only people listed in the directory can be emailed, and their address stays private.</small></label>
        <label class="field"><span>Subject</span><input type="text" name="subject" maxlength="120" required></label>
        <label class="field"><span>Message</span><textarea name="body" rows="6" maxlength="5000" required></textarea></label>
        ${emailFromNote()}
        <button class="btn block">${icon("mail")}Send email</button></form>` : html`<div class="rows">${empty("Nobody else is listed in the directory yet.")}</div>`}</section>` : ""}
    ${canEmail() ? html`<section class="sec"><div class="sec-head"><h2>Email a group</h2><a class="btn ghost sm" href="#admin-email">Sent emails</a></div>
      <p class="muted" style="margin-top:0">Everyone, a role, a class or group, a team, or people not seen lately. Each person gets their own copy.</p>
      ${emailGroupForm()}</section>` : ""}` };
};
Forms["email-member"] = async (d, f) => {
  const to = directoryEntries().find((p) => p.id === d.to && !p.isMe), subject = String(d.subject || "").trim(), body = String(d.body || "").trim();
  if (!to) return formError(f, "Choose who it goes to.");
  if (!subject || !body) return formError(f, "Write a subject and a message.");
  const btn = $("button.btn", f); if (btn.disabled) return;
  btn.disabled = true; btn.textContent = "Sending...";
  try {
    if (Backend.on) await Backend.call("send-email", { churchId: S.state.current, mode: "member", userIds: [to.id], subject, body });
    toast(Backend.on ? `Sent to ${to.name}` : `Practice: this would go to ${to.name}`); emailPick = ""; f.reset(); render();
  } catch (e) { btn.disabled = false; btn.textContent = "Send email"; formError(f, e.message || "The email couldn't be sent. Try again."); }
};

// ----- Where it shows up: a tab on Connect, and an "Email through the app" row on each person in the directory -----
{
  const segs = connectSeg;
  connectSeg = () => [...segs(), ["email", "Email", S.isMember() && (canMemberEmail() || canEmail())]];
  const person = Screens.person;
  Screens.person = (id) => { const v = person(id);
    if (!v?.body || id === S.me().id || !canMemberEmail()) return v;
    return { ...v, body: html`${v.body}<div class="btns" style="margin-top:14px"><a class="btn" href="#email-${id}">${icon("mail")}Email through the app</a></div>` }; };
}
