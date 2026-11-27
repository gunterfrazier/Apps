// ---------- Desktop builder: selecting several blocks, and the right-click menu on a block ----------
// Ctrl-click (Cmd-click on a Mac) adds or removes a block; Shift-click selects a run; Shift+↑/↓ extends from the
// keyboard; Ctrl+A in the outline selects them all; Esc clears. Duplicate, private, send home, move and delete then act
// on every selected block (49c-builder-keys.js), from the bar above the outline, the right-click menu, the command box
// or the shortcuts. A plain click goes back to one block.

const DeskSel = { doc: null, ids: [] };
const deskPicked = (d, id) => DeskSel.doc === d.id && DeskSel.ids.length > 1 && DeskSel.ids.includes(id);
function deskSelClear() { DeskSel.ids = []; DeskSel.anchor = null; } // a plain click starts over: the next Shift-click measures from the open block
function deskSelSet(d, ids) { DeskSel.doc = d.id; DeskSel.ids = ids; }
/** Indexes the block actions work on: the selection if there's more than one, else the open block. In order. */
function deskTargets(d) {
  if (DeskSel.doc === d.id && DeskSel.ids.length > 1) return d.blocks.map((b, i) => (DeskSel.ids.includes(b.id) ? i : -1)).filter((i) => i >= 0);
  const i = deskIndex(d); return i < 0 ? [] : [i];
}
function deskSelBar(d) {
  const n = DeskSel.doc === d.id ? DeskSel.ids.length : 0; if (n < 2) return "";
  return html`<div class="ol-bar" role="toolbar" aria-label="${n} blocks selected"><b>${n} selected</b>
    <button type="button" class="icon-btn" data-act="desk-sel" data-do="dup" aria-label="Duplicate" title="Duplicate (${keyLabel("Mod+D")})">${icon("copy")}</button>
    <button type="button" class="icon-btn" data-act="desk-sel" data-do="hide" aria-label="Keep private" title="Keep private">${icon("eyeoff")}</button>
    <button type="button" class="icon-btn" data-act="desk-sel" data-do="show" aria-label="Show on screen" title="Show on screen">${icon("eye")}</button>
    <button type="button" class="icon-btn" data-act="desk-sel" data-do="del" aria-label="Delete" title="Delete">${icon("trash")}</button>
    <button type="button" class="btn ghost sm" data-act="desk-sel" data-do="clear">Clear</button></div>`;
}
Actions["desk-sel"] = (el) => {
  const d = buildDoc(); if (!d) return;
  ({ dup: () => deskDuplicate(d), hide: () => deskTogglePrivate(d, false), show: () => deskTogglePrivate(d, true), del: () => deskDelete(d), clear: () => { deskSelClear(); render(); } })[el.dataset.do]?.();
};
/** Changes the selection without redrawing the page (the editor keeps whatever's being typed). */
function deskSelPaint(d) {
  $$(".ol-item").forEach((x) => { const id = $(".ol-pick", x)?.dataset.id; x.classList.toggle("picked", deskPicked(d, id)); });
  const ol = $('.pane[data-pane="outline"] .pane-body');
  $(".ol-bar", ol)?.remove();
  const bar = deskSelBar(d); if (bar && ol) ol.insertAdjacentHTML("afterbegin", flat(bar));
}
function deskSelectTo(d, id, add) {
  if (DeskSel.doc !== d.id) deskSelSet(d, []);
  const ids = d.blocks.map((b) => b.id);
  if (add) { // Ctrl-click: the open block counts as selected, then this one is added or removed.
    let set = DeskSel.ids.length ? [...DeskSel.ids] : desk.id ? [desk.id] : [];
    set = set.includes(id) ? set.filter((x) => x !== id) : [...set, id];
    DeskSel.ids = set; DeskSel.anchor = id;
  } else { // Shift-click: everything from the anchor (or the open block) to here.
    const from = ids.indexOf(DeskSel.anchor || desk.id), to = ids.indexOf(id);
    if (from < 0 || to < 0) return;
    DeskSel.ids = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
  }
  deskSelPaint(d);
}
// Modifier clicks on the outline (and the slide strip) select instead of opening.
document.addEventListener("click", (e) => {
  const add = isMac ? e.metaKey : e.ctrlKey; // on a Mac, Ctrl-click is a right-click
  const b = e.target.closest?.(".ol-pick, .strip-slide[data-id]"); if (!b || !(add || e.shiftKey) || !deskOn()) return;
  const d = buildDoc(); if (!d) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (!DeskSel.anchor || DeskSel.doc !== d.id) DeskSel.anchor = desk.id;
  deskSelectTo(d, b.dataset.id, add);
}, true);
document.addEventListener("keydown", (e) => {
  if (!deskOn() || cmdOpen() || $("#scrim") || Ctx.el) return;
  const d = buildDoc(); if (!d) return;
  const pick = e.target.closest?.(".ol-pick"), mod = isMac ? e.metaKey : e.ctrlKey;
  if (pick && e.shiftKey && !mod && !e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    const all = $$(".ol-pick"), next = all[all.indexOf(pick) + (e.key === "ArrowDown" ? 1 : -1)]; if (!next) return;
    if (!DeskSel.anchor || DeskSel.doc !== d.id || DeskSel.ids.length < 2) DeskSel.anchor = desk.id;
    deskSelectTo(d, next.dataset.id, false); next.focus();
  } else if (pick && mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
    e.preventDefault(); deskSelSet(d, d.blocks.map((b) => b.id)); deskSelPaint(d);
  } else if (e.key === "Escape" && DeskSel.ids.length > 1 && DeskSel.doc === d.id) {
    deskSelClear(); deskSelPaint(d);
  }
});
shortcut("Builder", ["Mod+Click", "Shift+Click"], "Select several blocks", () => typeof onDeskBuild === "function" && onDeskBuild());
shortcut("Builder", ["Shift+↑", "Shift+↓"], "Select more blocks from the outline", () => typeof onDeskBuild === "function" && onDeskBuild());
shortcut("Builder", ["Mod+A"], "Select every block (from the outline)", () => typeof onDeskBuild === "function" && onDeskBuild());

