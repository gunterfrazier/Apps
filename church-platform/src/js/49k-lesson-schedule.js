// ---------- New lesson: class first, then a calendar, then what to start from ----------
// The New lesson sheet asks in the order a teacher thinks: which class, which Sunday (a calendar that shows the class's
// meeting days and a picture of any lesson already planned), then what to start from (the Family Library sorted for the
// class's age), and only then a title, for a blank lesson or a layout. Picking a date that already has a lesson asks
// whether to replace it (the old one becomes an unassigned draft, no date or time) or keep it and pick another date.
// Opening an unassigned draft asks whether to put it on a class's calendar or keep working on it as a draft.

/** When a lesson is, in words. Unassigned drafts have no date. */
function docWhen(d, short = false) {
  if (!d.date) return "Unassigned draft";
  const day = (short ? fmtShort : fmtDay)(fromIsoDay(d.date));
  return d.time && !short ? `${day} at ${timeLabel(d.time)}` : day;
}
const isUnassigned = (d) => d.kind === "lesson" && !d.date;

/** A small picture for a lesson: its story scene or picture, else the first picture in its blocks. */
function lessonThumb(d) {
  const set = d.bgStory && typeof storyBgSet === "function" && storyBgSet(d.bgStory);
  if (set) return bgSceneUrl(set.scenes[0]);
  const s = d.storyId && familyLib?.stories.find((x) => x.id === d.storyId);
  if (s) return storyPic(s, classAge(d.gatheringId && S.get("gatherings", d.gatheringId)));
  return d.blocks.find((b) => b.type === "media" && b.image)?.image || "";
}
const lessonInitials = (d) => (d.title || "?").replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/** Lessons for a class on a day (and at a time, when given), other than one being moved. */
function lessonsOn(gid, date, time, exceptId) {
  return S.list("docs").filter((d) => d.kind === "lesson" && d.id !== exceptId && d.gatheringId === gid && d.date === date && (!time || !d.time || d.time === time));
}
function meetsOn(g, date) {
  const s = g?.schedule; if (!s) return false;
  if (s.kind === "once") return s.date === date;
  if (s.startDate && date < s.startDate) return false;
  if (s.endDate && date > s.endDate) return false;
  return (s.days || []).includes(fromIsoDay(date).getDay());
}

