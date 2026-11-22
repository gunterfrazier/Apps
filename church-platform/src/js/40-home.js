// ---------- Welcome, finding a church, starting a church account, Home, announcements, Watch live ----------

function servicesSummary(c) {
  const byDay = {};
  (c.locations || []).filter((l) => l.visibility !== "private").forEach((l) => (l.services || []).forEach((s) => (byDay[s.day] = byDay[s.day] || new Set()).add(s.time)));
  return Object.entries(byDay).map(([d, times]) => `${DAYS[d]}s at ${listJoin([...times].sort().map(timeLabel))}`).join("; ") || "Service times coming soon";
}
const churchCity = (c) => c.city || c.locations?.[0]?.address?.split(",").slice(-2).join(",").trim() || "";

const PLATFORM_CHURCH = { id: "platform", name: PLATFORM.name, color: PLATFORM.color, logo: "" };
const PLATFORM_BANNER = {
  bg: { type: "gradient", preset: "aurora", color: PLATFORM.color, image: "", dim: 0 }, logo: { size: "off", align: "left" }, height: "tall",
  text: { headline: "Find your church", sub: "Sermons, events, classes, giving and prayer for your congregation, in one app.", style: "bold", size: "xl", align: "left", color: "white", shadow: true },
  graphics: [{ id: "a", kind: "builtin", builtin: "sparkle", color: "#ffffff", x: 84, y: 24, size: 18, rotate: 0, opacity: 85 }, { id: "b", kind: "builtin", builtin: "sparkle", color: "#ffffff", x: 72, y: 40, size: 7, rotate: 0, opacity: 60 }, { id: "c", kind: "builtin", builtin: "rings", color: "#ffffff", x: 100, y: 100, size: 60, rotate: 0, opacity: 18 }],
};

Screens.welcome = () => {
  if (S.me().name) return { redirect: S.church() ? "home" : "churches" };
  return { page: html`<div class="welcome"><div class="wrap">
    ${brandWord()}
    ${bannerHtml(PLATFORM_CHURCH, PLATFORM_BANNER)}
    <form data-form="welcome" class="panel" style="margin-top:18px" novalidate>
      <h2 style="margin-bottom:4px">Create your account</h2><p class="muted" style="margin-top:0">Then join your church, or register one.</p>
      <label class="field"><span>Your name</span><input type="text" name="name" autocomplete="name" required></label>
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email"><small>Optional. Churches use it for giving receipts and group updates.</small></label>
      <button class="btn block">Create my account</button>
    </form>
    ${Backend.on ? "" : html`<p class="faint" style="margin-top:14px;text-align:center">This preview keeps everything in this browser. Nothing is sent anywhere, and no real money moves.</p>`}
    <p style="text-align:center;margin-top:10px"><a class="linkish" href="#pair">${icon("lock")}Set up a church device</a></p>
  </div></div>` };
};
Forms.welcome = (d, f) => {
  if (!d.name) return formError(f, "Enter your name to continue.");
  Object.assign(S.me(), { name: d.name, email: d.email || "" });
  S.save();
  const next = pendingRoute && !/^welcome/.test(pendingRoute) ? pendingRoute : "churches";
  pendingRoute = null; go(next);
};

function churchCard(c) {
  const pub = c.locations.filter((l) => l.visibility !== "private").length;
  return html`<a class="church-card" href="#church-${c.id}" data-search="${c.name} ${churchCity(c)} ${c.handle}">${bannerHtml(c, bannerOf(c), { mini: true })}
    <span class="cc-body">${churchMark(c, 44)}<span class="body"><span class="t">${c.name}</span><span class="s">${churchCity(c)}${pub > 1 ? `, ${pub} locations` : ""}</span></span>
    ${c.sample ? html`<span class="tag">Sample</span>` : ""}${S.isMember(c.id) ? html`<span class="tag brand">Joined</span>` : ""}</span></a>`;
}
Screens.churches = () => {
  const mine = S.myChurches();
  // A deactivated church is in nobody's list of churches; its primary account holder finds it under "Your churches".
  const all = S.churches().filter((c) => !S.deactivated(c) && (!c.training || S.isMember(c.id))).sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: "Find your church", back: S.church() && deactStatus() !== "deactivated" ? "home" : null,
    body: html`
      ${mine.length ? html`<section class="sec"><h2 class="sec-head">Your churches</h2><div class="rows">${mine.map((c) => html`
        <button class="row" data-act="switch-church" data-id="${c.id}">${churchMark(c)}<span class="body"><span class="t">${c.name}</span><span class="s">${S.deactivated(c) ? `Deleted for good on ${longDay(deactOf(c).purgeAt)} unless you reactivate it` : S.role(c.id).name}</span></span>${S.deactivated(c) ? html`<span class="tag warn">Deactivated</span>` : c.id === S.state.current ? html`<span class="tag brand">Open</span>` : icon("chev")}</button>`)}</div></section>` : ""}
      <div class="btns">
        <a class="btn ghost" href="#help">Help &amp; support</a>
        ${Backend.user ? html`<button class="btn ghost" data-act="sign-out">Sign out</button>` : ""}
      </div>
      <section class="sec">
        <label class="field search-field"><span class="sr">Search by name, city or church ID</span>${icon("search")}<input type="search" placeholder="Search by name, city or church ID" data-input="filter-rows" data-target="#church-list" data-empty="#church-none"></label>
        <div class="card-list" id="church-list">${all.map(churchCard)}</div>
        <div id="church-none" class="empty" hidden><p>No church matches that search.</p></div>
      </section>
      <section class="sec panel">
        <h2>Don't see your church?</h2>
        <p class="muted">Create an account for your congregation. The church gets its own account, separate from yours, and you become its primary account holder.</p>
        <a class="btn" href="#start">${icon("plus")}Register your church</a>
      </section>`,
  };
};
Actions["switch-church"] = (el) => { closeSheet(true); S.setCurrent(el.dataset.id); go("home"); };

