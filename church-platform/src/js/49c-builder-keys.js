// ---------- Builder keyboard: undo and redo, shortcuts, and the builder's commands in the command box ----------
// Undo keeps a history of each document's blocks for this visit (touch in 49-builder.js records every change). Saving
// as you type groups a burst of typing into one step. Ctrl+Z in a text field is the field's own undo; outside one it
// undoes the last change to the document.

/* ----- Undo and redo ----- */
const DocHistory = {};
/** Starts a document's history from how it is now (when its builder opens). */
function docHistorySeen(d) { DocHistory[d.id] ||= { past: [], future: [], last: JSON.stringify(d.blocks), at: 0, typing: false }; }
function docHistory(d, o = {}) {
  const h = DocHistory[d.id]; if (!h) return docHistorySeen(d);
  const cur = JSON.stringify(d.blocks); if (cur === h.last) return;
  const now = Date.now();
  if (!(o.typing && h.typing && now - h.at < 2000)) { h.past.push(h.last); if (h.past.length > 100) h.past.shift(); }
  h.last = cur; h.future = []; h.at = now; h.typing = !!o.typing;
}
function docUndo(d, redo = false) {
  if (typeof deskFlush === "function") deskFlush();
  const h = DocHistory[d.id], from = redo ? h?.future : h?.past;
  if (!from?.length) { toast(redo ? "Nothing to redo" : "Nothing to undo"); return; }
  (redo ? h.past : h.future).push(h.last);
  h.last = from.pop(); h.typing = false;
  d.blocks = JSON.parse(h.last); d.updated = new Date().toISOString(); S.save();
  render(); toast(redo ? "Redone" : `Undone. ${keyLabel("Mod+Shift+Z")} redoes it.`);
}
const buildPhoneOrDesk = Screens.build;
Screens.build = (id) => { const v = buildPhoneOrDesk(id); const d = S.get("docs", id); if (d && !v.redirect) docHistorySeen(d); return v; };

