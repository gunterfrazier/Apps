// ---------- Me, the ministry tools hub, links, install, preview tools ----------
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });

const MINISTRY_PERMS = ["book.rooms", "build.sermons", "build.lessons", "build.studies", "services.plan", "present", "checkin.station", "qr.create", "lead.groups", "teach.classes", "schedule.teams", "manage.devices"];
const ADMIN_PERMS = ["manage.followup", "view.reports", "manage.content", "manage.sermons", "manage.classes", "manage.prayer", "manage.people", "view.giving", "manage.page", "manage.integrations", "manage.locations", "manage.roles", "manage.church", "manage.devices"];
const hasMinistryTools = () => S.isMember() && S.canAny(MINISTRY_PERMS);
const hasAdminTools = () => S.isMember() && S.canAny(ADMIN_PERMS);
const accessText = (m) => !m ? "" : m.locations === "all" ? "All locations" : (S.locations().filter((l) => l.visibility !== "private" || m.locations.includes(l.id)).map((l) => l.name).join(", ") || "Public locations");

Screens.me = () => {
  const me = S.me(), c = S.church(), role = S.role(), m = S.membership();
  const saved = S.state.saved.map((id) => S.get("sermons", id)).filter((s) => s && s.churchId === c.id);
  const events = upcomingEvents().filter(myRegistration);
  const mine = S.visible("gatherings", { ignoreCampus: true }).filter((g) => isIn(g) || myEntries(g).length);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const links = churchLinks(c), embeds = (c.integrations?.embeds || []).filter((e) => e.showInMenu);
  const row = (href, ic, t, s) => html`<a class="row" href="${href}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${t}</span>${s ? html`<span class="s">${s}</span>` : ""}</span>${icon("chev")}</a>`;
  return {
    title: "Me", back: "home",
    body: html`
      <div style="display:flex;gap:14px;align-items:center;margin-top:18px">${avatar(me, "lg")}<div style="flex:1;min-width:0"><h1 style="font-size:1.5rem">${me.name}</h1><p class="muted" style="margin:0">${me.email || "No email added"}</p></div>
        <button class="btn ghost sm" data-act="profile-edit">${icon("edit")}Edit</button></div>

      <section class="sec"><div class="sec-head"><h2>${c.name}</h2>${role ? html`<span class="tag ${role.rank >= 90 ? "brand" : ""}">${role.name}</span>` : html`<span class="tag">Looking around</span>`}</div>
        ${m && S.locations().length > 1 ? html`<p class="faint" style="margin-top:-4px">Locations: ${accessText(m)}</p>` : ""}
        <div class="rows">
          ${hasAdminTools() ? row("#admin", "shield", "Admin", "Manage the church account, people, content and reports") : ""}
          ${hasMinistryTools() ? row("#ministry", "layers", "Ministry tools", "Builders, service plans, presentations, check-in and QR codes") : ""}
          ${S.on("parents") && kids().length ? row("#parents", "kid", "Parent portal", "Your kids' classes, events and check-in") : ""}
          ${S.isMember() ? (() => { const n = pendingAsks().length; return row("#serving", "hand", "Serving", n ? `${plural(n, "request")} waiting for your answer` : "Your teams, schedule and dates away"); })() : ""}
          ${row("#household", "people", "Household", me.household.length ? me.household.map((p) => p.name).join(", ") : "Add your family for classes and check-in")}
          ${S.on("checkin") ? row("#checkin", "kid", "Check in", "Kids and volunteers") : ""}
          ${S.on("giving") ? row("#history", "give", "Giving history", "Gifts and year-end statements") : ""}
          ${S.on("chat") && S.can("use.chat") ? row("#chat", "chat", "Messages") : ""}
          ${row("#settings", "gear", "Settings", "Language, text size, read aloud and notifications")}
          ${row("#scan", "scan", "Scan a QR code")}
          ${S.on("sermons") ? row("#notes", "note", "Sermon notes") : ""}
        </div></section>

      ${mine.length ? html`<section class="sec"><h2 class="sec-head">Your classes and groups</h2><div class="rows">${mine.map(gatheringRow)}</div></section>` : ""}
      ${events.length ? html`<section class="sec"><h2 class="sec-head">Your events</h2><div class="rows">${events.map(eventRow)}</div></section>` : ""}
      ${saved.length ? html`<section class="sec"><h2 class="sec-head">Saved sermons</h2><div class="rows">${saved.map(sermonRow)}</div></section>` : ""}

      ${links.length || embeds.length ? html`<section class="sec"><h2 class="sec-head">Links</h2><div class="rows">
        ${links.map(([label, url]) => html`<a class="row" href="${url}" target="_blank" rel="noopener"><span class="lead-ic">${icon(label === "Website" ? "globe" : "link")}</span><span class="body"><span class="t">${label}</span></span>${icon("chev")}</a>`)}
        ${embeds.map((e) => row(`#embed-${e.id}`, "link", e.title))}</div></section>` : ""}

      <section class="sec"><h2 class="sec-head">Churches</h2><div class="rows">
        <button class="row" data-act="open-switcher"><span class="lead-ic">${icon("church")}</span><span class="body"><span class="t">Switch church</span><span class="s">${plural(S.myChurches().length, "church", "churches")} joined</span></span>${icon("chev")}</button>
        ${row("#churches", "search", "Find a church")}
        ${row("#start", "plus", "Register a church", "Create a separate account for your congregation")}
        ${role && !S.isPrimary() ? html`<button class="row" data-act="leave-church"><span class="lead-ic" style="color:var(--warn)">${icon("x")}</span><span class="body"><span class="t">Leave ${c.name}</span></span></button>` : ""}
      </div></section>

      ${!standalone ? html`<section class="sec"><h2 class="sec-head">Put the app on your phone</h2><div class="panel">
        ${installPrompt ? html`<p style="margin-top:0">Install it like any other app. It opens full screen and works offline.</p><button class="btn" data-act="install">${icon("download")}Install app</button>`
          : isIOS ? html`<p style="margin:0">In Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>`
          : html`<p style="margin:0">Once the app is on its own website, open it in Chrome and choose <b>Install app</b> or <b>Add to Home screen</b> from the menu.</p>`}
      </div></section>` : ""}

      ${Backend.on ? html`<section class="sec"><h2 class="sec-head">Practice</h2><div class="rows">
        ${(() => { const real = isTrainingChurch(c) ? null : c, t = real && trainingChurchOf(real); if (!t) return "";
          return S.isMember(t.id) ? html`<button class="row" data-act="switch-church" data-id="${t.id}"><span class="lead-ic">${icon("people")}</span><span class="body"><span class="t">${t.name}</span><span class="s">Your team's shared training church</span></span>${icon("chev")}</button>`
            : html`<a class="row" href="#church-${t.id}"><span class="lead-ic">${icon("people")}</span><span class="body"><span class="t">Join ${t.name}</span><span class="s">Your team's shared training church: practise together</span></span>${icon("chev")}</a>`; })()}
        <button class="row" data-act="train-open"><span class="lead-ic">${icon("book")}</span><span class="body"><span class="t">Training</span><span class="s">Practice every feature with exercises, apart from your real church</span></span>${icon("chev")}</button>
        <a class="row" href="${location.pathname}?demo"><span class="lead-ic">${icon("play")}</span><span class="body"><span class="t">Demo</span><span class="s">Look around a sample church as its administrator</span></span>${icon("chev")}</a></div></section>
      <section class="sec"><div class="rows"><button class="row" data-act="sign-out"><span class="lead-ic">${icon("x")}</span><span class="body"><span class="t">Sign out</span><span class="s">${S.me().email}</span></span></button></div></section>` : html`<section class="sec"><h2 class="sec-head">${SANDBOX ? SANDBOX_NAMES[SANDBOX] : "Preview tools"}</h2><div class="rows">
        ${SANDBOX === "training" ? html`<a class="row" href="#training"><span class="lead-ic">${icon("list")}</span><span class="body"><span class="t">Training checklist</span><span class="s">${trainingProgress().done} of ${trainingProgress().total} exercises done</span></span>${icon("chev")}</a>` : ""}
        ${S.isMember() ? html`<button class="row" data-act="demo-role"><span class="lead-ic">${icon("key")}</span><span class="body"><span class="t">Try a different role</span><span class="s">See ${c.name} as a member, teacher, media coordinator or administrator</span></span>${icon("chev")}</button>` : ""}
        ${S.isMember() && !S.isPrimary() ? html`<button class="row" data-act="demo-primary"><span class="lead-ic">${icon("star")}</span><span class="body"><span class="t">Become the primary account holder</span><span class="s">Take over ${c.name}'s account in this preview</span></span>${icon("chev")}</button>` : ""}
        ${SANDBOX ? html`<button class="row" data-act="sandbox-reset"><span class="lead-ic">${icon("info")}</span><span class="body"><span class="t">Start over</span><span class="s">Clear what you changed and begin again</span></span>${icon("chev")}</button>
        <button class="row" data-act="sandbox-exit"><span class="lead-ic">${icon("x")}</span><span class="body"><span class="t">Leave the ${SANDBOX_NAMES[SANDBOX].toLowerCase()}</span><span class="s">${PLATFORM.supabaseUrl ? "Back to the live app. Your practice data waits here for next time." : "Back to the preview. Your practice data waits here for next time."}</span></span>${icon("chev")}</button>`
        : html`<a class="row" href="#training"><span class="lead-ic">${icon("list")}</span><span class="body"><span class="t">Training checklist</span><span class="s">Exercises that walk through every feature</span></span>${icon("chev")}</a>
        <button class="row" data-act="demo-reset"><span class="lead-ic">${icon("info")}</span><span class="body"><span class="t">Reset sample data</span><span class="s">Start over with fresh sample churches</span></span>${icon("chev")}</button>`}
      </div><p class="faint">${SANDBOX ? "Practice data, saved in this browser only. Nothing here reaches anyone's real data, and no money moves." : `${PLATFORM.name} preview. Everything is saved in this browser only.`}</p></section>`}`,
  };
};
Actions["profile-edit"] = () => {
  const me = S.me();
  openSheet("Your profile", html`<form data-form="profile" novalidate>
    <label class="field"><span>Name</span><input type="text" name="name" value="${me.name}" autocomplete="name" required></label>
    <label class="field"><span>Email</span><input type="email" name="email" value="${me.email}" autocomplete="email"></label>
    <label class="field"><span>Phone</span><input type="tel" name="phone" value="${me.phone}" autocomplete="tel"></label>
    <button class="btn block">Save</button></form>`);
};
Forms.profile = (d, f) => {
  if (!d.name) return formError(f, "Enter your name.");
  Object.assign(S.me(), { name: d.name, email: d.email, phone: d.phone });
  S.save(); closeSheet(); toast("Profile saved"); render();
};
Actions["leave-church"] = () => openSheet(`Leave ${S.church().name}?`, html`<p>You'll be removed from the directory, your groups' chats and member features. Your notes and giving history stay on this device.</p>
  <div class="btns"><button class="btn danger" data-act="leave-yes">Leave</button><button class="btn ghost" data-act="close-sheet">Stay</button></div>`);