// The church's front door: its banner and landing page, plus a way to join.
Screens.church = (id) => {
  const c = S.church(id);
  if (!c) return { redirect: "churches" };
  return {
    title: c.name, back: S.church() ? "churches" : null,
    body: html`<div style="margin-top:14px">${bannerHtml(c)}</div>
      <div class="panel" style="margin-top:14px">
        <div style="display:flex;gap:14px;align-items:center">${churchMark(c, 52)}<div><h2>${c.name}</h2><p class="muted" style="margin:0">${churchCity(c)}</p></div></div>
        ${c.tagline ? html`<p class="lead" style="margin-top:14px">${c.tagline}</p>` : ""}
        <div class="meta">${icon("clock")}<span>${servicesSummary(c)}</span>
          ${c.locations.filter((l) => l.visibility !== "private").map((l) => html`${icon("pin")}<span><b>${l.name}</b>${l.address ? html`<br><a href="${mapLink(l.address)}" target="_blank" rel="noopener">${l.address}</a>` : ""}</span>`)}</div>
        ${c.sample ? html`<p class="faint">This is a sample church so you can try the app.</p>` : ""}
        <div class="btns stack">
          ${S.isMember(c.id) ? html`<button class="btn block" data-act="switch-church" data-id="${c.id}">Open ${c.name}</button>`
            : html`<button class="btn block" data-act="join-church" data-id="${c.id}">Join ${c.name}</button>
                   <button class="btn ghost block" data-act="switch-church" data-id="${c.id}">Look around first</button>`}
        </div>
      </div>
      ${c.landing?.blocks?.length ? html`<div class="landing">${landingBlocks(c)}</div>` : ""}`,
  };
};
Actions["join-church"] = (el) => {
  const c = S.church(el.dataset.id);
  if (!S.me().name) { pendingRoute = `church-${c.id}`; go("welcome"); return; }
  if (S.isMember(c.id) || c.training) { S.join(c.id); go("home"); return; }
  openSheet(`Welcome to ${c.name}`, html`<p>How do you currently attend this church?</p>
    <div class="btns stack">${Object.entries(CHURCH_ATTENDEE_TYPES).map(([status, label]) => html`<button class="btn ghost block" data-act="join-with-status" data-id="${c.id}" data-status="${status}">${label}</button>`)}</div>`);
};
const CHURCH_ATTENDEE_TYPES = { first: "First-time visitor", returning: "Returning visitor", member: "Member" };
Actions["join-with-status"] = (el) => {
  const { id, status } = el.dataset;
  if (!S.church(id) || !Object.hasOwn(CHURCH_ATTENDEE_TYPES, status) || S.isMember(id)) return;
  S.state.churchAttendeeTypes ||= {};
  S.state.churchAttendeeTypes[id] = status;
  S.join(id);
  if (status === "first" && welcomeOf().ask) firstVisitCardFor = id;
  closeSheet(true); go("home");
};

// ---------- Registering a church account ----------
let startLocRows = 1;
function startLocRow(i) {
  return html`<fieldset class="loc-row panel" style="margin-top:10px"><legend class="faint" style="font-weight:700;padding:0 4px">Location ${i + 1}</legend>
    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:8px">
      <label class="field" style="margin:4px 0"><span>Name</span><input type="text" name="locName${i}" placeholder="${i ? "East campus" : "Main campus"}" maxlength="40"></label>
      <label class="field" style="margin:4px 0"><span>Unique ID</span><input type="text" name="locCode${i}" placeholder="${i ? "EAST" : "MAIN"}" maxlength="12" style="text-transform:uppercase"></label></div>
    <label class="field" style="margin:4px 0"><span>Address</span><input type="text" name="locAddress${i}" maxlength="120"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label class="field" style="margin:4px 0"><span>Main service</span><select name="locDay${i}">${DAYS.map((d, n) => html`<option value="${n}">${d}</option>`)}</select></label>
      <label class="field" style="margin:4px 0"><span>Time</span><input type="time" name="locTime${i}" value="10:00"></label></div>
    <div class="radios" style="margin-top:6px"><label><input type="radio" name="locVis${i}" value="public" checked><span>Public</span></label><label><input type="radio" name="locVis${i}" value="private"><span>Private</span></label></div>
  </fieldset>`;
}
Screens.start = (mode) => {
  startLocRows = 1;
  const guided = mode === "guided";
  return {
    title: "Register your church", back: S.church() ? "churches" : null,
    body: html`<div class="btns">
      ${guided ? html`<a class="btn ghost" href="#start">Set up manually</a>` : html`<a class="btn" href="#start-guided">${icon("list")}Use setup wizard</a>`}
    </div><form data-form="start-church" ${attr(guided, 'data-guided-registration data-setup-step="0"')} novalidate>
      ${guided ? html`<p class="setup-progress" data-setup-progress tabindex="-1">Step 1 of 4 · Church details</p>` : ""}
      <section data-setup-stage="0">
      <p class="muted" style="margin-top:12px">This creates a church account, separate from your own. You'll be its <b>primary account holder</b>: you choose its roles, features and defaults, and can hand the account to someone else later.</p>
      <h2 style="margin-top:20px">Church account</h2>
      <label class="field"><span>Church name</span><input type="text" name="name" required maxlength="60" data-input="suggest-handle"></label>
      <label class="field"><span>Church ID</span><input type="text" name="handle" maxlength="30" placeholder="grace-point-savannah" pattern="[a-z0-9-]+"><small>A unique ID people can search for. Lowercase letters, numbers and hyphens.</small></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field"><span>Church email</span><input type="email" name="email"></label>
        <label class="field"><span>Church phone</span><input type="tel" name="phone"></label></div>
      <label class="field"><span>City and state</span><input type="text" name="city" placeholder="Springfield, IL" maxlength="60"></label>
      <label class="field"><span>One line about your church</span><input type="text" name="tagline" maxlength="90"></label>
      <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Church color</legend>
        ${colorPicker("customColor", PLATFORM.color, { label: "Church color", church: true })}
        <small>Upload your logo later in Admin, Account details, and the app suggests colors from it.</small></fieldset>
      </section><section data-setup-stage="1" ${attr(guided, "hidden")}>
      <h2 style="margin-top:20px">Campuses and locations</h2>
      <p class="faint">Give each location a unique ID, like MAIN or EAST. Private locations only show to people you give access.</p>
      <div id="loc-rows">${startLocRow(0)}</div>
      <button type="button" class="btn ghost sm" style="margin-top:10px" data-act="add-start-loc">${icon("plus")}Add another location</button>
      </section>
      ${guided ? html`<section data-setup-stage="2" hidden>
        <h2>Choose features</h2><p>Pick the features you want to launch with. You can turn features on later from Admin and add other guides to your checklist.</p>
        ${setupFeaturePicker([...MODULES.map(([id]) => id), "visitors"])}
      </section><section data-setup-stage="3" hidden>
        ${setupExportButtons()}
        <div data-setup-review></div>
      </section>` : ""}
      <div class="btns">
        ${guided ? html`<button type="button" class="btn ghost" data-act="setup-back" hidden>Back</button>
          <button type="button" class="btn" data-act="setup-next">Continue</button>` : ""}
        <button class="btn" data-setup-create ${attr(guided, "hidden")}>Create church account</button>
      </div>
    </form>`,
  };
};
Inputs["suggest-handle"] = (el) => { const h = $("input[name=handle]", el.form); if (!h.dataset.touched) h.value = slugify(el.value).slice(0, 30); };
document.addEventListener("input", (e) => { if (e.target.name === "handle") e.target.dataset.touched = "1"; });
Actions["add-start-loc"] = () => { $("#loc-rows").insertAdjacentHTML("beforeend", flat(startLocRow(startLocRows++))); $(`input[name=locName${startLocRows - 1}]`).focus(); };
Forms["start-church"] = (d, f, fd) => {
  const guided = f.hasAttribute("data-guided-registration");
  if (guided && Number(f.dataset.setupStep) < 3) return Actions["setup-next"]({ form: f });
  if (!d.name) return registrationFieldError(f, 0, "Enter your church's name.");
  const handle = slugify(d.handle || d.name);
  if (S.churches().some((c) => c.handle === handle)) return registrationFieldError(f, 0, `The church ID "${handle}" is taken. Try another.`);
  const locations = [], codes = new Set();
  for (let i = 0; i < 20; i++) {
    if (!(`locName${i}` in d)) break;
    if (!d[`locName${i}`] && !d[`locCode${i}`]) continue;
    const code = (d[`locCode${i}`] || d[`locName${i}`]).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    if (!code) return registrationFieldError(f, 1, `Give location ${i + 1} a unique ID.`);
    if (codes.has(code)) return registrationFieldError(f, 1, `Two locations use the ID ${code}. Each needs its own.`);
    codes.add(code);
    locations.push({ code, name: d[`locName${i}`] || code, address: d[`locAddress${i}`] || "", visibility: d[`locVis${i}`] || "public", rooms: [], liveUrl: "",
      services: d[`locTime${i}`] ? [svc(+d[`locDay${i}`], d[`locTime${i}`], "Worship service")] : [] });
  }
  if (!locations.length) locations.push({ code: "MAIN", name: "Main campus", address: "", visibility: "public", rooms: [], liveUrl: "", services: [svc(0, "10:00", "Worship service")] });
  const chosenColor = /^#[0-9a-fA-F]{6}$/.test(d.customColor || "") ? d.customColor.toLowerCase() : (d.color || BRAND_COLORS[0]);
  const selected = guided ? chosenSetupTopics(fd.getAll("setupTopic")) : [];
  const setup = guided ? { modules: Object.fromEntries(MODULES.map(([id]) => [id, selected.includes(id)])), setupGuide: { selected, done: {} } } : {};
  const c = S.createChurch({ ...setup, name: d.name, handle, email: d.email || "", phone: d.phone || "", city: d.city || "", tagline: d.tagline || "", color: chosenColor, sign: ["Welcome", d.tagline || ""], locations });
  toast(`${c.name} is ready. You're its primary account holder.`); go(guided ? "admin-setupguide" : "admin");
};

