// ---------- Appearance: each church's theme, Home layout and tabs ----------
// Admin, Appearance sets the look (accent color, fonts, corners, header, page color and default light or dark),
// Admin, Home screen chooses and orders Home's sections, and Admin, Tabs picks the tabs along the bottom.
// The look is applied as attributes on <html> that design.css reads. Changes are a draft until published:
// whoever is editing sees the draft everywhere in the app (with a bar to publish or discard), everyone else
// keeps the published look.

const THEME_DEFAULTS = { font: "modern", corners: "round", header: "light", canvas: "plain", mode: "auto" };
const THEME_FONTS = [
  ["modern", "Modern", "Clean and current", "Plus Jakarta Sans", "Inter"],
  ["classic", "Classic", "Serif headings, timeless", "Fraunces", "Inter"],
  ["friendly", "Friendly", "Rounded and warm", "Rubik", "Atkinson Hyperlegible"],
  ["readable", "Most readable", "Made for low vision", "Atkinson Hyperlegible", "Atkinson Hyperlegible"],
];
const THEME_CORNERS = [["round", "Round", "Soft cards, pill buttons"], ["soft", "Soft", "Gently rounded"], ["square", "Square", "Crisp and minimal"]];
const THEME_HEADERS = [["light", "Light", "Matches the page"], ["brand", "Your color", "A bold bar in your accent"], ["dark", "Dark", "A deep charcoal bar"]];
const THEME_CANVAS = [["plain", "Plain", "Neutral gray page"], ["tinted", "Tinted", "A hint of your color"]];
const THEME_MODES = [["auto", "Match each phone", "Light or dark, by the device setting"], ["light", "Light", "Light unless someone picks dark"], ["dark", "Dark", "Dark unless someone picks light"], ["sepia", "Sepia", "Warm paper tones, easy on the eyes"]];
const ACCENTS = ["#4250d6", "#2563eb", "#0e7490", "#0f766e", "#15803d", "#a16207", "#c2410c", "#b91c1c", "#be185d", "#7c3aed", "#334155", "#1f2937"];

/** Who is looking at an unpublished draft (only on this device, until they publish or discard). */
let appearancePreview = false;
const themeOf = (c) => ({ ...THEME_DEFAULTS, ...(c?.theme || {}) });
function effectiveLook(c) {
  if (!c) return { color: PLATFORM.color, ...THEME_DEFAULTS };
  const pub = { color: c.color, ...themeOf(c) };
  return appearancePreview && c.themeDraft && S.can("manage.church") ? { ...pub, ...c.themeDraft } : pub;
}
/** Sets the church's look on the page. Called by applyBrand on every render. */
function applyLook(c) {
  const root = document.documentElement, look = effectiveLook(c);
  root.dataset.font = look.font; root.dataset.corners = look.corners; root.dataset.header = look.header; root.dataset.canvas = look.canvas;
  // The church's default mode applies when the person hasn't picked one themselves (Me, Settings).
  const own = typeof prefs === "function" ? prefs().theme || "auto" : "auto";
  if (own === "auto") { if (look.mode === "light" || look.mode === "dark" || look.mode === "sepia") root.dataset.theme = look.mode; else delete root.dataset.theme; }
  return normHex(look.color, PLATFORM.color);
}