Actions["leave-yes"] = () => { const n = S.church().name; S.leave(S.state.current); closeSheet(true); toast(`You left ${n}`); go(S.church() ? "home" : "churches"); };
Actions["install"] = async () => { if (!installPrompt) return; installPrompt.prompt(); try { await installPrompt.userChoice; } catch {} installPrompt = null; render(); };
Actions["demo-role"] = () => {
  const c = S.church(), cur = S.membership().roleId;
  openSheet("Try a different role", html`<p class="muted" style="margin-top:0">${SANDBOX ? "Practice only." : "Preview only."} In a live app, roles are given by the church's primary account holder or an administrator.</p>
    <div class="rows">${!S.isPrimary() ? html`<button class="row" data-act="demo-primary"><span class="body"><span class="t">Primary account holder</span><span class="s">Everything, including the church account</span></span></button>` : ""}${[...c.roles].sort((a, b) => b.rank - a.rank).map((r) => html`<button class="row" data-act="demo-role-set" data-id="${r.id}"><span class="body"><span class="t">${r.name}</span><span class="s">${plural(Object.values(r.perms).filter(Boolean).length, "permission")}</span></span>${r.id === cur && !S.isPrimary() ? icon("check") : ""}</button>`)}</div>`);
};
Actions["demo-role-set"] = (el) => {
  const c = S.church();
  if (S.isPrimary()) {
    if (!c.previousOwner) { closeSheet(true); toast("You're the primary account holder. Hand the account to someone else first, under Admin, People."); return; }
    c.ownerId = c.previousOwner; delete c.previousOwner;
  }
  S.membership().roleId = el.dataset.id;
  if (["admin"].includes(el.dataset.id)) S.membership().locations = "all";
  S.save(); closeSheet(true); toast(`You're now: ${S.role().name}`); go(el.dataset.id === "member" ? "home" : hasAdminTools() ? "admin" : hasMinistryTools() ? "ministry" : "home");
};
Actions["demo-primary"] = () => {
  makePrimary(S.church());
  S.save(); closeSheet(true); toast(`You're the primary account holder in this ${SANDBOX ? SANDBOX_NAMES[SANDBOX].toLowerCase() : "preview"}`); go("admin");
};
Actions["demo-reset"] = () => openSheet("Reset sample data?", html`<p>This clears your profile, household, notes, gifts and any churches you registered, then rebuilds the sample churches.</p>
  <div class="btns"><button class="btn danger" data-act="demo-reset-yes">Reset</button><button class="btn ghost" data-act="close-sheet">Cancel</button></div>`);