// ---------- Home ----------
const quickTile = ([href, ic, label]) => html`<a href="${href}"><span class="ic">${icon(ic)}</span>${label}</a>`;
function quickActions() {
  // Two rows at most; the rest are a tap away under More.
  const items = quickItems().filter(([href]) => !featureOffFor(href)), shown = items.length > 8 ? items.slice(0, 7) : items;
  return html`<div class="quick">${shown.map(quickTile)}${items.length > 8 ? html`<button type="button" data-act="quick-more"><span class="ic">${icon("list")}</span>More</button>` : ""}</div>`;
}
function quickItems() {
  const c = S.church(), member = S.isMember();
  const live = upcomingServices(c, 3).find((s) => s.live);
  const hasKidsRegs = S.list("gatherings").some((g) => kidsIn(g).length) || S.list("events").some((e) => myRegistration(e)?.kids?.length);
  const items = [
    // What everyone uses first, then the tools of each person's role.
    S.on("live") && ["#live", live ? "live" : "play", live ? "Watch live" : "Watch"],
    S.on("giving") && ["#give", "give", "Give"],
    S.on("prayer") && ["#connect", "pray", "Prayer"],
    S.on("checkin") && member && S.can("use.checkin") && ["#checkin", "kid", "Check in"],
    S.on("classes") && ["#classes", "door", "Classes"],
    S.on("parents") && member && hasKidsRegs && ["#parents", "kid", "Parents"],
    member && S.can("present") && ["#presenter", "screen", "Presenter"],
    member && (S.list("services").some((p) => (p.assignments || []).some((a) => a.userId === S.me().id && a.status !== "declined")) || myTeams().length) && ["#serving", "hand", "Serving"],
    member && S.can("checkin.station") && S.on("checkin") && ["#station", "kid", "Check-in station"],
    member && S.can("schedule.teams") && ["#teams", "people", "Schedule teams"],
    hasMinistryTools() && ["#ministry", "layers", "Ministry"],
    hasAdminTools() && ["#admin", "shield", "Admin"],
    ["#scan", "scan", "Scan"],
  ].filter(Boolean);
  return items;
}