// ----- The class, date and time fields -----
function lessonWhenFields({ classes, gid, date, time, exceptId = "" }) {
  return html`<label class="field"><span>Class</span><select name="gatheringId" data-input="lw-class" required>
      ${classes.length ? "" : html`<option value="">No classes you teach</option>`}${classes.map((g) => html`<option value="${g.id}" ${attr(g.id === gid, "selected")}>${g.name}</option>`)}</select></label>
    <div class="field lw"><span>Date and time</span>
      <input type="hidden" name="date" value="${date}"><input type="hidden" name="replaceId" value=""><input type="hidden" name="exceptId" value="${exceptId}">
      <div class="lcal" data-month="${date.slice(0, 7)}"></div>
      <div class="lw-row"><span class="lw-day faint"></span><label class="lw-time"><span class="sr">Time</span><input type="time" name="time" value="${time}" data-input="lw-time"></label></div>
      <div class="lw-clash" aria-live="polite"></div></div>`;
}
/** Draws the calendar and the clash prompt from the form's current class, date and time. */
function lessonWhenRefresh(form) {
  if (!form?.querySelector(".lcal")) return;
  const g = S.get("gatherings", form.elements.gatheringId.value), date = form.elements.date.value, time = form.elements.time.value, except = form.elements.exceptId.value;
  const cal = form.querySelector(".lcal"), month = cal.dataset.month || (date || isoDay(new Date())).slice(0, 7);
  const [y, m] = month.split("-").map(Number), first = new Date(y, m - 1, 1), today = isoDay(new Date());
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push("");
  for (let day = 1; day <= new Date(y, m, 0).getDate(); day++) cells.push(isoDay(new Date(y, m - 1, day)));
  const cell = (iso) => {
    if (!iso) return `<span class="lcal-pad"></span>`;
    const here = g ? lessonsOn(g.id, iso, "", except) : [], meets = meetsOn(g, iso), lesson = here[0], pic = lesson && lessonThumb(lesson);
    const label = `${fmtDay(fromIsoDay(iso))}${meets ? ", class meets" : ""}${lesson ? `, lesson: ${lesson.title}` : ""}`;
    return `<button type="button" class="lcal-day${meets ? " meets" : ""}${iso === date ? " on" : ""}${iso < today ? " past" : ""}${iso === today ? " today" : ""}${lesson ? " has" : ""}" data-act="lw-pick" data-date="${iso}" aria-label="${esc(label)}" aria-pressed="${iso === date}">
      <span class="n">${+iso.slice(8)}</span>${lesson ? (pic ? `<img src="${esc(pic)}" alt="" loading="lazy">` : `<span class="lcal-ini">${esc(lessonInitials(lesson))}</span>`) : ""}${here.length > 1 ? `<span class="lcal-more">+${here.length - 1}</span>` : ""}</button>`;
  };
  cal.innerHTML = `<div class="lcal-head"><button type="button" class="icon-btn lcal-prev" data-act="lw-month" data-step="-1" aria-label="Previous month">${flat(icon("chev"))}</button>
      <b>${first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
      <button type="button" class="icon-btn" data-act="lw-month" data-step="1" aria-label="Next month">${flat(icon("chev"))}</button></div>
    <div class="lcal-grid">${["S", "M", "T", "W", "T", "F", "S"].map((x) => `<span class="lcal-wd">${x}</span>`).join("")}${cells.map(cell).join("")}</div>
    ${g?.schedule ? `<p class="lcal-key faint"><span class="dot"></span>${esc(g.name)} meets ${esc(scheduleText(g))}</p>` : ""}`;
  form.querySelector(".lw-day").textContent = date ? fmtDay(fromIsoDay(date)) : "Pick a date";
  // A lesson already there: replace it, or keep it and pick another date.
  const clash = g && date ? lessonsOn(g.id, date, time, except)[0] : null, box = form.querySelector(".lw-clash"), replacing = form.elements.replaceId.value;
  if (!clash) { form.elements.replaceId.value = ""; box.innerHTML = ""; return; }
  if (replacing && replacing !== clash.id) form.elements.replaceId.value = "";
  const pic = lessonThumb(clash);
  box.innerHTML = `<div class="lw-clash-card ${form.elements.replaceId.value ? "replacing" : ""}">
    ${pic ? `<img src="${esc(pic)}" alt="">` : `<span class="lcal-ini big">${esc(lessonInitials(clash))}</span>`}
    <div><b>${esc(clash.title)}</b> is already planned for ${esc(g.name)} on ${esc(docWhen(clash))}.
    ${form.elements.replaceId.value
      ? `<p class="lw-note">${flat(icon("info"))}<span>“${esc(clash.title)}” will be saved as a draft with no date or time assigned. You'll find it under Unassigned drafts.</span></p>
         <button type="button" class="btn ghost sm" data-act="lw-keep">Keep it, pick another date</button>`
      : `<div class="btns"><button type="button" class="btn sm" data-act="lw-replace" data-id="${clash.id}">Replace it with the new lesson</button>
         <button type="button" class="btn ghost sm" data-act="lw-keep">Keep it, pick another date</button></div>`}</div></div>`;
}
/** The class's next meeting that doesn't have a lesson yet (date and time), for the default. */
function nextClassDay(g, exceptId = "") {
  let from = new Date();
  for (let i = 0; i < 60 && g; i++) {
    const n = nextMeeting(g, from); if (!n) break;
    const date = isoDay(n), time = g.schedule?.time || "09:00";
    if (!lessonsOn(g.id, date, time, exceptId).length) return { date, time };
    from = new Date(n.getTime() + 2 * 3600e3);
  }
  const n = g && nextMeeting(g);
  return n ? { date: isoDay(n), time: g.schedule?.time || "09:00" } : { date: isoDay(nextWeekday(0, "23:59")), time: "09:00" };
}
Inputs["lw-class"] = (el) => {
  const form = el.form, g = S.get("gatherings", el.value), n = nextClassDay(g);
  form.elements.date.value = n.date; form.elements.time.value = n.time; form.querySelector(".lcal").dataset.month = n.date.slice(0, 7);
  lessonWhenRefresh(form);
  if (form.querySelector(".sf-list")) startFromRefresh(form);
};
Inputs["lw-time"] = (el) => lessonWhenRefresh(el.form);
Actions["lw-pick"] = (el) => { const form = el.closest("form"); form.elements.date.value = el.dataset.date; form.elements.replaceId.value = ""; lessonWhenRefresh(form); };
Actions["lw-month"] = (el) => {
  const form = el.closest("form"), cal = form.querySelector(".lcal"), [y, m] = cal.dataset.month.split("-").map(Number);
  const d = new Date(y, m - 1 + Number(el.dataset.step), 1); cal.dataset.month = isoDay(d).slice(0, 7); lessonWhenRefresh(form);
};
Actions["lw-replace"] = (el) => { const form = el.closest("form"); form.elements.replaceId.value = el.dataset.id; lessonWhenRefresh(form); };
Actions["lw-keep"] = (el) => {
  const form = el.closest("form"); form.elements.replaceId.value = ""; form.elements.date.value = "";
  lessonWhenRefresh(form); form.querySelector(".lcal-day.meets:not(.has):not(.past), .lcal-day:not(.has):not(.past)")?.focus();
};
/** Checks the date and time before saving. Returns an error message, or "" when it's fine. */
function lessonWhenProblem(form, d) {
  if (!d.gatheringId) return "Choose the class this lesson is for.";
  if (!d.date) return "Pick a date on the calendar.";
  const clash = lessonsOn(d.gatheringId, d.date, d.time, d.exceptId)[0];
  if (clash && d.replaceId !== clash.id) { lessonWhenRefresh(form); return `“${clash.title}” is already on that date. Replace it, or pick another date.`; }
  return "";
}
/** Takes a lesson off the calendar: no date, no time, no class (it remembers the class for its teachers). */
function unassignLesson(doc) {
  Object.assign(doc, { date: "", time: "", formerGatheringId: doc.gatheringId || doc.formerGatheringId || null, gatheringId: null, published: false, updated: new Date().toISOString() });
}

