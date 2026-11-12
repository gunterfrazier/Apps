// ---------- Router, layout and shared UI ----------
// Screens[name](tail) returns { title, back, tab, body } or { page } for full-bleed screens.
// Every view is reachable by a plain hash such as #sermon-abc12, so links and QR codes can point straight at it.

const Screens = {};
const Actions = {};
const Forms = {};
const Inputs = {};
const AdminScreens = {}; // admin sections with their own layouts, filled in by later files
let lastRoute = null;

function tabsFor() {
  return [
    { id: "home", label: "Home", icon: "home", on: true },
    { id: "word", label: "Word", icon: "word", on: S.on("sermons") || S.on("plans") },
    { id: "events", label: "Events", icon: "calendar", on: S.on("events") },
    { id: "connect", label: "Connect", icon: "people", on: S.on("classes") || S.on("groups") || S.on("prayer") || S.on("directory") },
    { id: "give", label: "Give", icon: "give", on: S.on("giving") },
  ].filter((t) => t.on);
}

function go(hash) { if (location.hash.slice(1) === hash) render(); else location.hash = hash; }
function splitRoute() {
  const h = location.hash.slice(1);
  const i = h.indexOf("-");
  return { route: h, head: i < 0 ? h : h.slice(0, i), tail: i < 0 ? "" : h.slice(i + 1) };
}

function applyBrand() {
  const c = S.church();
  const color = c?.color || PLATFORM.color;
  document.documentElement.style.setProperty("--brand", color);
  document.documentElement.style.setProperty("--on-brand", onColor(color));
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = color;
  document.title = c ? `${c.name} | ${PLATFORM.name}` : PLATFORM.name;
}

const OPEN_ROUTES = ["welcome", "churches", "start", "church", "page", "display"];
// Screens that take a church ID after the dash (#give-riverside), so a QR code opens the right church.
const CHURCH_SCOPED = ["home", "give", "checkin", "parents", "serve", "live", "events", "classes", "groups", "connect"];
/** Which church a deep link belongs to, so links and QR codes switch the app to it. */
function churchForRoute(head, tail) {
  if (!tail) return null;
  if (CHURCH_SCOPED.includes(head) && S.state.churches[tail.split("~")[0]]) return tail.split("~")[0];
  if (head === "register") { const [k, ...r] = tail.split("-"); return S.get(k === "event" ? "events" : "gatherings", r.join("-"))?.churchId || null; }
  const kind = { event: "events", gathering: "gatherings", sermon: "sermons", outline: "docs", plan: "plans" }[head];
  return kind ? S.get(kind, tail)?.churchId || null : null;
}
function render() {
  const app = $("#app");
  let { route, head, tail } = splitRoute();
  document.documentElement.classList.toggle("overlay-page", head === "overlay");
  if (head === "display" || head === "stage" || head === "overlay") { Screens[head](tail); return; }
  const owner = churchForRoute(head, tail);
  if (owner && owner !== S.state.current) { S.state.current = owner; S.save(); }
  const me = S.me();
  if (Backend.failed) { app.innerHTML = flat(html`<div class="loading" role="alert"><div style="text-align:center;max-width:320px"><p>Can't reach ${PLATFORM.name} right now. Check your connection and try again.</p><button class="btn" data-act="reload">Try again</button></div></div>`); return; }
  if (Backend.on && !Backend.user && head !== "page") { if (head !== "signin") pendingRoute = pendingRoute || route; head = "signin"; tail = ""; }
  else if (Backend.on && !Backend.ready && head !== "page") { app.innerHTML = flat(html`<div class="loading" role="status"><span class="ai-dot"></span>Loading your churches...</div>`); return; }
  else if (Backend.ready && S.state.current && !Backend.loaded.has(S.state.current)) { Backend.loaded.add(S.state.current); Backend.pull().then(() => { Backend.subscribe(); render(); }); }
  else if (!me.name && head !== "welcome" && head !== "page") { pendingRoute = pendingRoute || route; head = "welcome"; tail = ""; }
  else if (!S.church() && !OPEN_ROUTES.includes(head)) { head = "churches"; tail = ""; }
  applyBrand();
  let view;
  try { view = (Screens[head] || Screens.home)(tail); }
  catch (err) { console.error(err); view = { title: "Something went wrong", body: html`<div class="panel" style="margin-top:16px"><p>This screen couldn't load. Your data is safe.</p><a class="btn" href="#home">Go home</a></div>` }; }
  if (view.redirect) { go(view.redirect); return; }
  document.body.classList.toggle("presenting", !!view.present);
  document.body.classList.toggle("kiosk-mode", !!view.kiosk);
  app.innerHTML = view.page ? flat(view.page) : flat(html`<a class="skip" href="#main" data-act="skip">${lang() === "es" ? "Saltar al contenido" : "Skip to content"}</a>
    ${view.band ? view.band : bar(view.title, view.back)}
    <main class="view" id="main" tabindex="-1">${view.body}</main>
    ${tabs(view.tab)}`);
  if (route !== lastRoute) {
    window.scrollTo(0, 0);
    // Move keyboard and screen reader focus to the new screen, except on the first load.
    if (lastRoute !== null && !view.page) $("#main")?.focus({ preventScroll: true });
    lastRoute = route;
  }
  view.after?.();
}
let pendingRoute = null;