// Right-click a block in the outline or the slide strip.
contextMenuFor(".ol-item, .strip-slide[data-id]", (el) => {
  const d = buildDoc(); if (!d || !deskOn()) return null;
  const id = el.matches(".ol-item") ? $(".ol-pick", el)?.dataset.id : el.dataset.id;
  const b = d.blocks.find((x) => x.id === id); if (!b) return null;
  // Right-clicking outside the selection makes that block the one you're working on.
  if (!deskPicked(d, id)) { if (desk.id !== id || desk.draft || DeskSel.ids.length) { desk.id = id; desk.draft = null; deskSelClear(); render(); } }
  const now = () => buildDoc() || d; // looked up when chosen: the page may have reloaded since the menu opened
  const idx = deskTargets(d), list = idx.map((i) => d.blocks[i]), many = list.length > 1, i = idx[0];
  const anyShown = list.some((x) => x.show), anyHome = list.some((x) => x.home), notes = list.every((x) => x.type === "note");
  return [
    { head: many ? `${list.length} blocks` : `${BLOCKS[b.type].label}: ${deskSummary(b).slice(0, 40) || "Untitled"}` },
    !many && { label: "Edit", icon: "edit", run: () => { desk.focus = "editor"; render(); } },
    !many && { label: "Add a block below", icon: "plus", keys: "Enter", run: () => openCommand("add ") },
    { label: "Duplicate", icon: "copy", keys: "Mod+D", run: () => deskDuplicate(now()) },
    !notes && (anyShown ? { label: "Keep private", icon: "eyeoff", keys: "Mod+H", run: () => deskTogglePrivate(now(), false) } : { label: "Show on screen", icon: "eye", keys: "Mod+H", run: () => deskTogglePrivate(now(), true) }),
    d.kind === "lesson" && !notes && { label: anyHome ? "Don't send home" : "Send home on the family page", icon: "door", run: () => deskSendHome(now(), !anyHome) },
    !many && { label: "Save for reuse", icon: "bookmark", run: () => Actions["item-save"]({ dataset: { kind: "block", source: d.id, i: String(i) } }) },
    "-",
    { label: "Move up", icon: "up", keys: "Alt+↑", disabled: idx[0] === 0, run: () => deskMove(now(), -1) },
    { label: "Move down", icon: "down", keys: "Alt+↓", disabled: idx.at(-1) === d.blocks.length - 1, run: () => deskMove(now(), 1) },
    { label: "Move to the top", icon: "up", disabled: idx[0] === 0 && !many, run: () => deskMove(now(), 0, 0) },
    { label: "Move to the bottom", icon: "down", disabled: idx.at(-1) === d.blocks.length - 1 && !many, run: () => deskMove(now(), 0, -1) },
    "-",
    { label: many ? `Delete ${list.length} blocks` : "Delete", icon: "trash", keys: "Delete", danger: true, run: () => deskDelete(now()) },
  ];
});
