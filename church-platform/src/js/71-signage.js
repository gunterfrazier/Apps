// ---------- Digital signage ----------
// Playlists of slides for lobby and hallway screens. Some slides are written by hand (a picture, a message, a QR code);
// others fill themselves from the app (announcements, upcoming events, service times with a countdown, today's
// classes and rooms, the latest sermon, a verse). The player rotates through them and picks up changes as they happen.

const SIGN_TYPES = {
  welcome: ["Welcome", "church", "The church's banner, name and a greeting"],
  services: ["Service times", "clock", "This week's services, with a countdown to the next one"],
  announcements: ["Announcements", "bell", "Current announcements, one per slide"],
  events: ["Upcoming events", "calendar", "The next events, with a QR code to sign up"],
  classes: ["Today's classes and rooms", "door", "What meets today and where, for finding your way"],
  sermon: ["Latest sermon", "play", "The newest message, with a QR code to watch or listen"],
  verse: ["Bible verse", "book", "A passage from the BSB, shown large"],
  give: ["Giving", "give", "A QR code to give, and the text-to-give number"],
  qr: ["QR code", "qr", "Any link in the app: a form, the connect card, an event"],
  text: ["Message", "note", "Your own title and words"],
  image: ["Picture or graphic", "image", "A flyer or photo you upload"],
};
const canSignage = () => S.isMember() && S.can("manage.devices");
const SIGN_THEMES = { brand: "Church color", dark: "Dark", light: "Light" };

/** Turns a playlist into the slides to show right now. Slides outside their dates, or with nothing to show, drop out. */
function signageSlides(pl, now = new Date()) {
  const c = S.church(), today = isoDay(now), out = [], dur = (s) => Math.max(4, +s.seconds || +pl.seconds || 10);
  const inLoc = (x) => !pl.locationId || !x.locationId || x.locationId === pl.locationId;
  for (const s of pl.slides || []) {
    if ((s.from && today < s.from) || (s.until && today > s.until)) continue;
    const base = { id: s.id, kind: s.type, seconds: dur(s) };
    switch (s.type) {
      case "welcome": out.push({ ...base, title: s.title || bannerOf(c).text.headline || `Welcome to ${c.name}`, body: s.body || bannerOf(c).text.sub || "" }); break;
      case "services": { const list = upcomingServices(c, 8, pl.locationId || "all").filter((x) => x.start - now < 7 * DAY); if (list.length) out.push({ ...base, services: list.slice(0, 6) }); break; }
      case "announcements": newsSorted().filter(inLoc).slice(0, +s.count || 3).forEach((n) => out.push({ ...base, id: `${s.id}-${n.id}`, title: n.title, body: n.body, urgent: n.urgent })); break;
      case "events": { const ev = upcomingEvents().filter(inLoc).slice(0, +s.count || 4); if (s.style === "each") ev.forEach((e) => out.push({ ...base, id: `${s.id}-${e.id}`, kind: "event", event: e })); else if (ev.length) out.push({ ...base, events: ev }); break; }
      case "classes": {
        const meet = S.list("gatherings").filter((g) => inLoc(g) && g.room).map((g) => [g, nextMeeting(g, startOfDay(now))]).filter(([, t]) => t && isoDay(t) === today).sort((a, b) => a[1] - b[1]);
        if (meet.length) out.push({ ...base, classes: meet.slice(0, 8).map(([g, t]) => ({ name: g.name, room: g.room, time: t, ages: g.ageMin != null ? `Ages ${g.ageMin} to ${g.ageMax}` : "" })) });
        break;
      }
      case "sermon": { const sm = sermonsSorted()[0]; if (sm) out.push({ ...base, sermon: sm }); break; }
      case "verse": if (s.ref) out.push({ ...base, ref: s.ref, text: verseCache[s.ref] || "" }); break;
      case "give": if (S.on("giving")) out.push({ ...base, title: s.title || "Give", body: s.body || "Thank you for your generosity. Giving online takes about a minute.", textGive: c.textGive }); break;
      case "qr": if (s.target) out.push({ ...base, title: s.title, body: s.body, target: s.target }); break;
      case "text": out.push({ ...base, title: s.title, body: s.body }); break;
      case "image": if (s.image) out.push({ ...base, image: s.image, caption: s.caption, fit: s.fit || "cover" }); break;
    }
  }
  return out;
}
const verseCache = {};
function loadVerses(pl) { (pl.slides || []).filter((s) => s.type === "verse" && s.ref && !verseCache[s.ref]).forEach((s) => Bible.text(s.ref, "BSB").then((t) => { verseCache[s.ref] = t; }).catch(() => {})); }