Actions["quick-more"] = () => openSheet("Shortcuts", html`<div class="quick in-sheet">${quickItems().filter(([href]) => !featureOffFor(href)).map(quickTile)}</div>`);
Screens.home = () => {
  const c = S.church();
  const services = upcomingServices(c, 8).filter((s, i) => i === 0 || s.start - Date.now() < 7 * DAY).slice(0, 4);
  const when = (s) => s.live ? `Started at ${fmtTime(s.start)}` : isoDay(s.start) === isoDay(new Date()) ? `Today at ${fmtTime(s.start)}` : `${fmt(s.start, { weekday: "long", month: "short", day: "numeric" })} at ${fmtTime(s.start)}`;
  const latest = S.on("sermons") && sermonsSorted()[0];
  const news = newsSorted();
  const urgent = unreadNews().filter((n) => n.urgent);
  const events = S.on("events") ? upcomingEvents().slice(0, 6) : [];
  const plans = S.on("plans") ? S.list("plans") : [];
  const active = plans.find((p) => planState(p) && nextPlanDay(p) != null);
  const band = html`<header class="home-top"><div class="wrap">
    <div class="home-bar">
      <button class="switcher" data-act="open-switcher" aria-label="Switch church">${churchMark(c, 40)}<span><strong>${c.name}</strong><small>${churchCity(c) || "Your church"} ${icon("down")}</small></span></button>
      ${headerIcons()}
    </div>
    ${campusChip()}
  </div></header>`;

  const greet = () => { const h = new Date().getHours(), first = (S.me().name || "").split(" ")[0];
    return html`<div class="greeting"><h1>${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}${first ? `, ${first}` : ""}</h1><p>${fmt(new Date(), { weekday: "long", month: "long", day: "numeric" })}</p></div>`; };
  // Each section of Home, by its ID in Admin, Home screen (homeLayout). A section with nothing to show is left out.
  const sections = {
    banner: () => html`<div class="home-banner">${bannerHtml(c)}</div>`,
    greeting: () => html`${S.isMember() ? greet() : ""}${whatsNewCard()}`,
    hero: () => homeHero(c, services[0], when),
    quick: () => quickActions(),
    landing: () => html`
      ${c.landing?.blocks?.length ? html`<div class="landing">${landingBlocks(c, { home: true })}</div>` : ""}`,
    latest: () => html`
      ${latest ? html`<section class="sec"><div class="sec-head"><h2>Latest message</h2><a href="#word">All sermons</a></div>
        <div class="sermon-card modern">
          <a href="#sermon-${latest.id}" style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:16px;flex:1;min-width:0">
            ${typeof sermonArtTile === "function" ? sermonArtTile(latest, 84) : ""}
            <span class="sc-body"><span class="sc-k">${latest.series}</span><span class="sc-title">${latest.title}</span>
            <span class="sc-meta">${latest.passage} · ${latest.speaker}</span></span>
          </a>
          ${sermonSources(latest).length ? html`<button type="button" class="sc-play-btn" data-act="mini-play" data-id="${latest.id}" data-title="${latest.title}" aria-label="${Player.isPlaying(latest.id) ? "Pause" : "Play"} ${latest.title}">${icon(Player.isPlaying(latest.id) ? "pause" : "play")}</button>` : ""}
        </div></section>` : ""}`,
    gather: () => html`
      <section class="sec">
        <div class="sec-head"><h2>Gather with us</h2>${S.on("live") ? html`<a href="#live">Watch live</a>` : ""}</div>
        <div class="rows">${services.length ? services.map((s) => html`<a class="row" href="#live"><span class="lead-ic">${icon(s.live ? "live" : "clock")}</span><span class="body"><span class="t">${s.label || "Service"}${s.live ? html` <span class="tag warn">Live now</span>` : ""}</span><span class="s">${when(s)}${multiCampus() ? `, ${s.location.name}` : ""}</span></span>${icon("chev")}</a>`) : empty("Service times haven't been added yet.")}</div>
      </section>`,
    events: () => html`
      ${S.on("events") ? html`<section class="sec"><div class="sec-head"><h2>Coming up</h2><a href="#events">All events</a></div>
        ${events.length ? html`${featuredEvent(events[0])}${events.length > 1 ? html`<div class="carousel" style="margin-top:14px">${events.slice(1).map(eventCard)}</div>` : ""}` : html`<div class="rows">${empty("No events on the calendar yet.")}</div>`}</section>` : ""}`,
    groups: () => homeGroups(),
    plans: () => html`
      ${plans.length ? html`<section class="sec"><div class="sec-head"><h2>Daily reading</h2><a href="#plans">Plans</a></div>
        ${active ? planTodayRow(active) : html`<div class="rows"><a class="row" href="#plans"><span class="lead-ic">${icon("book")}</span><span class="body"><span class="t">Start a reading plan</span><span class="s">${plural(plans.length, "plan")} from ${c.name}</span></span>${icon("chev")}</a></div>`}
      </section>` : ""}`,
    votd: () => (typeof votdCard === "function" ? votdCard() : ""),
    news: () => html`
      ${news.length ? html`<section class="sec"><div class="sec-head"><h2>Announcements</h2><a href="#alerts">See all</a></div>
        <div class="rows">${news.slice(0, 3).map(announcementRow)}</div></section>` : ""}`,
    connect: () => html`
      <section class="sec"><div class="rows">
        <button class="row" data-act="connect-card"><span class="lead-ic">${icon("inbox")}</span><span class="body"><span class="t">Connect card</span><span class="s">New here, have a question, or want to talk with a pastor?</span></span>${icon("chev")}</button>
        <button class="row" data-act="invite"><span class="lead-ic">${icon("share")}</span><span class="body"><span class="t">Invite a friend</span><span class="s">Text, email or share an invitation with service times and directions</span></span>${icon("chev")}</button>
      </div></section>`,
    social: () => socialRow(c),
  };
  return {
    tab: "home", band,
    body: html`
      ${!S.isMember() ? html`<div class="panel join-card"><p style="margin-top:0"><b>You're looking around ${c.name}.</b> Join to post prayer requests, register for classes, chat with your groups and check in your kids.</p><button class="btn block" data-act="join-church" data-id="${c.id}">Join ${c.name}</button></div>` : ""}
      ${(() => { const asks = pendingAsks(); return asks.length ? html`<a class="alert ask" href="#serving">${icon("hand")}<div><b>Can you serve?</b><span>${asks[0][1].position}, ${planLabel(asks[0][0])}${asks.length > 1 ? ` and ${plural(asks.length - 1, "more request")}` : ""}</span></div></a>` : ""; })()}
      ${deactAlerts()}
      ${urgent.map((n) => html`<a class="alert" href="#news-${n.id}">${icon("bell")}<div><b>${n.title}</b><span>${n.body}</span></div></a>`)}
      ${homeLayout(c).filter((x) => x.on && sections[x.id]).map((x) => sections[x.id]())}`,
  };
};
/** "Up next": the next service, or the live stream while it's on, over the church's photo. */
function homeHero(c, s, when) {
  if (!s) return "";
  // Its own photo (Admin, Home screen), else the banner's when the banner isn't also on Home, else the accent color.
  const bannerOn = homeLayout(c).find((x) => x.id === "banner")?.on;
  const bg = c.heroPhoto || (!bannerOn && c.banner?.bg?.type === "image" && c.banner.bg.image) || "";
  const addr = s.location?.address;
  return html`<section class="sec"><div class="hero-card">
    ${bg ? html`<img src="${bg}" alt="" decoding="async">` : ""}
    <span class="hero-k ${s.live ? "live" : ""}">${s.live ? "Live now" : "Up next"}</span>
    <h2 class="hero-title">${s.label || "Sunday worship"}</h2>
    <p class="hero-meta">${when(s)}${multiCampus() && s.location ? ` · ${s.location.name}` : ""}</p>
    <div class="hero-btns">
      ${S.on("live") ? html`<a class="hero-btn" href="#live">${icon(s.live ? "live" : "play")}${s.live ? "Watch live" : "Watch online"}</a>` : ""}
      ${!S.isMember() || isFirstVisitSoon() ? html`<a class="hero-btn ${S.on("live") ? "glass" : ""}" href="#visit">${icon("star")}Plan your visit</a>` : addr ? html`<a class="hero-btn glass" href="${mapLink(addr)}" target="_blank" rel="noopener">${icon("pin")}Directions</a>` : ""}
    </div></div></section>`;
}
const isFirstVisitSoon = () => false;
/** The next event as a full-width photo card: who's going, and the next step (sign up, or directions). */
function featuredEvent(e) {
  const reg = myRegistration(e), d = new Date(e.start), going = (e.registrations || []).filter((r) => r.by !== S.me().id);
  const people = going.reduce((n, r) => n + (r.count || 1), 0) + (reg ? reg.count || 1 : 0);
  const addr = fullAddress(e);
  return html`<article class="feature-card ${e.image ? "has-photo" : ""}">
    <a class="fc-link" href="#event-${e.id}" aria-label="${e.title}">${e.image ? html`<img src="${e.image}" alt="" decoding="async">` : ""}</a>
    <div class="fc-top">${e.category ? html`<span class="tag ec-cat">${e.category}</span>` : ""}<span class="ec-date"><span>${fmtMonth(d)}</span><b>${d.getDate()}</b></span></div>
    <div class="fc-body">
      <h3 class="fc-title">${e.title}</h3>
      <p class="fc-meta">${fmt(d, { weekday: "long" })} at ${fmtTime(d)}${placeText(e) ? ` · ${placeText(e)}` : ""}</p>
      <div class="fc-foot">
        ${people ? html`<span class="fc-going">${going.slice(0, 3).map((r) => avatar({ id: r.by, name: r.name || S.userName(r.by) }, "fc-face"))}<span>${reg ? (people > 1 ? `You and ${plural(people - (reg.count || 1), "other", "others")}` : "You're going") : `${plural(people, "person", "people")} going`}</span></span>` : html`<span class="fc-going"><span>${e.signup ? "Be the first to sign up" : "Everyone's welcome"}</span></span>`}
        <span class="fc-btns">${addr ? html`<a class="fc-btn" href="${mapLink(addr)}" target="_blank" rel="noopener" aria-label="Directions to ${e.title}">${icon("pin")}</a>` : ""}
          <a class="fc-btn primary" href="#event-${e.id}">${reg ? "You're going" : e.tickets?.length ? "Tickets" : e.signup ? "Sign up" : "Details"}</a></span>
      </div></div></article>`;
}
/** Groups and classes with photos, to browse from Home. */
function homeGroups() {
  if (!S.on("groups") && !S.on("classes")) return "";
  const list = S.visible("gatherings").filter((g) => g.photo && (g.type === "group" ? S.on("groups") : S.on("classes")) && g.category !== "Staff" && !isIn(g) && !(g.ageMax != null && g.ageMax < 18))
    .sort((a, b) => (a.type === "group" ? 0 : 1) - (b.type === "group" ? 0 : 1)).slice(0, 8);
  if (list.length < 2) return "";
  return html`<section class="sec"><div class="sec-head"><h2>Find your people</h2><a href="#groups">All groups</a></div>
    <div class="carousel">${list.map((g) => html`<a class="group-card" href="#gathering-${g.id}"><img src="${g.photo}" alt="" loading="lazy" decoding="async"><span class="gc-body"><span class="gc-k">${g.category}</span><span class="gc-title">${g.name}</span><span class="gc-meta">${scheduleText(g)}</span></span></a>`)}</div></section>`;
}
function eventCard(e) {
  const reg = myRegistration(e), d = new Date(e.start);
  return html`<a class="event-card" href="#event-${e.id}">
    <div class="ec-media">${e.image ? html`<img src="${e.image}" alt="" loading="lazy" decoding="async">` : ""}
      ${e.category ? html`<span class="tag ec-cat">${e.category}</span>` : ""}
      <span class="ec-date"><span>${fmtMonth(d)}</span><b>${d.getDate()}</b></span>
      ${reg ? html`<span class="tag ok ec-tag">Going</span>` : ""}
    </div>
    <div class="ec-body">
      <span class="ec-title">${e.title}</span><span class="ec-meta">${fmt(d, { weekday: "short" })} ${fmtTime(d)}</span><span class="ec-meta">${placeText(e)}</span>
    </div></a>`;
}

function planTodayRow(p) {
  const d = nextPlanDay(p), refs = p.days[d];
  const done = planState(p).done.length;
  return html`<div class="panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><b>${p.name}</b><span class="faint">Day ${d + 1} of ${p.days.length}</span></div>
    <div class="progress" style="margin:8px 0 12px"><i style="width:${Math.round(done / p.days.length * 100)}%"></i></div>
    <p class="scripture" style="font-size:1.15rem;margin:0">${refs.join(", ")}</p>
    <div class="btns">${readLink(refs[0])}<button class="btn ghost sm" data-act="plan-done" data-plan="${p.id}" data-day="${d}">${icon("check")}Mark as read</button></div></div>`;
}

function eventRow(e) {
  const reg = myRegistration(e), d = new Date(e.start);
  return html`<a class="event-card-row" href="#event-${e.id}">
    ${e.image ? html`<div class="ecr-banner"><img src="${e.image}" alt=""></div>` : ""}
    <div class="ecr-main"><span class="date"><span>${fmtMonth(d)}</span><b>${d.getDate()}</b></span>
      <span class="body"><span class="t">${e.title}</span><span class="s">${fmt(d, { weekday: "short" })} ${fmtTime(d)} · ${placeText(e)}</span>${e.category ? html`<span class="tag brand" style="margin-top:4px">${e.category}</span>` : ""}</span>
      ${reg ? html`<span class="tag ok">Going</span>` : icon("chev")}</div></a>`;
}

Actions["open-switcher"] = () => {
  const mine = S.myChurches();
  const list = mine.some((c) => c.id === S.state.current) ? mine : [S.church(), ...mine];
  openSheet("Your churches", html`<div class="rows">${list.map((c) => html`<button class="row" data-act="switch-church" data-id="${c.id}">${churchMark(c)}<span class="body"><span class="t">${c.name}</span><span class="s">${S.isMember(c.id) ? S.role(c.id).name : "Looking around"}</span></span>${c.id === S.state.current ? icon("check") : ""}</button>`)}</div>
    <div class="btns stack"><button class="btn ghost block" data-act="go" data-to="churches">${icon("search")}Find another church</button></div>`);
};

// Invite a friend: the invitation opens ready to send in the phone's own messaging or email app (sms: and mailto:
// links, so no permissions are needed and it goes from the person's own number or account), in any app through the
// phone's share sheet, or onto the clipboard. The text can be changed first.
const inviteText = (c) => `Come to church with me! ${c.name}${churchCity(c) ? ` in ${churchCity(c)}` : ""}. ${servicesSummary(c)}. Find "${c.name}" in the ${PLATFORM.name}: ${appLink(`church-${c.id}`)}`;
const inviteSubject = (c) => `Join me at ${c.name}`;
// iPhones read the message after "sms:&body="; Android and others after "sms:?body=".
const smsHref = (text) => `sms:${/iphone|ipad|ipod/i.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(text)}`;
const mailHref = (c, text) => `mailto:?subject=${encodeURIComponent(inviteSubject(c))}&body=${encodeURIComponent(text)}`;
Actions["invite"] = () => {
  const c = S.church(), text = inviteText(c);
  openSheet("Invite a friend", html`<label class="field" style="margin-top:0"><span>Your invitation</span><textarea id="invite-text" data-input="invite-text" maxlength="1000">${text}</textarea><small>Change it however you like before you send it.</small></label>
    <div class="rows invite-ways">
      <a class="row" id="invite-sms" href="${smsHref(text)}"><span class="lead-ic">${icon("chat")}</span><span class="body"><span class="t">Text message</span><span class="s">Opens your messaging app with the invitation filled in</span></span>${icon("chev")}</a>
      <a class="row" id="invite-mail" href="${mailHref(c, text)}"><span class="lead-ic">${icon("mail")}</span><span class="body"><span class="t">Email</span><span class="s">Opens your email app, ready to send from your own account</span></span>${icon("chev")}</a>
      ${typeof navigator.share === "function" ? html`<button type="button" class="row" data-act="invite-share"><span class="lead-ic">${icon("share")}</span><span class="body"><span class="t">More ways to share</span><span class="s">WhatsApp, Messenger and your other apps</span></span>${icon("chev")}</button>` : ""}
      <button type="button" class="row" data-act="invite-copy"><span class="lead-ic">${icon("copy")}</span><span class="body"><span class="t">Copy invitation</span><span class="s">Paste it anywhere</span></span></button>
    </div>`);
};
Inputs["invite-text"] = (el) => { const c = S.church(); $("#invite-sms").href = smsHref(el.value); $("#invite-mail").href = mailHref(c, el.value); };
Actions["invite-share"] = async () => {
  try { await navigator.share({ title: inviteSubject(S.church()), text: $("#invite-text").value }); }
  catch (e) { if (e?.name !== "AbortError") copyText($("#invite-text").value, "Invitation copied"); }   // no share sheet here: copy instead
};
Actions["invite-copy"] = () => copyText($("#invite-text").value, "Invitation copied");

Actions["connect-card"] = () => {
  const me = S.me();
  const reasons = ["I'm new here", "I'd like to talk with a pastor", "I want to be baptized", "I'd like to serve", "I have a question"];
  openSheet("Connect card", html`<form data-form="connect-card" novalidate>
    <p class="muted" style="margin-top:0">Goes to the staff at ${S.church().name}.</p>
    <fieldset class="field" style="border:0;padding:0"><legend class="sr">Reason</legend>${reasons.map((r, i) => html`<label class="check"><input type="radio" name="reason" value="${r}" ${attr(i === 0, "checked")}><span>${r}</span></label>`)}</fieldset>
    <label class="field"><span>Anything you'd like us to know</span><textarea name="message" maxlength="1000"></textarea></label>
    <label class="field"><span>Email or phone</span><input type="text" name="contact" value="${me.email || me.phone || ""}" maxlength="120"></label>
    <button class="btn block">Send card</button></form>`);
};
Forms["connect-card"] = (d, f) => {
  if (!d.contact) return formError(f, "Add an email or phone number so someone can reach you.");
  const rec = S.add("cards", { by: S.me().id, name: S.me().name, reason: d.reason, message: d.message, contact: d.contact, at: new Date().toISOString(), handled: false });
  emit("card.created", { name: rec.name, reason: rec.reason, message: rec.message, contact: rec.contact });
  const email = d.contact.includes("@") ? d.contact : S.me().email, phone = d.contact.includes("@") ? S.me().phone : d.contact;
  startFollowup({ personId: S.me().id, name: S.me().name, email, phone, source: "card", cardId: rec.id, reason: d.reason, message: d.message });
  closeSheet(); toast(`Sent to ${S.church().name}`);
};

const OpeningSummary = {
  eligible: false,
  pending: true,
  show() {
    if (!this.pending || !this.eligible || document.visibilityState !== "visible" ||
        !S.church() || !S.me().name || pendingRoute || thisDevice() || SANDBOX || isTrainingChurch() || $("#scrim, #now-playing[open]") ||
        ((Backend.on || Backend.configured()) && !Backend.ready)) return;
    this.pending = false;

    const serving = pendingAsks();
    const followups = canFollow() ? S.list("followups").filter((f) =>
      f.assignedTo === S.me().id && ["new", "contacted"].includes(f.status)) : [];
    const { news, alerts } = pendingAlerts();
    const chats = myChannels().filter(isUnread);
    if (!(serving.length || followups.length || alerts.length || news.length || chats.length)) return;

    const row = (href, title, detail = "") => html`<a class="row" href="${href}" data-act="go" data-to="${href.slice(1)}"><span class="body"><span class="t">${title}</span>
      ${detail ? html`<span class="s">${detail}</span>` : ""}</span>${icon("chev")}</a>`;
    openSheet("Your pending items", html`
      ${serving.length || followups.length ? html`<section class="sec"><h3>Tasks</h3><div class="rows">
        ${serving.map(([p, a]) => row("#serving", a.position, planLabel(p)))}
        ${followups.map((f) => row(`#guest-${f.id}`, `Follow up with ${f.name}`, f.reason))}
      </div></section>` : ""}
      ${alerts.length || news.length ? html`<section class="sec"><h3>Notifications</h3><div class="rows">
        ${alerts.map((n) => html`<button type="button" class="row" data-act="notes-open" data-id="${n.id}"><span class="body"><span class="t">${n.title}</span></span>${icon("chev")}</button>`)}
        ${news.slice(0, 5).map((n) => row(`#news-${n.id}`, n.title, "Announcement"))}
        ${news.length > 5 ? row("#alerts", plural(news.length - 5, "more announcement")) : ""}
      </div></section>` : ""}
      ${chats.length ? html`<section class="sec"><h3>Unread messages</h3><div class="rows">
        ${chats.map((ch) => row(`#thread-${ch.id}`, ch.name, ch.sub))}
      </div></section>` : ""}
      <div class="btns"><button type="button" class="btn ghost" data-act="close-sheet">Dismiss</button></div>
    `, { focus: '[data-act="close-sheet"]' });
  },
};

