// ---------- Desktop builder: outline, editor and Study pane side by side, with a slide strip ----------
// On a computer (isDesktop in 31b-desktop.js) the sermon, lesson and study builders open as resizable panes instead
// of one column of cards with pop-up sheets. Choosing a block in the outline opens it in the editor, which saves as you
// type; the Study pane follows the Scripture you're on (pin it to hold still); the strip along the bottom shows the
// slides. Each pane can close, and widths are remembered on this computer. Below 1,100 px nothing here runs.

/* ----- Panes: a row of resizable side-by-side panes, remembered per computer (localStorage "ofc-panes") ----- */
// Kept for each person on this computer, so people taking turns at a shared workstation each get their own.
const panesKey = () => `ofc-panes:${S.state?.me?.id || "anyone"}`;
const Panes = {
  read() { try { return JSON.parse(localStorage.getItem(panesKey()) || localStorage.getItem("ofc-panes") || "{}") || {}; } catch { return {}; } },
  write(all) { try { localStorage.setItem(panesKey(), JSON.stringify(all)); } catch { /* private mode */ } },
  get(set) { return this.read()[set] || {}; },
  put(set, patch) { const all = this.read(); all[set] = { ...(all[set] || {}), ...patch }; this.write(all); },
  isOpen(set, key, dflt = true) { const c = this.get(set).closed || {}; return key in c ? !c[key] : dflt; },
  setOpen(set, key, open) { this.put(set, { closed: { ...(this.get(set).closed || {}), [key]: !open } }); },
  width(set, p) { const w = (this.get(set).w || {})[p.key]; return paneClamp(w || p.width, p.min, p.max); },
  setWidth(set, key, w) { const g = this.get(set), ws = { ...(g.w || {}) }; if (w == null) delete ws[key]; else ws[key] = w; this.put(set, { w: ws }); },
};
const paneClamp = (v, a = 0, b = 9999) => Math.max(a, Math.min(b, v));
const PaneDefs = {};
/** panes: [{ key, label, body, tools, width (px; omit for the one that takes the rest), min, max, closable }]. */
function paneRow(set, panes) {
  PaneDefs[set] = Object.fromEntries(panes.map((p) => [p.key, p]));
  const open = panes.filter((p) => !p.closable || Panes.isOpen(set, p.key));
  const parts = [];
  open.forEach((p, n) => {
    if (n) parts.push(html`<div class="pane-resizer" data-col="8px" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize ${open[n - 1].label} and ${p.label}" title="Drag to resize. Double-click to reset." data-set="${set}" data-l="${open[n - 1].key}" data-r="${p.key}"></div>`);
    const col = p.width ? `${Panes.width(set, p)}px` : `minmax(${p.min || 320}px, 1fr)`;
    parts.push(html`<section class="pane" data-pane="${p.key}" data-col="${col}" aria-label="${p.label}"><header class="pane-head"><h2>${p.label}</h2><span class="pane-tools">${p.tools || ""}${p.closable ? html`<button type="button" class="icon-btn" data-act="pane-close" data-set="${set}" data-pane="${p.key}" aria-label="Close ${p.label}" title="Close ${p.label}">${icon("x")}</button>` : ""}</span></header>
      <div class="pane-body">${p.body}</div></section>`);
  });
  return html`<div class="panes" data-panes="${set}">${parts}</div>`;
}
/** Lays the columns out from each child's data-col (called after drawing and while resizing). */
function paneLayout(row) {
  if (!row) return;
  const kids = [...row.children], defs = PaneDefs[row.dataset.panes] || {}, room = row.clientWidth;
  const px = (c) => (/^\d+px$/.test(c.dataset.col) ? parseInt(c.dataset.col, 10) : 0);
  // Too wide for the window (a saved width, or a layout made on a bigger screen): shrink the fixed panes toward their
  // minimums, widest first, before the row has to scroll. Saved widths aren't changed.
  const fixed = kids.filter((c) => c.matches(".pane") && px(c)), flexMin = kids.filter((c) => c.matches(".pane") && !px(c)).reduce((n, c) => n + (defs[c.dataset.pane]?.min || 320), 0);
  const gaps = kids.filter((c) => !c.matches(".pane")).length * 8;
  const widths = new Map(fixed.map((c) => [c, px(c)]));
  let over = [...widths.values()].reduce((a, b) => a + b, 0) + flexMin + gaps - room;
  while (room && over > 0) {
    const c = fixed.filter((x) => widths.get(x) > (defs[x.dataset.pane]?.min || 200)).sort((a, b) => widths.get(b) - widths.get(a))[0]; if (!c) break;
    const cut = Math.min(over, widths.get(c) - (defs[c.dataset.pane]?.min || 200), 40);
    widths.set(c, widths.get(c) - cut); over -= cut;
  }
  row.style.gridTemplateColumns = kids.map((c) => (widths.has(c) ? `${widths.get(c)}px` : c.dataset.col)).join(" ");
}
addEventListener("resize", () => paneLayout($(".panes")));
function paneResizeTarget(r) {
  const defs = PaneDefs[r.dataset.set] || {}, l = defs[r.dataset.l], rt = defs[r.dataset.r];
  return l?.width ? { p: l, sign: 1 } : rt?.width ? { p: rt, sign: -1 } : null;
}
function paneSetCol(r, key, w) {
  const el = $(`:scope > [data-pane="${key}"]`, r.parentElement); if (!el) return;
  el.dataset.col = `${w}px`; paneLayout(r.parentElement); vtSync();
}
document.addEventListener("pointerdown", (e) => {
  const r = e.target.closest?.(".pane-resizer"); if (!r || e.button !== 0) return;
  const t = paneResizeTarget(r); if (!t) return;
  e.preventDefault();
  const el = $(`:scope > [data-pane="${t.p.key}"]`, r.parentElement), start = el.getBoundingClientRect().width, x0 = e.clientX;
  let w = Math.round(start);
  r.setPointerCapture(e.pointerId); r.classList.add("on"); document.body.classList.add("pane-dragging");
  const move = (ev) => { w = paneClamp(Math.round(start + t.sign * (ev.clientX - x0)), t.p.min, t.p.max); paneSetCol(r, t.p.key, w); };
  const up = () => { r.removeEventListener("pointermove", move); r.classList.remove("on"); document.body.classList.remove("pane-dragging"); Panes.setWidth(r.dataset.set, t.p.key, w); };
  r.addEventListener("pointermove", move);
  r.addEventListener("pointerup", up, { once: true }); r.addEventListener("pointercancel", up, { once: true });
});
document.addEventListener("dblclick", (e) => {
  const r = e.target.closest?.(".pane-resizer"); const t = r && paneResizeTarget(r); if (!t) return;
  Panes.setWidth(r.dataset.set, t.p.key, null); paneSetCol(r, t.p.key, t.p.width);
});
document.addEventListener("keydown", (e) => {
  const r = e.target.closest?.(".pane-resizer"); if (!r || !["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) return;
  const t = paneResizeTarget(r); if (!t) return;
  e.preventDefault();
  const now = Panes.width(r.dataset.set, t.p), w = e.key === "Home" ? t.p.width : paneClamp(now + (e.key === "ArrowRight" ? 24 : -24) * t.sign, t.p.min, t.p.max);
  Panes.setWidth(r.dataset.set, t.p.key, e.key === "Home" ? null : w); paneSetCol(r, t.p.key, w);
});
Actions["pane-close"] = (el) => { Panes.setOpen(el.dataset.set, el.dataset.pane, false); render(); };
Actions["pane-toggle"] = (el) => { Panes.setOpen(el.dataset.set, el.dataset.pane, !Panes.isOpen(el.dataset.set, el.dataset.pane)); render(); };

/* ----- The builder workspace ----- */
// What the workspace is showing: the document, the selected block (by id, so it survives reordering), a new block
// being written (draft, inserted at "at"), a pinned passage, the Study tab and translation.
let desk = { doc: null, id: null, draft: null, at: 0, pin: null, tab: "passage", t: null, focus: null, scroll: null };
const deskOn = () => typeof isDesktop === "function" && isDesktop() && /^#build-/.test(location.hash);

const buildPhoneScreen = Screens.build;
Screens.build = (id) => {
  const v = buildPhoneScreen(id);
  if (v.redirect || !isDesktop()) return v;
  return deskView(S.get("docs", id), v);
};

function deskView(d, v) {
  d.blocks.forEach((b) => { b.id ||= uid(); }); // older blocks had no id; selection and the slide strip need one
  if (desk.doc !== d.id) { deskLayoutFirstTime(); desk = { doc: d.id, id: d.blocks[0]?.id || null, draft: null, at: 0, pin: null, tab: Panes.get("builder").tab || "passage", t: null, focus: null, scroll: null }; }
  if (!desk.draft && !d.blocks.some((b) => b.id === desk.id)) desk.id = d.blocks[0]?.id || null;
  const g = d.gatheringId && S.get("gatherings", d.gatheringId), ref = deskRef(d);
  const toggle = (key, label, ic) => { const on = Panes.isOpen("builder", key); return html`<button type="button" class="chip ${on ? "on" : ""}" data-act="pane-toggle" data-set="builder" data-pane="${key}" aria-pressed="${on}">${icon(ic)}${label}</button>`; };
  return {
    title: v.title, back: v.back, wide: true,
    body: html`<div class="desk" data-doc="${d.id}">
      <div class="desk-head">
        <p class="desk-meta"><span class="tag brand">${DOC_KINDS[d.kind].label}</span> ${d.published ? html`<span class="tag ok">Published</span>` : html`<span class="tag">Draft</span>`}
          <span class="faint">${[d.passage, g?.name, docWhen(d), d.locationId && multiCampus() ? locName(d.locationId) : ""].filter(Boolean).join(". ")}</span></p>
        <div class="desk-tools"><div class="btns">${docButtons(d)}</div>
          <div class="desk-toggles" role="group" aria-label="Show or hide panes">${toggle("outline", "Outline", "list")}${toggle("study", "Study", "book")}${toggle("strip", "Slides", "image")}
            <button type="button" class="chip" data-act="desk-layouts" aria-haspopup="menu" title="Saved pane layouts">${icon("layers")}Pane layout</button></div></div>
        ${isUnassigned(d) ? html`<div class="demo-note">${icon("calendar")}<div>Unassigned draft: no class, date or time yet. <button class="btn ghost sm" data-act="doc-assign" data-id="${d.id}">Assign to a class</button></div></div>` : ""}
      </div>
      ${paneRow("builder", [
        { key: "outline", label: "Outline", width: 300, min: 220, max: 480, closable: true, body: deskOutline(d) },
        { key: "editor", label: desk.draft ? `New ${BLOCKS[desk.draft.type].label.toLowerCase()}` : "Editor", min: 380, body: deskEditor(d) },
        { key: "study", label: "Study", width: 400, min: 300, max: 680, closable: true, body: deskStudy(d),
          tools: ref ? html`<button type="button" class="icon-btn ${desk.pin ? "on" : ""}" data-act="desk-pin" aria-pressed="${desk.pin ? "true" : "false"}" aria-label="${desk.pin ? `Unpin ${ref}` : `Pin ${ref}`}" title="${desk.pin ? "Pinned. Click to follow the outline again." : "Pin this passage so it stays put"}">${icon("pin")}</button>` : "" },
      ])}
      ${Panes.isOpen("builder", "strip") ? deskStrip(d) : ""}
    </div>`,
    after() { deskAfter(d); },
  };
}

/** The passage the Study pane shows: the pinned one, else the Scripture block you're on or the last one above it, else the main passage. */
function deskRef(d) {
  if (desk.pin) return desk.pin;
  if (desk.draft?.type === "scripture" && parseRef(desk.draft.ref)) return refLabel(parseRef(desk.draft.ref));
  const i = desk.draft ? desk.at - 1 : d.blocks.findIndex((b) => b.id === desk.id);
  for (let j = Math.min(i, d.blocks.length - 1); j >= 0; j--) { const b = d.blocks[j]; if (b.type === "scripture" && parseRef(b.ref)) return refLabel(parseRef(b.ref)); }
  const p = parseRef(d.passage); return p ? refLabel(p) : null;
}
function deskSummary(b) {
  switch (b.type) {
    case "scripture": return b.ref || "No reference";
    case "media": return b.caption || (b.url ? "Video or link" : "Picture");
    case "text": return b.title || b.text || "";
    case "action": return [b.label, b.text].filter(Boolean).join(": ");
    default: return b.text || "";
  }
}

function deskOutline(d) {
  let slide = 0;
  return html`${deskSelBar(d)}${d.blocks.length ? html`<div class="ol-list" id="sort-list" aria-multiselectable="true">${d.blocks.map((b, i) => {
      const shown = b.show && b.type !== "note"; if (shown) slide++;
      const on = !desk.draft && b.id === desk.id;
      const vr = b.type === "scripture" && parseRef(b.ref) ? b.ref : "";
      return html`<div class="ol-item ${on ? "on" : ""} ${shown ? "" : "private"} ${deskPicked(d, b.id) ? "picked" : ""}" data-index="${i}">${dragHandle(`${BLOCKS[b.type].label} ${i + 1}`)}
        <button type="button" class="ol-pick" data-act="desk-pick" data-id="${b.id}" aria-current="${on ? "true" : "false"}" ${vr ? html`data-verse="${vr}"` : ""}>
          <span class="ol-num" title="${shown ? `On screen, slide ${slide}` : "Private"}">${shown ? slide : icon("lock")}</span>
          <span class="ol-text"><b>${BLOCKS[b.type].label}</b><span>${deskSummary(b)}</span></span></button>
        ${b.type !== "note" ? html`<button type="button" class="icon-btn" data-act="block-vis" data-doc="${d.id}" data-i="${i}" aria-label="${shown ? "Keep private" : "Show on screen"}" title="${shown ? "Shown on screen. Click to keep private." : "Private. Click to show on screen."}">${icon(shown ? "eye" : "eyeoff")}</button>` : ""}
      </div>`;
    })}</div>` : empty("No blocks yet. Add Scripture, points, keynotes, media or cues below.")}
    <div class="ol-add"><p class="faint">Add ${desk.id && d.blocks.length ? "below the selected block" : "a block"}</p>
      <div class="add-blocks">${Object.entries(BLOCKS).map(([k, t]) => html`<button class="chip" data-act="dblock-new" data-doc="${d.id}" data-type="${k}">${icon(t.icon)}${t.label}</button>`)}
        ${S.list("savedBlocks").length ? html`<button class="chip" data-act="saved-blocks" data-doc="${d.id}">${icon("bookmark")}Saved items</button>` : ""}
        ${S.list("layouts").some((l) => l.kind === d.kind) ? html`<button class="chip" data-act="layout-insert" data-kind="${d.kind}" data-id="${d.id}">${icon("layers")}From a layout</button>` : ""}</div></div>`;
}

function deskEditor(d) {
  if (desk.draft) return html`<p class="desk-crumb faint">It goes ${desk.at >= d.blocks.length ? "at the end" : `before block ${desk.at + 1}`}.</p>${docBlockForm(d.id, -1, desk.draft, { at: desk.at })}`;
  const i = d.blocks.findIndex((b) => b.id === desk.id);
  if (i < 0) return empty("Choose a block in the outline, or add one.");
  const b = d.blocks[i], prev = d.blocks[i - 1], next = d.blocks[i + 1];
  return html`<div class="desk-crumb"><b>${BLOCKS[b.type].label}</b><span class="faint">Block ${i + 1} of ${d.blocks.length}. Changes save as you type.</span>
      <span class="desk-step"><button type="button" class="icon-btn" data-act="desk-pick" data-id="${prev?.id || ""}" aria-label="Previous block" ${attr(!prev, "disabled")}>${icon("up")}</button><button type="button" class="icon-btn" data-act="desk-pick" data-id="${next?.id || ""}" aria-label="Next block" ${attr(!next, "disabled")}>${icon("down")}</button></span></div>
    ${docBlockForm(d.id, i, b, {})}`;
}

function deskStudy(d) {
  const ref = deskRef(d), tabs = [["passage", "Passage"], ["related", "Related"], ["past", d.kind === "sermon" ? "Past sermons" : "Past teaching"]];
  if (Veritas.enabled()) tabs.push(["veritas", "Veritas"]);
  if (d.kind === "lesson") tabs.push(["lesson", "Lesson"]);
  if (!tabs.some(([k]) => k === desk.tab)) desk.tab = "passage";
  const t = desk.t || bibleT();
  let body;
  if (desk.tab === "lesson") body = html`${S.on("kidsintro") && d.storyId ? kidsBookendsPanel(d) : ""}${S.on("storylessons") ? storyBgPanel(d) : ""}${familyPanel(d)}`;
  else if (!ref) body = empty("Add a Scripture block, or set the main passage in Details, and this pane follows it.");
  else if (desk.tab === "veritas") body = html`<p class="faint vt-note">Veritas Logos, live from veritaslogos.com. ${desk.pin ? "Pinned to" : "Following"} ${ref}. <a href="${Veritas.read(ref)}" target="_blank" rel="noopener">Open in a new tab</a></p>
    <div class="vt-slot" data-src="${Veritas.read(ref)}" aria-hidden="true"></div>`;
  else if (desk.tab === "related") body = html`<p class="faint">Passages related to ${ref}. Click one to read it here.</p><div class="study-xrefs" data-ref="${ref}" aria-live="polite"><p class="faint">Finding related passages...</p></div>`;
  else if (desk.tab === "past") body = pastPanel(ref, { doc: d.id, label: `From our church on ${ref}`, max: 12 }) || empty(`Nothing from your church on ${ref} yet.`);
  else body = html`<div class="study-ref"><b>${ref}</b><select data-change="desk-t" aria-label="Translation">${Bible.translations.map((x) => html`<option ${attr(x === t, "selected")}>${x}</option>`)}</select></div>
    <p class="faint study-follow">${desk.pin ? html`Pinned here. ${icon("pin")} unpins it.` : "Follows the Scripture you're on."}</p>
    <div class="btns"><button type="button" class="btn sm" data-act="desk-insert" data-ref="${ref}">${icon("plus")}Insert</button>${Veritas.enabled() ? html`<a class="btn ghost sm" href="${Veritas.read(ref)}" target="_blank" rel="noopener">${icon("book")}Open in Veritas Logos</a>` : ""}</div>
    <div class="study-text" data-ref="${ref}" data-t="${t}" aria-live="polite"><p class="faint">Loading ${ref}...</p></div>`;
  return html`<div class="study" data-ref="${ref || ""}" data-tab="${desk.tab}"><div class="seg study-tabs" role="tablist" aria-label="Study">${tabs.map(([k, l]) => html`<button type="button" role="tab" data-act="desk-tab" data-tab="${k}" aria-selected="${k === desk.tab}">${l}</button>`)}</div>${body}</div>`;
}

function deskStrip(d) {
  const slides = docSlides(d);
  return html`<section class="desk-strip" aria-label="Slides"><header class="pane-head"><h2>Slides</h2><span class="faint">${slides.length} slide${slides.length === 1 ? "" : "s"}. Click one to edit its block.</span>
      <span class="pane-tools"><a class="btn ghost sm" href="#slides-doc-${d.id}">${icon("image")}Edit slides</a><button type="button" class="icon-btn" data-act="pane-close" data-set="builder" data-pane="strip" aria-label="Close Slides" title="Close Slides">${icon("x")}</button></span></header>
    <div class="strip-row">${slides.map((s, n) => {
      const bid = String(s.editKey || "").startsWith("block:") ? s.editKey.split(":")[1] : "";
      const look = s.kind === "media" ? { ...s, url: "" } : s; // no players in a thumbnail
      return html`<button type="button" class="strip-slide ${bid && bid === desk.id && !desk.draft ? "on" : ""}" ${bid ? html`data-act="desk-pick" data-id="${bid}"` : html`data-act="doc-details" data-id="${d.id}"`} aria-label="Slide ${n + 1}"><div class="stage" aria-hidden="true">${slideHtml(look)}</div><span>${n + 1}</span></button>`;
    })}</div></section>`;
}

/* ----- Drawing, keeping the scroll, and loading the Study pane ----- */
function deskCapture() {
  const root = $(".desk"); if (!root) return;
  deskFlush();
  // Kept only for the next drawing of the same document, so another page doesn't inherit it.
  desk.scroll = Object.fromEntries([...$$(".pane", root).map((p) => [p.dataset.pane, $(".pane-body", p).scrollTop]), ["strip", $(".strip-row", root)?.scrollLeft || 0], ["_doc", root.dataset.doc]]);
}
const deskRenderBase = render;
render = function (...a) { deskCapture(); const r = deskRenderBase.apply(this, a); vtSync(); return r; }; // eslint-disable-line no-func-assign

function deskAfter(d) {
  const root = $(".desk"); if (!root) return;
  paneLayout($(".panes", root));
  deskFit();
  if (desk.scroll && desk.scroll._doc === d.id) {
    $$(".pane", root).forEach((p) => { const y = desk.scroll[p.dataset.pane]; if (y) $(".pane-body", p).scrollTop = y; });
    const row = $(".strip-row", root); if (row) row.scrollLeft = desk.scroll.strip || 0;
  }
  desk.scroll = { _doc: d.id };
  $(".ol-item.on", root)?.scrollIntoView({ block: "nearest" });
  $(".strip-slide.on", root)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  deskSortable(d);
  if (desk.focus === "ol") $(".ol-item.on .ol-pick", root)?.focus({ preventScroll: true });
  else if (desk.focus === "strip") $(".strip-slide.on", root)?.focus({ preventScroll: true });
  else if (desk.focus === "editor") $(".pane[data-pane=editor] .pane-body", root)?.querySelector("input:not([type=hidden]):not([type=checkbox]), textarea, select")?.focus({ preventScroll: true });
  desk.focus = null;
  deskFill();
}
/** The workspace fills the window below the top bar; the panes scroll inside it. */
function deskFit() { const root = $(".desk"); if (root) root.style.height = `${Math.max(480, innerHeight - root.getBoundingClientRect().top - 12)}px`; }
addEventListener("resize", () => { deskFit(); vtSync(); });

function deskSortable(d) {
  makeSortable($("#sort-list"), (from, to, kb) => { if (moveItem(d.blocks, from, to)) { touch(d); render(); if (kb) $$("#sort-list [data-drag]")[to]?.focus(); } });
}

async function deskVerses(ref, t) {
  const r = parseRef(ref), n = BOOKS.indexOf(r.book), data = await Bible.load(t, n < 39 ? "ot" : "nt"), ch = data[n < 39 ? n : n - 39]?.[r.chapter - 1];
  if (!ch) throw new Error("no such chapter");
  const a = r.verse || 1, b = Math.min(r.verseEnd || r.verse || ch.length, ch.length);
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => [a + k, ch[a + k - 1]]);
}
function deskFill() {
  const box = $(".study-text[data-ref]");
  if (box) deskVerses(box.dataset.ref, box.dataset.t).then((vs) => {
    if (!box.isConnected) return;
    box.innerHTML = flat(html`<p class="study-verses">${vs.map(([v, s]) => html`<sup>${v}</sup>${s} `)}</p><p class="faint">${box.dataset.t === "KJV" ? "King James Version" : "Berean Standard Bible"}, public domain.</p>`);
  }, () => { if (box.isConnected) box.innerHTML = flat(html`<p class="muted">${box.dataset.ref} couldn't load here. Check the reference, or your connection.</p>`); });
  const xb = $(".study-xrefs[data-ref]");
  if (xb) {
    const r = parseRef(xb.dataset.ref), b = BOOKS.indexOf(r.book), verses = r.verse ? Array.from({ length: (r.verseEnd || r.verse) - r.verse + 1 }, (_, i) => r.verse + i) : Array.from({ length: 176 }, (_, i) => i + 1);
    xrefsFor(b, r.chapter, verses, 15).then(async (list) => {
      const t = desk.t || bibleT(), preview = await Promise.all(list.map((x) => Bible.text(refLabel(x.ref), t, false).then((s) => s.slice(0, 150) + (s.length > 150 ? "..." : ""), () => "")));
      if (!xb.isConnected) return;
      xb.innerHTML = flat(list.length ? html`<div class="rows">${list.map((x, i) => html`<div class="row xref-row"><button type="button" class="body" data-act="desk-look" data-ref="${x.label}" data-verse="${x.label}"><span class="t">${x.label}</span>${preview[i] ? html`<span class="s">${preview[i]}</span>` : ""}</button>
          <button type="button" class="btn ghost sm" data-act="desk-insert" data-ref="${x.label}" aria-label="Insert ${x.label}">${icon("plus")}Insert</button></div>`)}</div>${xrefCredit()}` : html`<p class="muted">No cross-references for this passage yet.</p>${xrefCredit()}`);
    }, () => { if (xb.isConnected) xb.innerHTML = flat(html`<p class="muted">Related passages couldn't load. Check your connection.</p>`); });
  }
}

/** After a save as you type: redraw the outline, strip and (if the passage changed) the Study pane, leaving the editor alone. */
function deskRefresh(d) {
  const root = $(".desk"); if (!root || root.dataset.doc !== d.id) return;
  const ol = $('.pane[data-pane="outline"] .pane-body', root);
  if (ol) { const y = ol.scrollTop; ol.innerHTML = flat(deskOutline(d)); ol.scrollTop = y; deskSortable(d); }
  const st = $(".desk-strip", root);
  if (st) { const x = $(".strip-row", st)?.scrollLeft || 0; st.outerHTML = flat(deskStrip(d)); const row = $(".desk-strip .strip-row", root); if (row) row.scrollLeft = x; }
  const sp = $('.pane[data-pane="study"]', root), ref = deskRef(d) || "";
  if (sp && $(".study", sp)?.dataset.ref !== ref) { $(".pane-body", sp).innerHTML = flat(deskStudy(d)); deskFill(); vtSync(); }
}

/* ----- Saving as you type ----- */
let deskTimer = 0;
/** Saves what's been typed but not saved yet (before a redraw, an undo or a shortcut). */
function deskFlush() { if (!deskTimer) return; clearTimeout(deskTimer); deskTimer = 0; const f = $("form[data-desk-auto]"); if (f) deskAutosave(f, true); }
function deskKick(e) {
  const f = e.target.closest?.("form[data-desk-auto]"); if (!f) return;
  clearTimeout(deskTimer);
  const s = $(".desk-saved", f); if (s) s.textContent = "Saving...";
  deskTimer = setTimeout(() => { deskTimer = 0; deskAutosave(f); }, 600);
}
document.addEventListener("input", deskKick, true);
document.addEventListener("change", deskKick, true);
function deskAutosave(f, quiet) {
  if (!f.isConnected) return;
  const data = {}; for (const [k, v] of new FormData(f)) data[k] = typeof v === "string" ? v.trim() : v;
  const doc = S.get("docs", data._doc), i = +data._i; if (!doc || !doc.blocks[i] || !canEditDoc(doc)) return;
  const { b, err } = blockFromForm(doc, data), s = $(".desk-saved", f);
  if (err) { if (s) s.textContent = err; return; }
  doc.blocks[i] = { ...doc.blocks[i], ...b }; touch(doc, { typing: true });
  if (s) s.textContent = "Saved";
  if (!quiet) deskRefresh(doc);
}

/* ----- Hooks from the builder (49-builder.js) and the workspace's own actions ----- */
/** blockEditor asks first: on the desktop builder a block opens in the editor pane instead of a sheet. */
function deskEdit(docId, i, b) {
  if (!deskOn() || desk.doc !== docId) return false;
  const d = S.get("docs", docId);
  if (i < 0) { const s = d.blocks.findIndex((x) => x.id === desk.id); desk.draft = { ...b }; desk.at = s < 0 ? d.blocks.length : s + 1; }
  else { desk.draft = null; desk.id = d.blocks[i]?.id || desk.id; }
  desk.focus = "editor"; render();
  return true;
}
function deskSaved(doc, at, isNew) {
  if (desk.doc !== doc.id) return;
  desk.draft = null; desk.id = doc.blocks[at]?.id || desk.id;
  if (isNew) { desk.focus = "editor"; toast(`Added ${BLOCKS[doc.blocks[at]?.type]?.label.toLowerCase() || "block"}`); }
}
const deskDeleteBase = Actions["dblock-delete"];
Actions["dblock-delete"] = (el) => {
  const d = S.get("docs", el.dataset.doc), i = +el.dataset.i;
  if (d && desk.doc === d.id) desk.id = (d.blocks[i + 1] || d.blocks[i - 1])?.id || null;
  deskDeleteBase(el);
};
Actions["desk-pick"] = (el) => {
  if (!el.dataset.id) return;
  desk.id = el.dataset.id; desk.draft = null; deskSelClear();
  desk.focus = el.matches(".ol-pick") ? "ol" : el.matches(".strip-slide") ? "strip" : null;
  render();
};
Actions["desk-cancel"] = () => { desk.draft = null; render(); };
Actions["desk-tab"] = (el) => { desk.tab = el.dataset.tab; if (el.dataset.tab !== "lesson") Panes.put("builder", { tab: el.dataset.tab }); render(); };
Actions["desk-pin"] = () => { const d = S.get("docs", desk.doc); desk.pin = desk.pin ? null : d && deskRef(d); render(); };
Actions["desk-look"] = (el) => { desk.pin = el.dataset.ref; desk.tab = "passage"; render(); toast(`Pinned to ${el.dataset.ref}. Unpin to follow the outline again.`); };
Inputs["desk-t"] = (el) => { desk.t = el.value; render(); };
Actions["desk-insert"] = async (el) => {
  const d = S.get("docs", desk.doc), r = parseRef(el.dataset.ref); if (!d || !r || !canEditDoc(d)) return;
  const ref = refLabel(r), t = desk.t || bibleT();
  let text = ""; try { text = await Bible.text(ref, t); } catch { /* the block still gets the reference; Fill from the Bible can try again */ }
  const s = d.blocks.findIndex((b) => b.id === desk.id), at = desk.draft ? desk.at : s < 0 ? d.blocks.length : s + 1;
  const b = { id: uid(), type: "scripture", show: true, ref, translation: t, text, notes: "" };
  d.blocks.splice(at, 0, b);
  if (desk.draft) desk.at = at + 1; else desk.id = b.id;
  touch(d); render(); toast(`Added ${ref}`);
};
// Arrow keys in the outline move between blocks.
document.addEventListener("keydown", (e) => {
  const b = e.target.closest?.(".ol-pick"); if (!b || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
  const all = $$(".ol-pick"), next = all[all.indexOf(b) + (e.key === "ArrowDown" ? 1 : -1)];
  if (!next) return;
  e.preventDefault(); desk.id = next.dataset.id; desk.draft = null; desk.focus = "ol"; deskSelClear(); render();
});

/* ----- The Veritas tab: the live Veritas Logos app beside the writing ----- */
// The builder redraws its panes on every click, and redrawing (or even moving) an iframe reloads it. So the frame lives
// in one fixed box on the page, outside anything that redraws, and sits over the Study pane's .vt-slot. It loads once;
// after that a new passage only changes the link's #read-... part, which the Veritas app follows without reloading.
const VtFrame = { host: null, frame: null, src: "", seen: null };
function vtSync() {
  const slot = $(".vt-slot");
  if (!slot) { if (VtFrame.host) VtFrame.host.hidden = true; return; }
  if (!VtFrame.host) {
    VtFrame.host = document.createElement("div"); VtFrame.host.className = "vt-host";
    VtFrame.frame = document.createElement("iframe");
    Object.assign(VtFrame.frame, { title: "Veritas Logos", referrerPolicy: "strict-origin-when-cross-origin" });
    VtFrame.frame.setAttribute("allow", "clipboard-write");
    VtFrame.host.appendChild(VtFrame.frame); document.body.appendChild(VtFrame.host);
    VtFrame.seen = new ResizeObserver(() => vtPlace());
  }
  if (VtFrame.src !== slot.dataset.src) { VtFrame.src = slot.dataset.src; VtFrame.frame.src = VtFrame.src; }
  VtFrame.seen.disconnect(); VtFrame.seen.observe(slot);
  vtPlace();
}
function vtPlace() {
  const slot = $(".vt-slot"); if (!slot || !VtFrame.host) return;
  const r = slot.getBoundingClientRect();
  Object.assign(VtFrame.host.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  VtFrame.host.hidden = r.width < 20 || r.height < 20;
}
