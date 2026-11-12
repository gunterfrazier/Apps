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
    <p class="brand-word">${PLATFORM.name}</p>
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
  const all = S.churches().sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: "Find your church", back: S.church() ? "home" : null,
    body: html`
      ${mine.length ? html`<section class="sec"><h2 class="sec-head">Your churches</h2><div class="rows">${mine.map((c) => html`
        <button class="row" data-act="switch-church" data-id="${c.id}">${churchMark(c)}<span class="body"><span class="t">${c.name}</span><span class="s">${S.role(c.id).name}</span></span>${c.id === S.state.current ? html`<span class="tag brand">Open</span>` : icon("chev")}</button>`)}</div></section>` : ""}
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
  S.join(c.id); toast(`Welcome to ${c.name}`); go("home");
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
Screens.start = () => {
  startLocRows = 1;
  return {
    title: "Register your church", back: S.church() ? "churches" : null,
    body: html`<form data-form="start-church" novalidate>
      <p class="muted" style="margin-top:12px">This creates a church account, separate from your own. You'll be its <b>primary account holder</b>: you choose its roles, features and defaults, and can hand the account to someone else later.</p>
      <h2 style="margin-top:20px">Church account</h2>
      <label class="field"><span>Church name</span><input type="text" name="name" required maxlength="60" data-input="suggest-handle"></label>
      <label class="field"><span>Church ID</span><input type="text" name="handle" maxlength="30" placeholder="grace-point-savannah" pattern="[a-z0-9-]+"><small>A unique ID people can search for. Lowercase letters, numbers and hyphens.</small></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field"><span>Church email</span><input type="email" name="email"></label>
        <label class="field"><span>Church phone</span><input type="tel" name="phone"></label></div>
      <label class="field"><span>City and state</span><input type="text" name="city" placeholder="Springfield, IL" maxlength="60"></label>
      <label class="field"><span>One line about your church</span><input type="text" name="tagline" maxlength="90"></label>
      <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Brand color</legend>
        <div class="swatches">${BRAND_COLORS.map((col, i) => html`<label><input type="radio" name="color" value="${col}" ${attr(i === 0, "checked")}><span style="background:${col}"></span><span class="sr">${col}</span></label>`)}</div></fieldset>
      <h2 style="margin-top:20px">Campuses and locations</h2>
      <p class="faint">Give each location a unique ID, like MAIN or EAST. Private locations only show to people you give access.</p>
      <div id="loc-rows">${startLocRow(0)}</div>
      <button type="button" class="btn ghost sm" style="margin-top:10px" data-act="add-start-loc">${icon("plus")}Add another location</button>
      <div class="btns"><button class="btn block">Create church account</button></div>
    </form>`,
  };
};
Inputs["suggest-handle"] = (el) => { const h = $("input[name=handle]", el.form); if (!h.dataset.touched) h.value = slugify(el.value).slice(0, 30); };
document.addEventListener("input", (e) => { if (e.target.name === "handle") e.target.dataset.touched = "1"; });
Actions["add-start-loc"] = () => { $("#loc-rows").insertAdjacentHTML("beforeend", flat(startLocRow(startLocRows++))); $(`input[name=locName${startLocRows - 1}]`).focus(); };
Forms["start-church"] = (d, f) => {
  if (!d.name) return formError(f, "Enter your church's name.");
  const handle = slugify(d.handle || d.name);
  if (S.churches().some((c) => c.handle === handle)) return formError(f, `The church ID "${handle}" is taken. Try another.`);
  const locations = [], codes = new Set();
  for (let i = 0; i < 20; i++) {
    if (!(`locName${i}` in d)) break;
    if (!d[`locName${i}`] && !d[`locCode${i}`]) continue;
    const code = (d[`locCode${i}`] || d[`locName${i}`]).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    if (!code) return formError(f, `Give location ${i + 1} a unique ID.`);
    if (codes.has(code)) return formError(f, `Two locations use the ID ${code}. Each needs its own.`);
    codes.add(code);
    locations.push({ code, name: d[`locName${i}`] || code, address: d[`locAddress${i}`] || "", visibility: d[`locVis${i}`] || "public", rooms: [], liveUrl: "",
      services: d[`locTime${i}`] ? [svc(+d[`locDay${i}`], d[`locTime${i}`], "Worship service")] : [] });
  }
  if (!locations.length) locations.push({ code: "MAIN", name: "Main campus", address: "", visibility: "public", rooms: [], liveUrl: "", services: [svc(0, "10:00", "Worship service")] });
  const c = S.createChurch({ name: d.name, handle, email: d.email || "", phone: d.phone || "", city: d.city || "", tagline: d.tagline || "", color: d.color || BRAND_COLORS[0], sign: ["Welcome", d.tagline || ""], locations });
  toast(`${c.name} is ready. You're its primary account holder.`); go("admin");
};

