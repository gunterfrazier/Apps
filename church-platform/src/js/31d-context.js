// ---------- Right-click menus and hover previews ----------
// contextMenuFor(selector, el => items) adds a right-click menu to anything matching the selector; items are
// { label, icon, keys, run, danger, disabled }, "-" for a line, or { head } for a heading. The menu also opens from the
// keyboard (the Menu key or Shift+F10) and works with arrow keys. Shift+right-click still gives the browser's own menu,
// and text fields keep theirs. Every item is also a button somewhere on the page.
// hoverSource(selector, el => html or a promise of html) shows a small card while the pointer rests on an element:
// a Bible reference shows the verse, a person shows who they are. Mouse only; it adds nothing that isn't a click away.

/* ----- Right-click menus ----- */
const CtxMenus = [];
function contextMenuFor(selector, fn) { CtxMenus.push({ selector, fn }); }
const Ctx = { el: null, back: null, items: [] };
function openContextMenu(x, y, items, from) {
  closeContextMenu(true);
  items = items.filter(Boolean); if (!items.some((it) => it.run)) return;
  Ctx.items = items; Ctx.back = from || document.activeElement;
  const m = document.createElement("div"); m.className = "ctx"; m.setAttribute("role", "menu"); m.id = "ctx";
  m.innerHTML = flat(items.map((it, i) => it === "-" ? html`<div class="ctx-sep" role="separator"></div>`
    : it.head ? html`<p class="ctx-head">${it.head}</p>`
      : html`<button type="button" role="menuitem" tabindex="-1" class="ctx-i ${it.danger ? "danger" : ""}" data-ctx="${i}" ${attr(it.disabled, "disabled")}>${icon(it.icon || "next")}<span>${it.label}</span>${it.keys ? html`<span class="ctx-k">${keyLabel(it.keys)}</span>` : ""}</button>`));
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(6, Math.min(x, innerWidth - r.width - 6))}px`;
  m.style.top = `${Math.max(6, y + r.height > innerHeight - 6 ? y - r.height : y)}px`;
  m.addEventListener("click", (e) => { const b = e.target.closest("[data-ctx]:not([disabled])"); if (!b) return; const it = Ctx.items[+b.dataset.ctx]; closeContextMenu(true); it.run(); });
  m.addEventListener("keydown", (e) => {
    const all = $$(".ctx-i:not([disabled])", m), at = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); all[(at + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus(); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); (e.key === "Home" ? all[0] : all.at(-1))?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeContextMenu(); }
    else if (e.key === "Tab") { e.preventDefault(); closeContextMenu(); }
  });
  m.addEventListener("mousemove", (e) => { const b = e.target.closest(".ctx-i:not([disabled])"); if (b && b !== document.activeElement) b.focus({ preventScroll: true }); });
  Ctx.el = m;
  $(".ctx-i:not([disabled])", m)?.focus({ preventScroll: true });
}
function closeContextMenu(keepFocus) {
  if (!Ctx.el) return;
  Ctx.el.remove(); Ctx.el = null;
  if (!keepFocus && Ctx.back?.isConnected) Ctx.back.focus?.({ preventScroll: true });
}
function ctxItemsFor(target) {
  for (const { selector, fn } of CtxMenus) {
    const el = target.closest?.(selector); if (!el) continue;
    const items = fn(el); if (items?.length) return { el, items };
  }
  return null;
}
document.addEventListener("contextmenu", (e) => {
  if (e.shiftKey || isTyping(e.target) || e.target.closest?.("#ctx")) return;
  const hit = ctxItemsFor(e.target); if (!hit) return;
  e.preventDefault(); hoverHide();
  // From the keyboard there's no pointer position: open under the element instead.
  let { clientX: x, clientY: y } = e;
  if (!x && !y) { const r = hit.el.getBoundingClientRect(); x = r.left + 12; y = r.bottom; }
  openContextMenu(x, y, hit.items, hit.el);
});
document.addEventListener("pointerdown", (e) => { if (Ctx.el && !Ctx.el.contains(e.target)) closeContextMenu(true); }, true);
addEventListener("blur", () => closeContextMenu(true));
addEventListener("resize", () => closeContextMenu(true));
addEventListener("hashchange", () => closeContextMenu(true));
document.addEventListener("scroll", () => closeContextMenu(true), true);
shortcut("Everywhere", ["Right-click", "Shift+F10"], "Menu for a block, person or row");

/* ----- Hover previews ----- */
const HoverSources = [];
function hoverSource(selector, fn) { HoverSources.push({ selector, fn }); }
const Hov = { el: null, target: null, timer: 0, cache: new Map() };
const canHover = matchMedia("(hover: hover) and (pointer: fine)");
function hoverHide() {
  clearTimeout(Hov.timer); Hov.timer = 0; Hov.target = null;
  if (Hov.el) Hov.el.hidden = true;
}
function hoverShow(target, content) {
  if (Hov.target !== target || !target.isConnected) return;
  if (!Hov.el) { Hov.el = document.createElement("div"); Hov.el.className = "hov"; Hov.el.setAttribute("role", "tooltip"); Hov.el.id = "hov"; document.body.appendChild(Hov.el); }
  Hov.el.innerHTML = flat(content); Hov.el.hidden = false;
  const r = target.getBoundingClientRect(), h = Hov.el.getBoundingClientRect();
  const below = r.bottom + 8 + h.height < innerHeight - 8;
  Hov.el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - h.width - 8))}px`;
  Hov.el.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h.height - 8)}px`;
}
document.addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse" || !canHover.matches || Ctx.el || cmdOpen()) return;
  let hit = null;
  for (const s of HoverSources) { const el = e.target.closest?.(s.selector); if (el) { hit = { el, s }; break; } }
  if (!hit) { if (Hov.target && !Hov.target.contains(e.target)) hoverHide(); return; }
  if (hit.el === Hov.target) return;
  hoverHide(); Hov.target = hit.el;
  Hov.timer = setTimeout(async () => {
    const key = `${hit.s.selector}|${hit.el.dataset.verse || hit.el.getAttribute("href") || ""}|${bibleT()}`;
    let content = Hov.cache.get(key);
    if (content === undefined) {
      try { content = await hit.s.fn(hit.el); } catch { content = null; }
      if (content) Hov.cache.set(key, content);
    }
    if (content) hoverShow(hit.el, content);
  }, 450);
});
document.addEventListener("pointerout", (e) => { if (Hov.target && !Hov.target.contains(e.relatedTarget)) hoverHide(); });
document.addEventListener("pointerdown", hoverHide, true);
document.addEventListener("keydown", hoverHide, true);
document.addEventListener("scroll", hoverHide, true);
addEventListener("hashchange", hoverHide);

// A Bible reference: the verses, in the person's translation.
const verseOf = (el) => el.dataset.verse || (el.getAttribute("href") || "").replace(/^#bible-/, "");
hoverSource("[data-verse], a[href^='#bible-']", async (el) => {
  const r = el.dataset.verse ? parseRef(el.dataset.verse) : slugToRef(verseOf(el));
  if (!r) return null;
  const ref = refLabel(r), t = bibleT();
  const one = r.verse ? r : { ...r, verse: 1, verseEnd: 3 }; // a whole chapter: the first verses
  let text = await Bible.text(refLabel(one), t);
  if (text.length > 420) text = `${text.slice(0, 400).replace(/\s+\S*$/, "")}...`;
  return html`<p class="hov-h">${icon("word")}<b>${ref}</b><span class="faint">${t}</span></p><p class="hov-verse">${text}</p>${r.verse ? "" : html`<p class="faint hov-more">The opening verses of the chapter.</p>`}`;
});
// A person: who they are, from the directory (only if the directory is on and this person may use it).
hoverSource("a[href^='#person-']", (el) => {
  if (!S.on("directory") || !S.can("use.directory")) return null;
  const p = directoryEntries().find((x) => `#person-${x.id}` === el.getAttribute("href")); if (!p) return null;
  return html`<div class="hov-person">${avatar(p)}<div><b>${p.name}${p.isMe ? " (you)" : ""}</b>${p.household ? html`<span class="faint">${p.household}</span>` : ""}
    ${[p.phone, p.email].filter(Boolean).map((x) => html`<span class="faint">${x}</span>`)}</div></div>`;
});

/* ----- People: right-click a person anywhere they're listed ----- */
contextMenuFor("a[href^='#person-']", (el) => {
  if (!S.on("directory") || !S.can("use.directory")) return null;
  const p = directoryEntries().find((x) => `#person-${x.id}` === el.getAttribute("href")); if (!p) return null;
  return [{ head: p.name },
    { label: "Open", icon: "user", run: goTo(`person-${p.id}`) },
    !p.isMe && S.on("chat") && S.can("use.chat") && { label: "Send a message", icon: "chat", run: () => Actions["dm-start"]({ dataset: { user: p.id } }) },
    p.phone && { label: `Call ${p.phone}`, icon: "phone", run: () => { location.href = `tel:${p.phone.replace(/[^\d+]/g, "")}`; } },
    p.email && { label: "Email", icon: "mail", run: () => { location.href = `mailto:${p.email}`; } },
    { label: "Copy contact", icon: "copy", run: () => Actions["copy"]({ dataset: { done: "Contact copied", text: [p.name, p.phone, p.email].filter(Boolean).join("\n") } }) }];
});