// ----- Opening an unassigned draft -----
const askedUnassigned = new Set();
function maybeAskUnassigned(d) {
  if (!isUnassigned(d) || askedUnassigned.has(d.id)) return;
  askedUnassigned.add(d.id);
  setTimeout(() => { if (location.hash === `#build-${d.id}` && !document.querySelector("#scrim .sheet")) Actions["doc-assign-ask"]({ dataset: { id: d.id } }); }, 0);
}
Actions["doc-assign-ask"] = (el) => {
  const d = S.get("docs", el.dataset.id);
  openSheet("This lesson isn't on a calendar", html`<p style="margin-top:0"><b>${d.title}</b> is an unassigned draft: it has no class, date or time, so no one else sees it.</p>
    <p class="faint">Put it on a class's calendar now, or keep it as a draft and assign it later from this page.</p>
    <div class="btns"><button class="btn" data-act="doc-assign" data-id="${d.id}">${icon("calendar")}Assign it to a class</button>
      <button class="btn ghost" data-act="close-sheet">Keep it as a draft and edit</button></div>`);
};
Actions["doc-assign"] = (el) => {
  const d = S.get("docs", el.dataset.id), classes = lessonClasses();
  const g = S.get("gatherings", d.gatheringId || d.formerGatheringId) || classes[0], n = d.date ? { date: d.date, time: d.time } : nextClassDay(g, d.id);
  openSheet(d.date ? "Move this lesson" : "Assign to a class", html`<form data-form="doc-assign" novalidate><input type="hidden" name="id" value="${d.id}">
    ${lessonWhenFields({ classes, gid: g?.id, date: n.date, time: n.time, exceptId: d.id })}
    <button class="btn block">${d.date ? "Move it" : "Put it on the calendar"}</button></form>`);
  lessonWhenRefresh($("#scrim form[data-form=doc-assign]"));
};
Forms["doc-assign"] = (data, f) => {
  const d = S.get("docs", data.id); if (!d) return;
  const problem = lessonWhenProblem(f, data); if (problem) return formError(f, problem);
  const old = data.replaceId && S.get("docs", data.replaceId);
  if (old) unassignLesson(old);
  const g = S.get("gatherings", data.gatheringId);
  Object.assign(d, { gatheringId: g.id, date: data.date, time: data.time, locationId: g.locationId || d.locationId || null, updated: new Date().toISOString() });
  delete d.formerGatheringId;
  closeSheet(true); render();
  toast(old ? `${d.title} is on ${docWhen(d, true)}. ${old.title} is now an unassigned draft.` : `${d.title} is on ${g.name}'s calendar for ${docWhen(d, true)}`);
};
/** The classes this person can plan lessons for. */
function lessonClasses() {
  return S.visible("gatherings", { ignoreCampus: true }).filter((g) => g.type === "class" && (S.can("manage.classes") || isLeader(g)));
}

// ----- Building a lesson straight from a library story, with everything in it -----
/** The edition closest to the class's age that the story has. */
function closestEdition(s, age) {
  const order = { young: ["young", "middle", "teen"], middle: ["middle", "young", "teen"], teen: ["teen", "middle", "young"] }[age] || ["young", "middle", "teen"];
  return order.find((a) => s.editions[a]) || "young";
}
function allStoryPieces(s, age) {
  return new Set(["game", "scripture", "story", "video", "questions", "craft", "pray", "parents", "resources", ...(age === "teen" ? [] : ["coloring"])]
    .filter((k) => (k !== "video" || s.videos.length) && (k !== "craft" || s.craft) && (k !== "game" || s.game)));
}