function announcementRow(n) {
  return html`<a class="row" href="#news-${n.id}"><span class="lead-ic">${icon("bell")}</span>
    <span class="body"><span class="t">${n.title}</span>
      <span class="s">${[ago(n.at), n.locationId && locName(n.locationId)].filter(Boolean).join(" · ")}</span>
      ${n.urgent || !S.state.seen.includes(n.id) ? html`<span class="row-tags">${n.urgent ? html`<span class="tag warn">Important</span>` : ""}${!S.state.seen.includes(n.id) ? html`<span class="tag brand">New</span>` : ""}</span>` : ""}</span>
    ${icon("chev")}</a>`;
}

const readableAnnouncements = () => S.visible("news", { ignoreCampus: true });
const announcementIdInNotice = (notice) => notice.kind === "news" ? notice.announcementId || /^#news-(.+)$/.exec(notice.link || "")?.[1] : null;

function announcementForNotice(notice, announcements) {
  if (notice.kind !== "news") return null;
  const id = announcementIdInNotice(notice);
  if (id) return announcements.find((n) => n.id === id);
  if (notice.link !== "#alerts") return null;
  // Older announcement notifications contain only the title and an excerpt. Leave ambiguous notices separate.
  const matches = announcements.filter((n) => n.title === notice.title && (n.body || "").slice(0, 140) === notice.body &&
    Date.parse(n.at) <= Date.parse(notice.at));
  return matches.length === 1 ? matches[0] : null;
}

