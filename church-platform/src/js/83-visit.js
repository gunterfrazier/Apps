// ---------- First-time visitors: the question on joining, the visitor card, Plan your visit and the welcome message ----------
// church.welcome = { ask, title, message, links: [{ label, url }] }, set under Admin, Welcome for new visitors.
const WELCOME_DEFAULT = { title: "Welcome to {church}!", message: "Thank you for visiting us. We're so glad you came, and we'd love to see you again. If there's anything we can do for you or your family, just ask." };
const welcomeOf = (c = S.church()) => ({ ask: c?.welcome?.ask !== false, title: c?.welcome?.title || WELCOME_DEFAULT.title, message: c?.welcome?.message || WELCOME_DEFAULT.message,
  links: c?.welcome?.links || [{ label: "Plan your visit", url: "#visit" }, ...(mapLocations().length ? [{ label: "Campus map", url: "#map" }] : [])] });
const welcomeText = (t, c = S.church()) => String(t).replace(/\{church\}/gi, c.name).replace(/\{name\}/gi, (S.me().name || "").split(" ")[0] || "friend");
const safeLink = (u) => /^#[\w~.-]*$/.test(u) || isUrl(u);
let visitAsk = null;   // the church someone just joined, until the question has been put to them
/** Just joined: ask whether this is their first visit. */
function visitPrompt() {
  const c = S.church(); if (!visitAsk || !c || visitAsk !== c.id || $("#scrim")) return;
  visitAsk = null;
  if (!welcomeOf(c).ask || !S.isMember() || S.isPrimary()) return;
  openSheet(`Welcome to ${c.name}`, html`<p style="margin-top:0;font-size:1.1rem">Is this your first time visiting us?</p>
    <div class="btns stack"><button class="btn block" data-act="visit-first">Yes, I'm new here</button><button class="btn ghost block" data-act="visit-not-first">No, I've been before</button></div>`);
}
Actions["visit-not-first"] = () => { closeSheet(true); toast(`Glad you're here. Welcome to ${S.church().name} in the app.`); setTimeout(presencePrompt, 600); };
Actions["visit-first"] = () => {
  const me = S.me();
  openSheet("Tell us about you", html`<form data-form="visitor-card" novalidate>
    <p class="muted" style="margin-top:0">This goes to the staff at ${S.church().name} so they can welcome you. Share as much or as little as you like.</p>
    <label class="field"><span>Your name</span><input type="text" name="name" value="${me.name || ""}" maxlength="80" autocomplete="name" required></label>
    <label class="field"><span>Email</span><input type="email" name="email" value="${me.email || ""}" maxlength="120" autocomplete="email"></label>
    <label class="field"><span>Phone</span><input type="tel" name="phone" value="${me.phone || ""}" maxlength="30" autocomplete="tel"></label>
    <label class="field"><span>Home address (optional)</span><input type="text" name="address" maxlength="160" autocomplete="street-address"></label>
    <label class="field"><span>Spouse or other adults with you</span><input type="text" name="adults" maxlength="160" placeholder="Names"></label>
    <label class="field"><span>Children</span><textarea name="children" rows="3" maxlength="400" placeholder="One per line, with ages. For example: Ella, 7"></textarea></label>
    <label class="field"><span>How did you hear about us?</span><select name="heard"><option value="">Choose one</option>${["A friend or family member", "Drove by", "Online search", "Social media", "An event", "Other"].map((x) => html`<option>${x}</option>`)}</select></label>
    <label class="field"><span>Anything you'd like us to know, or pray about</span><textarea name="message" rows="3" maxlength="1000"></textarea></label>
    <div class="btns"><button class="btn">Send</button><button type="button" class="btn ghost" data-act="visit-skip">Skip for now</button></div></form>`);
};
Actions["visit-skip"] = () => { closeSheet(true); go("visit"); setTimeout(() => welcomeShow(), 500); };
Forms["visitor-card"] = (d, f) => {
  const name = String(d.name || "").trim(), email = String(d.email || "").trim(), phone = String(d.phone || "").trim();
  if (!name) return formError(f, "Add your name.");
  if (!email && !phone) return formError(f, "Add an email or phone number so someone can reach you.");
  const kids = String(d.children || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const family = [d.adults && `Adults: ${String(d.adults).trim()}`, kids.length && `Children: ${kids.join("; ")}`, d.address && `Address: ${String(d.address).trim()}`, d.heard && `Heard about us: ${d.heard}`].filter(Boolean);
  const message = [String(d.message || "").trim(), ...family].filter(Boolean).join("\n");
  const rec = S.add("cards", { by: S.me().id, name, reason: "First-time visitor", message, contact: email || phone, email, phone, address: String(d.address || "").trim(), adults: String(d.adults || "").trim(), children: kids, heard: d.heard || "", firstVisit: true, at: new Date().toISOString(), handled: false });
  emit("card.created", { name, reason: rec.reason, message, contact: rec.contact });
  if (!S.me().phone && phone) S.me().phone = phone;
  startFollowup({ personId: S.me().id, name, email, phone, source: "card", cardId: rec.id, reason: "First-time visitor", message });
  S.save(); closeSheet(); go("visit"); setTimeout(() => welcomeShow(), 500);
};
/** The welcome message. Staff can preview it; `as` lets the settings screen show unsaved words. */
function welcomeShow(as) {
  const c = S.church(), w = as || welcomeOf(c);
  openSheet(welcomeText(w.title, c), html`<p style="margin-top:0;white-space:pre-line;font-size:1.05rem">${welcomeText(w.message, c)}</p>
    <div class="btns stack">${w.links.filter((l) => l.label && safeLink(l.url)).map((l, i) => l.url.startsWith("#") ? html`<button class="btn ${i ? "ghost" : ""} block" data-act="welcome-go" data-to="${l.url.slice(1)}">${l.label}</button>`
      : html`<a class="btn ${i ? "ghost" : ""} block" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`)}<button class="btn ghost block" data-act="close-sheet">Close</button></div>`);
}
Actions["welcome-go"] = (el) => { closeSheet(true); if (location.hash !== `#${el.dataset.to}`) go(el.dataset.to); };

// ----- Plan your visit -----
Screens.visit = () => {
  const c = S.church(); if (!c) return { redirect: "churches" };
  const locs = S.visibleLocations().filter((l) => l.visibility !== "private" || S.isMember()), day = (n) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][n];
  const time = (t) => { const [h, m] = t.split(":").map(Number); return fmtTime(new Date(2000, 0, 1, h, m)); };
  const next = upcomingServices(c, 1)[0];
  return { title: "Plan your visit", back: "home", body: html`
    <div style="margin-top:14px">${bannerHtml(c)}</div>
    ${next ? html`<div class="panel" style="margin-top:14px"><p class="muted" style="margin:0">Next service</p><h2 style="margin:2px 0 0">${serviceName(next)}</h2></div>` : ""}
    ${locs.map((l) => html`<section class="sec panel"><h2 style="margin:0">${locs.length > 1 ? l.name : "When and where"}</h2>
      ${(l.services || []).length ? html`<ul class="plain" style="margin:10px 0 0;padding:0;list-style:none">${l.services.map((s) => html`<li style="padding:4px 0"><b>${day(s.day)} ${time(s.time)}</b> ${s.label || "Service"}</li>`)}</ul>` : html`<p class="muted" style="margin:8px 0 0">Service times aren't posted yet.</p>`}
      ${l.address ? html`<p style="margin:10px 0 0">${l.address}</p>` : ""}
      <div class="btns" style="margin-top:12px">${l.address ? html`<a class="btn" href="${mapLink(l.address)}" target="_blank" rel="noopener">${icon("pin")}Directions</a>` : ""}${mapOf(l) ? html`<a class="btn ghost" href="#map-${l.id}">Campus map</a>` : ""}${l.liveUrl ? html`<a class="btn ghost" href="#live">Watch live</a>` : ""}</div></section>`)}
    <section class="sec"><div class="rows">
      ${S.on("checkin") !== false && S.isMember() ? html`<a class="row" href="#household"><span class="lead-ic">${icon("kid")}</span><span class="body"><span class="t">Bringing kids?</span><span class="s">Add them now so check-in is quick when you arrive</span></span>${icon("chev")}</a>` : ""}
      <button class="row" data-act="connect-card"><span class="lead-ic">${icon("inbox")}</span><span class="body"><span class="t">Have a question?</span><span class="s">Send a connect card and someone will be in touch</span></span>${icon("chev")}</button>
      <a class="row" href="#events"><span class="lead-ic">${icon("calendar")}</span><span class="body"><span class="t">What's coming up</span><span class="s">Events and ways to get to know people</span></span>${icon("chev")}</a></div></section>
    ${c.landing?.blocks?.length ? html`<div class="landing">${landingBlocks(c)}</div>` : ""}` };
};

