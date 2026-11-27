// ---------- Reports on a computer: real tables ----------
// On a computer (isDesktop), every reportTable becomes a working table: click a heading to sort (again to reverse),
// pick which columns show, the heading stays put while the rows scroll, tick rows (Shift-click for a run) to copy or
// download just those, copy for pasting into a spreadsheet, and right-click a row. A row whose first column names a
// member also offers that person. Sort and columns are remembered for each table on this computer. Phones keep the
// short table with its download.

const DT = {}; // per table: { head, rows, numeric, file, sel: Set of row numbers, last }
const DT_MAX = 500;
const dtSaved = () => { try { return JSON.parse(localStorage.getItem("ofc-dt") || "{}"); } catch { return {}; } };
const dtSave = (id, patch) => { const all = dtSaved(); all[id] = { ...(all[id] || {}), ...patch }; try { localStorage.setItem("ofc-dt", JSON.stringify(all)); } catch { /* private mode */ } };
const dtText = (c) => (typeof c === "number" ? c : String(c && typeof c === "object" ? flat(c) : c ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim());
const dtNum = (c) => { if (typeof c === "number") return c; const n = parseFloat(String(dtText(c)).replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : -Infinity; };

const reportTablePhone = reportTable;
reportTable = function (id, file, head, rows, opts = {}) { // eslint-disable-line no-func-assign
  const phone = reportTablePhone(id, file, head, rows, opts); // also keeps the full CSV download up to date
  if (!isDesktop() || !rows.length) return phone;
  const numeric = opts.numeric || [], saved = dtSaved()[id] || {}, hidden = new Set(saved.hidden || []);
  const prev = DT[id], same = prev && prev.rows.length === rows.length && prev.head.join() === head.join();
  DT[id] = { head, rows, numeric, file, sel: same ? prev.sel : new Set(), last: same ? prev.last : null };
  let order = rows.map((_, i) => i);
  if (saved.col != null && saved.col < head.length) {
    const k = saved.col, dir = saved.dir || 1, num = numeric.includes(k);
    order.sort((a, b) => dir * (num ? dtNum(rows[a][k]) - dtNum(rows[b][k]) : String(dtText(rows[a][k])).localeCompare(String(dtText(rows[b][k])), undefined, { numeric: true, sensitivity: "base" })));
  }
  const cols = head.map((h, i) => i).filter((i) => !hidden.has(i)), shown = order.slice(0, DT_MAX), sel = DT[id].sel;
  return html`<div class="dt" data-dt="${id}">
    <div class="dt-tools">${dtBar(id)}<span class="dt-spacer"></span>
      <button type="button" class="btn ghost sm" data-act="dt-cols" data-id="${id}" aria-haspopup="menu">${icon("list")}Columns${hidden.size ? ` (${head.length - hidden.size} of ${head.length})` : ""}</button>
      <button type="button" class="btn ghost sm" data-act="dt-copy" data-id="${id}" title="Copy the table to paste into a spreadsheet">${icon("copy")}Copy</button>
      <button type="button" class="btn ghost sm" data-act="report-csv" data-id="${id}">${icon("download")}Download CSV</button></div>
    <div class="table-wrap dt-wrap"><table class="mini-table dt-table" aria-rowcount="${rows.length}">
      <thead><tr><th class="dt-check"><input type="checkbox" data-dt-all="${id}" aria-label="Select every row" ${attr(sel.size && sel.size === rows.length, "checked")}></th>
        ${cols.map((i) => { const on = saved.col === i, dir = saved.dir || 1; return html`<th class="${numeric.includes(i) ? "num" : ""}" aria-sort="${on ? (dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" class="dt-sort" data-act="dt-sort" data-id="${id}" data-col="${i}">${head[i]}<span class="dt-arrow" aria-hidden="true">${on ? (dir > 0 ? "▲" : "▼") : ""}</span></button></th>`; })}</tr></thead>
      <tbody>${shown.map((r) => html`<tr data-dt-row="${r}" class="${sel.has(r) ? "picked" : ""}"><td class="dt-check"><input type="checkbox" data-dt-pick="${id}" data-i="${r}" aria-label="Select ${dtText(rows[r][0])}" ${attr(sel.has(r), "checked")}></td>
        ${cols.map((i) => html`<td class="${numeric.includes(i) ? "num" : ""}">${typeof rows[r][i] === "number" ? rows[r][i].toLocaleString() : rows[r][i]}</td>`)}</tr>`)}</tbody></table></div>
    ${rows.length > DT_MAX ? html`<p class="faint dt-more">Showing ${DT_MAX} of ${rows.length.toLocaleString()}. The download has them all.</p>` : ""}</div>`;
};
function dtBar(id) {
  const t = DT[id], n = t?.sel.size || 0;
  return n ? html`<span class="dt-sel" role="status"><b>${n} selected</b><button type="button" class="btn ghost sm" data-act="dt-copy" data-id="${id}" data-picked="1">${icon("copy")}Copy ${n === 1 ? "row" : "rows"}</button>
      <button type="button" class="btn ghost sm" data-act="dt-csv" data-id="${id}">${icon("download")}Download ${n === 1 ? "row" : "rows"}</button><button type="button" class="btn ghost sm" data-act="dt-clear" data-id="${id}">Clear</button></span>`
    : html`<span class="faint dt-count">${(t?.rows.length || 0).toLocaleString()} ${t?.rows.length === 1 ? "row" : "rows"}</span>`;
}
/** Selection changes without a redraw: the boxes, the row tint and the bar. */
function dtPaint(id) {
  const box = $(`.dt[data-dt="${id}"]`), t = DT[id]; if (!box || !t) return;
  $$("tbody tr", box).forEach((tr) => { const on = t.sel.has(+tr.dataset.dtRow); tr.classList.toggle("picked", on); const c = $("input", tr); if (c) c.checked = on; });
  const all = $("[data-dt-all]", box); if (all) { all.checked = t.sel.size > 0 && t.sel.size === t.rows.length; all.indeterminate = t.sel.size > 0 && t.sel.size < t.rows.length; }
  const tools = $(".dt-tools", box), bar = $(".dt-sel, .dt-count", tools); if (bar) bar.outerHTML = flat(dtBar(id));
}
document.addEventListener("click", (e) => {
  const c = e.target.closest?.("input[data-dt-pick]"); if (!c) return;
  const id = c.dataset.dtPick, t = DT[id], i = +c.dataset.i; if (!t) return;
  if (e.shiftKey && t.last != null) { // a run, in the order the rows are shown
    const shown = $$(`.dt[data-dt="${id}"] tbody tr`).map((tr) => +tr.dataset.dtRow), a = shown.indexOf(t.last), b = shown.indexOf(i);
    if (a >= 0 && b >= 0) shown.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((r) => (c.checked ? t.sel.add(r) : t.sel.delete(r)));
  } else if (c.checked) t.sel.add(i); else t.sel.delete(i);
  t.last = i; dtPaint(id);
});
document.addEventListener("change", (e) => {
  const c = e.target.closest?.("input[data-dt-all]"); if (!c) return;
  const t = DT[c.dataset.dtAll]; if (!t) return;
  t.sel = c.checked ? new Set(t.rows.map((_, i) => i)) : new Set(); dtPaint(c.dataset.dtAll);
});
Actions["dt-sort"] = (el) => {
  const id = el.dataset.id, col = +el.dataset.col, s = dtSaved()[id] || {};
  const first = DT[id]?.numeric.includes(col) ? -1 : 1; // numbers start biggest first, words A to Z
  dtSave(id, s.col !== col ? { col, dir: first } : s.dir === first ? { col, dir: -first } : { col: null, dir: 1 }); // then reversed, then unsorted
  render(); $(`.dt[data-dt="${id}"] [data-act=dt-sort][data-col="${col}"]`)?.focus({ preventScroll: true });
};
Actions["dt-cols"] = (el) => {
  const id = el.dataset.id, t = DT[id], hidden = new Set(dtSaved()[id]?.hidden || []), r = el.getBoundingClientRect(); if (!t) return;
  const toggle = (i) => () => { const h = new Set(dtSaved()[id]?.hidden || []); if (h.has(i)) h.delete(i); else if (t.head.length - h.size > 1) h.add(i); dtSave(id, { hidden: [...h] }); render(); setTimeout(() => Actions["dt-cols"]($(`.dt[data-dt="${id}"] [data-act=dt-cols]`)), 0); };
  openContextMenu(r.left, r.bottom + 4, [{ head: "Show columns" }, ...t.head.map((h, i) => ({ label: h, icon: hidden.has(i) ? "eyeoff" : "check", run: toggle(i) })),
    hidden.size && "-", hidden.size && { label: "Show them all", icon: "eye", run: () => { dtSave(id, { hidden: [] }); render(); } }], el);
};
const dtPicked = (t, picked) => (picked ? [...t.sel].sort((a, b) => a - b) : t.rows.map((_, i) => i)).map((i) => t.rows[i]);
Actions["dt-copy"] = (el) => {
  const t = DT[el.dataset.id]; if (!t) return;
  const rows = dtPicked(t, el.dataset.picked), tsv = [t.head, ...rows].map((r) => r.map((c) => String(dtText(c)).replace(/[\t\n]/g, " ")).join("\t")).join("\n");
  navigator.clipboard?.writeText(tsv).then(() => toast(`Copied ${plural(rows.length, "row")}. Paste into a spreadsheet.`), () => toast("Copying isn't allowed here. Use Download CSV."));
};
Actions["dt-csv"] = (el) => {
  const t = DT[el.dataset.id]; if (!t) return;
  saveFile(`${t.file}-selected-${isoDay(new Date())}.csv`, [csvLine(t.head), ...dtPicked(t, true).map((r) => csvLine(r.map(dtText)))].join("\n") + "\n");
};
Actions["dt-clear"] = (el) => { const t = DT[el.dataset.id]; if (t) { t.sel.clear(); dtPaint(el.dataset.id); } };

// Right-click a row.
contextMenuFor(".dt tbody tr", (tr) => {
  const id = tr.closest(".dt").dataset.dt, t = DT[id], i = +tr.dataset.dtRow; if (!t) return null;
  const first = String(dtText(t.rows[i][0])), m = S.members().find((x) => S.user(x.userId)?.name === first), u = m && S.user(m.userId);
  const listed = u && S.on("directory") && S.can("use.directory") && directoryEntries().some((p) => p.id === u.id);
  return [{ head: first.slice(0, 48) || "Row" },
    { label: t.sel.has(i) ? "Unselect" : "Select", icon: "check", run: () => { if (t.sel.has(i)) t.sel.delete(i); else t.sel.add(i); t.last = i; dtPaint(id); } },
    { label: "Copy this row", icon: "copy", run: () => navigator.clipboard?.writeText([t.head.join("\t"), t.rows[i].map((c) => String(dtText(c))).join("\t")].join("\n")).then(() => toast("Row copied")) },
    u && "-", u && { head: u.name },
    listed && { label: "Open in the directory", icon: "user", run: goTo(`person-${u.id}`) },
    u && S.canAny(["manage.people", "manage.roles"]) && { label: "Role and access", icon: "edit", run: () => { adminPeopleSel = u.id; go("admin-people"); } },
    u && u.id !== S.me().id && S.on("chat") && S.can("use.chat") && { label: "Send a message", icon: "chat", run: () => Actions["dm-start"]({ dataset: { user: u.id } }) },
    u?.email && { label: "Email", icon: "mail", run: () => { location.href = `mailto:${u.email}`; } }];
});