function headerIcons() {
  const unread = S.church() ? unreadNews().length + myNotifications().filter((n) => !n.read).length : 0;
  const chatUnread = S.church() && S.on("chat") && S.can("use.chat") ? unreadChats() : 0;
  return html`
    ${S.church() && S.on("chat") && S.can("use.chat") ? html`<a class="icon-btn" href="#chat" aria-label="Messages${chatUnread ? `, ${chatUnread} unread` : ""}">${icon("chat")}${chatUnread ? html`<span class="dot">${chatUnread}</span>` : ""}</a>` : ""}
    ${S.church() ? html`<a class="icon-btn" href="#alerts" aria-label="Notifications${unread ? `, ${unread} unread` : ""}">${icon("bell")}${unread ? html`<span class="dot">${unread}</span>` : ""}</a>` : ""}
    <a class="me-link" href="#me" aria-label="Me">${avatar(S.me())}</a>`;
}
function bar(title, back) {
  return html`<header class="bar"><div class="wrap">
    ${back ? html`<a class="icon-btn" href="#${back}" aria-label="Back">${icon("back")}</a>` : S.church() ? html`<a href="#home" aria-label="Home" class="me-link">${churchMark(S.church(), 34)}</a>` : ""}
    <h1>${title}</h1>${headerIcons()}
  </div></header>`;
}
function avatar(person, cls = "") { return html`<span class="avatar ${cls}" style="background:${personColor(person.id || person.name)}">${initials(person.name)}</span>`; }
/** The church's logo if it uploaded one, otherwise its initials on its color. */
function churchMark(c, size = 44) {
  if (c.logo) return html`<img class="logo-mark" src="${c.logo}" alt="" style="width:${size}px;height:${size}px">`;
  return html`<span class="monogram" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${c.color};color:${onColor(c.color)}">${initials(c.name)}</span>`;
}

function tabs(active) {
  if (!S.church()) return "";
  const list = tabsFor();
  return html`<nav class="tabs" aria-label="Main"><div class="wrap" style="grid-template-columns:repeat(${list.length},1fr)">${list.map((t) => html`<a href="#${t.id}" ${attr(t.id === active, 'aria-current="page"')}>${icon(t.icon)}<span>${t.label}</span></a>`)}</div></nav>`;
}

function seg(items, current) {
  const list = items.filter((x) => x[2] !== false);
  if (list.length < 2) return "";
  return html`<nav class="seg" aria-label="Sections">${list.map(([hash, label]) => html`<a href="#${hash}" ${attr(hash === current, 'aria-current="page"')}>${label}</a>`)}</nav>`;
}

/** Location filter chip, shown when the person can see more than one location. */
function campusChip(onDark) {
  const locs = S.visibleLocations();
  if (locs.length < 2) return "";
  const cur = S.campus();
  return html`<button class="campus-chip ${onDark ? "on-dark" : ""}" data-act="pick-campus">${icon("pin")}${cur === "all" ? "All locations" : locName(cur)}${icon("down")}</button>`;
}
Actions["pick-campus"] = () => {
  const cur = S.campus();
  openSheet("Show me", html`<div class="rows">${[{ id: "all", name: "All locations", code: "" }, ...S.visibleLocations()].map((l) => html`
    <button class="row" data-act="set-campus" data-id="${l.id}"><span class="lead-ic">${icon(l.id === "all" ? "globe" : l.visibility === "private" ? "lock" : "pin")}</span>
    <span class="body"><span class="t">${l.name}</span>${l.code ? html`<span class="s">${l.code}${l.visibility === "private" ? ", private" : ""}${l.address ? `, ${l.address}` : ""}</span>` : ""}</span>${l.id === cur ? icon("check") : ""}</button>`)}</div>`);
};
Actions["set-campus"] = (el) => { S.setCampus(el.dataset.id); closeSheet(true); render(); };

