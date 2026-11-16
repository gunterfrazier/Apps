// ---------- Texting, and how each kind of message goes out ----------
// Texting is off until a church links its own Twilio account (Admin, Texting) and turns it on. Until then nothing in the
// app offers to send a text: no Text tab on Connect, no text receipts, no Text to give. The Twilio keys are kept
// encrypted on the server (the texting function); the church only stores the number and its choices:
//   church.texting = { linked, enabled, number, account, practice }
//   church.messaging = { receipts: ["email", "text"], tickets: [...], eventReminders: [...], servingReminders: [...],
//                        groupMessages: [...], giveByText: true }
// Each kind of message goes out by any of: an app notification, email, text. Text only counts while texting is on.

const MSG_CHANNELS = { push: ["App notification", "bell"], email: ["Email", "mail"], text: ["Text", "chat"] };
const MSG_KINDS = [
  ["receipts", "Payment receipts", "After a gift, a ticket or form payment, and cash or checks taken in person", ["email"]],
  ["tickets", "Event tickets", "The ticket with its QR code, once someone signs up or pays", ["push", "email"]],
  ["eventReminders", "Event reminders", "The day before an event someone signed up for", ["push"]],
  ["servingReminders", "Serving reminders", "The day before someone is scheduled to serve", ["push"]],
  ["groupMessages", "Messages to people and groups", "What staff can send from Admin and Connect", ["email"]],
];
const textingOn = (c = S.church()) => !!c?.texting?.linked && !!c.texting.enabled;
const canText = () => S.isMember() && textingOn() && S.can("send.texts");
/** The ways a kind of message goes out at this church right now. */
function msgRoute(kind, c = S.church()) {
  const def = MSG_KINDS.find(([k]) => k === kind)?.[3] || ["push"];
  return (c?.messaging?.[kind] || def).filter((ch) => MSG_CHANNELS[ch] && (ch !== "text" || textingOn(c)));
}
const textGiveOn = (c = S.church()) => textingOn(c) && c.messaging?.giveByText !== false && !!c.texting?.number;
/** Characters and how many text messages (160 characters each, or 153 when split) a message takes. */
const smsParts = (s) => { const n = String(s || "").length + 24; return n <= 160 ? 1 : Math.ceil(n / 153); };