// ---------- Home ----------
function quickActions() {
  const c = S.church(), member = S.isMember();
  const live = upcomingServices(c, 3).find((s) => s.live);
  const hasKidsRegs = S.list("gatherings").some((g) => kidsIn(g).length) || S.list("events").some((e) => myRegistration(e)?.kids?.length);
  const items = [
    S.on("checkin") && member && S.can("use.checkin") && ["#checkin", "kid", "Check in"],
    S.on("giving") && ["#give", "give", "Give"],
    S.on("prayer") && ["#connect", "pray", "Prayer"],
    S.on("live") && ["#live", live ? "live" : "play", live ? "Watch live" : "Watch"],
    S.on("classes") && ["#classes", "door", "Classes"],
    S.on("parents") && member && hasKidsRegs && ["#parents", "kid", "Parents"],
    ["#scan", "scan", "Scan"],
    hasMinistryTools() && ["#ministry", "layers", "Ministry"],
    hasAdminTools() && ["#admin", "shield", "Admin"],
  ].filter(Boolean).slice(0, 8);
  return html`<div class="quick">${items.map(([href, ic, label]) => html`<a href="${href}"><span class="ic">${icon(ic)}</span>${label}</a>`)}</div>`;
}

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
    ${bannerHtml(c)}
    ${campusChip()}
  </div></header>`;

  return {
    tab: "home", band,
    body: html`
      ${!S.isMember() ? html`<div class="panel join-card"><p style="margin-top:0"><b>You're looking around ${c.name}.</b> Join to post prayer requests, register for classes, chat with your groups and check in your kids.</p><button class="btn block" data-act="join-church" data-id="${c.id}">Join ${c.name}</button></div>` : ""}
      ${(() => { const asks = pendingAsks(); return asks.length ? html`<a class="alert ask" href="#serving">${icon("hand")}<div><b>Can you serve?</b><span>${asks[0][1].position}, ${planLabel(asks[0][0])}${asks.length > 1 ? ` and ${plural(asks.length - 1, "more request")}` : ""}</span></div></a>` : ""; })()}
      ${urgent.map((n) => html`<a class="alert" href="#alerts">${icon("bell")}<div><b>${n.title}</b><span>${n.body}</span></div></a>`)}
      ${quickActions()}
      ${c.landing?.showOnHome && c.landing.blocks.length ? html`<div class="landing">${landingBlocks(c, { home: true })}</div>` : ""}

      ${latest ? html`<section class="sec"><div class="sec-head"><h2>Latest message</h2><a href="#word">All sermons</a></div>
        <a class="sermon-card" href="#sermon-${latest.id}"><span class="sc-play">${icon("play")}</span>
          <span class="sc-k">${latest.series}</span><span class="sc-title">${latest.title}</span>
          <span class="sc-meta">${latest.passage}, ${latest.speaker}</span></a></section>` : ""}

      <section class="sec">
        <div class="sec-head"><h2>Gather with us</h2>${S.on("live") ? html`<a href="#live">Watch live</a>` : ""}</div>
        <div class="rows">${services.length ? services.map((s) => html`<a class="row" href="#live"><span class="lead-ic">${icon(s.live ? "live" : "clock")}</span><span class="body"><span class="t">${s.label || "Service"}${s.live ? html` <span class="tag warn">Live now</span>` : ""}</span><span class="s">${when(s)}${multiCampus() ? `, ${s.location.name}` : ""}</span></span>${icon("chev")}</a>`) : empty("Service times haven't been added yet.")}</div>
      </section>

      ${S.on("events") ? html`<section class="sec"><div class="sec-head"><h2>Coming up</h2><a href="#events">All events</a></div>
        ${events.length ? html`<div class="carousel">${events.map(eventCard)}</div>` : html`<div class="rows">${empty("No events on the calendar yet.")}</div>`}</section>` : ""}

      ${plans.length ? html`<section class="sec"><div class="sec-head"><h2>Daily reading</h2><a href="#plans">Plans</a></div>
        ${active ? planTodayRow(active) : html`<div class="rows"><a class="row" href="#plans"><span class="lead-ic">${icon("book")}</span><span class="body"><span class="t">Start a reading plan</span><span class="s">${plural(plans.length, "plan")} from ${c.name}</span></span>${icon("chev")}</a></div>`}
      </section>` : ""}

      ${news.length ? html`<section class="sec"><div class="sec-head"><h2>Announcements</h2><a href="#alerts">See all</a></div>
        <div class="rows">${news.slice(0, 3).map((n) => html`<a class="row" href="#alerts"><span class="lead-ic">${icon("bell")}</span><span class="body"><span class="t">${n.title}</span><span class="s">${ago(n.at)}</span></span>${icon("chev")}</a>`)}</div></section>` : ""}

      <section class="sec"><div class="rows">
        <button class="row" data-act="connect-card"><span class="lead-ic">${icon("inbox")}</span><span class="body"><span class="t">Connect card</span><span class="s">New here, have a question, or want to talk with a pastor?</span></span>${icon("chev")}</button>
        <button class="row" data-act="invite"><span class="lead-ic">${icon("share")}</span><span class="body"><span class="t">Invite a friend</span><span class="s">Copy an invitation with service times and directions</span></span>${icon("chev")}</button>
      </div></section>
      ${socialRow(c)}`,
  };
};
function eventCard(e) {
  const reg = myRegistration(e), d = new Date(e.start);
  return html`<a class="event-card" href="#event-${e.id}"><span class="ec-date"><span>${fmtMonth(d)}</span><b>${d.getDate()}</b></span>
    ${reg ? html`<span class="tag ok ec-tag">Going</span>` : ""}
    <span class="ec-title">${e.title}</span><span class="ec-meta">${fmt(d, { weekday: "short" })} ${fmtTime(d)}</span><span class="ec-meta">${placeText(e)}</span></a>`;
}

function planTodayRow(p) {
  const d = nextPlanDay(p), refs = p.days[d];
  const done = planState(p).done.length;
  return html`<div class="panel"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><b>${p.name}</b><span class="faint">Day ${d + 1} of ${p.days.length}</span></div>
    <div class="progress" style="margin:8px 0 12px"><i style="width:${Math.round(done / p.days.length * 100)}%"></i></div>
    <p class="scripture" style="font-size:1.15rem;margin:0">${refs.join(", ")}</p>
    <div class="btns">${Veritas.enabled() && Veritas.read(refs[0]) ? ext(Veritas.read(refs[0]), "Read", "btn sm", "word") : ""}<button class="btn ghost sm" data-act="plan-done" data-plan="${p.id}" data-day="${d}">${icon("check")}Mark as read</button></div></div>`;
}

function eventRow(e) {
  const reg = myRegistration(e);
  return html`<a class="row" href="#event-${e.id}"><span class="date"><span>${fmtMonth(e.start)}</span><b>${new Date(e.start).getDate()}</b></span>
    <span class="body"><span class="t">${e.title}</span><span class="s">${fmt(e.start, { weekday: "short" })} ${fmtTime(e.start)}, ${placeText(e)}</span></span>
    ${reg ? html`<span class="tag ok">Going</span>` : icon("chev")}</a>`;
}

Actions["open-switcher"] = () => {
  const mine = S.myChurches();
  const list = mine.some((c) => c.id === S.state.current) ? mine : [S.church(), ...mine];
  openSheet("Your churches", html`<div class="rows">${list.map((c) => html`<button class="row" data-act="switch-church" data-id="${c.id}">${churchMark(c)}<span class="body"><span class="t">${c.name}</span><span class="s">${S.isMember(c.id) ? S.role(c.id).name : "Looking around"}</span></span>${c.id === S.state.current ? icon("check") : ""}</button>`)}</div>
    <div class="btns stack"><button class="btn ghost block" data-act="go" data-to="churches">${icon("search")}Find another church</button></div>`);
};

Actions["invite"] = () => {
  const c = S.church();
  copyText(`Come to church with me! ${c.name}${churchCity(c) ? ` in ${churchCity(c)}` : ""}. ${servicesSummary(c)}. Find "${c.name}" in the ${PLATFORM.name} app: ${appLink(`church-${c.id}`)}`, "Invitation copied");
};

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

Screens.alerts = () => {
  const news = newsSorted(), mine = myNotifications().slice(0, 30);
  return {
    title: "Notifications", back: "home", tab: "home",
    body: html`${mine.length ? html`<section class="sec"><div class="sec-head"><h2>For you</h2>${mine.some((n) => n.read) ? html`<button class="btn ghost sm" data-act="notes-clear">Clear read</button>` : ""}</div><div class="rows">${mine.map((n) => html`<a class="row ${n.read ? "" : "unread"}" href="${n.link || "#alerts"}"><span class="lead-ic">${icon({ serve: "hand", chat: "chat", event: "calendar", give: "give", checkin: "kid" }[n.kind] || "bell")}</span><span class="body"><span class="t">${n.title}</span><span class="s">${n.body}</span><span class="s faint">${ago(n.at)}</span></span>${n.read ? "" : html`<span class="tag brand">New</span>`}</a>`)}</div></section>` : ""}
      <section class="sec"><h2 class="sec-head">Announcements</h2><div class="rows">${news.length ? news.map((n) => html`<article class="prayer">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="font-size:1.1rem;flex:1">${n.title}</h2>${n.urgent ? html`<span class="tag warn">Important</span>` : ""}${n.locationId ? html`<span class="tag">${locName(n.locationId)}</span>` : ""}${!S.state.seen.includes(n.id) ? html`<span class="tag brand">New</span>` : ""}</div>
      <p>${n.body}</p><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span class="faint">${ago(n.at)}</span>${listenBtn(`news:${n.id}`)}</div></article>`) : empty("No announcements yet.")}</div></section>`,
    after() {
      const ids = news.map((n) => n.id).filter((id) => !S.state.seen.includes(id)); if (ids.length) { S.state.seen.push(...ids); S.save(); }
      if (mine.some((n) => !n.read)) { mine.forEach((n) => { n.read = true; }); S.save(); }
    },
  };
};
Actions["notes-clear"] = () => { const me = S.me().id; S.state.notifications = S.state.notifications.filter((n) => !(n.userId === me && n.churchId === S.state.current && n.read)); S.save(); render(); };

// ---------- Watch live ----------
let liveLocation = null;
Screens.live = () => {
  const c = S.church();
  const locs = S.visibleLocations().filter((l) => l.services?.length || l.liveUrl);
  const services = upcomingServices(c, 6);
  const liveNow = services.find((s) => s.live);
  const chosen = locs.find((l) => l.id === liveLocation) || liveNow?.location || locs.find((l) => l.liveUrl) || locs[0];
  const url = chosen?.liveUrl || c.liveUrl || "";
  const svcForLoc = services.filter((s) => !chosen || s.location.id === chosen.id);
  const nowSvc = svcForLoc.find((s) => s.live);
  const plan = nowSvc && S.list("services").find((p) => p.date === isoDay(nowSvc.start) && p.time === nowSvc.time && (!p.locationId || p.locationId === nowSvc.location.id))
    || S.list("services").filter((p) => p.date >= isoDay(new Date()) && (!chosen || !p.locationId || p.locationId === chosen.id)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const sermonDoc = plan?.segments.find((s) => s.type === "sermon" && s.content.docId);
  return {
    title: nowSvc ? "Live now" : "Watch live", back: "home", tab: "word",
    body: html`
      ${locs.length > 1 ? html`<div class="chips" role="group" aria-label="Location" style="margin-top:12px">${locs.map((l) => html`<button class="chip" data-act="live-loc" data-id="${l.id}" aria-pressed="${l.id === chosen?.id}">${l.name}</button>`)}</div>` : ""}
      ${url ? html`<div style="margin-top:14px">${embedView(url, `${c.name} livestream`, { video: true })}</div>` : ""}
      <div class="player" ${attr(url, 'style="margin-top:12px"')}>
        ${url ? html`<a class="play" href="${url}" target="_blank" rel="noopener" aria-label="Open the livestream">${icon(nowSvc ? "live" : "play")}</a>` : html`<span class="play" aria-disabled="true">${icon("live")}</span>`}
        <div><b>${nowSvc ? `${nowSvc.label || "Service"} is live` : svcForLoc[0] ? `Next live: ${fmt(svcForLoc[0].start, { weekday: "long" })} at ${fmtTime(svcForLoc[0].start)}` : "No services scheduled"}</b>
        <small>${url ? "Opens the stream in its own player" : "This location hasn't added a livestream link yet. Admins add it under Locations."}</small></div>
      </div>
      <div class="btns">${S.on("giving") ? html`<a class="btn ghost sm" href="#give">${icon("give")}Give</a>` : ""}${sermonDoc ? html`<a class="btn ghost sm" href="#outline-${sermonDoc.content.docId}">${icon("note")}Sermon outline</a>` : ""}</div>
      ${plan ? html`<section class="sec"><h2 class="sec-head">Order of service</h2><div class="rows">${plan.segments.filter((s) => s.show).map((s) => html`<div class="row"><span class="lead-ic">${icon(SEGMENT_TYPES[s.type]?.icon || "list")}</span><span class="body"><span class="t">${s.title}</span>${s.leader ? html`<span class="s">${s.leader}</span>` : ""}</span></div>`)}</div></section>` : ""}
      <section class="sec"><h2 class="sec-head">Upcoming services</h2><div class="rows">${svcForLoc.length ? svcForLoc.map((s) => html`<div class="row"><span class="lead-ic">${icon(s.live ? "live" : "clock")}</span><span class="body"><span class="t">${s.label || "Service"}</span><span class="s">${fmtDay(s.start)} at ${fmtTime(s.start)}</span></span>${s.live ? html`<span class="tag warn">Live</span>` : ""}</div>`) : empty("No services scheduled here.")}</div></section>`,
  };
};
Actions["live-loc"] = (el) => { liveLocation = el.dataset.id; render(); };

function socialRow(c) {
  const links = churchLinks(c);
  if (!links.length) return "";
  return html`<section class="sec"><h2 class="sec-head">Find us online</h2><div class="chips" style="flex-wrap:wrap">${links.map(([label, url]) => html`<a class="chip" href="${url}" target="_blank" rel="noopener">${label}</a>`)}</div></section>`;
}
const SOCIAL = [["website", "Website"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["youtube", "YouTube"], ["x", "X"], ["tiktok", "TikTok"], ["podcast", "Podcast"]];
function churchLinks(c) {
  return SOCIAL.map(([k, label]) => [label, k === "website" ? c.website : c.social?.[k]]).filter(([, u]) => isUrl(u));
}
