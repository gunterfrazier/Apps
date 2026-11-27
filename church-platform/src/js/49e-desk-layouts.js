// ---------- Desktop builder: saved layouts ----------
// A layout is a named arrangement of the builder's panes: which are open, how wide, and which Study tab shows.
// Built-in ones cover the common jobs; a person saves their own (kept in their settings, so they follow them to any
// computer, including a shared workstation) and picks one as their default; an admin shares layouts with the church
// and sets a default for each role (#admin-layouts). The first time someone opens the builder on a computer it is
// arranged by their own default, else their role's, else everything open. After that it stays as they leave it.

const LAYOUT_PRESETS = [
  { id: "everything", name: "Everything", desc: "Outline, editor, Study and slides", closed: { outline: false, study: false, strip: false }, w: {}, tab: "passage" },
  { id: "writing", name: "Writing", desc: "Outline and editor only, for getting words down", closed: { outline: false, study: true, strip: true }, w: { outline: 280 }, tab: "passage" },
  { id: "study", name: "Study", desc: "A wide Study pane beside the writing", closed: { outline: false, study: false, strip: true }, w: { outline: 240, study: 560 }, tab: "passage" },
  { id: "research", name: "Veritas research", desc: "Veritas Logos open wide beside the writing", closed: { outline: true, study: false, strip: true }, w: { study: 680 }, tab: "veritas", needs: () => Veritas.enabled() },
  { id: "slides", name: "Slides", desc: "Outline, editor and the slide strip", closed: { outline: false, study: true, strip: false }, w: { outline: 300 }, tab: "passage" },
  { id: "lesson", name: "Kids lesson", desc: "The Lesson tab (family page and story) and slides", closed: { outline: false, study: false, strip: false }, w: { outline: 260, study: 420 }, tab: "lesson" },
];
const myLayouts = () => prefs().layouts || [];
const churchLayouts = () => S.church()?.deskLayouts?.list || [];
const layoutById = (id) => LAYOUT_PRESETS.find((l) => l.id === id) || myLayouts().find((l) => l.id === id) || churchLayouts().find((l) => l.id === id) || null;
/** The layout this person starts from: their own default, else their role's, else none (everything open). */
function layoutDefault() {
  const mine = layoutById(prefs().layoutDefault); if (mine) return mine;
  const role = S.membership()?.roleId || S.role()?.id;
  return layoutById(S.church()?.deskLayouts?.roles?.[role]) || null;
}
function layoutNow() {
  const g = Panes.get("builder"), closed = {};
  ["outline", "study", "strip"].forEach((k) => { closed[k] = !Panes.isOpen("builder", k); });
  return { closed, w: { ...(g.w || {}) }, tab: g.tab || desk.tab || "passage" };
}
function applyLayout(l, quiet) {
  Panes.put("builder", { closed: { ...l.closed }, w: { ...(l.w || {}) }, tab: l.tab || "passage", applied: l.id });
  if (typeof desk !== "undefined") desk.tab = l.tab || "passage";
  if (!quiet) { render(); toast(`Pane layout: ${l.name}`); }
}
/** First time this person opens the builder on this computer: arrange it by their default (deskView calls this). */
function deskLayoutFirstTime() {
  if (Object.keys(Panes.get("builder")).length) return;
  const l = layoutDefault();
  if (l) applyLayout(l, true); else Panes.put("builder", { applied: "everything" });
}
const canShareLayouts = () => S.can("manage.church");