// ----- Admin, Texting -----
AdminScreens.texting = () => {
  const stop = guard("manage.church"); if (stop) return stop;
  const c = S.church(), t = c.texting || {}, practice = !Backend.on || practiceMode(c) || IN_PREVIEW;
  const optOut = (t.optOut || []).length;
  const route = (k) => c.messaging?.[k] || MSG_KINDS.find(([x]) => x === k)[3];
  return { title: "Texting", back: "admin", body: html`
    <p class="muted" style="margin-top:14px">Texts go out from your church's own Twilio number, and Twilio bills your church for them. Texting stays off, and nothing in the app offers a text, until you link Twilio and turn it on.</p>
    <section class="sec"><h2 class="sec-head">Twilio account</h2>
      ${t.linked ? html`<div class="panel"><p style="margin-top:0"><span class="tag ok">Linked</span> <b>${t.number}</b>${t.account ? ` (${t.account})` : ""} ${t.practice ? html`<span class="tag">Practice</span>` : ""}</p>
          <label class="check"><input type="checkbox" data-change="texting-enable" ${attr(t.enabled, "checked")}><span><b>Texting is ${t.enabled ? "on" : "off"}</b>. ${t.enabled ? "Text options show in the app where you allow them below." : "Turn it on to show text options in the app."}</span></label>
          ${optOut ? html`<p class="faint">${plural(optOut, "number has", "numbers have")} replied STOP and won't get texts until they reply START.</p>` : ""}
          <div class="btns"><button class="btn ghost sm" data-act="texting-test" ${attr(!t.enabled, "disabled")}>${icon("chat")}Send a test text</button><button class="btn ghost sm" data-act="texting-link">Change account</button><button class="btn danger sm" data-act="texting-unlink">Unlink</button></div></div>`
        : html`<div class="panel"><p style="margin-top:0">Not linked. You'll need a Twilio account with a phone number that can send texts.</p><button class="btn" data-act="texting-link">${icon("link")}Link Twilio</button>
          ${practice ? html`<p class="faint">You're in ${practicePlace()}: linking here is pretend, and no texts are sent.</p>` : ""}</div>`}</section>
    <section class="sec"><h2 class="sec-head">How each kind of message goes out</h2>
      <form data-form="msg-routes" class="panel" novalidate>
        <p class="muted" style="margin-top:0">Pick any mix. People only get texts where texting is on, and only at numbers that haven't replied STOP.</p>
        <div class="msg-routes">${MSG_KINDS.map(([k, label, hint]) => html`<fieldset class="msg-route"><legend><b>${label}</b><span class="faint">${hint}</span></legend>
          <div class="chips">${Object.entries(MSG_CHANNELS).filter(([ch]) => !(k === "groupMessages" && ch === "push")).map(([ch, [l, ic]]) => html`<label class="chip-check"><input type="checkbox" name="${k}" value="${ch}" ${attr(route(k).includes(ch), "checked")} ${attr(ch === "text" && !textingOn(c), "disabled")}><span>${icon(ic)}${l}</span></label>`)}</div></fieldset>`)}
        <fieldset class="msg-route"><legend><b>Text to give</b><span class="faint">People text a keyword and an amount to your number and get a link to finish the gift</span></legend>
          <label class="check"><input type="checkbox" name="giveByText" ${attr(c.messaging?.giveByText !== false, "checked")} ${attr(!textingOn(c), "disabled")}><span>On</span></label>
          <label class="field" style="max-width:220px"><span>Keyword</span><input type="text" name="keyword" value="${c.textGive?.keyword || "GIVE"}" maxlength="20" ${attr(!textingOn(c), "disabled")}></label></fieldset></div>
        ${textingOn(c) ? "" : html`<p class="faint">Text choices open up once texting is on.</p>`}
        <button class="btn">Save</button></form></section>` };
};
Actions["texting-link"] = () => {
  const c = S.church(), t = c.texting || {};
  openSheet("Link Twilio", html`<form data-form="texting-link" novalidate>
    <ol class="steps-list"><li>Sign in at <a href="https://console.twilio.com" target="_blank" rel="noopener">console.twilio.com</a>, or make an account.</li>
      <li>Copy the <b>Account SID</b> (starts with AC) and <b>Auth Token</b> from the Account Info box on the home page.</li>
      <li>Under Phone Numbers, Active numbers, copy the number texts come from. US numbers need A2P 10DLC registration (Messaging, Regulatory Compliance) before carriers deliver texts.</li></ol>
    <label class="field"><span>Account SID</span><input type="text" name="sid" value="" placeholder="AC..." autocomplete="off" spellcheck="false" required></label>
    <label class="field"><span>Auth Token</span><input type="password" name="token" autocomplete="off" required></label>
    <label class="field"><span>Phone number</span><input type="tel" name="from" value="${t.number || ""}" placeholder="+1 770 555 0100" required><small>Or a Messaging Service SID (starts with MG).</small></label>
    <p class="faint">The Auth Token is saved encrypted on the server and never shown again. Replies of STOP and START are handled for you.</p>
    <button class="btn block">Link</button></form>`);
};
Forms["texting-link"] = async (d, f) => {
  const sid = String(d.sid || "").trim(), token = String(d.token || "").trim(), from = String(d.from || "").trim();
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) return formError(f, "The Account SID starts with AC and has 34 letters and numbers.");
  if (token.length < 20) return formError(f, "Paste the Auth Token from the Twilio console.");
  if (!/^MG[0-9a-f]{32}$/i.test(from) && digits(from).length < 10) return formError(f, "Enter the Twilio phone number, with area code.");
  const btn = $("button.btn", f); btn.disabled = true; btn.textContent = "Checking with Twilio...";
  const c = S.church();
  try {
    if (Backend.on && !practiceMode(c) && !IN_PREVIEW) { await Backend.call("texting", { action: "link", churchId: c.id, sid, token, from }); await Backend.pull().catch(() => {}); }
    else S.updateChurch({ texting: { ...(c.texting || {}), linked: true, practice: true, number: /^MG/i.test(from) ? from : prettyPhone(from), account: "Practice account" } });
    closeSheet(true); toast("Twilio linked. Turn texting on when you're ready."); render();
  } catch (e) { btn.disabled = false; btn.textContent = "Link"; formError(f, e.message || "Twilio didn't accept those details."); }
};
const prettyPhone = (s) => { const n = digits(s).slice(-10); return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : s; };
Inputs["texting-enable"] = async (el) => {
  const c = S.church();
  S.updateChurch({ texting: { ...c.texting, enabled: el.checked } });
  logActivity(`${el.checked ? "Turned on" : "Turned off"} texting`, "text");
  toast(el.checked ? "Texting is on" : "Texting is off. Text options are hidden."); render();
};
Actions["texting-unlink"] = () => openSheet("Unlink Twilio?", html`<p style="margin-top:0">Texting turns off and the saved keys are deleted. Text options disappear from the app. You can link again any time.</p>
  <div class="btns"><button class="btn danger" data-act="texting-unlink-yes">Unlink</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>`);