function empty(text, action) { return html`<div class="empty"><p>${text}</p>${action || ""}</div>`; }
function demoNote(text) { return html`<div class="demo-note">${icon("info")}<div>${text}</div></div>`; }
function mapLink(address) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`; }
function ext(href, label, cls = "btn ghost sm", ic) {
  if (String(href).startsWith("#")) return html`<a class="${cls}" href="${href}">${ic ? icon(ic) : ""}${label}</a>`;
  return html`<a class="${cls}" href="${href}" target="_blank" rel="noopener">${ic ? icon(ic) : ""}${label}</a>`;
}
function locationOptions(selected, allLabel = "All locations (church-wide)") {
  return html`<option value="">${allLabel}</option>${S.visibleLocations().map((l) => html`<option value="${l.id}" ${attr(l.id === selected, "selected")}>${l.name} (${l.code})</option>`)}`;
}

// ---------- Embeds and video ----------
/** Turns a share link from YouTube, Vimeo or Facebook into the address that can be framed. */
function embedSrc(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\.|^m\./, "");
    if (h === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (h.endsWith("youtube.com")) {
      if (u.searchParams.get("v")) return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
      const live = u.pathname.match(/^\/live\/([\w-]+)/); if (live) return `https://www.youtube.com/embed/${live[1]}`;
      const ch = u.pathname.match(/^\/channel\/([\w-]+)/); if (ch) return `https://www.youtube.com/embed/live_stream?channel=${ch[1]}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (h === "vimeo.com") { const ev = u.pathname.match(/^\/event\/(\d+)/); if (ev) return `https://vimeo.com/event/${ev[1]}/embed`; const v = u.pathname.match(/^\/(\d+)/); if (v) return `https://player.vimeo.com/video/${v[1]}`; }
    if (h.endsWith("facebook.com")) return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
    return url;
  } catch { return url; }
}
const isMediaFile = (url) => /\.(mp4|webm|m3u8|mp3|m4a|ogg)(\?|$)/i.test(url || "");
/** Shows another site inside the app on your own website. The preview can't frame other sites, so it shows a link instead. */
function embedView(url, title = "", { height = 380, video = false } = {}) {
  if (!isUrl(url)) return "";
  if (IN_PREVIEW) {
    let host = url; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    return html`<a class="embed-card" href="${url}" target="_blank" rel="noopener"><span class="lead-ic">${icon(video ? "play" : "link")}</span><span class="body"><span class="t">${title || host}</span><span class="s">Opens ${host}. It shows inside the app once it's on your own website.</span></span>${icon("chev")}</a>`;
  }
  if (video && isMediaFile(url)) return html`<video class="embed" src="${url}" controls playsinline style="height:auto;aspect-ratio:16/9"></video>`;
  return html`<iframe class="embed" src="${embedSrc(url)}" title="${title || "Embedded page"}" style="${video ? "aspect-ratio:16/9;height:auto" : `height:${height}px`}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"></iframe>`;
}

// ---------- Files ----------
/** Saves a generated file: through Claude's downloads in the preview, or a normal download on your own website. */
async function saveFile(filename, data) {
  if (IN_PREVIEW) {
    try {
      const d = await window.claude?.use?.("downloads");
      if (!d) throw { code: "unavailable" };
      await d.save({ filename, data }); toast("Saved");
    } catch (e) { if (e?.code !== "declined") toast("Downloads aren't available here"); }
    return;
  }
  const blob = data instanceof Blob ? data : new Blob([data]);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Sheet (bottom dialog) ----------
let sheetReturn = null;
function openSheet(title, body, opts = {}) {
  closeSheet(true);
  sheetReturn = document.activeElement;
  const scrim = document.createElement("div");
  scrim.className = "scrim"; scrim.id = "scrim";
  scrim.innerHTML = flat(html`<div class="sheet ${opts.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="grip"></div>
    <div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Close">${icon("x")}</button></div>
    ${body}</div>`);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) closeSheet(); });
  document.body.appendChild(scrim);
  document.body.classList.add("sheet-open");
  const first = opts.focus ? $(opts.focus, scrim) : $("input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]), textarea, select", scrim);
  (first || $(".sheet", scrim)).focus?.({ preventScroll: true });
}
function closeSheet(silent) {
  const s = $("#scrim"); if (!s) return;
  s.remove(); document.body.classList.remove("sheet-open");
  if (!silent) sheetReturn?.focus?.();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

let toastTimer = 0;
function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}