/* ----- Block actions shared by shortcuts and commands ----- */
const buildDoc = () => { const m = location.hash.match(/^#build-(.+)$/), d = m && S.get("docs", m[1]); return d && canEditDoc(d) ? d : null; };
const deskIndex = (d) => (typeof desk !== "undefined" && desk.doc === d.id && !desk.draft ? d.blocks.findIndex((b) => b.id === desk.id) : -1);
// Each acts on the selected blocks (several, with Ctrl-click or Shift-click: 49d-builder-select.js), or the one open.
function deskDuplicate(d) {
  const idx = deskTargets(d); if (!idx.length) return;
  const copies = idx.map((i) => ({ ...JSON.parse(JSON.stringify(d.blocks[i])), id: uid() }));
  d.blocks.splice(idx.at(-1) + 1, 0, ...copies);
  desk.id = copies[0].id; deskSelSet(d, copies.length > 1 ? copies.map((c) => c.id) : []);
  touch(d); render(); toast(copies.length > 1 ? `Duplicated ${copies.length} blocks` : "Duplicated");
}
function deskTogglePrivate(d, show) {
  const list = deskTargets(d).map((i) => d.blocks[i]).filter((b) => b.type !== "note"); if (!list.length) return;
  const on = show ?? !list.some((b) => b.show);
  list.forEach((b) => { b.show = on; }); touch(d); render();
  toast(`${list.length > 1 ? `${list.length} blocks: ` : ""}${on ? "shown on screen" : "kept private"}`.replace(/^./, (c) => c.toUpperCase()));
}
function deskSendHome(d, home) {
  const list = deskTargets(d).map((i) => d.blocks[i]).filter((b) => b.type !== "note"); if (!list.length || d.kind !== "lesson") return;
  const on = home ?? !list.some((b) => b.home);
  list.forEach((b) => { b.home = on; }); touch(d); render();
  toast(on ? "Goes home on the family page" : "Not on the family page");
}
function deskMove(d, dir, to) {
  const idx = deskTargets(d); if (!idx.length) return;
  if (to != null) { // to the top (0) or the bottom (-1), keeping their order
    const moving = idx.map((i) => d.blocks[i]), rest = d.blocks.filter((_, i) => !idx.includes(i));
    d.blocks = to === 0 ? [...moving, ...rest] : [...rest, ...moving];
  } else {
    if (dir < 0 ? idx[0] === 0 : idx.at(-1) === d.blocks.length - 1) return;
    (dir < 0 ? idx : [...idx].reverse()).forEach((i) => moveItem(d.blocks, i, i + dir));
  }
  desk.focus = $(".ol-pick:focus") ? "ol" : null; touch(d); render();
}
function deskDelete(d) {
  const idx = deskTargets(d); if (!idx.length) return;
  const gone = new Set(idx.map((i) => d.blocks[i].id));
  desk.id = (d.blocks.slice(idx.at(-1) + 1).find((b) => !gone.has(b.id)) || d.blocks.slice(0, idx[0]).at(-1))?.id || null; desk.focus = "ol";
  d.blocks = d.blocks.filter((b) => !gone.has(b.id)); deskSelClear();
  touch(d); render(); toast(`${gone.size > 1 ? `Deleted ${gone.size} blocks` : "Deleted"}. ${keyLabel("Mod+Z")} brings ${gone.size > 1 ? "them" : "it"} back.`);
}
/** Adds a passage with its text: below the selected block on the desktop builder, otherwise at the end. */
async function addScripture(d, ref) {
  const t = (typeof desk !== "undefined" && desk.t) || bibleT();
  let text = ""; try { text = await Bible.text(ref, t); } catch { /* the reference still goes in; Fill from the Bible can try again */ }
  const i = deskIndex(d), at = i < 0 ? d.blocks.length : i + 1, b = { id: uid(), type: "scripture", show: true, ref, translation: t, text, notes: "" };
  d.blocks.splice(at, 0, b); if (typeof desk !== "undefined" && desk.doc === d.id) { desk.id = b.id; desk.draft = null; }
  touch(d); render(); toast(`Added ${ref}`);
}
function printPresenterPage(d) { go(`resource-${d.id}`); setTimeout(() => window.print(), 500); }

/* ----- Shortcuts ----- */
const onBuild = () => !!buildDoc(), onDeskBuild = () => onBuild() && deskOn();
shortcut("Builder", ["Mod+Z"], "Undo (outside a text field)", onBuild);
shortcut("Builder", ["Mod+Shift+Z", "Mod+Y"], "Redo", onBuild);
shortcut("Builder", ["Mod+P"], "Print the presenter page", onBuild);
shortcut("Builder", ["↑", "↓"], "Move between blocks in the outline", onDeskBuild);
shortcut("Builder", ["Enter"], "Add a block below (from the outline)", onDeskBuild);
shortcut("Builder", ["Alt+↑", "Alt+↓"], "Move the selected block up or down", onDeskBuild);
shortcut("Builder", ["Mod+D"], "Duplicate the selected block", onDeskBuild);
shortcut("Builder", ["Mod+H"], "Keep private, or show on screen", onDeskBuild);
shortcut("Builder", ["Delete"], "Delete the selected block (from the outline)", onDeskBuild);

document.addEventListener("keydown", (e) => {
  if (cmdOpen() || $("#scrim") || e.defaultPrevented) return;
  const d = buildDoc(); if (!d) return;
  const mod = isMac ? e.metaKey : e.ctrlKey, k = e.key.toLowerCase(), typing = isTyping(e.target);
  if (mod && !e.altKey && k === "z" && !typing) { e.preventDefault(); docUndo(d, e.shiftKey); return; }
  if (mod && !e.altKey && !e.shiftKey && k === "y" && !typing) { e.preventDefault(); docUndo(d, true); return; }
  if (mod && !e.altKey && !e.shiftKey && k === "p") { e.preventDefault(); deskFlush?.(); printPresenterPage(d); return; }
  if (!deskOn()) return;
  if (mod && !e.altKey && !e.shiftKey && (k === "d" || k === "h")) { e.preventDefault(); deskFlush(); (k === "d" ? deskDuplicate : deskTogglePrivate)(d); return; }
  if (e.altKey && !mod && !typing && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); deskMove(d, e.key === "ArrowUp" ? -1 : 1); return; }
  const fromOutline = e.target.closest?.(".ol-pick") || e.target === document.body;
  if (fromOutline && !mod && !e.altKey && !e.shiftKey && e.key === "Enter") { e.preventDefault(); openCommand("add "); return; }
  if (e.target.closest?.(".ol-pick") && !mod && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); deskDelete(d); }
});