function pendingAlerts() {
  const news = unreadNews(), notices = myNotifications().filter((n) => !n.read);
  if (!news.length || !notices.length) return { news, alerts: notices };
  const ids = new Set(news.map((n) => n.id)), announcements = readableAnnouncements();
  const alerts = notices.filter((n) => !ids.has(announcementForNotice(n, announcements)?.id));
  return { news, alerts };
}

Screens.news = (id) => {
  const announcements = readableAnnouncements(), item = announcements.find((n) => n.id === id);
  const linked = myNotifications().filter((n) => announcementIdInNotice(n) === id || (item && announcementForNotice(n, announcements)?.id === id));
  const notice = linked[0];
  let changed = false;
  if (item && !S.state.seen.includes(id)) { S.state.seen.push(id); changed = true; }
  for (const n of linked) {
    if (!n.read) { n.read = true; changed = true; }
  }
  if (changed) S.save();
  return {
    title: "Announcement", back: "alerts", tab: "home",
    body: html`<section class="sec"><article class="panel">
      <h2>${item?.title || notice?.title || "Announcement unavailable"}</h2>
      ${item ? html`<p class="faint">${[fmtDay(item.at), item.locationId && locName(item.locationId)].filter(Boolean).join(" · ")}</p>
        ${item.urgent ? html`<span class="tag warn">Important</span>` : ""}` : ""}
      ${item || notice ? html`<p style="white-space:pre-wrap;overflow-wrap:anywhere">${item?.body || notice?.body}</p>` : ""}
      ${item ? listenBtn(`news:${item.id}`) : html`<p class="muted">The full announcement is unavailable.</p>`}
    </article></section>`,
  };
};

