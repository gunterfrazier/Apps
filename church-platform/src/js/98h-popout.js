// ---------- Pop-out windows for a second screen (#popout-slides-<doc>, #popout-notes-<doc>, #popout-dashboard) ----------
// A pastor rehearses on one screen and writes on the other; the office keeps the dashboard on a wall monitor.
//   Slides: the builder's current slide, large, with the next one. Notes: the block's words and its private notes in
//   big type, for rehearsing. Both follow the block selected in the builder as it's written, and the arrow keys in the
//   window move the builder along too.
//   Dashboard: the dashboard full screen, updating itself every minute.
// Windows of the same app talk over a BroadcastChannel, so this works in the preview and on a live site alike. If the
// browser has already been allowed to place windows (Screens on this computer), a pop-out opens on the other display.

const popChan = "BroadcastChannel" in window ? new BroadcastChannel("ofc-popout") : null;
const Pop = { doc: null, sel: null, kind: null };

/** Opens (or brings back) a pop-out window, on another display when the browser allows it. */
async function openPopout(route, name) {
  let feat = "popup,width=1280,height=800";
  try {
    const perm = await navigator.permissions?.query({ name: "window-management" });
    if (perm?.state === "granted" && window.getScreenDetails) {
      const d = await getScreenDetails(), other = d.screens.find((s) => s !== d.currentScreen);
      if (other) feat = `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
    }
  } catch { /* the browser decides where it goes */ }
  const w = window.open(`${location.pathname}#${route}`, name, feat);
  if (!w) return toast("Allow pop-ups for this site to open a second window");
  w.focus?.();
  setTimeout(deskBroadcast, 600);
}

/* ----- The builder's side: say what's selected, and follow the window's arrow keys ----- */
function deskBroadcast() {
  if (!popChan || typeof desk === "undefined" || !desk.doc) return;
  const d = S.get("docs", desk.doc); if (!d) return;
  popChan.postMessage({ type: "desk", doc: JSON.parse(JSON.stringify(d)), sel: desk.draft ? null : desk.id });
}
popChan?.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type === "hello") deskBroadcast();
  else if (m.type === "pick" && typeof desk !== "undefined" && desk.doc === m.doc && location.hash === `#build-${m.doc}`) {
    desk.id = m.id; desk.draft = null; if (typeof deskSelClear === "function") deskSelClear(); render();
  } else if (m.type === "desk" && Pop.kind && m.doc?.id === Pop.doc) {
    // In the pop-out: take the builder's copy (it may be ahead of what this window has loaded) and redraw.
    const list = S.state.docs, i = list.findIndex((x) => x.id === m.doc.id);
    if (i >= 0) list[i] = m.doc; else list.push(m.doc);
    Pop.sel = m.sel; render();
  }
});
// The builder tells the windows after every redraw and every save as you type.
const popRenderBase = render;
render = function (...a) { const r = popRenderBase.apply(this, a); if (/^#build-/.test(location.hash) && !Pop.kind) deskBroadcast(); return r; }; // eslint-disable-line no-func-assign
if (typeof deskRefresh === "function") { const base = deskRefresh; deskRefresh = function (d) { base(d); deskBroadcast(); }; } // eslint-disable-line no-func-assign

/* ----- The windows ----- */
Screens.popout = (tail = "") => {
  const [kind, ...rest] = tail.split("-"), id = rest.join("-");
  if (kind === "dashboard") return popDashboard();
  const d = S.get("docs", id);
  Pop.kind = kind; Pop.doc = id;
  if (!d) { popChan?.postMessage({ type: "hello" }); return { page: html`<div class="pop pop-wait"><p>Waiting for the builder...</p></div>` }; }
  const slides = docSlides(d), blocks = d.blocks || [];
  let bi = blocks.findIndex((b) => b.id === Pop.sel); if (bi < 0) bi = 0;
  const b = blocks[bi];
  // The block's first slide; a private block shows the last slide before it (what the room still sees).
  const keyOf = (s) => String(s.editKey || "").split(":")[1];
  let si = slides.findIndex((s) => keyOf(s) === b?.id);
  if (si < 0) for (let j = bi; j >= 0 && si < 0; j--) { const k = slides.map(keyOf).lastIndexOf(blocks[j]?.id); if (k >= 0) si = k; }
  if (si < 0) si = 0;
  const cur = slides[si], next = slides[si + 1], look = (s) => (s?.kind === "media" ? { ...s, url: "" } : s);
  const tools = html`<div class="pop-tools"><span><b>${d.title}</b> <span class="faint">Block ${bi + 1} of ${blocks.length}</span></span>
    <span class="pop-keys faint">← → move through the sermon</span>
    <a class="btn ghost sm" href="#popout-${kind === "slides" ? "notes" : "slides"}-${d.id}">${kind === "slides" ? "Notes" : "Slides"}</a></div>`;
  if (kind === "notes") return {
    title: `Notes: ${d.title}`,
    page: html`<div class="pop pop-notes">${tools}
      <div class="pop-notes-body"><p class="pop-kind">${b ? BLOCKS[b.type]?.label : ""}${b && !(b.show && b.type !== "note") ? " (private)" : ""}</p>
        <div class="pop-text">${b ? (b.type === "scripture" ? html`<b>${b.ref}</b><br>${b.text || ""}` : b.title ? html`<b>${b.title}</b><br>${b.text || ""}` : b.text || b.label || b.caption || "") : ""}</div>
        ${b?.notes ? html`<div class="pop-mynotes">${icon("lock")}<span>${b.notes}</span></div>` : ""}</div>
      <aside class="pop-side">${cur ? html`<div class="stage" aria-label="On screen now">${slideHtml(look(cur))}</div>` : ""}
        ${blocks[bi + 1] ? html`<p class="faint">Next: ${BLOCKS[blocks[bi + 1].type]?.label}. ${typeof deskSummary === "function" ? deskSummary(blocks[bi + 1]) : ""}</p>` : html`<p class="faint">That's the end.</p>`}</aside></div>`,
  };
  return {
    title: `Slides: ${d.title}`,
    page: html`<div class="pop pop-slides">${tools}
      <div class="pop-main">${cur ? html`<div class="stage">${slideHtml(look(cur))}</div>` : html`<p class="faint">No slides yet.</p>`}</div>
      <div class="pop-next">${next ? html`<p class="faint">Next</p><div class="stage">${slideHtml(look(next))}</div>` : html`<p class="faint">Last slide</p>`}
        <p class="faint">Slide ${si + 1} of ${slides.length}</p></div></div>`,
  };
};
// Arrow keys in a slides or notes window move the builder to the next or previous block.
document.addEventListener("keydown", (e) => {
  if (!Pop.kind || !/^#popout-(slides|notes)-/.test(location.hash) || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", " ", "PageDown", "PageUp"].includes(e.key)) return;
  const d = S.get("docs", Pop.doc); if (!d?.blocks?.length) return;
  e.preventDefault();
  const i = Math.max(0, d.blocks.findIndex((b) => b.id === Pop.sel)), step = ["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key) ? -1 : 1;
  const next = d.blocks[Math.min(d.blocks.length - 1, Math.max(0, i + step))];
  Pop.sel = next.id; render();
  popChan?.postMessage({ type: "pick", doc: d.id, id: next.id });
});
// A window opened straight from a link asks the builder what's selected.
addEventListener("hashchange", () => { if (/^#popout-(slides|notes)-/.test(location.hash)) popChan?.postMessage({ type: "hello" }); });
if (/^#popout-(slides|notes)-/.test(location.hash)) setTimeout(() => popChan?.postMessage({ type: "hello" }), 300);

/* ----- The dashboard on a wall screen ----- */
let popDashTimer = 0;
function popDashboard() {
  if (!S.isMember() || !hasAdminTools()) return { redirect: "me" };
  const v = Screens.dashboard();
  if (!v.body) return v;
  clearInterval(popDashTimer);
  popDashTimer = setInterval(() => { if (location.hash === "#popout-dashboard" && !pageBusy()) render(); else if (location.hash !== "#popout-dashboard") clearInterval(popDashTimer); }, 60000);
  const now = new Date();
  return {
    title: `Dashboard: ${S.church().name}`,
    page: html`<div class="pop pop-dash"><header class="pop-dash-head"><b>${S.church().name}</b><span class="faint">Updated ${fmtTime(now)}. Refreshes every minute.</span>
      <button class="btn ghost sm" data-act="pop-full">${icon("expand")}Full screen</button></header><div class="pop-dash-body">${v.body}</div></div>`,
  };
}
Actions["pop-full"] = () => { document.documentElement.requestFullscreen?.().catch(() => toast("Full screen isn't available here")); };

/* ----- Ways in ----- */
Actions["pop-open"] = (el) => openPopout(el.dataset.route, el.dataset.name || "ofc-popout");
commandSource(() => {
  const out = [];
  const d = typeof buildDoc === "function" && buildDoc();
  if (d) out.push({ group: "Second screen", label: "Pop out the slides", icon: "screen", keywords: "window second screen preview rehearse", run: () => openPopout(`popout-slides-${d.id}`, "ofc-pop-slides") },
    { group: "Second screen", label: "Pop out the notes", icon: "note", keywords: "window second screen rehearse speaker notes", run: () => openPopout(`popout-notes-${d.id}`, "ofc-pop-notes") });
  if (S.isMember() && hasAdminTools()) out.push({ group: "Second screen", label: "Dashboard on a wall screen", icon: "layers", keywords: "window monitor tv dashboard pop out", run: () => openPopout("popout-dashboard", "ofc-pop-dashboard") });
  return out;
});
Actions["desk-popout"] = (el) => {
  const d = typeof buildDoc === "function" && buildDoc(); if (!d) return;
  const r = el.getBoundingClientRect();
  openContextMenu(r.left, r.bottom + 4, [{ head: "Open in a window for another screen" },
    { label: "Slides: this slide, large, and the next", icon: "screen", run: () => openPopout(`popout-slides-${d.id}`, "ofc-pop-slides") },
    { label: "Notes: the words and your notes, large", icon: "note", run: () => openPopout(`popout-notes-${d.id}`, "ofc-pop-notes") }], el);
};