function signSlideHtml(s, pl) {
  const c = S.church(), qr = (target) => html`<div class="sg-qr">${raw(qrSvg(appLink(target), { size: 360 }))}</div>`;
  const body = (() => {
    switch (s.kind) {
      case "welcome": { const b = bannerOf(c); return html`<div class="sg-welcome" style="background:${raw(esc(bannerBackground(b, c.color)))};color:${bannerTextColor(b, c.color)}">
        <div class="sg-mark">${c.logo ? html`<img src="${c.logo}" alt="">` : html`<span>${initials(c.name)}</span>`}</div><div class="sg-big">${s.title}</div>${s.body ? html`<div class="sg-sub">${s.body}</div>` : ""}<div class="sg-church">${c.name}</div></div>`; }
      case "services": { const next = s.services.find((x) => x.start > Date.now()) || s.services[0];
        return html`<div class="sg-pad"><div class="sg-kicker">Join us</div><div class="sg-title">Service times</div>
          <ul class="sg-list">${s.services.map((x) => html`<li><b>${fmt(x.start, { weekday: "long" })} ${fmtTime(x.start)}</b><span>${x.label || "Service"}${multiCampus() && !pl.locationId ? `, ${x.location.name}` : ""}</span></li>`)}</ul>
          ${next && next.start > Date.now() && next.start - Date.now() < 3 * 3600e3 ? html`<div class="sg-count"><span>${next.label || "Service"} starts in</span><b data-cd-end="${next.start.getTime()}">${cdText((next.start - Date.now()) / 1000)}</b></div>` : ""}</div>`; }
      case "announcements": return html`<div class="sg-pad">${s.urgent ? html`<div class="sg-kicker warn">Important</div>` : html`<div class="sg-kicker">Announcement</div>`}<div class="sg-title">${s.title}</div><div class="sg-body">${s.body}</div></div>`;
      case "events": return html`<div class="sg-pad"><div class="sg-kicker">Coming up</div><div class="sg-title">Events</div>
        <ul class="sg-list">${s.events.map((e) => html`<li><b>${fmt(e.start, { month: "short", day: "numeric" })}</b><span>${e.title}<small>${fmtTime(e.start)}, ${placeText(e)}</small></span></li>`)}</ul></div>`;
      case "event": { const e = s.event; return html`<div class="sg-pad sg-split"><div><div class="sg-kicker">${e.category}</div><div class="sg-title">${e.title}</div>
        <div class="sg-sub">${fmtDay(e.start)}, ${fmtTime(e.start)}<br>${placeText(e)}</div>${e.tickets?.length ? html`<div class="sg-body">${e.tickets.map((t) => `${t.name} ${money(t.price)}`).join(", ")}</div>` : ""}</div>
        ${e.signup ? html`<div class="sg-qrwrap">${qr(`register-event-${e.id}`)}<span>Scan to sign up</span></div>` : ""}</div>`; }
      case "classes": return html`<div class="sg-pad"><div class="sg-kicker">Today</div><div class="sg-title">Classes and rooms</div>
        <ul class="sg-list rooms">${s.classes.map((g) => html`<li><b>${fmtTime(g.time)}</b><span>${g.name}${g.ages ? html`<small>${g.ages}</small>` : ""}</span><em>${g.room}</em></li>`)}</ul></div>`;
      case "sermon": { const sm = s.sermon; return html`<div class="sg-pad sg-split"><div><div class="sg-kicker">${sm.series || "Latest message"}</div><div class="sg-title">${sm.title}</div><div class="sg-sub">${sm.passage}<br>${sm.speaker}</div></div>
        <div class="sg-qrwrap">${qr(`sermon-${sm.id}`)}<span>Scan to watch or listen</span></div></div>`; }
      case "verse": return html`<div class="sg-pad sg-verse"><div class="sg-scripture">${s.text ? s.text.replace(/(^|\s)\d+\s/g, " ").trim() : s.ref}</div><div class="sg-ref">${s.ref} BSB</div></div>`;
      case "give": return html`<div class="sg-pad sg-split"><div><div class="sg-kicker">Generosity</div><div class="sg-title">${s.title}</div>${s.body ? html`<div class="sg-body">${s.body}</div>` : ""}
        ${s.textGive?.number ? html`<div class="sg-sub">Text <b>${s.textGive.keyword || "GIVE"} 50</b> to ${s.textGive.number}</div>` : ""}</div><div class="sg-qrwrap">${qr(`give-${c.id}`)}<span>Scan to give</span></div></div>`;
      case "qr": return html`<div class="sg-pad sg-split"><div><div class="sg-title">${s.title || ""}</div>${s.body ? html`<div class="sg-body">${s.body}</div>` : ""}</div><div class="sg-qrwrap">${qr(s.target)}<span>Scan with your phone's camera</span></div></div>`;
      case "text": return html`<div class="sg-pad sg-center"><div class="sg-big">${s.title || ""}</div>${s.body ? html`<div class="sg-body">${s.body}</div>` : ""}</div>`;
      case "image": return html`<img class="sg-image ${s.fit}" src="${s.image}" alt="${s.caption || ""}">${s.caption ? html`<div class="sg-caption">${s.caption}</div>` : ""}`;
      default: return "";
    }
  })();
  return html`<div class="sg-slide k-${s.kind}">${body}</div>`;
}
function signFrame(pl, slide, { live = false } = {}) {
  return html`<div class="sg-stage ${pl.orientation === "portrait" ? "portrait" : ""} theme-${pl.theme || "brand"}" translate="no">
    ${slide ? signSlideHtml(slide, pl) : html`<div class="sg-slide"><div class="sg-pad sg-center"><div class="sg-big">${S.church().name}</div></div></div>`}
    ${pl.clock !== false && live ? html`<div class="sg-clock" data-clock>${fmtTime(Date.now())}</div>` : ""}</div>`;
}