Screens.alerts = () => {
  const news = newsSorted(), mine = myNotifications().slice(0, 30);
  return {
    title: "Notifications", back: "home", tab: "home",
    body: html`${mine.length ? html`<section class="sec"><div class="sec-head"><h2>For you</h2>${mine.some((n) => n.read) ? html`<button class="btn ghost sm" data-act="notes-clear">Clear read</button>` : ""}</div><div class="rows">${mine.map((n) => html`<button type="button" class="row ${n.read ? "" : "unread"}" data-act="notes-open" data-id="${n.id}"><span class="lead-ic">${icon({ serve: "hand", chat: "chat", event: "calendar", give: "give", checkin: "kid" }[n.kind] || "bell")}</span><span class="body"><span class="t">${n.title}</span><span class="s">${n.body}</span><span class="s faint">${ago(n.at)}</span></span>${n.read ? "" : html`<span class="tag brand">New</span>`}</button>`)}</div></section>` : ""}
      <section class="sec"><h2 class="sec-head">Announcements</h2><div class="rows">${news.length ? news.map(announcementRow) : empty("No announcements yet.")}</div></section>`,
  };
};
Actions["notes-open"] = (el) => {
  const n = myNotifications().find((item) => item.id === el.dataset.id);
  if (!n) return;
  ForegroundAlerts.hide();
  if (Player.dialogue?.open) Player.minimize(false);
  if (n.kind === "security-radio") {
    if (SecurityRadio.allowed() && n.radioMessageId) { closeSheet(true); go(`security-message-${n.radioMessageId}`); }
    return;
  }
  const announcementId = announcementIdInNotice(n) || announcementForNotice(n, readableAnnouncements())?.id;
  if (announcementId) {
    closeSheet(true);
    go(`news-${announcementId}`);
    return;
  }
  if (!n.read) { n.read = true; S.save(); }
  render();
  const link = n.link?.startsWith("#") && n.link !== "#alerts" ? n.link : "";
  openSheet(n.title, html`<p style="white-space:pre-wrap;overflow-wrap:anywhere">${n.body || ""}</p>
    ${link ? html`<div class="btns"><a class="btn" href="${link}">Open related page</a></div>` : ""}`,
    { focus: '[data-act="close-sheet"]' });
};
Actions["notes-clear"] = () => { const me = S.me().id; S.state.notifications = S.state.notifications.filter((n) => !(n.userId === me && n.churchId === S.state.current && n.read)); S.save(); render(); };

