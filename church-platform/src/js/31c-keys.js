// ---------- Keyboard: the command box (Ctrl+K or Cmd+K), the shortcut sheet (?), and the list of shortcuts ----------
// The command box searches people, events, groups and classes, sermons and lessons, and the pages this person's role
// opens, and runs commands ("new sermon", "add scripture John 15:1-8", "present"). Every result comes from what the
// person can already see: the sidebar's role-filtered lists, the directory's own rules, canEditDoc and so on.
// Other files add commands with commandSource() and shortcuts with shortcut(). Everything stays reachable by a button;
// the keyboard is an addition.

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const modKey = () => (isMac ? "⌘" : "Ctrl");
const keyLabel = (k) => k.replace(/Mod/g, modKey()).replace(/Alt/g, isMac ? "Option" : "Alt");
/** Is someone typing in this element? Shortcuts that are plain keys leave text fields alone. */
const isTyping = (el) => !!el?.closest?.("textarea, select, [contenteditable=''], [contenteditable=true]") || (el?.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(el.type));

/* ----- Shortcut list and the ? sheet ----- */
const Shortcuts = [];
/** area: heading in the sheet. keys: ["Mod+K"] (each shown as a key cap; "/" between alternatives). when: is this area live here? */
function shortcut(area, keys, label, when) { Shortcuts.push({ area, keys, label, when }); }
function shortcutSheet() {
  const areas = [];
  Shortcuts.forEach((s) => { if (s.when && !s.when()) return; let a = areas.find((x) => x.name === s.area); if (!a) areas.push(a = { name: s.area, list: [] }); a.list.push(s); });
  areas.sort((a, b) => (a.name === "Everywhere") - (b.name === "Everywhere")); // this page's keys first
  openSheet("Keyboard shortcuts", html`<div class="keys-sheet">${areas.map((a) => html`<section><h3>${a.name}</h3><dl>${a.list.map((s) => html`<div><dt>${s.keys.map((k, n) => html`${n ? html`<span class="faint"> or </span>` : ""}${keyLabel(k).split("+").map((p) => html`<kbd>${p}</kbd>`)}`)}</dt><dd>${s.label}</dd></div>`)}</dl></section>`)}</div>
    <p class="faint">Every shortcut also has a button on the page.</p>`, { wide: true });
}
Actions["shortcuts"] = () => shortcutSheet();

const onPresenting = () => document.body.classList.contains("presenting");
shortcut("Everywhere", ["Mod+K"], "Search and commands");
shortcut("Everywhere", ["?"], "Show these shortcuts");
shortcut("Everywhere", ["Esc"], "Close a sheet, drawer or box");
shortcut("Presenting", ["→", "Space", "PageDown"], "Next slide", onPresenting);
shortcut("Presenting", ["←", "PageUp"], "Previous slide", onPresenting);
shortcut("Presenting", ["1"], "Jump to a song section (1 to 9)", onPresenting);
shortcut("Presenting", ["B"], "Black screen", onPresenting);
shortcut("Presenting", ["L"], "Logo", onPresenting);
shortcut("Presenting", ["F"], "Full screen", onPresenting);
shortcut("Presenting", ["Enter"], "Booth: take the cued slide", () => onPresenting() && typeof pres !== "undefined" && pres.mode === "booth");
shortcut("Presenting", ["Esc"], "Booth: clear the cue", () => onPresenting() && typeof pres !== "undefined" && pres.mode === "booth");
shortcut("Set list", ["→", "↓", "Space"], "Next part", () => location.hash.startsWith("#setlist-"));
shortcut("Set list", ["←", "↑"], "Previous part", () => location.hash.startsWith("#setlist-"));
shortcut("Stage display", ["→", "Space", "Enter"], "Next", () => location.hash.startsWith("#stage-"));
shortcut("Stage display", ["←", "↑"], "Previous", () => location.hash.startsWith("#stage-"));