// ----- The player -----
const signPlay = { id: "", i: 0, timer: 0, slides: [] };
/** #signage-ID: full screen, slide after slide. Used by signage devices, and by staff to preview a playlist. */
Screens.signage = (id) => {
  const pl = S.get("signage", id);
  if (!pl) return { title: "Digital signage", back: "signs", body: html`<div class="rows" style="margin-top:16px">${empty("This playlist was removed.")}</div>` };
  if (signPlay.id !== id) { Object.assign(signPlay, { id, i: 0 }); loadVerses(pl); }
  signPlay.slides = signageSlides(pl);
  const n = signPlay.slides.length, cur = n ? signPlay.slides[signPlay.i % n] : null;
  return {
    present: true,
    page: html`<div class="sign-player" data-orient="${pl.orientation || "landscape"}">${signFrame(pl, cur, { live: true })}
      ${thisDevice() ? deviceExitBtn() : html`<a class="sign-exit" href="#signedit-${pl.id}" aria-label="Back to the editor">${icon("back")}</a>`}</div>`,
    after() {
      clearTimeout(signPlay.timer);
      signPlay.timer = setTimeout(() => { if (location.hash !== `#signage-${id}`) return; signPlay.i = (signPlay.i + 1) % Math.max(1, signageSlides(pl).length); render(); }, (cur?.seconds || 10) * 1000);
    },
  };
};