// ---------- Home layout ----------
/** Home's sections, in their default order. The alerts at the very top (join, serve asks, urgent news) always show. */
const HOME_SECTIONS = [
  ["banner", "Home banner", "Your banner from Admin, Home banner", true],
  ["greeting", "Greeting", "Good morning, with the person's name", false],
  ["hero", "Up next", "The next service or live stream, with a photo", true],
  ["quick", "Shortcuts", "Give, Watch, Check in and the tools each person uses", true],
  ["latest", "Latest message", "The newest sermon, ready to play", true],
  ["events", "Coming up", "The next event as a photo card, then a row of events", true],
  ["groups", "Find your people", "Groups and classes with photos", true],
  ["gather", "Service times", "This week's services", true],
  ["plans", "Daily reading", "Today's reading from a plan", true],
  ["votd", "Verse of the Day", "A verse each day, chosen by YouVersion, in the Berean Standard Bible", true],
  ["news", "Announcements", "The three newest announcements", true],
  ["landing", "Landing page", "The blocks from your landing page", false],
  ["connect", "Connect card and invite", "For questions, next steps and inviting friends", true],
  ["social", "Social links", "Your website and social media", true],
];
/** The church's Home sections in order, with whether each is on. Sections added to the app later go to the end. */
function homeLayout(c = S.church()) {
  const saved = Array.isArray(c?.homeLayout) ? c.homeLayout.filter((x) => HOME_SECTIONS.some(([id]) => id === x.id)) : null;
  const defaults = HOME_SECTIONS.map(([id, , , on]) => ({ id, on: id === "landing" ? !!c?.landing?.showOnHome : on }));
  if (!saved?.length) return defaults;
  return [...saved, ...defaults.filter((d) => !saved.some((x) => x.id === d.id))];
}

// ---------- Tabs ----------
/** Every tab a church can put along the bottom. route is where it goes; screens is which screens light it up. */
const TAB_CHOICES = [
  { id: "home", label: "Home", icon: "home", screens: ["home"], on: () => true },
  { id: "word", label: "Word", icon: "word", screens: ["word"], on: () => S.on("sermons") || S.on("plans") },
  { id: "live", label: "Watch", icon: "play", screens: ["live", "watch"], on: () => S.on("live") || S.on("sermons") },
  { id: "events", label: "Events", icon: "calendar", screens: ["events"], on: () => S.on("events") },
  { id: "connect", label: "Connect", icon: "people", screens: ["connect"], on: () => S.on("classes") || S.on("groups") || S.on("prayer") || S.on("directory") },
  { id: "groups", label: "Groups", icon: "people", screens: ["groups"], on: () => S.on("groups") },
  { id: "classes", label: "Classes", icon: "door", screens: ["classes"], on: () => S.on("classes") },
  { id: "prayer", label: "Prayer", icon: "pray", route: "connect", screens: [], on: () => S.on("prayer") },
  { id: "bible", label: "Bible", icon: "book", screens: ["bible"], on: () => true },
  { id: "give", label: "Give", icon: "give", screens: ["give"], on: () => S.on("giving") },
  { id: "games", label: "Game night", icon: "game", screens: ["games", "gameroom", "gameqs"], on: () => S.on("games") },
  { id: "checkin", label: "Check in", icon: "kid", screens: ["checkin"], on: () => S.on("checkin") },
  { id: "me", label: "Me", icon: "user", screens: ["me"], on: () => true },
  { id: "more", label: "More", icon: "list", screens: [], on: () => true },
];
const DEFAULT_TABS = ["home", "word", "events", "connect", "give"];
/** The church's tabs: up to five, Home first. Tabs for features that are off are left out. */
function churchTabs(c = S.church()) {
  const ids = Array.isArray(c?.tabs) && c.tabs.length ? c.tabs : DEFAULT_TABS.map((id) => ({ id }));
  const list = ids.map((t) => ({ ...TAB_CHOICES.find((x) => x.id === (t.id || t)), ...(t.label ? { label: t.label } : {}) })).filter((t) => t.id && t.on());
  if (!list.some((t) => t.id === "home")) list.unshift(TAB_CHOICES[0]);
  return list.slice(0, 5);
}
// Replaces the fixed tab list in 30-ui.js.
tabsFor = () => churchTabs();
/** The "More" tab: everything that isn't one of the church's tabs. */
Actions["tab-more"] = () => {
  const shown = new Set(churchTabs().map((t) => t.id));
  const list = TAB_CHOICES.filter((t) => !shown.has(t.id) && t.id !== "more" && t.on());
  openSheet("More", html`<div class="rows">${list.map((t) => html`<a class="row" href="#${t.route || t.id}" data-act="go" data-to="${t.route || t.id}"><span class="lead-ic">${icon(t.icon)}</span><span class="body"><span class="t">${t.label}</span></span>${icon("chev")}</a>`)}</div>`);
};

