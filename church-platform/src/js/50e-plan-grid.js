// ---------- Service plans side by side (#services-grid) ----------
// Several weeks of service plans in columns, like Planning Center's Matrix: each column a service (date, time, campus,
// length), its order of service below, and the team scheduled for it in rows by position. Click a segment to edit it
// (the drawer leaves the grid in view); drag it up or down to reorder, or onto another week to copy it there (a song
// or reading you want again). A song sung the week before is marked. Right-click a segment for the same and more.
// From a plan, M opens the grid there. Built for a computer; on a phone the columns scroll sideways.

const PG = { start: null };
const pgCols = () => (isDesktop() ? Math.max(2, Math.min(7, Math.floor((innerWidth - (document.body.classList.contains("side-folded") ? 80 : 260) - 220) / 250))) : 2);
const ASSIGN_STATUS = { accepted: ["Confirmed", "ok"], pending: ["Asked", "warn"], declined: ["Declined", "bad"], sub: ["Needs a sub", "warn"] };

Screens["services-grid"] = () => {
  if (!canSeePlans()) return { redirect: "ministry" };
  const all = plansInView(), today = isoDay(new Date()), n = pgCols();
  if (PG.start == null || PG.start >= all.length) PG.start = Math.max(0, all.findIndex((p) => p.date >= today) === -1 ? all.length - n : all.findIndex((p) => p.date >= today));
  PG.start = Math.max(0, Math.min(PG.start, Math.max(0, all.length - 1)));
  const plans = all.slice(PG.start, PG.start + n), edit = canPlan();
  const songIds = (p) => new Set(p.segments.filter((s) => s.type === "song" && s.content?.songId).map((s) => s.content.songId));
  // The team: every position anyone is scheduled for in these weeks, as rows.
  const positions = [...new Set(plans.flatMap((p) => (p.assignments || []).map((a) => `${a.team}\u0000${a.position}`)))].sort().map((k) => k.split("\u0000"));
  const cols = `minmax(150px, 180px) repeat(${Math.max(plans.length, 1)}, minmax(220px, 1fr))`;
  const head = (p) => html`<div class="pg-head"><a href="#service-${p.id}"><b>${p.title}</b></a><span>${fmtShort(fromIsoDay(p.date))}, ${timeLabel(p.time)}</span>
    <span class="faint">${[p.locationId && multiCampus() ? locName(p.locationId) : "", `${planMinutes(p)} min`].filter(Boolean).join(", ")}</span>
    <span class="pg-links">${S.can("present") ? html`<a href="#present-service-${p.id}" title="Present">${icon("screen")}</a>` : ""}${setlistSongs(p).length ? html`<a href="#setlist-${p.id}" title="Set list">${icon("music")}</a>` : ""}</span></div>`;
  const stack = (p, k) => {
    const before = k > 0 ? songIds(plans[k - 1]) : (PG.start > 0 ? songIds(all[PG.start - 1]) : new Set());
    let clock = fromIsoDay(p.date, p.time || "10:00");
    return html`<div class="pg-stack" data-plan="${p.id}">${p.segments.map((s, i) => {
      const t = SEGMENT_TYPES[s.type] || SEGMENT_TYPES.custom, pre = s.type === "countdown" && s.content?.to !== "length", at = clock;
      if (!pre) clock = new Date(clock.getTime() + (+s.minutes || 0) * 60e3);
      const song = s.type === "song" && S.get("songs", s.content?.songId), again = song && before.has(song.id);
      return html`<div class="pg-seg ${s.show === false ? "private" : ""} pg-${s.type}" ${edit ? html`draggable="true" data-act="seg-edit" tabindex="0" role="button"` : ""} data-plan="${p.id}" data-i="${i}" aria-label="${s.title}, ${s.minutes} minutes">
        <span class="pg-time">${pre ? "Before" : fmtTime(at)}</span><span class="pg-t">${icon(t.icon)}<b>${s.title}</b></span>
        <span class="pg-s">${song ? song.title : s.content?.ref || s.leader || t.label}${again ? html` <span class="tag warn" title="Also sung the week before">Again</span>` : ""}</span><span class="pg-min">${s.minutes || 0}m</span></div>`;
    })}${p.segments.length ? "" : html`<p class="faint pg-empty">Nothing planned yet.</p>`}
      ${edit ? html`<button type="button" class="btn ghost sm pg-add" data-act="seg-add" data-plan="${p.id}">${icon("plus")}Add</button>` : ""}</div>`;
  };
  const who = (p, team, pos) => (p.assignments || []).filter((a) => a.team === team && a.position === pos).map((a) => {
    const [label, tone] = ASSIGN_STATUS[a.status] || ["", ""];
    return html`<span class="pg-person" title="${label}"><span class="dot ${tone}"></span>${S.userName(a.userId)}</span>`;
  });
  return {
    title: "Service plans", back: "services", wide: true,
    body: html`<div class="pg-tools"><div class="btns">
        <button class="btn ghost sm" data-act="pg-move" data-d="-${n}" ${attr(PG.start === 0, "disabled")} aria-label="Earlier services">${icon("back")}Earlier</button>
        <button class="btn ghost sm" data-act="pg-today">Today</button>
        <button class="btn ghost sm" data-act="pg-move" data-d="${n}" ${attr(PG.start + n >= all.length, "disabled")} aria-label="Later services">Later${icon("next")}</button></div>
        <span class="faint">${plans.length ? `${fmtShort(fromIsoDay(plans[0].date))} to ${fmtShort(fromIsoDay(plans.at(-1).date))}` : ""}${edit ? ". Drag a segment to reorder it, or onto another week to copy it." : ""}</span>
        <span class="pg-spacer"></span><a class="btn ghost sm" href="#services">${icon("list")}List</a>${edit ? html`<button class="btn sm" data-act="plan-new">${icon("plus")}New service plan</button>` : ""}</div>
      ${plans.length ? html`<div class="pg" style="grid-template-columns:${cols}">
        <div class="pg-label"></div>${plans.map(head)}
        <div class="pg-label">Order of service</div>${plans.map(stack)}
        ${positions.length ? html`<div class="pg-label pg-team-label">Team</div>${plans.map(() => html`<div class="pg-team-gap"></div>`)}
          ${positions.map(([team, pos]) => html`<div class="pg-label pg-pos"><b>${pos}</b><span class="faint">${team}</span></div>${plans.map((p) => html`<div class="pg-cell">${who(p, team, pos)}</div>`)}`)}` : ""}
      </div>` : empty("No service plans yet.")}`,
    after() { pgDnd(); },
  };
};
Actions["pg-move"] = (el) => { PG.start = Math.max(0, (PG.start || 0) + +el.dataset.d); render(); };
Actions["pg-today"] = () => { PG.start = null; render(); };