/* ----- The command box ----- */
const CommandSources = [];
/** fn(q, words) returns items: { group, label, sub, icon, run, score?, keys?, always? }. always: shown before anything's typed. */
function commandSource(fn) { CommandSources.push(fn); }
/** How well text matches every typed word: 0 for no match; word starts and a matching start score higher. */
function cmdScore(text, words) {
  if (!words.length) return 1;
  const t = ` ${String(text).toLowerCase()}`;
  let score = 0;
  for (const w of words) { const at = t.indexOf(w); if (at < 0) return 0; score += /[\s(:.,-]/.test(t[at - 1]) ? 3 : 1; }
  return score + (t.startsWith(` ${words[0]}`) ? 4 : 0);
}
const Cmd = { el: null, items: [], sel: 0, back: null };
const cmdOpen = () => !!Cmd.el;
function openCommand(q = "") {
  if (Cmd.el) { const i = $("input", Cmd.el); i.value = q; cmdRefresh(); i.focus(); return; }
  Cmd.back = document.activeElement;
  Cmd.el = document.createElement("div"); Cmd.el.className = "cmdk-scrim"; Cmd.el.id = "cmdk";
  Cmd.el.innerHTML = flat(html`<div class="cmdk" role="dialog" aria-modal="true" aria-label="Search and commands">
    <div class="cmdk-in">${icon("search")}<input type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Search people, events, sermons, pages, or type a command" aria-label="Search and commands"><kbd>Esc</kbd></div>
    <div class="cmdk-list" id="cmdk-list" role="listbox" aria-label="Results"></div>
    <p class="cmdk-foot faint"><kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>Enter</kbd> to choose. Try "new sermon", "add scripture Romans 8:28" or a name.</p></div>`);
  document.body.appendChild(Cmd.el);
  const input = $("input", Cmd.el);
  input.value = q;
  input.addEventListener("input", () => { Cmd.sel = 0; cmdRefresh(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (Cmd.items.length) { Cmd.sel = (Cmd.sel + (e.key === "ArrowDown" ? 1 : -1) + Cmd.items.length) % Cmd.items.length; cmdMark(); } }
    else if (e.key === "Enter") { e.preventDefault(); cmdRun(Cmd.sel); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCommand(); }
    else if (e.key === "Tab") e.preventDefault(); // focus stays in the box while it's open
  });
  Cmd.el.addEventListener("click", (e) => { const o = e.target.closest("[data-cmd]"); if (o) cmdRun(+o.dataset.cmd); else if (e.target === Cmd.el) closeCommand(); });
  Cmd.el.addEventListener("mousemove", (e) => { const o = e.target.closest("[data-cmd]"); if (o && +o.dataset.cmd !== Cmd.sel) { Cmd.sel = +o.dataset.cmd; cmdMark(); } });
  Cmd.sel = 0; cmdRefresh(); input.focus();
}
function closeCommand(keepFocus) {
  if (!Cmd.el) return;
  Cmd.el.remove(); Cmd.el = null;
  if (!keepFocus) Cmd.back?.focus?.({ preventScroll: true });
}
function cmdRefresh() {
  const q = $("input", Cmd.el).value.trim(), words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let items = [];
  for (const src of CommandSources) { try { items.push(...(src(q, words) || [])); } catch (err) { console.warn("command source", err); } }
  if (!words.length) items = items.filter((x) => x.always);
  else items = items.map((x) => ({ ...x, score: x.score ?? cmdScore(`${x.label} ${x.keywords || ""} ${x.sub || ""}`, words) })).filter((x) => x.score > 0);
  // Best group first (by its best match), each group's best first, at most 6 a group.
  const groups = [];
  items.forEach((x) => { let g = groups.find((y) => y.name === x.group); if (!g) groups.push(g = { name: x.group, list: [], best: 0 }); g.list.push(x); g.best = Math.max(g.best, x.score || 0); });
  if (words.length) groups.sort((a, b) => b.best - a.best);
  Cmd.items = groups.flatMap((g) => g.list.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6));
  if (Cmd.sel >= Cmd.items.length) Cmd.sel = 0;
  let n = 0;
  $("#cmdk-list", Cmd.el).innerHTML = flat(Cmd.items.length ? groups.map((g) => { const list = g.list.slice(0, 6); return html`<div class="cmdk-g" role="group" aria-label="${g.name}"><p class="cmdk-h">${g.name}</p>${list.map((x) => { const k = n++; return html`<div class="cmdk-o" role="option" id="cmdk-o${k}" data-cmd="${k}" aria-selected="${k === Cmd.sel}">${icon(x.icon || "next")}<span class="cmdk-t"><span>${x.label}</span>${x.sub ? html`<span class="faint">${x.sub}</span>` : ""}</span>${x.keys ? html`<span class="cmdk-k">${keyLabel(x.keys).split("+").map((p) => html`<kbd>${p}</kbd>`)}</span>` : ""}</div>`; })}</div>`; })
    : html`<p class="cmdk-none muted">${words.length ? `Nothing matches "${q}".` : "Start typing."}</p>`);
  cmdMark();
}
function cmdMark() {
  $$("[data-cmd]", Cmd.el).forEach((o) => o.setAttribute("aria-selected", String(+o.dataset.cmd === Cmd.sel)));
  const on = $(`[data-cmd="${Cmd.sel}"]`, Cmd.el); on?.scrollIntoView({ block: "nearest" });
  $("input", Cmd.el).setAttribute("aria-activedescendant", on ? on.id : "");
}
function cmdRun(i) {
  const x = Cmd.items[i]; if (!x) return;
  closeCommand(true);
  try { x.run(); } catch (err) { console.warn(err); toast("That didn't work. Try the button on the page."); }
}
Actions["cmdk"] = () => openCommand();

