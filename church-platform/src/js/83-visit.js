// ---------- Visitor onboarding, welcome messages, and attendance milestones ----------
// church.welcome = { ask, title, message, links: [{ label, url }] }, set under Admin, Welcome for new visitors.
const WELCOME_DEFAULT = { title: "Welcome to {church}!", message: "Thank you for visiting us. We're so glad you came, and we'd love to see you again. If there's anything we can do for you or your family, just ask." };
const welcomeOf = (c = S.church()) => ({ ask: c?.welcome?.ask !== false, title: c?.welcome?.title || WELCOME_DEFAULT.title, message: c?.welcome?.message || WELCOME_DEFAULT.message,
  links: c?.welcome?.links || [{ label: "Plan your visit", url: "#visit" }, ...(mapLocations().length ? [{ label: "Campus map", url: "#map" }] : [])] });
const welcomeText = (t, c = S.church()) => String(t).replace(/\{church\}/gi, c.name).replace(/\{name\}/gi, (S.me().name || "").split(" ")[0] || "friend");
const safeLink = (u) => /^#[\w~.-]*$/.test(u) || isUrl(u);
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

// Plan your visit itself is in 87-visit-page.js.

// ----- Settings: Admin, Welcome for new visitors -----
AdminScreens.welcome = () => {
  const stop = guard("manage.church"); if (stop) return stop;
  const c = S.church(), w = welcomeOf(c);
  return { title: "Welcome for new visitors", back: "admin", body: html`
    <p class="muted" style="margin-top:14px">When someone joins ${c.name} in the app they choose First-time visitor, Returning visitor, or Member. First-time visitors can fill in a visitor card (it lands in Connect cards and New people), see Plan your visit, and then get this message.</p>
    <form data-form="welcome-save" class="panel" novalidate>
      <label class="check"><input type="checkbox" name="ask" value="1" ${attr(w.ask, "checked")}><span>Offer the optional visitor card to first-time visitors</span></label>
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

let firstVisitCardFor = null;
function churchVisitState() {
  const status = S.isMember() ? S.state.churchAttendeeTypes?.[S.state.current] : null;
  const visits = new Set(S.list("presence").filter((p) => p.userId === S.me().id).map((p) => p.serviceKey)).size;
  return { status, visits, first: status === "first" && visits < 2, returning: status === "returning" || status === "first" && visits >= 1 };
}
Screens.welcomeback = () => {
  const c = S.church(), { returning, visits } = churchVisitState();
  if (!c || !returning) return { redirect: "home" };
  return { title: "Welcome back", back: "home", body: html`
    <section class="sec panel"><h2>Thank you for visiting us again!</h2>
      <p>We're glad to see you back at ${c.name}.</p>
      <p>${visits >= 5 ? "Ready to get more involved? Ask about membership or explore ways to serve." : visits >= 3 ? "Get to know the church through an upcoming class or group." : "Find your way around and see what’s coming up for your next visit."}</p>
      <div class="btns">${mapLocations().length ? html`<a class="btn ghost" href="#map">Campus map</a>` : ""}
        <a class="btn ghost" href="#page-${c.id}">Church information</a>
        ${S.on("events") ? html`<a class="btn ghost" href="#events">Upcoming events</a>` : ""}
        ${visits >= 3 && S.on("classes") ? html`<a class="btn ghost" href="#classes">Explore classes</a>` : ""}</div>
    </section><section class="sec panel"><h2>How to become a member</h2>
      <p>Ask the church office about its membership process, upcoming orientation, and who you can meet to talk about joining.</p>
      <div class="btns">${c.email ? html`<a class="btn" href="mailto:${c.email}">Email the church office</a>` : html`<a class="btn" href="#connect">Connect with the church</a>`}
      ${visits >= 5 && S.on("checkin") ? html`<a class="btn ghost" href="#serve">Explore serving</a>` : ""}</div></section>` };
};
{
  const home = Screens.home;
  Screens.home = (t) => {
    const v = home(t);
    if (!v?.body || v.redirect) return v;
    const { status, first, returning } = churchVisitState();
    const intro = html`
      ${first || returning || status === "member" ? html`<section class="sec panel">
        <h2>${first ? "New here?" : returning ? "Welcome back" : "Your church home"}</h2>
        <div class="btns">
          ${returning ? html`<a class="btn" href="#welcomeback">Welcome back</a>` : ""}
          ${first ? html`<a class="btn ghost" href="#visit">Plan your visit</a>` : ""}
          ${mapLocations().length ? html`<a class="btn ghost" href="#map">Campus map</a>` : ""}
        </div></section>` : ""}
      `;
    const legacyMap = !status && mapLocations().length ? html`<section class="sec btns"><a class="btn ghost" href="#map">Campus map</a><a class="btn ghost" href="#visit">Plan your visit</a></section>` : "";
    v.body = html`${intro}${v.body}${legacyMap}`;
    if (firstVisitCardFor === S.state.current) {
      const after = v.after;
      v.after = () => {
        firstVisitCardFor = null;
        Actions["visit-first"]();
        after?.();
      };
    }
    return v;
  };
}