/* ----- Drag a segment: up or down to reorder, onto another week to copy ----- */
let pgDrag = null;
function pgDnd() {
  $$(".pg-seg[draggable=true]").forEach((el) => {
    el.addEventListener("dragstart", (e) => { pgDrag = { plan: el.dataset.plan, i: +el.dataset.i }; e.dataTransfer.effectAllowed = "copyMove"; e.dataTransfer.setData("text/plain", el.getAttribute("aria-label")); el.classList.add("dragging"); });
    el.addEventListener("dragend", () => { el.classList.remove("dragging"); pgDrag = null; $$(".pg-drop").forEach((x) => x.classList.remove("pg-drop")); $$(".pg-mark").forEach((x) => x.remove()); });
  });
  $$(".pg-stack").forEach((st) => {
    st.addEventListener("dragover", (e) => { if (!pgDrag) return; e.preventDefault(); e.dataTransfer.dropEffect = st.dataset.plan === pgDrag.plan ? "move" : "copy"; pgMark(st, e.clientY); });
    st.addEventListener("dragleave", (e) => { if (!st.contains(e.relatedTarget)) { st.classList.remove("pg-drop"); $(".pg-mark", st)?.remove(); } });
    st.addEventListener("drop", (e) => { if (!pgDrag) return; e.preventDefault(); pgDrop(pgDrag, st.dataset.plan, pgIndexAt(st, e.clientY)); });
  });
}
const pgIndexAt = (st, y) => { const segs = $$(".pg-seg", st); const k = segs.findIndex((s) => { const r = s.getBoundingClientRect(); return y < r.top + r.height / 2; }); return k < 0 ? segs.length : k; };
function pgMark(st, y) {
  st.classList.add("pg-drop");
  const at = pgIndexAt(st, y), segs = $$(".pg-seg", st);
  let m = $(".pg-mark", st); if (!m) { m = document.createElement("div"); m.className = "pg-mark"; }
  if (segs[at]) st.insertBefore(m, segs[at]); else st.insertBefore(m, $(".pg-add, .pg-empty", st) || null);
}
/** The same plan: move. Another plan: copy, with its own id. */
function pgDrop(from, toPlan, at) {
  const a = S.get("services", from.plan), b = S.get("services", toPlan); if (!a || !b || !canPlan()) return;
  if (a === b) { const j = at > from.i ? at - 1 : at; if (j !== from.i) { moveItem(a.segments, from.i, j); S.save(); render(); } return; }
  b.segments.splice(at, 0, { ...JSON.parse(JSON.stringify(a.segments[from.i])), id: uid() });
  S.save(); render(); toast(`Copied "${a.segments[from.i].title}" to ${fmtShort(fromIsoDay(b.date))}`);
}
// Enter or Space on a focused segment opens it, like a click.
document.addEventListener("keydown", (e) => {
  const seg = e.target.closest?.(".pg-seg[data-act]"); if (!seg || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault(); seg.click();
});

/* ----- Right-click a segment ----- */
contextMenuFor(".pg-seg", (el) => {
  const p = S.get("services", el.dataset.plan), i = +el.dataset.i, s = p?.segments[i]; if (!s) return null;
  const all = plansInView(), shown = all.slice(PG.start || 0, (PG.start || 0) + pgCols()), others = shown.filter((x) => x.id !== p.id), next = all[all.indexOf(p) + 1];
  if (!canPlan()) return [{ head: s.title }, { label: "Open the plan", icon: "list", run: goTo(`service-${p.id}`) }];
  const copyTo = (q) => () => pgDrop({ plan: p.id, i }, q.id, q.segments.length);
  return [{ head: `${s.title}, ${fmtShort(fromIsoDay(p.date))}` },
    { label: "Edit", icon: "edit", run: () => el.click() },
    { label: "Move up", icon: "up", disabled: i === 0, run: () => { moveItem(p.segments, i, i - 1); S.save(); render(); } },
    { label: "Move down", icon: "down", disabled: i === p.segments.length - 1, run: () => { moveItem(p.segments, i, i + 1); S.save(); render(); } },
    next && { label: `Copy to the next service (${fmtShort(fromIsoDay(next.date))})`, icon: "copy", run: copyTo(next) },
    ...others.filter((q) => q !== next).map((q) => ({ label: `Copy to ${q.title}, ${fmtShort(fromIsoDay(q.date))}`, icon: "copy", run: copyTo(q) })),
    "-", { label: "Remove from this service", icon: "trash", danger: true, run: () => { p.segments.splice(i, 1); S.save(); render(); toast(`Removed "${s.title}"`); } }];
});

/* ----- Getting there: M from a plan, the services page, the command box ----- */
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || $("#scrim") || cmdOpen()) return;
  const m = location.hash.match(/^#service-(.+)$/); if (!m) return;
  const at = plansInView().findIndex((p) => p.id === m[1]); if (at < 0) return;
  e.preventDefault(); PG.start = at; go("services-grid");
});
shortcut("Service plans", ["M"], "Open the plans side by side, from a plan", () => location.hash.startsWith("#service-"));
commandSource(() => (canSeePlans() && S.on("presentations") ? [{ group: "Go to", label: "Service plans side by side", icon: "calendar", keywords: "matrix grid weeks plans services", run: goTo("services-grid") }] : []));