// ---------- Admin, Appearance ----------
const lookDraft = (c) => ({ color: c.color, ...themeOf(c), ...(c.themeDraft || {}) });
AdminScreens.appearance = () => {
  const c = S.church();
  if (!S.can("manage.church")) return { redirect: "admin" };
  const d = lookDraft(c), hasDraft = !!c.themeDraft;
  const opt = (name, value, label, sub, sample = "") => html`<label class="opt"><input type="radio" name="${name}" value="${value}" data-change="look-set" ${attr(d[name] === value, "checked")}>
    ${sample}<b>${label}</b><small>${sub}</small></label>`;
  return {
    title: "Appearance", back: "admin", tab: "home",
    body: html`
      ${hasDraft ? html`<div class="draft-bar" role="status"><span><b>Draft.</b> ${appearancePreview ? "You're seeing it across the app; everyone else sees the published look." : "Not published yet."}</span>
        <button class="btn sm" data-act="look-publish">Publish</button><button class="btn ghost sm" data-act="look-discard">Discard</button></div>` : ""}
      <p class="muted" style="margin-top:14px">How your app looks for everyone at ${c.name}. Try things out: changes stay a draft, which only you see, until you publish.</p>
      <div class="ap-preview" aria-hidden="true"><div class="ap-phone"><div class="ap-screen">
        <div class="ap-top"><span class="ap-mark">${initials(c.name)}</span><b>${c.name}</b></div>
        <div class="ap-body">
          <div class="ap-hero"><b>Sunday worship</b><span style="opacity:.9">9:00 and 11:00 AM</span><span class="ap-btn">Plan your visit</span></div>
          ${[0, 1, 2].map((i) => html`<div class="ap-card"><span class="ap-ic"></span><div style="flex:1;display:grid;gap:4px"><div class="ap-line" style="width:${[70, 55, 62][i]}%;background:var(--ink);opacity:.75"></div><div class="ap-line" style="width:${[45, 60, 38][i]}%"></div></div></div>`)}
        </div>
        <div class="ap-tabs"><span class="on"></span><span></span><span></span><span></span><span></span></div>
      </div></div></div>

      <section class="sec"><h2 class="sec-head">Accent color</h2>
        <p class="faint" style="margin-top:-6px">Buttons, links, the current tab and highlights.</p>
        ${colorPicker("accent", d.color, { sources: churchColorSources(c), apply: "look", label: "Accent color" })}</section>

      <section class="sec"><h2 class="sec-head">Fonts</h2>
        <div class="opt-grid">${THEME_FONTS.map(([v, l, s, h]) => opt("font", v, l, s, html`<span class="sample" style="font-family:'${h}', serif;font-weight:${v === "classic" ? 650 : 750}">Aa</span>`))}</div></section>
      <section class="sec"><h2 class="sec-head">Corners</h2>
        <div class="opt-grid">${THEME_CORNERS.map(([v, l, s]) => opt("corners", v, l, s, html`<span style="display:block;width:44px;height:26px;border:2px solid var(--brand);border-radius:${{ round: 13, soft: 8, square: 3 }[v]}px;margin-bottom:4px"></span>`))}</div></section>
      <section class="sec"><h2 class="sec-head">Header</h2>
        <div class="opt-grid">${THEME_HEADERS.map(([v, l, s]) => opt("header", v, l, s, html`<span style="display:block;width:52px;height:14px;border-radius:4px;margin-bottom:4px;background:${v === "brand" ? "var(--brand)" : v === "dark" ? "#12151c" : "var(--sunken)"};box-shadow:inset 0 0 0 1px var(--line)"></span>`))}</div></section>
      <section class="sec"><h2 class="sec-head">Page color</h2>
        <div class="opt-grid">${THEME_CANVAS.map(([v, l, s]) => opt("canvas", v, l, s))}</div></section>
      <section class="sec"><h2 class="sec-head">Light or dark</h2>
        <div class="opt-grid">${THEME_MODES.map(([v, l, s]) => opt("mode", v, l, s))}</div>
        <p class="faint">Anyone can still choose their own under Me, Settings, including Sanctuary mode for dark rooms.</p></section>

      <div class="btns" style="margin-top:22px">${hasDraft ? html`<button class="btn" data-act="look-publish">Publish changes</button><button class="btn ghost" data-act="look-discard">Discard draft</button>` : html`<span class="faint">Pick anything above to start a draft.</span>`}</div>

      <section class="sec"><h2 class="sec-head">Layout</h2><div class="rows">
        <a class="row" href="#admin-homelayout"><span class="lead-ic">${icon("home")}</span><span class="body"><span class="t">Home screen</span><span class="s">Choose and order what's on Home</span></span>${icon("chev")}</a>
        <a class="row" href="#admin-tabs"><span class="lead-ic">${icon("layers")}</span><span class="body"><span class="t">Tabs</span><span class="s">${churchTabs(c).map((t) => t.label).join(", ")}</span></span>${icon("chev")}</a>
        <a class="row" href="#admin-screenfooter"><span class="lead-ic">${icon("screen")}</span><span class="body"><span class="t">Slides and screens footer</span><span class="s">Your logo and information on presentations and lobby screens</span></span>${icon("chev")}</a>
        <a class="row" href="#admin-banner"><span class="lead-ic">${icon("star")}</span><span class="body"><span class="t">Home banner</span><span class="s">Photo, logo and words at the top of Home</span></span>${icon("chev")}</a>
        <a class="row" href="#admin-account"><span class="lead-ic">${icon("church")}</span><span class="body"><span class="t">Logo</span><span class="s">Under Account details</span></span>${icon("chev")}</a>
      </div></section>`,
  };
};
/** Warns when white text on the accent would be hard to read. */
function contrastNote(hex) {
  const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const L = lum(hex), withWhite = 1.05 / (L + 0.05), withBlack = (L + 0.05) / 0.05;
  if (Math.max(withWhite, withBlack) >= 4.5) return "";
  return html`<p class="faint" role="note">${icon("info")} This color is hard to read text on. A slightly darker or lighter shade will work better for buttons.</p>`;
}
function lookChange(patch) {
  const c = S.church();
  S.updateChurch({ themeDraft: { ...(c.themeDraft || {}), ...patch } });
  appearancePreview = true;
  render();
}
Inputs["look-set"] = (el) => lookChange({ [el.name]: el.value });
Actions["look-color"] = (el) => lookChange({ color: el.dataset.color });
Inputs["look-color-pick"] = (el) => lookChange({ color: normHex(el.value) });
Actions["look-publish"] = () => {
  const c = S.church(), d = lookDraft(c);
  const { color, ...theme } = d;
  S.updateChurch({ color: normHex(color), theme: { font: theme.font, corners: theme.corners, header: theme.header, canvas: theme.canvas, mode: theme.mode }, themeDraft: null });
  appearancePreview = false;
  if (typeof logActivity === "function") logActivity("Published a new app look", "image");
  toast("Published. Everyone sees the new look now."); render();
};
Actions["look-discard"] = () => { S.updateChurch({ themeDraft: null }); appearancePreview = false; toast("Draft discarded"); render(); };
Actions["look-preview-off"] = () => { appearancePreview = false; render(); };
/** The bar that follows an editor around the app while they look at a draft. */
function lookDraftBar() {
  const c = S.church();
  if (!appearancePreview || !c?.themeDraft || !S.can("manage.church") || location.hash.startsWith("#admin-appearance")) return "";
  return html`<div class="wrap"><div class="draft-bar" role="status"><span>You're previewing a draft look.</span><a class="btn sm" href="#admin-appearance">Edit</a><button class="btn sm ghost" data-act="look-publish">Publish</button><button class="btn sm ghost" data-act="look-preview-off">Stop previewing</button></div></div>`;
}

// ---------- Admin, Home screen ----------
AdminScreens.homelayout = () => {
  const c = S.church();
  if (!S.can("manage.page") && !S.can("manage.church")) return { redirect: "admin" };
  const list = homeLayout(c);
  return {
    title: "Home screen", back: "admin-appearance", tab: "home",
    body: html`<p class="muted" style="margin-top:14px">Choose what's on Home and in what order. Drag a section by its handle, or use the arrows. Sections only show when they have something in them.</p>
      <ul class="build-list" id="home-build">${list.map((x, i) => { const [, label, sub] = HOME_SECTIONS.find(([id]) => id === x.id); return html`
        <li class="build-item ${x.on ? "" : "off"}" data-id="${x.id}">
          <span class="grip" data-drag="home" aria-hidden="true">${icon("grip")}</span>
          <span class="body"><b>${label}</b><small>${sub}</small></span>
          <button class="icon-btn" data-act="home-move" data-id="${x.id}" data-dir="-1" aria-label="Move ${label} up" ${attr(i === 0, "disabled")}>${icon("up")}</button>
          <button class="icon-btn" data-act="home-move" data-id="${x.id}" data-dir="1" aria-label="Move ${label} down" ${attr(i === list.length - 1, "disabled")}>${icon("down")}</button>
          <input type="checkbox" class="switch" data-change="home-toggle" data-id="${x.id}" ${attr(x.on, "checked")} aria-label="Show ${label}">
        </li>`; })}</ul>
      <form class="panel" data-form="home-hero" style="margin-top:20px"><h2 class="sec-head" style="margin-top:0">Up next photo</h2>
        ${imageField("heroPhoto", "Photo behind the next service", c.heroPhoto, "Without one, Up next uses your accent color.")}
        <button class="btn">Save photo</button></form>
      <div class="btns"><a class="btn ghost" href="#home">${icon("eye")}See Home</a><button class="btn ghost" data-act="home-reset">Restore the default</button></div>`,
    after: () => dragList("#home-build", (ids) => { const cur = homeLayout(); S.updateChurch({ homeLayout: ids.map((id) => cur.find((x) => x.id === id)) }); render(); }),
  };
};
Actions["home-move"] = (el) => {
  const list = homeLayout(), i = list.findIndex((x) => x.id === el.dataset.id), j = i + +el.dataset.dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  S.updateChurch({ homeLayout: list }); render();
  $(`[data-act="home-move"][data-id="${el.dataset.id}"][data-dir="${el.dataset.dir}"]`)?.focus();
};
Inputs["home-toggle"] = (el) => { S.updateChurch({ homeLayout: homeLayout().map((x) => (x.id === el.dataset.id ? { ...x, on: el.checked } : x)) }); render(); };
Forms["home-hero"] = (d) => { S.updateChurch({ heroPhoto: d.heroPhoto || "" }); toast("Saved"); render(); };
Actions["home-reset"] = () => { S.updateChurch({ homeLayout: null }); toast("Home is back to the default"); render(); };

// ---------- Admin, Tabs ----------
AdminScreens.tabs = () => {
  const c = S.church();
  if (!S.can("manage.church")) return { redirect: "admin" };
  const mine = churchTabs(c), others = TAB_CHOICES.filter((t) => t.on() && !mine.some((m) => m.id === t.id));
  return {
    title: "Tabs", back: "admin-appearance", tab: "home",
    body: html`<p class="muted" style="margin-top:14px">The buttons along the bottom of the app: up to five, with Home first. Add <b>More</b> to reach everything else. You can rename a tab.</p>
      <ul class="build-list" id="tab-build">${mine.map((t, i) => html`
        <li class="build-item" data-id="${t.id}">
          ${t.id === "home" ? html`<span class="grip" aria-hidden="true">${icon(t.icon)}</span>` : html`<span class="grip" data-drag="tabs" aria-hidden="true">${icon("grip")}</span>`}
          <span class="body"><input type="text" value="${t.label}" maxlength="12" data-change="tab-rename" data-id="${t.id}" aria-label="Name for the ${TAB_CHOICES.find((x) => x.id === t.id).label} tab"></span>
          ${t.id === "home" ? html`<span class="faint">Always first</span>` : html`
            <button class="icon-btn" data-act="tab-move" data-id="${t.id}" data-dir="-1" aria-label="Move ${t.label} left" ${attr(i <= 1, "disabled")}>${icon("up")}</button>
            <button class="icon-btn" data-act="tab-move" data-id="${t.id}" data-dir="1" aria-label="Move ${t.label} right" ${attr(i === mine.length - 1, "disabled")}>${icon("down")}</button>
            <button class="icon-btn" data-act="tab-remove" data-id="${t.id}" aria-label="Remove the ${t.label} tab">${icon("x")}</button>`}
        </li>`)}</ul>
      ${mine.length < 5 ? html`<section class="sec"><h2 class="sec-head">Add a tab</h2><div class="rows">${others.map((t) => html`<button class="row" data-act="tab-add" data-id="${t.id}"><span class="lead-ic">${icon(t.icon)}</span><span class="body"><span class="t">${t.label}</span></span>${icon("plus")}</button>`)}</div></section>`
        : html`<p class="faint">Five tabs is the most that fit. Remove one to add another.</p>`}
      <div class="btns"><button class="btn ghost" data-act="tabs-reset">Restore the default</button></div>`,
    after: () => dragList("#tab-build", (ids) => saveTabs(["home", ...ids.filter((id) => id !== "home")].map((id) => churchTabs().find((t) => t.id === id)))),
  };
};
const tabRecord = (t) => { const base = TAB_CHOICES.find((x) => x.id === t.id); return t.label && t.label !== base.label ? { id: t.id, label: t.label } : { id: t.id }; };
function saveTabs(list) { S.updateChurch({ tabs: list.filter(Boolean).map(tabRecord) }); render(); }
Actions["tab-add"] = (el) => saveTabs([...churchTabs(), TAB_CHOICES.find((t) => t.id === el.dataset.id)].slice(0, 5));
Actions["tab-remove"] = (el) => saveTabs(churchTabs().filter((t) => t.id !== el.dataset.id));
Actions["tab-move"] = (el) => {
  const list = churchTabs(), i = list.findIndex((t) => t.id === el.dataset.id), j = i + +el.dataset.dir;
  if (j < 1 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]]; saveTabs(list);
};
Inputs["tab-rename"] = (el) => {
  const label = el.value.trim().slice(0, 12) || TAB_CHOICES.find((t) => t.id === el.dataset.id).label;
  saveTabs(churchTabs().map((t) => (t.id === el.dataset.id ? { ...t, label } : t)));
};
Actions["tabs-reset"] = () => { S.updateChurch({ tabs: null }); toast("Tabs are back to the default"); render(); };

/** Drag to reorder a list of [data-id] items by their [data-drag] handle (mouse, touch or pen). */
function dragList(sel, onDone) {
  const list = $(sel);
  if (!list) return;
  list.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-drag]"), item = handle?.closest("[data-id]");
    if (!item) return;
    e.preventDefault();
    item.classList.add("dragging"); handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(`${sel} > [data-id]`);
      if (!over || over === item || !over.querySelector("[data-drag]")) return;
      const r = over.getBoundingClientRect();
      over.parentNode.insertBefore(item, ev.clientY < r.top + r.height / 2 ? over : over.nextSibling);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up);
      item.classList.remove("dragging");
      onDone([...list.children].map((x) => x.dataset.id));
    };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
  });
}