document.addEventListener("keydown", (e) => {
  if (!S.church() || !S.isMember() || thisDevice()) return;
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); if (cmdOpen()) closeCommand(); else openCommand(); return; }
  if (e.key === "?" && !mod && !e.altKey && !isTyping(e.target) && !cmdOpen() && !$("#scrim")) { e.preventDefault(); shortcutSheet(); }
});

/* ----- Built-in sources: pages, new documents, and search ----- */
const goTo = (hash) => () => go(hash);
commandSource(() => {
  const tabs = tabsFor().map((t) => [t.route || t.id, t.icon, t.label]);
  const work = workspacesFor().flatMap(([, items]) => items.map(([to, ic, label]) => [to, ic, label]));
  const seen = new Set();
  return [...tabs, ...work, ["me", "user", "Me: profile and settings"]].filter(([to]) => !seen.has(to) && seen.add(to))
    .map(([to, ic, label]) => ({ group: "Go to", label, icon: ic, keywords: "open go page", run: goTo(to), always: work.some((w) => w[0] === to) }));
});
commandSource(() => Object.entries(DOC_KINDS).filter(([kind, k]) => S.isMember() && S.can(k.perm) && !(typeof featureOffFor === "function" && featureOffFor(`#docs-${kind}`)))
  .map(([kind, k]) => ({ group: "Commands", label: `New ${k.label.toLowerCase()}`, icon: "plus", keywords: `create add start ${kind}`, run: () => Actions["new-doc"]({ dataset: { kind } }), always: kind === "sermon" })));
commandSource((q) => [{ group: "Commands", label: "Keyboard shortcuts", icon: "info", keywords: "keys help hotkeys", keys: "?", run: shortcutSheet, always: true }]);
// A Bible reference typed on its own opens it in the reader.
commandSource((q) => { const r = parseRef(q); return r ? [{ group: "Bible", label: `Read ${refLabel(r)}`, icon: "word", score: 50, run: goTo(`bible-${refSlug(r)}`) }] : []; });
commandSource((q, words) => {
  if (q.length < 2) return [];
  const out = [];
  if (S.on("directory") && S.can("use.directory")) directoryEntries().forEach((p) => out.push({ group: "People", label: p.name, sub: p.household, icon: "user", run: goTo(`person-${p.id}`) }));
  upcomingEvents().forEach((e) => out.push({ group: "Events", label: e.title, sub: fmtShort(new Date(e.start)), icon: "calendar", run: goTo(`event-${e.id}`) }));
  S.visible("gatherings").forEach((g) => out.push({ group: "Groups and classes", label: g.name, sub: g.type === "class" ? "Class" : "Group", icon: g.type === "class" ? "door" : "people", run: goTo(`gathering-${g.id}`) }));
  S.list("docs").forEach((d) => {
    const edit = canEditDoc(d), href = edit ? `build-${d.id}` : d.published ? `outline-${d.id}` : null; if (!href) return;
    out.push({ group: "Sermons and lessons", label: d.title, sub: [DOC_KINDS[d.kind]?.label, d.passage, d.date ? fmtShort(fromIsoDay(d.date)) : ""].filter(Boolean).join(", "), keywords: d.kind, icon: DOC_KINDS[d.kind]?.icon || "word", run: goTo(href) });
  });
  return out;
});