// ----- Settings: Admin, Welcome for new visitors -----
AdminScreens.welcome = () => {
  const stop = guard("manage.church"); if (stop) return stop;
  const c = S.church(), w = welcomeOf(c);
  return { title: "Welcome for new visitors", back: "admin", body: html`
    <p class="muted" style="margin-top:14px">When someone joins ${c.name} in the app they're asked whether it's their first visit. If it is, they fill in a visitor card (it lands in Connect cards and New people), see Plan your visit, and then get this message.</p>
    <form data-form="welcome-save" class="panel" novalidate>
      <label class="check"><input type="checkbox" name="ask" value="1" ${attr(w.ask, "checked")}><span>Ask new members if it's their first visit</span></label>
      <label class="field" style="margin-top:12px"><span>Heading</span><input type="text" name="title" maxlength="80" value="${c.welcome?.title || ""}" placeholder="${WELCOME_DEFAULT.title}"></label>
      <label class="field"><span>Message</span><textarea name="message" rows="5" maxlength="800" placeholder="${WELCOME_DEFAULT.message}">${c.welcome?.message || ""}</textarea><small>Leave blank for the standard message. {church} becomes the church's name and {name} the visitor's first name.</small></label>
      <label class="field"><span>Buttons under the message</span><textarea name="links" rows="4" placeholder="Plan your visit | #visit&#10;Our website | https://yourchurch.org">${(c.welcome?.links || w.links).map((l) => `${l.label} | ${l.url}`).join("\n")}</textarea>
        <small>One per line: the words, a bar, then where it goes. Use a web address, or a screen in the app: #visit, #map, #events, #give, #connect, #live.</small></label>
      <div class="btns"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="welcome-preview">Preview</button></div></form>` };
};
function welcomeRead(f) {
  const d = Object.fromEntries(new FormData(f)), bad = [];
  const links = String(d.links || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5).map((line) => { const [label, ...rest] = line.split("|"), url = rest.join("|").trim(); if (!label.trim() || !safeLink(url)) bad.push(line); return { label: label.trim().slice(0, 40), url }; });
  return { w: { ask: !!d.ask, title: String(d.title || "").trim(), message: String(d.message || "").trim(), links }, bad };
}
Forms["welcome-save"] = (d, f) => {
  if (!S.can("manage.church")) return;
  const { w, bad } = welcomeRead(f);
  if (bad.length) return formError(f, `This button needs words, a bar and a link starting with https:// or #: "${bad[0]}"`);
  S.church().welcome = w; S.save(); logActivity("Changed the welcome for new visitors", "church"); toast("Saved"); render();
};
Actions["welcome-preview"] = (el) => { const { w, bad } = welcomeRead(el.closest("form")); if (bad.length) return formError(el.closest("form"), `Check this button: "${bad[0]}"`);
  welcomeShow({ ...w, title: w.title || WELCOME_DEFAULT.title, message: w.message || WELCOME_DEFAULT.message }); };

// ----- Where these show up -----
{
  const join = Actions["join-church"];
  Actions["join-church"] = (el) => { const was = S.isMember(el.dataset.id); join(el); if (!was && S.isMember(el.dataset.id)) visitAsk = el.dataset.id; };
  const home = Screens.home;   // (already wrapped once for the attendance question)
  Screens.home = (t) => { const v = home(t); if (v && !v.redirect) { const after = v.after; v.after = () => { setTimeout(visitPrompt, 250); after?.(); };
    if (mapLocations().length && v.body) v.body = html`${v.body}<section class="sec"><div class="rows"><a class="row" href="#map"><span class="lead-ic">${icon("pin")}</span><span class="body"><span class="t">Campus map</span><span class="s">Find the sanctuary, kids' rooms, restrooms and more</span></span>${icon("chev")}</a>
      <a class="row" href="#visit"><span class="lead-ic">${icon("clock")}</span><span class="body"><span class="t">Plan your visit</span><span class="s">Service times, directions and what to expect</span></span>${icon("chev")}</a></div></section>`; } return v; };
}