// ---------- Watch live ----------
let liveLocation = null;
Screens.live = () => {
  const c = S.church();
  const locs = S.visibleLocations().filter((l) => l.services?.length || l.liveUrl);
  const services = upcomingServices(c, Infinity, "all");
  const liveNow = services.find((s) => s.live);
  const chosen = locs.find((l) => l.id === liveLocation) || liveNow?.location || locs.find((l) => l.liveUrl) || locs[0];
  const url = chosen?.liveUrl || c.liveUrl || "";
  const nowSvc = services.find((s) => s.live && s.location.id === chosen?.id);
  const past = S.visible("sermons", { ignoreCampus: true })
    .filter((s) => s.date <= isoDay(new Date()) && sermonSources(s).length)
    .sort((a, b) => b.date.localeCompare(a.date));
  const plan = nowSvc && S.list("services").find((p) => p.date === isoDay(nowSvc.start) && p.time === nowSvc.time && (!p.locationId || p.locationId === nowSvc.location.id))
    || S.list("services").filter((p) => p.date >= isoDay(new Date()) && (!chosen || !p.locationId || p.locationId === chosen.id)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const sermonDoc = plan?.segments?.find((s) => s.type === "sermon" && s.content.docId);
  return {
    title: "Watch", back: "home", tab: "word",
    body: html`
      <div class="btns">${url ? html`<button class="btn ghost sm" data-act="watch-stream">Livestream</button>` : ""}${S.on("sermons") ? html`<a class="btn ghost sm" href="#listen">Podcasts &amp; audio</a>` : ""}</div>
      <section class="sec" aria-labelledby="watch-upcoming"><h2 class="sec-head" id="watch-upcoming">Upcoming services</h2>
        <div class="rows">${services.length ? services.map((s) => html`<div class="row">
          <span class="lead-ic">${icon(s.live ? "live" : "clock")}</span>
          <span class="body"><span class="t">${s.label || "Service"}</span><span class="s">${fmtWhen(s.start)} · ${s.location.name}</span></span>
          ${s.live && (s.location.liveUrl || c.liveUrl) ? html`<button class="btn sm" data-act="live-loc" data-id="${s.location.id}" data-focus-stream="1">Watch live</button>` : ""}
        </div>`) : empty("No services scheduled.")}</div></section>
      <section class="sec" aria-labelledby="watch-past"><h2 class="sec-head" id="watch-past">Past services</h2>
        <div class="rows">${past.length ? past.map((s) => {
          const sources = sermonSources(s);
          const source = sources.find((item) => item.key === "video") || sources[0];
          return html`<div class="row"><a class="body" href="#sermon-${s.id}"><span class="t">${s.title}</span>
            <span class="s">${fmtDay(fromIsoDay(s.date))}${s.speaker ? ` · ${s.speaker}` : ""}</span></a>
            <button class="btn ghost sm" data-act="audio-source" data-id="${s.id}" data-source="${source.key}" aria-label="${source.key === "video" ? "Watch" : "Listen to"} ${s.title}">${icon("play")}${source.key === "video" ? "Watch" : "Listen"}</button></div>`;
        }) : empty("No past service recordings are available.")}</div></section>
      <section class="sec" id="watch-stream" tabindex="-1"><h2 class="sec-head">Livestream</h2>
      ${locs.length > 1 ? html`<div class="chips" role="group" aria-label="Location" style="margin-top:12px">${locs.map((l) => html`<button class="chip" data-act="live-loc" data-id="${l.id}" aria-pressed="${l.id === chosen?.id}">${l.name}</button>`)}</div>` : ""}
      ${url ? html`<div style="margin-top:14px">${embedView(url, `${c.name} livestream`, { video: true })}</div>` : ""}
      <div class="player" ${attr(url, 'style="margin-top:12px"')}>
        ${url ? html`<a class="play" href="${url}" target="_blank" rel="noopener" aria-label="Open the livestream">${icon(nowSvc ? "live" : "play")}</a>` : html`<span class="play" aria-disabled="true">${icon("live")}</span>`}
        <div><b>${nowSvc ? `${nowSvc.label || "Service"} is live` : chosen?.name || c.name}</b>
        <small>${url ? "Opens the stream in its own player" : "This location hasn't added a livestream link yet. Admins add it under Locations."}</small></div>
      </div>
      <div class="btns">${S.on("giving") ? html`<a class="btn ghost sm" href="#give">${icon("give")}Give</a>` : ""}${sermonDoc ? html`<a class="btn ghost sm" href="#outline-${sermonDoc.content.docId}">${icon("note")}Sermon outline</a>` : ""}</div>
      ${plan ? html`<section class="sec"><h2 class="sec-head">Order of service</h2><div class="rows">${plan.segments.filter((s) => s.show).map((s) => html`<div class="row"><span class="lead-ic">${icon(SEGMENT_TYPES[s.type]?.icon || "list")}</span><span class="body"><span class="t">${s.title}</span>${s.leader ? html`<span class="s">${s.leader}</span>` : ""}</span></div>`)}</div></section>` : ""}
      </section>`,
  };
};
Actions["live-loc"] = (el) => {
  liveLocation = el.dataset.id;
  render();
  if (el.dataset.focusStream) Actions["watch-stream"]();
};

Actions["watch-stream"] = () => $("#watch-stream")?.focus();

function socialRow(c) {
  const links = churchLinks(c);
  if (!links.length) return "";
  return html`<section class="sec"><h2 class="sec-head">Find us online</h2><div class="chips" style="flex-wrap:wrap">${links.map(([label, url]) => html`<a class="chip" href="${url}" target="_blank" rel="noopener">${label}</a>`)}</div></section>`;
}
const SOCIAL = [["website", "Website"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["youtube", "YouTube"], ["x", "X"], ["tiktok", "TikTok"], ["podcast", "Podcast"]];
function churchLinks(c) {
  return SOCIAL.map(([k, label]) => [label, k === "website" ? c.website : c.social?.[k]]).filter(([, u]) => isUrl(u));
}

/** "What's new" on Home in the demo and training, until it's closed. */
function whatsNewCard() {
  if (!SANDBOX || S.state.whatsNewClosed === SEED_VERSION || !S.isMember()) return "";
  return html`<section class="sec whats-new" aria-labelledby="whats-new-h"><div class="sec-head"><h2 id="whats-new-h">What's new</h2>
      <button class="icon-btn" data-act="whats-new-close" aria-label="Close What's new">${icon("x")}</button></div>
    <div class="rows">${WHATS_NEW.map(([, ic, t, s, route]) => html`<a class="row" href="#${route}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${t}</span><span class="s">${s}</span></span>${icon("chev")}</a>`)}</div></section>`;
}
Actions["whats-new-close"] = () => { S.state.whatsNewClosed = SEED_VERSION; S.save(); render(); };