// ----- Playlists for staff -----
Screens.signs = () => {
  if (!canSignage()) return { redirect: "admin" };
  const list = S.list("signage");
  return {
    title: "Digital signage", back: hasAdminTools() ? "admin" : "ministry",
    body: html`<p class="muted" style="margin-top:16px">Playlists for screens in the lobby, hallways and kids area. Each screen plays one; slides like announcements and today's classes fill themselves in.</p>
      <div class="btns"><button class="btn" data-act="sign-new">${icon("plus")}New playlist</button><a class="btn ghost" href="#devices">${icon("screen")}Screens and devices</a></div>
      <div class="sign-grid">${list.length ? list.map((pl) => { const first = signageSlides(pl)[0], screens = S.list("devices").filter((d) => d.settings?.playlistId === pl.id || d.settings?.idlePlaylistId === pl.id).length;
        return html`<a class="sign-card" href="#signedit-${pl.id}"><div class="sign-thumb">${signFrame(pl, first)}</div><span class="t">${pl.name}</span><span class="s">${plural((pl.slides || []).length, "slide")}${pl.locationId ? `, ${locName(pl.locationId)}` : ""}, ${screens ? plural(screens, "screen") : "not on a screen yet"}</span></a>`; })
        : html`<div class="rows" style="grid-column:1/-1">${empty("Make a playlist, then pair a screen to play it.")}</div>`}</div>`,
  };
};
Actions["sign-new"] = () => openSheet("New playlist", html`<form data-form="sign-new" novalidate>
  <label class="field"><span>Name</span><input type="text" name="name" required maxlength="60" placeholder="Lobby"></label>
  <label class="field"><span>Location</span><select name="locationId">${locationOptions("", "All locations")}</select><small>Announcements, events and classes from other locations stay off this playlist.</small></label>
  <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Screen shape</legend><div class="radios"><label><input type="radio" name="orientation" value="landscape" checked><span>Landscape (16:9)</span></label><label><input type="radio" name="orientation" value="portrait"><span>Portrait (9:16)</span></label></div></fieldset>
  <label class="check"><input type="checkbox" name="starter" checked><span>Start with welcome, service times, announcements, events and today's classes</span></label>
  <button class="btn block">Create playlist</button></form>`);
