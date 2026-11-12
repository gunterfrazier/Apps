// ---------- Service plans (liturgy), saved segments and the song library ----------

const SEGMENT_TYPES = {
  welcome: { label: "Welcome", icon: "hand", content: "text" },
  call: { label: "Call to worship", icon: "word", content: "scripture" },
  song: { label: "Song", icon: "music", content: "song" },
  prayer: { label: "Prayer", icon: "pray", content: "text" },
  scripture: { label: "Scripture reading", icon: "book", content: "scripture" },
  creed: { label: "Creed or responsive reading", icon: "list", content: "text" },
  sermon: { label: "Sermon", icon: "word", content: "sermon" },
  communion: { label: "Communion", icon: "church", content: "text" },
  offering: { label: "Offering", icon: "give", content: "text" },
  announcements: { label: "Announcements", icon: "bell", content: "none" },
  media: { label: "Video or graphic", icon: "play", content: "media" },
  benediction: { label: "Benediction", icon: "hand", content: "scripture" },
  countdown: { label: "Countdown", icon: "clock", content: "countdown" },
  custom: { label: "Other", icon: "list", content: "text" },
};
const canPlan = () => S.isMember() && S.can("services.plan");
const canSeePlans = () => S.isMember() && S.canAny(["services.plan", "present", "schedule.teams"]);
const plansInView = () => S.visible("services", { ignoreCampus: true }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const planMinutes = (p) => p.segments.reduce((n, s) => n + (s.type === "countdown" && s.content?.to !== "length" ? 0 : +s.minutes || 0), 0);

Screens.services = () => {
  if (!canSeePlans()) return { redirect: "ministry" };
  const today = isoDay(new Date());
  const all = plansInView(), upcoming = all.filter((p) => p.date >= today), past = all.filter((p) => p.date < today).reverse().slice(0, 6);
  const row = (p) => html`<a class="row" href="#service-${p.id}"><span class="date"><span>${fmtMonth(fromIsoDay(p.date))}</span><b>${fromIsoDay(p.date).getDate()}</b></span><span class="body"><span class="t">${p.title}</span><span class="s">${timeLabel(p.time)}${p.locationId ? `, ${locName(p.locationId)}` : ""}, ${plural(p.segments.length, "segment")}, ${planMinutes(p)} min</span></span>${icon("chev")}</a>`;
  return {
    title: "Service plans", back: "ministry",
    body: html`<div class="btns" style="margin-top:16px">${canPlan() ? html`<button class="btn" data-act="plan-new">${icon("plus")}New service plan</button><a class="btn ghost" href="#songs">${icon("music")}Songs</a><a class="btn ghost" href="#layouts-service">${icon("layers")}Layouts</a><a class="btn ghost" href="#library">${icon("list")}Saved segments</a>` : ""}</div>
      <section class="sec"><h2 class="sec-head">Upcoming</h2><div class="rows">${upcoming.length ? upcoming.map(row) : empty("No services planned yet.")}</div></section>
      ${past.length ? html`<section class="sec"><h2 class="sec-head">Recent</h2><div class="rows">${past.map(row)}</div></section>` : ""}`,
  };
};
Actions["plan-new"] = (el) => {
  const next = upcomingServices(S.church(), 6, "all").filter((s) => !S.list("services").some((p) => p.date === isoDay(s.start) && p.time === s.time && p.locationId === s.location.id));
  const s = next[0];
  openSheet("New service plan", html`<form data-form="plan-new" novalidate>
    <label class="field"><span>Name</span><input type="text" name="title" value="${s?.label || "Sunday worship"}" required maxlength="60"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Date</span><input type="date" name="date" value="${isoDay(s?.start || nextWeekday(0, "23:59"))}"></label><label class="field"><span>Time</span><input type="time" name="time" value="${s?.time || "10:00"}"></label></div>
    <label class="field"><span>Location</span><select name="locationId">${locationOptions(s?.location?.id)}</select></label>
    <label class="field"><span>Start from</span><select name="from"><option value="">A blank plan</option>${layoutOptions("service", el?.dataset?.layout)}<optgroup label="Other"><option value="library">All my saved segments</option>${plansInView().slice().reverse().map((p) => html`<option value="${p.id}">Copy of ${p.title}, ${fmtShort(fromIsoDay(p.date))} ${timeLabel(p.time)}</option>`)}</optgroup></select></label>
    <button class="btn block">Create plan</button></form>`);
};
Forms["plan-new"] = (d, f) => {
  if (!d.title) return formError(f, "Name the service.");
  const copy = (s) => ({ ...JSON.parse(JSON.stringify(s)), id: uid() });
  const segments = d.from?.startsWith("layout:") ? layoutCopy(S.get("layouts", d.from.slice(7)))
    : d.from === "library" ? S.list("library").map(({ churchId, name, ...rest }) => copy(rest)) : d.from ? S.get("services", d.from).segments.map(copy) : [];
  const p = S.add("services", { title: d.title, date: d.date || isoDay(new Date()), time: d.time || "10:00", locationId: d.locationId || null, notes: "", segments });
  closeSheet(true); go(`service-${p.id}`);
};

Screens.service = (id) => {
  const p = S.get("services", id);
  if (!p || !canSeePlans()) return { redirect: "services" };
  const edit = canPlan();
  let clock = fromIsoDay(p.date, p.time || "10:00");
  return {
    title: p.title, back: "services",
    body: html`${planHead(p)}
      <p class="muted" style="margin-top:4px">${plural(p.segments.length, "segment")}, ${planMinutes(p)} minutes.</p>
      <div class="btns">${S.can("present") ? html`<a class="btn sm" href="#present-service-${p.id}">${icon("screen")}Present</a>` : ""}
        ${edit ? html`<button class="btn ghost sm" data-act="plan-details" data-id="${p.id}">${icon("edit")}Details</button><button class="btn ghost sm" data-act="layout-save" data-kind="service" data-id="${p.id}">${icon("layers")}Save as layout</button><button class="btn ghost sm" data-act="plan-dup" data-id="${p.id}">${icon("copy")}Copy to next week</button>` : ""}</div>
      ${p.notes ? html`<p class="panel" style="margin-top:12px">${icon("lock")} ${p.notes}</p>` : ""}
      <section class="sec"><div class="sec-head"><h2>Order of service</h2>${edit && p.segments.length > 1 ? html`<span class="faint">Drag ${icon("grip")} to reorder</span>` : ""}</div>
      <div class="blocks" id="sort-list">${p.segments.length ? p.segments.map((s, i) => {
        const t = SEGMENT_TYPES[s.type] || SEGMENT_TYPES.custom, pre = s.type === "countdown" && s.content?.to !== "length", start = clock;
        if (!pre) clock = new Date(clock.getTime() + (+s.minutes || 0) * 60e3);
        return html`<div class="block-card ${s.show ? "" : "private"}" data-index="${i}"><div class="block-top">${edit ? dragHandle(s.title) : ""}<span class="seg-time">${pre ? "Before" : fmtTime(start)}</span><b>${s.title}</b>
          ${edit ? html`<span class="row-tools"><button class="icon-btn" data-act="seg-move" data-plan="${p.id}" data-i="${i}" data-dir="-1" aria-label="Move up" ${attr(i === 0, "disabled")}>${icon("up")}</button><button class="icon-btn" data-act="seg-move" data-plan="${p.id}" data-i="${i}" data-dir="1" aria-label="Move down" ${attr(i === p.segments.length - 1, "disabled")}>${icon("down")}</button><button class="icon-btn" data-act="seg-edit" data-plan="${p.id}" data-i="${i}" aria-label="Edit">${icon("edit")}</button></span>` : ""}</div>
          <div class="block-body"><span class="s">${t.label}, ${s.minutes} min${s.leader ? `, ${s.leader}` : ""}${s.show ? "" : ". Not shown on screen"}</span>${segmentSummary(s)}</div>
          ${s.notes ? html`<div class="block-notes">${icon("lock")}<span>${s.notes}</span></div>` : ""}</div>`;
      }) : empty("Add segments to build the order of service.")}</div>
      ${edit ? html`<div class="btns"><button class="btn" data-act="seg-add" data-plan="${p.id}">${icon("plus")}Add a segment</button>${S.list("library").length ? html`<button class="btn ghost" data-act="seg-from-lib" data-plan="${p.id}">${icon("list")}From saved segments</button>` : ""}${S.list("layouts").some((l) => l.kind === "service") ? html`<button class="btn ghost" data-act="layout-insert" data-kind="service" data-id="${p.id}">${icon("layers")}From a layout</button>` : ""}</div>` : ""}</section>`,
    after() { if (edit) makeSortable($("#sort-list"), (from, to, kb) => { if (moveItem(p.segments, from, to)) { S.save(); render(); if (kb) $$("#sort-list [data-drag]")[to]?.focus(); } }); },
  };
};
function segmentSummary(s) {
  const c = s.content || {};
  if (s.type === "song") { const song = S.get("songs", c.songId); return song ? html`<span class="s">${song.title}${song.author ? `, ${song.author}` : ""}${c.sections?.length ? `. ${c.sections.join(", ")}` : ""}</span>` : html`<span class="s">No song chosen</span>`; }
  if (s.type === "sermon") { const d = S.get("docs", c.docId); if (c.blocks) return html`<span class="s">${plural(c.blocks.length, "saved item")}${c.title ? ` from "${c.title}"` : ""}</span>`; return d ? html`<span class="s">Slides from "${d.title}" (${plural(d.blocks.filter((b) => b.show && b.type !== "note").length, "item")} on screen)</span>` : html`<span class="s">No sermon chosen</span>`; }
  if (s.type === "countdown") return html`<span class="s">Counts down to ${c.to === "length" ? `the end of these ${s.minutes} minutes` : "the service start time"}${c.text ? `. "${c.text}"` : ""}</span>`;
  if (c.ref) return html`<span class="scripture">${c.ref}</span>`;
  if (c.image) return html`<img class="thumb" src="${c.image}" alt="">`;
  if (c.text) return html`<span class="s clamp2">${c.text}</span>`;
  return "";
}
Actions["seg-move"] = (el) => { const p = S.get("services", el.dataset.plan), i = +el.dataset.i, j = i + +el.dataset.dir; if (j < 0 || j >= p.segments.length) return; [p.segments[i], p.segments[j]] = [p.segments[j], p.segments[i]]; S.save(); render(); };
Actions["seg-add"] = (el) => openSheet("Add a segment", html`<div class="rows">${Object.entries(SEGMENT_TYPES).map(([k, t]) => html`<button class="row" data-act="seg-new" data-plan="${el.dataset.plan}" data-type="${k}"><span class="lead-ic">${icon(t.icon)}</span><span class="body"><span class="t">${t.label}</span></span>${icon("plus")}</button>`)}</div>`);
Actions["seg-new"] = (el) => segmentEditor({ plan: el.dataset.plan, i: -1 }, { type: el.dataset.type, title: SEGMENT_TYPES[el.dataset.type].label, minutes: { sermon: 30, song: 4, countdown: 5 }[el.dataset.type] || 3, show: el.dataset.type !== "prayer", content: { translation: "BSB" } });
Actions["seg-edit"] = (el) => segmentEditor({ plan: el.dataset.plan, i: +el.dataset.i }, S.get("services", el.dataset.plan).segments[+el.dataset.i]);
Actions["seg-from-lib"] = (el) => openSheet("Saved segments", html`<div class="rows">${S.list("library").map((s) => html`<button class="row" data-act="seg-lib-add" data-plan="${el.dataset.plan}" data-id="${s.id}"><span class="lead-ic">${icon(SEGMENT_TYPES[s.type]?.icon || "list")}</span><span class="body"><span class="t">${s.name || s.title}</span><span class="s">${SEGMENT_TYPES[s.type]?.label}, ${s.minutes} min</span></span>${icon("plus")}</button>`)}</div>`);
Actions["seg-lib-add"] = (el) => { const p = S.get("services", el.dataset.plan), s = S.get("library", el.dataset.id); const { churchId, name, ...rest } = JSON.parse(JSON.stringify(s)); p.segments.push({ ...rest, id: uid() }); S.save(); closeSheet(); toast(`${name || s.title} added`); render(); };

/** where = { plan, i } for a service segment, or { lib: id|"" } for the saved-segment library. */
function segmentEditor(where, s) {
  const t = SEGMENT_TYPES[s.type] || SEGMENT_TYPES.custom, c = s.content || {};
  let content = "";
  if (t.content === "text") content = html`<label class="field"><span>Words for the screen</span><textarea name="text">${c.text || ""}</textarea><small>Blank lines start a new slide.</small></label>`;
  if (t.content === "scripture") content = html`<div style="display:grid;grid-template-columns:2fr 1fr;gap:8px"><label class="field"><span>Reference</span><input type="text" name="ref" value="${c.ref || ""}" placeholder="Psalm 95:1-2"></label>
      <label class="field"><span>Translation</span><select name="translation">${Bible.translations.map((x) => html`<option ${attr(x === (c.translation || "BSB"), "selected")}>${x}</option>`)}</select></label></div>
    <label class="field"><span>Text</span><textarea name="text" style="min-height:120px">${c.text || ""}</textarea></label><button type="button" class="btn ghost sm" data-act="fill-bible">${icon("word")}Fill from the Bible</button>`;
  if (t.content === "song") {
    const song = S.get("songs", c.songId), labels = song ? songOrderLabels(song) : [];
    content = html`<label class="field"><span>Song</span><select name="songId"><option value="">Choose a song</option>${S.list("songs").sort((a, b) => a.title.localeCompare(b.title)).map((x) => html`<option value="${x.id}" ${attr(x.id === c.songId, "selected")}>${x.title}</option>`)}</select><small><a href="#songs">Add songs to the library</a></small></label>
      ${labels.length > 1 ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Sections to sing</legend>${labels.map((l) => html`<label class="check" style="padding:4px 0"><input type="checkbox" name="sections" value="${l}" ${attr(!c.sections?.length || c.sections.includes(l), "checked")}><span>${l}</span></label>`)}<small>The song's own order sets the sequence. Change it under Songs.</small></fieldset>` : ""}`;
  }
  if (t.content === "sermon") content = html`<label class="field"><span>Sermon from the builder</span><select name="docId"><option value="">None</option>${S.list("docs").filter((d) => d.kind === "sermon").sort((a, b) => b.date.localeCompare(a.date)).map((d) => html`<option value="${d.id}" ${attr(d.id === c.docId, "selected")}>${d.title}, ${fmtShort(fromIsoDay(d.date))}</option>`)}</select>
      <small>${c.blocks ? `This segment holds ${plural(c.blocks.length, "saved item")}. Choosing a sermon here replaces them with that sermon's slides.` : "Its on-screen items become slides in this service, in the order set in the builder."}</small></label>
      ${c.docId && S.get("docs", c.docId) && canEditDoc(S.get("docs", c.docId)) ? html`<p><a href="#build-${c.docId}">${icon("edit")}Reorder or edit the sermon's items in the builder</a></p>` : ""}`;
  if (t.content === "media") content = html`${imageField("image", "Picture or graphic", c.image, "", 1920)}<label class="field"><span>Video link</span><input type="url" name="url" value="${c.url || ""}"></label><label class="field"><span>Caption</span><input type="text" name="caption" value="${c.caption || ""}"></label>`;
  if (t.content === "none") content = html`<p class="faint">Shows the church's current announcements, one per slide.</p>`;
  if (t.content === "countdown") content = html`<label class="field"><span>Count down to</span><select name="to"><option value="start" ${attr(c.to !== "length", "selected")}>The service start time</option><option value="length" ${attr(c.to === "length", "selected")}>The end of this segment, from when it's shown</option></select><small>Put it first and count down to the start time for a pre-service countdown.</small></label>
    <label class="field"><span>Words under the timer</span><input type="text" name="text" value="${c.text ?? "We'll begin shortly"}" maxlength="80"></label>`;
  const inLib = "lib" in where;
  openSheet(inLib ? "Saved segment" : where.i < 0 ? `Add: ${t.label}` : `Edit: ${s.title}`, html`<form data-form="seg-save" novalidate>
    <input type="hidden" name="_plan" value="${where.plan || ""}"><input type="hidden" name="_i" value="${where.i ?? ""}"><input type="hidden" name="_lib" value="${inLib ? where.lib : "-"}"><input type="hidden" name="_type" value="${s.type}">
    ${inLib ? html`<label class="field"><span>Name in your saved list</span><input type="text" name="name" value="${s.name || s.title || ""}" maxlength="60"></label>` : ""}
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px"><label class="field"><span>Title</span><input type="text" name="title" value="${s.title || ""}" required maxlength="60"></label>
      <label class="field"><span>Minutes</span><input type="number" name="minutes" value="${s.minutes ?? 3}" min="0" max="180"></label></div>
    <label class="field"><span>Led by</span><input type="text" name="leader" value="${s.leader || ""}" maxlength="60"></label>
    ${content}
    <label class="check"><input type="checkbox" name="show" ${attr(s.show !== false, "checked")}><span>Show on screen</span></label>
    <label class="field"><span>Notes for the team (private)</span><textarea name="notes" style="min-height:70px">${s.notes || ""}</textarea></label>
    ${!inLib ? (() => { const n = S.get("services", where.plan).segments.length; return positionField(where.i >= 0 ? n : n + 1, where.i >= 0 ? where.i : n); })() : ""}
    <div class="btns"><button class="btn">${inLib || where.i >= 0 ? "Save" : "Add"}</button>
      ${!inLib && where.i >= 0 ? html`<button type="button" class="btn ghost" data-act="item-save" data-kind="segment" data-source="${where.plan}" data-i="${where.i}">${icon("layers")}Save for reuse</button><button type="button" class="btn danger" data-act="seg-delete" data-plan="${where.plan}" data-i="${where.i}">Remove</button>` : ""}
      ${inLib && where.lib ? html`<button type="button" class="btn danger" data-act="lib-delete" data-id="${where.lib}">Delete</button>` : ""}</div></form>`, { wide: true });
}
Forms["seg-save"] = (d, f, fd) => {
  if (!d.title) return formError(f, "Give the segment a title.");
  const t = SEGMENT_TYPES[d._type] || SEGMENT_TYPES.custom;
  const content = {};
  if (t.content === "text") content.text = d.text;
  if (t.content === "scripture") { if (d.ref && !parseRef(d.ref)) return formError(f, "That reference doesn't look right."); Object.assign(content, { ref: d.ref ? refLabel(parseRef(d.ref)) : "", translation: d.translation, text: d.text }); }
  const prev = d._lib !== "-" ? (d._lib ? S.get("library", d._lib) : null) : d._i !== "" ? S.get("services", d._plan).segments[+d._i] : null;
  if (t.content === "song") { content.songId = d.songId; const picked = fd.getAll("sections"); const song = S.get("songs", d.songId);
    if (song && prev?.content?.songId === d.songId && picked.length && picked.length < songOrderLabels(song).length) content.sections = picked;
    if (song && prev?.content?.songId === d.songId && fd.has("songId") && !picked.length && songOrderLabels(song).length > 1) return formError(f, "Choose at least one section to sing."); }
  if (t.content === "sermon") { content.docId = d.docId; if (prev?.content?.blocks && prev.content.docId === d.docId) Object.assign(content, { blocks: prev.content.blocks, title: prev.content.title }); }
  if (t.content === "countdown") Object.assign(content, { to: d.to === "length" ? "length" : "start", text: d.text });
  if (t.content === "media") { if (d.url && !isUrl(d.url)) return formError(f, "The video link should start with https://"); Object.assign(content, { image: d.image, url: d.url, caption: d.caption }); }
  const seg = { type: d._type, title: d.title, minutes: Math.max(0, +d.minutes || 0), leader: d.leader, show: !!d.show, notes: d.notes, content };
  if (d._lib !== "-") {
    seg.name = d.name || d.title;
    if (d._lib) Object.assign(S.get("library", d._lib), seg); else S.add("library", seg);
  } else {
    const p = S.get("services", d._plan), i = d._i === "" ? -1 : +d._i;
    if (i >= 0) p.segments[i] = { ...p.segments[i], ...seg }; else p.segments.push({ id: uid(), ...seg });
    const at = i >= 0 ? i : p.segments.length - 1;
    if (d._pos !== undefined && d._pos !== "") moveItem(p.segments, at, +d._pos);
  }
  S.save(); closeSheet(); render();
};
Actions["seg-delete"] = (el) => { S.get("services", el.dataset.plan).segments.splice(+el.dataset.i, 1); S.save(); closeSheet(); render(); };
Actions["plan-details"] = (el) => {
  const p = S.get("services", el.dataset.id);
  openSheet("Service details", html`<form data-form="plan-details" novalidate><input type="hidden" name="id" value="${p.id}">
    <label class="field"><span>Name</span><input type="text" name="title" value="${p.title}" required maxlength="60"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Date</span><input type="date" name="date" value="${p.date}"></label><label class="field"><span>Time</span><input type="time" name="time" value="${p.time}"></label></div>
    <label class="field"><span>Location</span><select name="locationId">${locationOptions(p.locationId)}</select></label>
    <label class="field"><span>Notes for the team (private)</span><textarea name="notes">${p.notes || ""}</textarea></label>
    <div class="btns"><button class="btn">Save</button><button type="button" class="btn danger" data-act="plan-delete" data-id="${p.id}">Delete plan</button></div></form>`);
};
Forms["plan-details"] = (d, f) => { if (!d.title) return formError(f, "Name the service."); S.update("services", d.id, { title: d.title, date: d.date, time: d.time, locationId: d.locationId || null, notes: d.notes }); closeSheet(); render(); };
Actions["plan-delete"] = (el) => { S.remove("services", el.dataset.id); closeSheet(true); toast("Plan deleted"); go("services"); };
Actions["plan-dup"] = (el) => {
  const p = S.get("services", el.dataset.id);
  const date = isoDay(new Date(fromIsoDay(p.date).getTime() + 7 * DAY));
  const n = S.add("services", { ...JSON.parse(JSON.stringify(p)), id: undefined, date, segments: p.segments.map((s) => ({ ...JSON.parse(JSON.stringify(s)), id: uid() })) });
  n.id = uid(); S.save(); toast(`Copied to ${fmtShort(fromIsoDay(date))}`); go(`service-${n.id}`);
};

// ----- Saved segments -----
Screens.library = () => {
  if (!canPlan()) return { redirect: "services" };
  const list = S.list("library");
  return {
    title: "Saved segments", back: "services",
    body: html`<p class="muted" style="margin-top:16px">Segments you repeat every week, like the welcome, offering, doxology or benediction. Add them to any service plan in one tap.</p>
      <div class="rows">${list.length ? list.map((s) => html`<button class="row" data-act="lib-edit" data-id="${s.id}"><span class="lead-ic">${icon(SEGMENT_TYPES[s.type]?.icon || "list")}</span><span class="body"><span class="t">${s.name || s.title}</span><span class="s">${SEGMENT_TYPES[s.type]?.label}, ${s.minutes} min${segmentSummaryText(s)}</span></span>${icon("edit")}</button>`) : empty("Nothing saved yet. Open a segment in a service plan and choose Save for reuse.")}</div>
      <div class="btns"><button class="btn ghost" data-act="lib-new">${icon("plus")}New saved segment</button></div>`,
  };
};
function segmentSummaryText(s) {
  const c = s.content || {};
  if (s.type === "song") { const song = S.get("songs", c.songId); return song ? `. ${song.title}${c.sections?.length ? ` (${c.sections.join(", ")})` : ""}` : ". No song yet"; }
  if (c.blocks) return `. ${plural(c.blocks.length, "sermon item")}`;
  if (c.ref) return `. ${c.ref}`;
  return Object.keys(c).filter((k) => k !== "translation" && c[k]).length ? "" : ". Slot only";
}
Actions["lib-edit"] = (el) => segmentEditor({ lib: el.dataset.id }, S.get("library", el.dataset.id));
Actions["lib-new"] = () => openSheet("What kind?", html`<div class="rows">${Object.entries(SEGMENT_TYPES).map(([k, t]) => html`<button class="row" data-act="lib-new-type" data-type="${k}"><span class="lead-ic">${icon(t.icon)}</span><span class="body"><span class="t">${t.label}</span></span>${icon("plus")}</button>`)}</div>`);
Actions["lib-new-type"] = (el) => segmentEditor({ lib: "" }, { type: el.dataset.type, title: SEGMENT_TYPES[el.dataset.type].label, minutes: 3, show: true, content: { translation: "BSB" } });
Actions["lib-delete"] = (el) => { S.remove("library", el.dataset.id); closeSheet(); render(); };

// ----- Songs -----
// A song is a list of sections, each with a kind (intro, verse, pre-chorus, chorus, bridge, outro, or one of the
// church's own like "Tag"), a label people can change, and its words; plus the order the band sings them in.
// In the presenter, each section is a button, so the screen shows just the part being sung.
const SONG_PART_TYPES = { intro: "Intro", verse: "Verse", prechorus: "Pre-chorus", chorus: "Chorus", bridge: "Bridge", outro: "Outro" };
const sameLabel = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The kind of section a label names: "Verse 2" is a verse, "Pre-Chorus" a pre-chorus, "Tag" is the church's own. */
function partTypeOf(label) {
  const l = String(label || "").toLowerCase().replace(/[^a-z]/g, "");
  if (/^intro/.test(l)) return "intro";
  if (/^prechorus/.test(l)) return "prechorus";
  if (/^(chorus|refrain)/.test(l)) return "chorus";
  if (/^verse/.test(l)) return "verse";
  if (/^bridge/.test(l)) return "bridge";
  if (/^(outro|ending)/.test(l)) return "outro";
  return "custom";
}
/** Names of the church's own kinds of section, from its songs: "Tag", "Interlude"... */
function customPartNames(extra = []) {
  const names = new Map();
  [...S.list("songs").flatMap((s) => s.parts || []), ...extra].filter((p) => p.type === "custom").forEach((p) => {
    const n = p.label.replace(/\s+\d+[a-z]?$/i, "").trim(); if (n && !names.has(n.toLowerCase())) names.set(n.toLowerCase(), n);
  });
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
const HEADING = /^(intro|verse|pre-?\s?chorus|chorus|refrain|bridge|outro|ending|tag|interlude|instrumental|vamp|turnaround|coda)(\s*\d+[a-z]?)?\s*:?$/i;
function lyricHeading(line, custom) {
  const t = line.trim(), m = t.match(/^\[(.+)\]$/);
  if (m) return m[1].trim();
  if (HEADING.test(t) || custom.some((n) => new RegExp(`^${escRe(n)}(\\s*\\d+)?\\s*:?$`, "i").test(t))) return t.replace(/\s*:$/, "");
  return null;
}
/** Pasted lyrics -> sections. Headings can be [Verse 1], or a line on its own like "Chorus" (as SongSelect copies them).
 *  Stanzas without a heading become Verse 1, Verse 2... A blank line inside a section starts a new slide. */
function parseLyrics(text, custom = [], idFor = () => uid()) {
  const out = []; let cur = null, gap = false;
  String(text || "").replace(/\r/g, "").split("\n").forEach((line) => {
    const h = lyricHeading(line, custom);
    if (h) { cur = { type: partTypeOf(h), label: h, lines: [] }; out.push(cur); gap = false; return; }
    if (!line.trim()) { gap = true; return; }
    if (!cur || (gap && cur.unlabeled)) { cur = { type: "verse", label: "", lines: [], unlabeled: true }; out.push(cur); }
    else if (gap && cur.lines.length) cur.lines.push("");
    gap = false; cur.lines.push(line.trim());
  });
  const parts = [];
  out.forEach((p) => {
    const lyrics = p.lines.join("\n").trim(), dup = parts.find((x) => p.label && sameLabel(x.label, p.label));
    if (dup && (!lyrics || lyrics === dup.lyrics)) return; // "[Chorus]" again just means sing it again
    const label = p.label && !dup ? p.label : nextPartLabel(p.type, parts, p.label.replace(/\s+\d+$/, ""));
    parts.push({ id: idFor(parts.length), type: p.type, label, lyrics });
  });
  return parts;
}
/** The next free label for a new section: Verse 3, Chorus, Chorus 2, Tag... */
function nextPartLabel(type, parts, name) {
  const base = type === "custom" ? (name || "Section") : SONG_PART_TYPES[type];
  const taken = new Set(parts.map((p) => p.label.trim().toLowerCase()));
  if (type === "verse") { for (let n = 1; ; n++) if (!taken.has(`verse ${n}`)) return `Verse ${n}`; }
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
/** A song's sections. Songs saved before sections existed are read from their [Label] lyrics. */
const songParts = (song) => song.parts || parseLyrics(song.lyrics, [], (i) => `p${i}`);
/** Labels in the order they're sung. An empty order means straight through. */
function songOrder(song) {
  const parts = songParts(song);
  const order = (Array.isArray(song.order) ? song.order : String(song.order || "").split(",")).map((x) => x.trim()).filter((l) => l && parts.some((p) => sameLabel(p.label, l)));
  return order.length ? order : parts.map((p) => p.label);
}
const partsToLyrics = (parts) => parts.map((p) => `[${p.label}]\n${p.lyrics}`.trim()).join("\n\n");
function songFooter(song) {
  const c = S.church();
  return song.publicDomain ? `${song.title}${song.author ? `, ${song.author}` : ""}. Public domain.` : [song.title, song.author, song.copyright, song.ccliSong ? `CCLI song ${song.ccliSong}` : "", c.ccli ? `CCLI license ${c.ccli}` : ""].filter(Boolean).join(". ");
}
/** One section's slides. Each stanza is its own slide, split evenly when it's longer than four lines.
 *  A section without words is instrumental: the intro shows the song's title, others a clear screen. */
function songPartSlides(song, p, footer = songFooter(song)) {
  const base = { title: song.title, label: p.label, partType: p.type, songId: song.id };
  const stanzas = String(p.lyrics || "").split(/\n\s*\n/).map((st) => st.split("\n").map((l) => l.trim()).filter(Boolean)).filter((l) => l.length);
  if (!stanzas.length) return [p.type === "intro" ? { ...base, kind: "title", body: song.author || "", instrumental: true, footer } : { ...base, kind: "lyrics", body: "", instrumental: true }];
  return stanzas.flatMap((lines) => {
    const n = Math.ceil(lines.length / 4), size = Math.ceil(lines.length / n), out = [];
    for (let i = 0; i < lines.length; i += size) out.push({ ...base, kind: "lyrics", body: lines.slice(i, i + size).join("\n"), footer });
    return out;
  });
}
/** Slides for the whole song in its order, or only some sections. occ numbers each time a section is sung; chunk is the slide within it. */
function songSlides(song, only) {
  const parts = songParts(song), footer = songFooter(song);
  let seq = songOrder(song).map((l) => parts.find((p) => sameLabel(p.label, l))).filter(Boolean);
  if (only?.length) seq = seq.filter((p) => only.some((l) => sameLabel(l, p.label)));
  return seq.flatMap((p, occ) => songPartSlides(song, p, footer).map((x, chunk) => ({ ...x, occ, chunk })));
}

Screens.songs = () => {
  if (!canSeePlans()) return { redirect: "ministry" };
  const list = S.list("songs").sort((a, b) => a.title.localeCompare(b.title));
  return {
    title: "Songs and lyrics", back: "services",
    body: html`${demoNote(html`Most worship songs are copyrighted. Project them under your church's <b>CCLI license</b> (add its number under Account details) and get lyrics from CCLI SongSelect. Hymns published before 1929 are public domain.`)}
      ${canPlan() ? html`<div class="btns"><button class="btn" data-act="song-edit">${icon("plus")}Add a song</button></div>` : ""}
      <label class="field"><span class="sr">Search songs</span><input type="search" placeholder="Search songs" data-input="filter-rows" data-target="#song-list" data-empty="#song-none"></label>
      <div class="rows" id="song-list">${list.map((s) => html`<button class="row" data-act="song-edit" data-id="${s.id}" data-search="${s.title} ${s.author}"><span class="lead-ic">${icon("music")}</span><span class="body"><span class="t">${s.title}</span><span class="s">${s.author || "Unknown author"}, ${plural(songParts(s).length, "section")}${s.publicDomain ? ", public domain" : s.ccliSong ? `, CCLI ${s.ccliSong}` : ""}</span>
        <span class="part-strip" aria-hidden="true">${songOrder(s).map((l) => { const p = songParts(s).find((x) => sameLabel(x.label, l)); return html`<i class="pt-${p.type}" title="${p.label}"></i>`; })}</span></span>${icon(canPlan() ? "edit" : "chev")}</button>`)}</div>
      <div id="song-none" class="empty" ${attr(list.length, "hidden")}><p>${list.length ? "No songs match." : "No songs yet."}</p></div>`,
  };
};

// ----- Song editor: sections, labels and order, kept in a draft until Save -----
let songEd = null;
const partTypeName = (t) => SONG_PART_TYPES[t] || "Custom";
const orderIsStraight = () => songEd.order.join() === songEd.parts.map((p) => p.id).join();
function songPartsHtml() {
  const e = songEd, ro = e.ro, custom = customPartNames(e.parts);
  const addChip = (type, name) => html`<button type="button" class="sp-chip pt-${type}" data-act="sp-add" data-type="${type}" data-name="${name || ""}">${icon("plus")}${name || SONG_PART_TYPES[type]}</button>`;
  return html`
    <div class="sp-head-row"><h3 class="sp-h">Sections</h3>${ro ? "" : html`<button type="button" class="btn ghost sm" data-act="song-paste" aria-expanded="${!!e.paste}">${icon("edit")}${e.paste ? "Close" : "Paste the whole song"}</button>`}</div>
    ${e.paste && !ro ? html`<div class="sp-paste">
      <label class="field"><span>Paste the lyrics</span><textarea name="pasteText" style="min-height:180px;font-family:var(--serif)" placeholder="Verse 1&#10;First line&#10;Second line&#10;&#10;Chorus&#10;...">${e.pasteText || ""}</textarea>
        <small>Headings on their own line, like Verse 1, Pre-chorus or [Bridge], start a new section. Lyrics copied from SongSelect already have them.${e.parts.length ? " This replaces the sections below." : ""}</small></label>
      <button type="button" class="btn sm" data-act="song-split">${icon("layers")}Split into sections</button></div>` : ""}
    ${e.parts.length ? html`<ol class="sp-list" id="sp-list">${e.parts.map((p, i) => html`<li class="sp pt-${p.type}" data-index="${i}">
      <div class="sp-top">${ro ? "" : dragHandle(`Move ${p.label || "this section"}`)}
        <label class="sp-type"><span class="sr">Kind of section</span><select data-sp="type" data-i="${i}" ${attr(ro, "disabled")}>${Object.entries(SONG_PART_TYPES).map(([k, n]) => html`<option value="${k}" ${attr(p.type === k, "selected")}>${n}</option>`)}<option value="custom" ${attr(p.type === "custom", "selected")}>Custom</option></select></label>
        <label class="sp-label"><span class="sr">Label</span><input type="text" value="${p.label}" data-sp="label" data-i="${i}" maxlength="30" placeholder="Label" ${attr(ro, "readonly")}></label>
        ${ro ? "" : html`<button type="button" class="icon-btn sm" data-act="sp-remove" data-i="${i}" aria-label="Remove ${p.label}">${icon("trash")}</button>`}</div>
      <label class="sr" for="sp-words-${p.id}">Words for ${p.label}</label>
      <textarea id="sp-words-${p.id}" data-sp="lyrics" data-i="${i}" rows="${Math.min(10, Math.max(2, String(p.lyrics || "").split("\n").length))}" placeholder="${p.type === "intro" || p.type === "outro" ? "Leave empty if it's instrumental" : "Words. A blank line starts a new slide."}" ${attr(ro, "readonly")}>${p.lyrics || ""}</textarea>
    </li>`)}</ol>` : html`<p class="faint">${e.paste ? "Or add the sections one at a time:" : "Add the song's sections one at a time, or paste the whole song."}</p>`}
    ${ro ? "" : html`<div class="sp-add" role="group" aria-label="Add a section">${Object.keys(SONG_PART_TYPES).map((k) => addChip(k))}${custom.map((n) => addChip("custom", n))}
      ${e.adding ? html`<span class="sp-new"><label class="sr" for="sp-custom-name">Name of the new kind of section</label><input id="sp-custom-name" type="text" maxlength="24" placeholder="Tag, Interlude, Vamp..."><button type="button" class="btn sm" data-act="sp-custom-add">Add</button><button type="button" class="linkish" data-act="sp-custom">Cancel</button></span>`
        : html`<button type="button" class="sp-chip" data-act="sp-custom">${icon("plus")}Custom...</button>`}</div>`}
    <h3 class="sp-h">Order</h3>
    <p class="faint" style="margin:0 0 8px">How the band sings it.${ro ? "" : " Tap a section below to add it to the end; tap × to take one out."}</p>
    <div id="sp-order">${songOrderHtml()}</div>`;
}
function songOrderHtml() {
  const e = songEd, ro = e.ro, byId = (id) => e.parts.find((p) => p.id === id);
  return html`<ol class="sp-order" aria-label="Order">${e.order.map((id, k) => { const p = byId(id); return p ? html`<li class="sp-chip pt-${p.type}">${p.label || partTypeName(p.type)}${ro ? "" : html`<button type="button" data-act="sp-order-remove" data-k="${k}" aria-label="Take out ${p.label} (number ${k + 1})">${icon("x")}</button>`}</li>` : ""; })}${e.order.length ? "" : html`<li class="faint">Nothing yet</li>`}</ol>
    ${ro || !e.parts.length ? "" : html`<div class="sp-add" role="group" aria-label="Add to the order">${e.parts.map((p) => html`<button type="button" class="sp-chip ghost pt-${p.type}" data-act="sp-order-add" data-id="${p.id}">${icon("plus")}${p.label || partTypeName(p.type)}</button>`)}
      ${orderIsStraight() ? "" : html`<button type="button" class="linkish" data-act="sp-order-reset">Sing straight through</button>`}</div>`}`;
}
function songFormHtml() {
  const e = songEd, ro = e.ro;
  return html`<form data-form="song-save" data-input="song-ed" data-change="song-ed" novalidate>
    <label class="field"><span>Title</span><input type="text" name="title" value="${e.title}" required maxlength="80" ${attr(ro, "readonly")}></label>
    ${ro ? "" : html`<div class="btns" style="margin:0 0 6px"><button type="button" class="btn ghost sm" data-act="song-find" data-site="songselect">${icon("search")}Find on SongSelect</button><button type="button" class="btn ghost sm" data-act="song-find" data-site="hymnary">${icon("search")}Find a hymn</button></div>
    <p class="faint" style="margin-top:0">Opens a search in a new tab. Copy the lyrics you're licensed to use back into Paste the whole song.</p>`}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="field"><span>Author</span><input type="text" name="author" value="${e.author}" maxlength="80" ${attr(ro, "readonly")}></label>
      <label class="field"><span>CCLI song number</span><input type="text" name="ccliSong" value="${e.ccliSong}" maxlength="12" ${attr(ro, "readonly")}></label></div>
    <label class="field"><span>Copyright line</span><input type="text" name="copyright" value="${e.copyright}" maxlength="160" placeholder="© 2010 Publisher Name" ${attr(ro, "readonly")}></label>
    <label class="check"><input type="checkbox" name="publicDomain" ${attr(e.publicDomain, "checked")} ${attr(ro, "disabled")}><span>This song is in the public domain</span></label>
    <div id="song-ed">${songPartsHtml()}</div>
    ${ro ? "" : html`<div class="btns"><button class="btn">Save song</button>${e.id ? html`<button type="button" class="btn danger" data-act="song-delete" data-id="${e.id}">Delete</button>` : ""}</div>`}</form>`;
}
function redrawSongEd(focus) {
  const box = $("#song-ed"); if (!box || !songEd) return;
  box.innerHTML = flat(songPartsHtml());
  makeSortable($("#sp-list"), (from, to, kb) => {
    const straight = orderIsStraight();
    if (!moveItem(songEd.parts, from, to)) return;
    if (straight) songEd.order = songEd.parts.map((p) => p.id);
    redrawSongEd(kb ? `#sp-list > [data-index="${to}"] [data-drag]` : null);
  });
  if (focus) $(focus)?.focus();
}
Actions["song-edit"] = (el) => {
  const s = S.get("songs", el.dataset.id);
  const parts = s ? songParts(s).map((p) => ({ ...p, id: s.parts ? p.id : uid(), orig: p.label })) : [];
  const order = s ? songOrder(s).map((l) => parts.find((p) => sameLabel(p.label, l))?.id).filter(Boolean) : [];
  songEd = { id: s?.id || "", title: s?.title || "", author: s?.author || "", ccliSong: s?.ccliSong || "", copyright: s?.copyright || "", publicDomain: !!s?.publicDomain, parts, order, ro: !canPlan(), paste: !s, pasteText: "", adding: false };
  openSheet(s ? s.title : "Add a song", songFormHtml(), { wide: true });
  redrawSongEd();
};
Inputs["song-ed"] = (form, ev) => {
  const t = ev.target, e = songEd; if (!e) return;
  if (["title", "author", "ccliSong", "copyright", "pasteText"].includes(t.name)) e[t.name] = t.value;
  if (t.name === "publicDomain") e.publicDomain = t.checked;
  const p = e.parts[+t.dataset.i]; if (!p || !t.dataset.sp) return;
  if (t.dataset.sp === "lyrics") p.lyrics = t.value;
  if (t.dataset.sp === "label") { p.label = t.value; $("#sp-order").innerHTML = flat(songOrderHtml()); }
  if (t.dataset.sp === "type" && ev.type === "change") {
    const was = p.type; p.type = t.value;
    // A label that just named the old kind ("Verse 2") follows the new kind; one the person typed stays.
    const old = was === "custom" ? null : new RegExp(`^${escRe(SONG_PART_TYPES[was])}(\\s+\\d+)?$`, "i");
    if (!p.label.trim() || (old && old.test(p.label.trim()))) p.label = nextPartLabel(p.type, e.parts.filter((x) => x !== p), p.type === "custom" ? "Section" : "");
    redrawSongEd(`[data-sp="type"][data-i="${t.dataset.i}"]`);
  }
};
Actions["sp-add"] = (el) => {
  const e = songEd, straight = orderIsStraight(), type = el.dataset.type;
  const p = { id: uid(), type, label: nextPartLabel(type, e.parts, el.dataset.name), lyrics: "" };
  e.parts.push(p); if (straight) e.order.push(p.id);
  redrawSongEd(`#sp-words-${p.id}`);
};
Actions["sp-custom"] = () => { songEd.adding = !songEd.adding; redrawSongEd(songEd.adding ? "#sp-custom-name" : null); };
Actions["sp-custom-add"] = () => {
  const name = $("#sp-custom-name")?.value.trim().replace(/\s+/g, " ");
  if (!name) { $("#sp-custom-name")?.focus(); return; }
  songEd.adding = false; Actions["sp-add"]({ dataset: { type: partTypeOf(name) === "custom" ? "custom" : partTypeOf(name), name } });
};
document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.id === "sp-custom-name") { ev.preventDefault(); Actions["sp-custom-add"](); } });
Actions["sp-remove"] = (el) => {
  const e = songEd, [p] = e.parts.splice(+el.dataset.i, 1);
  e.order = e.order.filter((id) => id !== p.id);
  redrawSongEd(); toast(`${p.label || "Section"} removed`);
};
Actions["sp-order-add"] = (el) => { songEd.order.push(el.dataset.id); $("#sp-order").innerHTML = flat(songOrderHtml()); };
Actions["sp-order-remove"] = (el) => { songEd.order.splice(+el.dataset.k, 1); $("#sp-order").innerHTML = flat(songOrderHtml()); $("#sp-order [data-act=sp-order-remove]")?.focus(); };
Actions["sp-order-reset"] = () => { songEd.order = songEd.parts.map((p) => p.id); $("#sp-order").innerHTML = flat(songOrderHtml()); };
Actions["song-paste"] = () => { songEd.paste = !songEd.paste; redrawSongEd(songEd.paste ? "#song-ed textarea[name=pasteText]" : null); };
Actions["song-split"] = () => {
  const e = songEd, parts = parseLyrics(e.pasteText, customPartNames(e.parts));
  if (!parts.length) { toast("Paste the lyrics first"); $("#song-ed textarea[name=pasteText]")?.focus(); return; }
  // Sections that keep a label keep their place in plans that pick sections.
  parts.forEach((p) => { const was = e.parts.find((x) => sameLabel(x.label, p.label)); if (was?.orig) p.orig = was.orig; });
  Object.assign(e, { parts, order: parts.map((p) => p.id), paste: false, pasteText: "" });
  redrawSongEd(); toast(`Split into ${plural(parts.length, "section")}`);
};
Actions["song-find"] = (el) => {
  const title = $("#scrim input[name=title]")?.value || "";
  const url = el.dataset.site === "hymnary" ? `https://hymnary.org/search?qu=${encodeURIComponent(title)}` : `https://songselect.ccli.com/search/results?search=${encodeURIComponent(title)}`;
  const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
};
/** When a section is renamed or removed, plans and saved segments that sing only some sections follow along. */
function renameSongSections(songId, map) {
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.songId === songId && Array.isArray(o.sections)) {
      o.sections = o.sections.map((l) => (map.has(l.trim().toLowerCase()) ? map.get(l.trim().toLowerCase()) : l)).filter(Boolean);
      if (!o.sections.length) delete o.sections;
    }
    Object.values(o).forEach(walk);
  };
  ["services", "library", "layouts"].forEach((k) => walk(S.list(k)));
}
Forms["song-save"] = (d, f) => {
  const e = songEd; if (!e) return;
  if (!d.title) return formError(f, "Give the song a title.");
  if (!e.parts.length && e.pasteText?.trim()) Actions["song-split"]();
  if (!e.parts.length) return formError(f, "Add the song's sections, or paste the lyrics and choose Split into sections.");
  if (e.parts.some((p) => !p.label.trim())) return formError(f, "Every section needs a label.");
  const dup = e.parts.find((p, i) => e.parts.findIndex((x) => sameLabel(x.label, p.label)) !== i);
  if (dup) return formError(f, `Two sections are called "${dup.label.trim()}". Give each its own label, like Chorus and Chorus 2.`);
  if (!e.parts.some((p) => p.lyrics.trim())) return formError(f, "Add the words to at least one section.");
  if (!e.order.length) return formError(f, "Add at least one section to the order.");
  if (!d.publicDomain && !d.copyright && !d.ccliSong) return formError(f, "Add the copyright line or CCLI song number, or mark the song public domain.");
  const parts = e.parts.map((p) => ({ id: p.id, type: p.type, label: p.label.trim().replace(/\s+/g, " "), lyrics: p.lyrics.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() }));
  const labels = e.order.map((id) => parts.find((p) => p.id === id)?.label).filter(Boolean);
  const straight = labels.join("\n") === parts.map((p) => p.label).join("\n");
  const rec = { title: d.title, author: d.author, ccliSong: d.ccliSong, copyright: d.copyright, publicDomain: !!d.publicDomain, parts, order: straight ? [] : labels, lyrics: partsToLyrics(parts) };
  if (e.id) {
    const map = new Map();
    const before = songParts(S.get("songs", e.id));
    before.forEach((b) => { const now = e.parts.find((p) => p.orig && sameLabel(p.orig, b.label)); map.set(b.label.trim().toLowerCase(), now ? now.label.trim() : null); });
    renameSongSections(e.id, map);
    S.update("songs", e.id, rec);
  } else S.add("songs", rec);
  songEd = null; closeSheet(); toast("Song saved"); render();
};
Actions["song-delete"] = (el) => { S.remove("songs", el.dataset.id); songEd = null; closeSheet(); render(); };