Actions["texting-unlink-yes"] = async () => {
  const c = S.church();
  try { if (Backend.on && !c.texting?.practice) await Backend.call("texting", { action: "unlink", churchId: c.id }); } catch (e) { toast(e.message); return; }
  S.updateChurch({ texting: { optOut: c.texting?.optOut || [] } }); closeSheet(true); toast("Twilio unlinked"); render();
};
Actions["texting-test"] = () => openSheet("Send a test text", html`<form data-form="texting-test" novalidate><label class="field"><span>Mobile number</span><input type="tel" name="to" value="${S.me().phone || ""}" required></label><button class="btn block">${icon("chat")}Send</button></form>`);
Forms["texting-test"] = async (d, f) => {
  if (digits(d.to).length < 10) return formError(f, "Enter a mobile number with area code.");
  const c = S.church();
  try { if (Backend.on && !c.texting?.practice) await Backend.call("texting", { action: "test", churchId: c.id, to: d.to }); closeSheet(true); toast(c.texting?.practice ? "Practice: no text was sent" : "Sent. It should arrive in a few seconds."); }
  catch (e) { formError(f, e.message || "The text couldn't be sent."); }
};
Forms["msg-routes"] = (d, f, fd) => {
  const c = S.church(), messaging = { ...(c.messaging || {}) };
  for (const [k] of MSG_KINDS) messaging[k] = fd.getAll(k);
  if (textingOn(c)) {
    messaging.giveByText = fd.has("giveByText");
    S.updateChurch({ messaging, textGive: messaging.giveByText ? { number: c.texting.number, keyword: String(d.keyword || "GIVE").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || "GIVE" } : null });
  } else {
    // Text choices can't be changed while texting is off: keep the ones already saved.
    for (const [k] of MSG_KINDS) if ((c.messaging?.[k] || []).includes("text")) messaging[k] = [...new Set([...messaging[k], "text"])];
    S.updateChurch({ messaging });
  }
  toast("Saved"); render();
};

// ----- Sending texts to people and groups -----
/** Who a text can go to: the email audiences, plus everyone signed up for an upcoming event. */
function textAudiences() {
  const out = emailAudiences().map(([k, l, ids]) => [k, l, ids, 0]);
  S.visible("events").filter((e) => e.signup && e.start >= new Date(Date.now() - DAY).toISOString()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 15).forEach((e) => {
    const regs = e.registrations || []; if (regs.length) out.push([`event:${e.id}`, `Signed up: ${e.title}`, [...new Set(regs.map((r) => r.by).filter((u) => S.user(u)))], regs.filter((r) => !S.user(r.by) && r.phone).length]);
  });
  return out;
}
const textForm = (aud = textAudiences(), person = null) => html`<form data-form="text-send" class="panel" novalidate>
    ${person ? html`<input type="hidden" name="person" value="${person.id}"><p style="margin-top:0">To <b>${person.name}</b></p>`
      : html`<label class="field"><span>To</span><select name="to">${aud.map(([k, l, ids, extra]) => html`<option value="${k}">${l} (${ids.length + extra})</option>`)}</select></label>`}
    <label class="field"><span>Message</span><textarea name="body" rows="4" maxlength="640" required data-input="text-count"></textarea><small class="text-count">Short is best. "Reply STOP to opt out" is added to the end.</small></label>
    <p class="faint" style="margin:0 0 10px">From ${S.church().name} at ${S.church().texting?.number}. People without a mobile number on file, or who replied STOP, are skipped.</p>
    <button class="btn block">${icon("chat")}Send text</button></form>`;