const signSlide = (type, o = {}) => ({ id: uid(), type, seconds: "", from: "", until: "", ...o });
const starterSlides = () => [signSlide("welcome"), signSlide("services"), signSlide("announcements", { count: 3 }), signSlide("events", { count: 4, style: "list" }), signSlide("classes"), signSlide("give")];
/** The sample church's lobby playlist. */
function signageSeed() {
  return [{ id: "sign-lobby", churchId: "riverside", name: "Main lobby", locationId: null, orientation: "landscape", seconds: 10, theme: "brand", clock: true,
    slides: [...starterSlides(), signSlide("verse", { ref: "Psalm 46:10", title: "Verse of the week" })] }];
}
Forms["sign-new"] = (d, f) => {
  if (!d.name) return formError(f, "Name the playlist.");
  const slides = d.starter ? starterSlides() : [];
  const pl = S.add("signage", { name: d.name, locationId: d.locationId || null, orientation: d.orientation || "landscape", seconds: 10, theme: "brand", clock: true, slides });
  closeSheet(true); go(`signedit-${pl.id}`);
};
let signPick = 0;
Screens.signedit = (id) => {
  const pl = S.get("signage", id);
  if (!pl || !canSignage()) return { redirect: "signs" };
  loadVerses(pl);
  const slides = signageSlides(pl), shown = slides[clamp(signPick, 0, Math.max(0, slides.length - 1))];
  return {
    title: pl.name, back: "signs",
    body: html`<div class="sign-preview">${signFrame(pl, shown)}</div>
      <p class="faint" style="text-align:center;margin-top:6px">${slides.length ? `Slide ${clamp(signPick, 0, slides.length - 1) + 1} of ${slides.length} as it plays now` : "Nothing to show yet"}${slides.length > 1 ? html` <button class="linkish" data-act="sign-pick" data-d="1">Next</button>` : ""}</p>
      <div class="btns"><a class="btn sm" href="#signage-${pl.id}">${icon("expand")}Play full screen</a><button class="btn ghost sm" data-act="sign-settings" data-id="${pl.id}">${icon("gear")}Settings</button><a class="btn ghost sm" href="#devices">${icon("screen")}Put it on a screen</a></div>
      <section class="sec"><div class="sec-head"><h2>Slides</h2>${(pl.slides || []).length > 1 ? html`<span class="faint">Drag ${icon("grip")} to reorder</span>` : ""}</div>
        <div class="blocks" id="sort-list">${(pl.slides || []).length ? pl.slides.map((s, i) => { const [label, ic] = SIGN_TYPES[s.type];
          return html`<div class="block-card" data-index="${i}"><div class="block-top">${dragHandle(label)}<span class="lead-ic sm">${icon(ic)}</span><b>${s.type === "verse" ? s.ref : s.title || label}</b>
            <span class="row-tools"><button class="icon-btn" data-act="sign-slide" data-pl="${pl.id}" data-i="${i}" aria-label="Edit ${label}">${icon("edit")}</button></span></div>
            <div class="block-body"><span class="s">${label}. ${+s.seconds || pl.seconds || 10} seconds${s.from || s.until ? `. Shows ${s.from ? `from ${fmtShort(fromIsoDay(s.from))}` : ""}${s.until ? ` until ${fmtShort(fromIsoDay(s.until))}` : ""}` : ""}</span></div></div>`; }) : empty("Add the first slide.")}</div>
        <div class="btns"><button class="btn" data-act="sign-add" data-pl="${pl.id}">${icon("plus")}Add a slide</button></div></section>`,
    after() { makeSortable($("#sort-list"), (from, to, kb) => { if (moveItem(pl.slides, from, to)) { S.save(); render(); if (kb) $$("#sort-list [data-drag]")[to]?.focus(); } }); },
  };
};
Actions["sign-pick"] = (el) => { signPick += +el.dataset.d; const n = signageSlides(S.get("signage", location.hash.slice(10))).length; if (signPick >= n) signPick = 0; render(); };
Actions["sign-settings"] = (el) => {
  const pl = S.get("signage", el.dataset.id);
  openSheet("Playlist settings", html`<form data-form="sign-settings" novalidate><input type="hidden" name="id" value="${pl.id}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${pl.name}" required maxlength="60"></label>
    <label class="field"><span>Location</span><select name="locationId">${locationOptions(pl.locationId, "All locations")}</select></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Seconds per slide</span><input type="number" name="seconds" min="4" max="120" value="${pl.seconds || 10}"></label>
      <label class="field"><span>Colors</span><select name="theme">${Object.entries(SIGN_THEMES).map(([k, l]) => html`<option value="${k}" ${attr(k === pl.theme, "selected")}>${l}</option>`)}</select></label></div>
    <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Screen shape</legend><div class="radios">${[["landscape", "Landscape (16:9)"], ["portrait", "Portrait (9:16)"]].map(([k, l]) => html`<label><input type="radio" name="orientation" value="${k}" ${attr((pl.orientation || "landscape") === k, "checked")}><span>${l}</span></label>`)}</div></fieldset>
    <label class="check"><input type="checkbox" name="clock" ${attr(pl.clock !== false, "checked")}><span>Show the time in the corner</span></label>
    <div class="btns"><button class="btn">Save</button><button type="button" class="btn danger" data-act="sign-delete" data-id="${pl.id}">Delete playlist</button></div></form>`);
};
Forms["sign-settings"] = (d, f) => {
  if (!d.name) return formError(f, "Name the playlist.");
  Object.assign(S.get("signage", d.id), { name: d.name, locationId: d.locationId || null, seconds: clamp(+d.seconds || 10, 4, 120), theme: d.theme, orientation: d.orientation, clock: !!d.clock });
  S.save(); closeSheet(); render();
};
Actions["sign-delete"] = (el) => { S.remove("signage", el.dataset.id); closeSheet(true); toast("Playlist deleted"); go("signs"); };
Actions["sign-add"] = (el) => openSheet("Add a slide", html`<div class="rows">${Object.entries(SIGN_TYPES).map(([k, [l, ic, s]]) => html`<button class="row" data-act="sign-new-slide" data-pl="${el.dataset.pl}" data-type="${k}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${l}</span><span class="s">${s}</span></span>${icon("plus")}</button>`)}</div>`, { wide: true });
Actions["sign-new-slide"] = (el) => signSlideEditor(el.dataset.pl, -1, { id: uid(), type: el.dataset.type, seconds: "", from: "", until: "", count: el.dataset.type === "events" ? 4 : 3, style: "list" });
Actions["sign-slide"] = (el) => signSlideEditor(el.dataset.pl, +el.dataset.i, S.get("signage", el.dataset.pl).slides[+el.dataset.i]);
function signSlideEditor(plId, i, s) {
  const [label] = SIGN_TYPES[s.type];
  const t = (name, lab, v, ph = "", max = 80) => html`<label class="field"><span>${lab}</span><input type="text" name="${name}" value="${v || ""}" maxlength="${max}" placeholder="${ph}"></label>`;
  const area = (name, lab, v, ph = "") => html`<label class="field"><span>${lab}</span><textarea name="${name}" maxlength="400" style="min-height:70px" placeholder="${ph}">${v || ""}</textarea></label>`;
  const fields = {
    welcome: html`${t("title", "Greeting", s.title, "Uses the Home banner headline if blank")}${t("body", "Under it", s.body, "Uses the banner's second line if blank")}`,
    announcements: html`<label class="field"><span>How many</span><input type="number" name="count" min="1" max="8" value="${s.count || 3}"></label>`,
    events: html`<label class="field"><span>How many</span><input type="number" name="count" min="1" max="8" value="${s.count || 4}"></label>
      <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Show them</legend><div class="radios"><label><input type="radio" name="style" value="list" ${attr(s.style !== "each", "checked")}><span>As one list</span></label><label><input type="radio" name="style" value="each" ${attr(s.style === "each", "checked")}><span>One per slide, with a QR code</span></label></div></fieldset>`,
    verse: html`<label class="field"><span>Passage</span><input type="text" name="ref" value="${s.ref || ""}" placeholder="Psalm 46:1-3" maxlength="40"><small>Keep it to a few verses so it reads from across the room.</small></label>`,
    give: html`${t("title", "Title", s.title, "Give")}${area("body", "Words", s.body, "Thank you for your generosity.")}`,
    qr: html`${t("title", "Title", s.title, "New here? Tell us hello")}${area("body", "Words", s.body)}<label class="field"><span>Link to</span><select name="target">${qrTargetGroups().map(([g, items]) => html`<optgroup label="${g}">${items.map(([k, l]) => html`<option value="${k}" ${attr(k === s.target, "selected")}>${l}</option>`)}</optgroup>`)}</select></label>`,
    text: html`${t("title", "Title", s.title, "", 60)}${area("body", "Words", s.body)}`,
    image: html`${imageField("image", "Picture", s.image, "Landscape 1920 × 1080 or portrait 1080 × 1920 fits best.", 1920)}${t("caption", "Caption (optional)", s.caption)}
      <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Fit</legend><div class="radios"><label><input type="radio" name="fit" value="cover" ${attr(s.fit !== "contain", "checked")}><span>Fill the screen</span></label><label><input type="radio" name="fit" value="contain" ${attr(s.fit === "contain", "checked")}><span>Show all of it</span></label></div></fieldset>`,
  }[s.type] || html`<p class="faint">${SIGN_TYPES[s.type][2]}. It fills itself in from the app.</p>`;
  openSheet(i < 0 ? `Add: ${label}` : `Edit: ${label}`, html`<form data-form="sign-slide-save" novalidate><input type="hidden" name="pl" value="${plId}"><input type="hidden" name="i" value="${i}"><input type="hidden" name="type" value="${s.type}"><input type="hidden" name="id" value="${s.id}">
    ${fields}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><label class="field"><span>Seconds</span><input type="number" name="seconds" min="4" max="120" value="${s.seconds || ""}" placeholder="${S.get("signage", plId).seconds || 10}"></label>
      <label class="field"><span>Show from</span><input type="date" name="from" value="${s.from || ""}"></label><label class="field"><span>Until</span><input type="date" name="until" value="${s.until || ""}"></label></div>
    <div class="btns"><button class="btn">${i < 0 ? "Add" : "Save"}</button>${i >= 0 ? html`<button type="button" class="btn danger" data-act="sign-slide-delete" data-pl="${plId}" data-i="${i}">Remove</button>` : ""}</div></form>`, { wide: true });
}
Forms["sign-slide-save"] = (d, f) => {
  if (d.type === "verse" && !parseRef(d.ref)) return formError(f, "That passage doesn't look like a Bible reference.");
  if (d.type === "image" && !d.image) return formError(f, "Choose a picture.");
  if (d.type === "text" && !d.title && !d.body) return formError(f, "Write a title or some words.");
  if (d.until && d.from && d.until < d.from) return formError(f, "The last day has to be after the first.");
  const pl = S.get("signage", d.pl), keep = ["title", "body", "count", "style", "ref", "target", "image", "caption", "fit"];
  const s = { id: d.id, type: d.type, seconds: d.seconds, from: d.from, until: d.until, ...Object.fromEntries(keep.filter((k) => d[k] !== undefined).map((k) => [k, k === "ref" ? refLabel(parseRef(d.ref)) : d[k]])) };
  if (+d.i < 0) pl.slides.push(s); else pl.slides[+d.i] = s;
  S.save(); closeSheet(); render();
};
Actions["sign-slide-delete"] = (el) => { S.get("signage", el.dataset.pl).slides.splice(+el.dataset.i, 1); S.save(); closeSheet(); render(); };