/* ----- The builder's commands in the command box ----- */
commandSource((q) => {
  const d = buildDoc(); if (!d) return [];
  const now = () => buildDoc() || d; // looked up when chosen
  const kind = DOC_KINDS[d.kind].label.toLowerCase(), here = `This ${kind}`, desktop = deskOn(), sel = deskTargets(d).length > 0, many = deskTargets(d).length > 1;
  const where = desktop && sel ? "below the selected block" : "at the end";
  const out = Object.entries(BLOCKS).map(([type, t]) => ({ group: here, label: `Add ${t.label.toLowerCase()}`, sub: where, icon: t.icon, keywords: "new block insert", always: true,
    run: () => Actions["dblock-new"]({ dataset: { doc: d.id, type } }) }));
  // "add scripture Romans 8:28", "scripture John 3:16", or just a reference: add it with its text.
  const m = q.match(/^(?:add\s+)?(?:scripture|verse|verses|passage|reading)?\s*(.+)$/i), r = m && parseRef(m[1]);
  if (r) out.push({ group: here, label: `Add ${refLabel(r)}`, sub: `Scripture, with its text, ${where}`, icon: "word", score: 60, run: () => addScripture(now(), refLabel(r)) });
  out.push(
    { group: here, label: `Present this ${kind}`, icon: "screen", keywords: "show slides start", run: goTo(`present-doc-${d.id}`) },
    { group: here, label: "Edit slides", icon: "image", run: goTo(`slides-doc-${d.id}`) },
    { group: here, label: "Presenter page", icon: "note", keywords: "notes", run: goTo(`resource-${d.id}`) },
    { group: here, label: "Print the presenter page", icon: "print", keys: "Mod+P", run: () => printPresenterPage(now()) },
    { group: here, label: "Details", sub: "Title, passage, date", icon: "edit", keywords: "title date passage settings", run: () => Actions["doc-details"]({ dataset: { id: d.id } }) },
    { group: here, label: d.published ? "Unpublish" : "Publish", icon: "share", run: () => Actions["doc-publish"]({ dataset: { id: d.id } }) },
    { group: here, label: "Undo", icon: "back", keys: "Mod+Z", run: () => docUndo(now()) },
    { group: here, label: "Redo", icon: "next", keys: "Mod+Shift+Z", run: () => docUndo(now(), true) });
  if (desktop && sel) out.push(
    { group: here, label: many ? "Duplicate the selected blocks" : "Duplicate the selected block", icon: "copy", keys: "Mod+D", keywords: "copy", run: () => deskDuplicate(now()) },
    { group: here, label: many ? "Keep the selected blocks private" : "Keep the selected block private", icon: "eyeoff", keys: "Mod+H", keywords: "hide private", run: () => deskTogglePrivate(now(), false) },
    { group: here, label: many ? "Show the selected blocks on screen" : "Show the selected block on screen", icon: "eye", keywords: "show screen", run: () => deskTogglePrivate(now(), true) },
    { group: here, label: many ? "Delete the selected blocks" : "Delete the selected block", icon: "trash", keywords: "remove", run: () => deskDelete(now()) });
  return out;
});