Inputs["text-count"] = (el) => { const n = el.value.length, p = smsParts(el.value); $(".text-count", el.closest("form")).textContent = `${n} characters, ${plural(p, "text")} each.${p > 2 ? " Shorter costs less." : ""}`; };
Forms["text-send"] = async (d, f) => {
  if (!canText()) return;
  const body = String(d.body || "").trim(); if (!body) return formError(f, "Write the message.");
  let userIds = [], eventId = "", label = "";
  if (d.person) { userIds = [d.person]; label = nameOf(d.person); }
  else { const a = textAudiences().find(([k]) => k === d.to); if (!a) return formError(f, "Choose who it goes to."); userIds = a[2]; label = a[1]; if (a[0].startsWith("event:")) eventId = a[0].slice(6); }
  const btn = $("button.btn", f); if (btn.disabled) return; btn.disabled = true; btn.textContent = "Sending...";
  const c = S.church();
  try {
    let n = userIds.length;
    if (Backend.on && !c.texting?.practice) { const r = await Backend.call("texting", { action: "send", churchId: c.id, userIds, eventId, body, audience: label }); n = r.sent; await Backend.pull().catch(() => {}); }
    else logActivity(`Texted ${plural(n, "person", "people")} (${label}): ${body.slice(0, 60)}`, "text");
    toast(Backend.on && !c.texting?.practice ? `Sent to ${plural(n, "person", "people")}` : `Practice: this would go to ${plural(n, "person", "people")}`); f.reset(); render();
  } catch (e) { btn.disabled = false; btn.textContent = "Send text"; formError(f, e.message || "The text couldn't be sent."); }
};
AdminScreens.texts = () => {
  const stop = guard("send.texts"); if (stop) return stop;
  if (!textingOn()) return { redirect: S.can("manage.church") ? "admin-texting" : "admin" };
  const sent = S.list("activity").filter((a) => a.area === "text").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  return { title: "Text people", back: "admin", body: html`<p class="muted" style="margin-top:14px">Send a text to a group, a class, a team or everyone signed up for an event. Each person gets their own text; nobody sees anyone else's number.</p>
    ${textForm()}
    ${sent.length ? html`<section class="sec"><div class="sec-head"><h2>Sent</h2></div><div class="rows">${sent.map((a) => html`<div class="row"><span class="body"><span class="t">${a.what}</span><span class="s">${a.name}, ${fmt(a.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></span></div>`)}</div></section>` : ""}` };
};
Screens.text = (tail = "") => {
  if (!S.church()) return { redirect: "churches" };
  if (!canText()) return { redirect: "connect" };
  const person = tail && S.user(tail);
  return { title: "Connect", tab: "connect", body: html`${seg(connectSeg(), "text")}<section class="sec"><div class="sec-head"><h2>${person ? "Text a person" : "Text a group"}</h2>${S.can("send.texts") ? html`<a class="btn ghost sm" href="#admin-texts">Sent texts</a>` : ""}</div>${textForm(undefined, person)}</section>` };
};

// ----- Where it shows up: Admin rows, a Connect tab and a row on each person, only while texting is on -----
{
  const segs = connectSeg;
  connectSeg = () => [...segs(), ["text", "Text", canText()]];
  const person = Screens.person;
  Screens.person = (id) => { const v = person(id);
    if (!v?.body || id === S.me().id || !canText()) return v;
    return { ...v, body: html`${v.body}<div class="btns" style="margin-top:8px"><a class="btn ghost" href="#text-${id}">${icon("chat")}Text through the app</a></div>` }; };
}