/** Copy from a click; if the browser refuses, show the text so it can be copied by hand. */
async function copyText(text, done = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch {
    openSheet("Copy this", html`<textarea readonly style="min-height:160px">${text}</textarea><p class="faint">Select the text and copy it.</p>`, { focus: "textarea" });
    $("#scrim textarea")?.select();
  }
}

// ---------- Event delegation ----------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  e.preventDefault();
  const fn = Actions[el.dataset.act];
  if (fn) fn(el, e); else console.warn("No action", el.dataset.act);
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  const data = {};
  for (const [k, v] of fd) data[k] = typeof v === "string" ? v.trim() : v;
  const fn = Forms[f.dataset.form];
  if (fn) fn(data, f, fd);
});
document.addEventListener("input", (e) => { const el = e.target.closest("[data-input]"); if (el) Inputs[el.dataset.input]?.(el, e); });
document.addEventListener("change", (e) => { const el = e.target.closest("[data-change]"); if (el) Inputs[el.dataset.change]?.(el, e); });

Actions["close-sheet"] = () => closeSheet();
Actions["skip"] = () => $("#main")?.focus();
Actions["reload"] = () => location.reload();
Actions["go"] = (el) => { closeSheet(true); go(el.dataset.to); };
Actions["copy"] = (el) => copyText(el.dataset.text, el.dataset.done || "Copied");

/** Show an inline error on a form instead of an alert. */
function formError(form, msg) {
  let e = $(".err", form);
  if (!e) { e = document.createElement("p"); e.className = "err"; e.setAttribute("role", "alert"); form.appendChild(e); }
  e.textContent = msg;
}
/** A filter that hides rows whose text doesn't match, without re-rendering (keeps focus in the search box). */
Inputs["filter-rows"] = (el) => {
  const q = el.value.trim().toLowerCase();
  const list = $(el.dataset.target);
  let shown = 0;
  $$("[data-search]", list).forEach((r) => { const hit = r.dataset.search.toLowerCase().includes(q); r.hidden = !hit; if (hit) shown++; });
  const none = $(el.dataset.empty); if (none) none.hidden = shown > 0;
};
/** Image picker used by forms: resizes the picture and stores it in a hidden field named by data-field. */
Inputs["pick-image"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  const form = el.closest("form");
  try {
    const url = await readImage(file, +(el.dataset.max || 1400));
    const field = $(`input[name="${el.dataset.field}"]`, form);
    field.value = url; field.dispatchEvent(new Event("input", { bubbles: true }));
    const prev = $(`[data-preview="${el.dataset.field}"]`, form);
    if (prev) prev.innerHTML = `<img src="${url}" alt="">`;
  } catch (e) { formError(form, e.message); }
};
Actions["clear-image"] = (el) => {
  const form = el.closest("form");
  const field = $(`input[name="${el.dataset.field}"]`, form); field.value = ""; field.dispatchEvent(new Event("input", { bubbles: true }));
  const prev = $(`[data-preview="${el.dataset.field}"]`, form); if (prev) prev.innerHTML = "";
};
function imageField(name, label, value, hint, max) {
  return html`<div class="field"><span>${label}</span><input type="hidden" name="${name}" value="${value || ""}">
    <div class="img-preview" data-preview="${name}">${value ? html`<img src="${value}" alt="">` : ""}</div>
    <div class="btns" style="margin-top:6px"><label class="btn ghost sm">${icon("image")}Choose image<input type="file" accept="image/*" class="sr" data-change="pick-image" data-field="${name}" ${attr(max, `data-max="${max}"`)}></label>
    <button type="button" class="btn ghost sm" data-act="clear-image" data-field="${name}">Remove</button></div>${hint ? html`<small>${hint}</small>` : ""}</div>`;
}