/* ----- The Layout menu in the builder ----- */
Actions["desk-layouts"] = (el) => {
  const on = Panes.get("builder").applied, item = (l) => ({ label: l.name, icon: l.id === on ? "check" : "layers", run: () => applyLayout(l) });
  const r = el.getBoundingClientRect(), mine = myLayouts(), shared = churchLayouts(), def = layoutDefault();
  openContextMenu(r.left, r.bottom + 4, [
    { head: "Built-in layouts" }, ...LAYOUT_PRESETS.filter((l) => !l.needs || l.needs()).map(item),
    mine.length && "-", mine.length && { head: "My layouts" }, ...mine.map(item),
    shared.length && "-", shared.length && { head: `${S.church().name} layouts` }, ...shared.map(item),
    "-",
    def && { label: `Back to my default (${def.name})`, icon: "back", run: () => applyLayout(def) },
    { label: "Save this layout...", icon: "plus", run: () => layoutSaveSheet() },
    (mine.length || shared.length) && { label: "Manage layouts", icon: "edit", run: () => layoutManageSheet() },
    canShareLayouts() && { label: "Defaults for each role", icon: "people", run: () => go("admin-layouts") },
  ], el);
};
function layoutSaveSheet() {
  openSheet("Save this pane layout", html`<form data-form="desk-layout-save" novalidate>
    <p class="muted">Saves which panes are open, how wide they are, and the Study tab. Your layouts follow you to any computer you sign in on.</p>
    <label class="field"><span>Name</span><input name="name" required maxlength="40" placeholder="Sermon writing" autocomplete="off"></label>
    <label class="check"><input type="checkbox" name="mine" checked><span>Open the builder this way by default</span></label>
    ${canShareLayouts() ? html`<label class="check"><input type="checkbox" name="church"><span>Share with ${S.church().name}, so it can be a role's default</span></label>` : ""}
    <div class="btns"><button class="btn">Save</button></div><p class="err" role="alert"></p></form>`);
}
Forms["desk-layout-save"] = (d, f) => {
  const name = String(d.name || "").trim(); if (!name) return formError(f, "Give the layout a name.");
  const l = { id: `lay-${uid()}`, name, ...layoutNow() };
  const p = prefs(), list = (p.layouts || []).filter((x) => x.name.toLowerCase() !== name.toLowerCase()); // the same name replaces it
  p.layouts = [...list, l].slice(-20);
  if (d.mine) p.layoutDefault = l.id;
  if (d.church && canShareLayouts()) {
    const dl = S.church().deskLayouts || {};
    S.updateChurch({ deskLayouts: { ...dl, list: [...(dl.list || []).filter((x) => x.name.toLowerCase() !== name.toLowerCase()), { ...l, id: `clay-${uid()}` }] } });
  }
  Panes.put("builder", { applied: l.id });
  S.save(); closeSheet(); render(); toast(`Saved "${name}"${d.mine ? ", your default" : ""}`);
};
function layoutManageSheet() {
  const p = prefs(), mine = myLayouts(), shared = churchLayouts();
  const row = (l, own) => html`<div class="row"><div class="body"><span class="t">${l.name}${p.layoutDefault === l.id ? html` <span class="tag ok">Your default</span>` : ""}</span><span class="s">${layoutSummary(l)}</span></div>
    <span class="row-btns"><button class="btn ghost sm" data-act="desk-layout-apply" data-id="${l.id}">Use</button>
    ${p.layoutDefault === l.id ? "" : html`<button class="btn ghost sm" data-act="desk-layout-default" data-id="${l.id}">Make my default</button>`}
    ${own ? html`<button class="icon-btn" data-act="desk-layout-delete" data-id="${l.id}" aria-label="Delete ${l.name}">${icon("trash")}</button>` : ""}</span></div>`;
  openSheet("Pane layouts", html`${mine.length ? html`<h3>My layouts</h3><div class="rows">${mine.map((l) => row(l, true))}</div>` : html`<p class="muted">You haven't saved a layout yet.</p>`}
    ${shared.length ? html`<h3>${S.church().name} layouts</h3><div class="rows">${shared.map((l) => row(l, false))}</div>` : ""}
    ${p.layoutDefault ? html`<p><button class="btn ghost sm" data-act="desk-layout-default" data-id="">Use my role's default instead of my own</button></p>` : ""}`, { wide: true });
}
const layoutSummary = (l) => {
  const open = [["outline", "Outline"], ["study", "Study"], ["strip", "Slides"]].filter(([k]) => !l.closed?.[k]).map(([, n]) => n);
  return `Editor${open.length ? `, ${open.join(", ").replace(/, ([^,]*)$/, " and $1")}` : " only"}${!l.closed?.study && l.tab && l.tab !== "passage" ? ` (${{ veritas: "Veritas", related: "Related", past: "Past", lesson: "Lesson" }[l.tab] || l.tab} tab)` : ""}`;
};
Actions["desk-layout-apply"] = (el) => { const l = layoutById(el.dataset.id); if (l) { closeSheet(); applyLayout(l); } };
Actions["desk-layout-default"] = (el) => { prefs().layoutDefault = el.dataset.id || undefined; S.save(); layoutManageSheet(); toast(el.dataset.id ? "That's your default now" : "Your role's default it is"); };
Actions["desk-layout-delete"] = (el) => {
  const p = prefs(); p.layouts = myLayouts().filter((l) => l.id !== el.dataset.id);
  if (p.layoutDefault === el.dataset.id) delete p.layoutDefault;
  S.save(); layoutManageSheet(); toast("Layout deleted");
};

/* ----- Admin: the church's layouts and a default for each role ----- */
Screens["admin-layouts"] = () => {
  if (!S.isMember() || !canShareLayouts()) return { redirect: "admin" };
  const c = S.church(), dl = c.deskLayouts || {}, shared = dl.list || [];
  const options = (sel) => html`<option value="">Everything (built in)</option>${LAYOUT_PRESETS.filter((l) => l.id !== "everything").map((l) => html`<option value="${l.id}" ${attr(sel === l.id, "selected")}>${l.name} (built in)</option>`)}
    ${shared.map((l) => html`<option value="${l.id}" ${attr(sel === l.id, "selected")}>${l.name}</option>`)}`;
  return {
    title: "Desktop layouts", back: "admin",
    body: html`<p class="muted">On a computer, the sermon, lesson and study builders open with panes side by side. Pick how each role's builder is arranged the first time they open it. Anyone can change theirs afterwards and save their own.</p>
      <form data-form="desk-layout-roles" class="card" novalidate><h3>Default for each role</h3>
        <div class="rows">${c.roles.map((r) => html`<label class="row"><span class="body"><span class="t">${r.name}</span></span><select name="role-${r.id}" aria-label="${r.name}'s default layout">${options(dl.roles?.[r.id] || "")}</select></label>`)}</div>
        <div class="btns"><button class="btn">Save defaults</button></div></form>
      <section class="card"><h3>${c.name} layouts</h3>
        ${shared.length ? html`<div class="rows">${shared.map((l) => html`<div class="row"><div class="body"><span class="t">${l.name}</span><span class="s">${layoutSummary(l)}</span></div><button class="icon-btn" data-act="desk-layout-church-delete" data-id="${l.id}" aria-label="Delete ${l.name}">${icon("trash")}</button></div>`)}</div>`
          : html`<p class="muted">None yet. In a builder on a computer, arrange the panes, then choose Layout, Save this layout, and Share with ${c.name}.</p>`}</section>`,
  };
};
Forms["desk-layout-roles"] = (d) => {
  const c = S.church(), roles = {};
  c.roles.forEach((r) => { if (d[`role-${r.id}`]) roles[r.id] = d[`role-${r.id}`]; });
  S.updateChurch({ deskLayouts: { ...(c.deskLayouts || {}), roles } }); render(); toast("Role defaults saved. They apply the first time someone opens a builder on a computer.");
};
Actions["desk-layout-church-delete"] = (el) => {
  const dl = S.church().deskLayouts || {}, roles = { ...(dl.roles || {}) };
  Object.keys(roles).forEach((k) => { if (roles[k] === el.dataset.id) delete roles[k]; });
  S.updateChurch({ deskLayouts: { ...dl, list: (dl.list || []).filter((l) => l.id !== el.dataset.id), roles } }); render(); toast("Layout deleted");
};

/* ----- The command box: "layout writing" ----- */
commandSource(() => {
  if (!buildDoc() || !deskOn()) return [];
  return [...LAYOUT_PRESETS.filter((l) => !l.needs || l.needs()), ...myLayouts(), ...churchLayouts()].map((l) => ({ group: "Layouts", label: `Layout: ${l.name}`, sub: layoutSummary(l), icon: "layers", keywords: "arrange panes view", run: () => applyLayout(l) }))
    .concat([{ group: "Layouts", label: "Save this layout", icon: "plus", keywords: "layout arrange panes", run: layoutSaveSheet }]);
});