Actions["demo-reset-yes"] = () => { S.reset(); closeSheet(true); go("welcome"); };

// ---------- Ministry tools hub ----------
Screens.ministry = () => {
  if (!hasMinistryTools()) return { redirect: "me" };
  const myClasses = S.visible("gatherings", { ignoreCampus: true }).filter(isLeader);
  const docs = S.list("docs").filter((d) => d.authorId === S.me().id).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  const row = (href, ic, t, s) => html`<a class="row" href="${href}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${t}</span>${s ? html`<span class="s">${s}</span>` : ""}</span>${icon("chev")}</a>`;
  const builders = [
    S.can("build.sermons") && row("#docs-sermon", "word", "Sermon builder", "Scripture, points, keynotes, media and cues, with a presenter page"),
    S.can("build.lessons") && row("#docs-lesson", "door", "Sunday school lesson builder", S.can("manage.classes") ? "For any class" : myClasses.some((g) => g.type === "class") ? "For the classes you teach" : "You'll see your classes here once you're assigned one"),
    S.can("build.studies") && row("#docs-study", "book", "Bible study guide builder", "Questions and passages for your group"),
  ].filter(Boolean);
  const layoutRows = Object.entries(LAYOUT_KINDS).filter(([k]) => canLayouts(k)).map(([k, l]) => row(`#layouts-${k}`, "layers", l.label, plural(S.list("layouts").filter((x) => x.kind === k).length, "saved layout")));
  const sunday = [
    S.can("services.plan") && row("#services", "list", "Service plans", "Order of service, saved segments and who leads what"),
    S.can("services.plan") && row("#songs", "music", "Songs and lyrics", "Your song library, with CCLI details"),
    S.can("schedule.teams") && row("#teams", "hand", "Volunteer scheduling", "Teams, positions and who serves when"),
    (S.can("book.rooms") || S.can("manage.locations")) && row("#rooms", "door", "Rooms", "See what's free and request a room"),
    S.can("present") && row("#services", "screen", "Present", "Slides, the stage display, countdowns, livestream overlay and captions"),
    S.can("checkin.station") && row("#admin-checkin", "kid", "Check-in station", "Rosters by room and pickup by code"),
    S.can("qr.create") && row("#qr", "qr", "QR codes", "Link to events, classes, registration and check-in"),
    S.can("manage.devices") && row("#signs", "image", "Digital signage", "Playlists for lobby and hallway screens"),
    S.can("manage.devices") && row("#devices", "lock", "Screens and devices", "Sign in kiosks, presentation screens, stage displays and booth computers"),
  ].filter(Boolean);
  return {
    title: "Ministry tools", back: "me",
    body: html`
      ${builders.length ? html`<section class="sec"><h2 class="sec-head">Builders</h2><div class="rows">${builders}</div></section>` : ""}
      ${sunday.length ? html`<section class="sec"><h2 class="sec-head">Sunday</h2><div class="rows">${sunday}</div></section>` : ""}
      ${layoutRows.length ? html`<section class="sec"><h2 class="sec-head">Layouts</h2><div class="rows">${layoutRows}</div></section>` : ""}
      ${myClasses.length ? html`<section class="sec"><h2 class="sec-head">You lead</h2><div class="rows">${myClasses.map(gatheringRow)}</div></section>` : ""}
      ${docs.length ? html`<section class="sec"><h2 class="sec-head">Your recent work</h2><div class="rows">${docs.slice(0, 5).map(docRow)}</div></section>` : ""}`,
  };
};
