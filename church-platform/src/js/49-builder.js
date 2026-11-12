// ---------- Builders: sermons, Sunday school lessons and Bible study guides ----------
// A document is a list of blocks. Each block is either shown on screen during the presentation or kept private,
// and can carry speaker notes. The presenter page lists every block with its slide number and notes.

const DOC_KINDS = {
  sermon: { label: "Sermon", many: "Sermons", perm: "build.sermons", icon: "word" },
  lesson: { label: "Lesson", many: "Sunday school lessons", perm: "build.lessons", icon: "door" },
  study: { label: "Study guide", many: "Bible study guides", perm: "build.studies", icon: "book" },
};
const BLOCKS = {
  scripture: { label: "Scripture", icon: "word" },
  point: { label: "Point", icon: "list" },
  keynote: { label: "Keynote", icon: "star" },
  media: { label: "Media", icon: "image" },
  text: { label: "Text", icon: "note" },
  question: { label: "Question", icon: "ask" },
  action: { label: "Cue or action", icon: "bolt" },
  note: { label: "Private note", icon: "lock" },
};
const CUES = ["Cue", "Response time", "Offering", "Band", "Lights", "Play video", "Show QR code", "Handout", "Craft", "Prayer"];

function canEditDoc(d) {
  if (!S.isMember() || !d) return false;
  if (d.authorId === S.me().id && S.can(DOC_KINDS[d.kind].perm)) return true;
  if (d.kind === "sermon") return S.can("build.sermons");
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  if (d.kind === "lesson") return S.can("build.lessons") && (S.can("manage.classes") || (g && isLeader(g)));
  return S.can("build.studies") && (S.can("manage.classes") || (g && isLeader(g)));
}
function docRow(d) {
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  return html`<a class="row" href="#build-${d.id}"><span class="lead-ic">${icon(DOC_KINDS[d.kind].icon)}</span><span class="body"><span class="t">${d.title}</span><span class="s">${DOC_KINDS[d.kind].label}${d.passage ? `, ${d.passage}` : ""}${g ? `, ${g.name}` : ""}, ${fmtShort(fromIsoDay(d.date))}${d.published ? "" : ", draft"}</span></span>${icon("chev")}</a>`;
}

Screens.docs = (kind) => {
  const k = DOC_KINDS[kind];
  if (!k || !S.isMember() || !S.can(k.perm)) return { redirect: "ministry" };
  const docs = S.list("docs").filter((d) => d.kind === kind && canEditDoc(d)).sort((a, b) => b.date.localeCompare(a.date));
  const myClasses = S.visible("gatherings", { ignoreCampus: true }).filter((g) => g.type === "class" && isLeader(g));
  const blockedLesson = kind === "lesson" && !S.can("manage.classes") && !myClasses.length;
  return {
    title: k.many, back: "ministry",
    body: html`${blockedLesson ? html`<div class="panel" style="margin-top:16px"><p style="margin:0">The lesson builder opens once you're assigned to teach a class. Ask whoever schedules classes to add you as a teacher.</p></div>`
        : html`<div class="btns" style="margin-top:16px"><button class="btn" data-act="new-doc" data-kind="${kind}">${icon("plus")}New ${k.label.toLowerCase()}</button><a class="btn ghost" href="#layouts-${kind}">${icon("layers")}Layouts</a></div>`}
      <div class="rows" style="margin-top:14px">${docs.length ? docs.map(docRow) : empty(`No ${k.many.toLowerCase()} yet.`)}</div>`,
  };
};

Actions["new-doc"] = (el) => {
  const kind = el.dataset.kind, k = DOC_KINDS[kind];
  const classes = S.visible("gatherings", { ignoreCampus: true }).filter((g) => (kind === "lesson" ? g.type === "class" : g.type === "group") && (S.can("manage.classes") || isLeader(g)));
  const preset = el.dataset.gathering;
  const next = kind === "sermon" ? upcomingServices(S.church(), 1)[0] : null;
  openSheet(`New ${k.label.toLowerCase()}`, html`<form data-form="new-doc" novalidate><input type="hidden" name="kind" value="${kind}">
    <label class="field"><span>Title</span><input type="text" name="title" required maxlength="90"></label>
    <label class="field"><span>Main passage</span><input type="text" name="passage" maxlength="40" placeholder="John 15:1-8"><small>Fills the layout's first empty Scripture slot, or becomes the first item.</small></label>
    <label class="field"><span>Start from</span><select name="from"><option value="">A blank ${k.label.toLowerCase()}</option>${layoutOptions(kind, el.dataset.layout)}</select></label>
    ${kind !== "sermon" ? html`<label class="field"><span>${kind === "lesson" ? "Class" : "Group (optional)"}</span><select name="gatheringId">${kind === "study" ? html`<option value="">No group</option>` : ""}${classes.map((g) => html`<option value="${g.id}" ${attr(g.id === preset, "selected")}>${g.name}</option>`)}</select></label>` : ""}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field"><span>Date</span><input type="date" name="date" value="${isoDay(next?.start || nextWeekday(0, "23:59"))}"></label>
      <label class="field"><span>Time</span><input type="time" name="time" value="${next?.time || "09:00"}"></label></div>
    ${kind === "sermon" ? html`<label class="field"><span>Location</span><select name="locationId">${locationOptions(next?.location?.id)}</select></label>` : ""}
    <button class="btn block">Create</button></form>`);
};
Forms["new-doc"] = (d, f) => {
  if (!d.title) return formError(f, "Give it a title.");
  if (d.passage && !parseRef(d.passage)) return formError(f, "That passage doesn't look like a Bible reference.");
  if (d.kind === "lesson" && !d.gatheringId) return formError(f, "Choose the class this lesson is for.");
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  const blocks = d.from?.startsWith("layout:") ? layoutCopy(S.get("layouts", d.from.slice(7))) : [];
  if (d.passage) {
    const ref = refLabel(parseRef(d.passage)), slot = blocks.find((b) => b.type === "scripture" && !b.ref && !b.text);
    if (slot) Object.assign(slot, { ref, translation: slot.translation || "BSB" }); else blocks.unshift({ id: uid(), type: "scripture", ref, translation: "BSB", text: "", show: true, notes: "" });
  }
  const doc = S.add("docs", { kind: d.kind, title: d.title, passage: d.passage ? refLabel(parseRef(d.passage)) : "", topic: "", date: d.date || isoDay(new Date()), time: d.time, locationId: d.locationId || g?.locationId || null,
    gatheringId: d.gatheringId || null, authorId: S.me().id, published: false, shareWithParents: d.kind === "lesson", resource: "", blocks, updated: new Date().toISOString() });
  closeSheet(true);
  const toFill = blocks.filter((b) => b.type === "scripture" && b.ref && !b.text);
  if (toFill.length) Promise.all(toFill.map(fillScripture)).then(() => { S.save(); if (location.hash === `#build-${doc.id}`) render(); });
  go(`build-${doc.id}`);
};
async function fillScripture(b) { try { b.text = await Bible.text(b.ref, b.translation || "BSB"); } catch { /* leave for typing */ } }

function blockSummary(b) {
  switch (b.type) {
    case "scripture": return html`<span class="scripture">${b.ref}</span>${b.text ? html`<span class="s clamp2">${b.text}</span>` : html`<span class="s">No text yet</span>`}`;
    case "media": return html`${b.image ? html`<img class="thumb" src="${b.image}" alt="">` : ""}<span class="s">${b.caption || b.url || "Media"}</span>`;
    case "text": return html`<b>${b.title}</b><span class="s clamp2">${b.text}</span>`;
    case "action": return html`<b>${b.label}</b><span class="s">${b.text}${b.target ? ` (QR: #${b.target})` : ""}</span>`;
    default: return html`<span class="clamp2">${b.text}</span>`;
  }
}

Screens.build = (id) => {
  const d = S.get("docs", id);
  if (!d) return { redirect: "ministry" };
  if (!canEditDoc(d)) return { redirect: `outline-${id}` };
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  let slide = 0;
  return {
    title: d.title, back: `docs-${d.kind}`,
    body: html`
      <p style="margin:16px 0 4px"><span class="tag brand">${DOC_KINDS[d.kind].label}</span> ${d.published ? html`<span class="tag ok">Published</span>` : html`<span class="tag">Draft</span>`}</p>
      <h1>${d.title}</h1>
      <p class="muted" style="margin-top:4px">${[d.passage, g?.name, `${fmtDay(fromIsoDay(d.date))}${d.time ? ` at ${timeLabel(d.time)}` : ""}`, d.locationId && multiCampus() ? locName(d.locationId) : ""].filter(Boolean).join(". ")}</p>
      <div class="btns">
        ${S.can("present") || canEditDoc(d) ? html`<a class="btn sm" href="#present-doc-${d.id}">${icon("screen")}Present</a>` : ""}
        <a class="btn ghost sm" href="#resource-${d.id}">${icon("note")}Presenter page</a>
        <button class="btn ghost sm" data-act="doc-details" data-id="${d.id}">${icon("edit")}Details</button>
        <button class="btn ghost sm" data-act="layout-save" data-kind="doc" data-id="${d.id}">${icon("layers")}Save as layout</button>
        <button class="btn ghost sm" data-act="doc-publish" data-id="${d.id}">${d.published ? "Unpublish" : "Publish"}</button>
        ${canAI() ? html`<button class="btn ghost sm" data-act="ai-build" data-id="${d.id}">${icon("bolt")}${d.kind === "lesson" && !d.blocks.some((b) => b.type !== "scripture") ? "Draft this lesson" : "Draft questions"}</button>` : ""}
      </div>
      <p class="faint">${d.kind === "sermon" ? "Published sermons can be followed by members during the service." : d.kind === "lesson" ? `Published lessons show to the class${d.shareWithParents ? " and in parents' portal" : ""}.` : "Published guides show on the group's page."} Items marked private never appear on screen or to members.</p>

      <section class="sec"><div class="sec-head"><h2>Blocks</h2><span class="faint">${d.blocks.filter((b) => b.show && b.type !== "note").length} on screen, ${d.blocks.filter((b) => !b.show || b.type === "note").length} private</span></div>
      ${d.blocks.length > 1 ? html`<p class="faint" style="margin-top:-4px">Drag ${icon("grip")} to change the order.</p>` : ""}
      <div class="blocks" id="sort-list">${d.blocks.length ? d.blocks.map((b, i) => {
        const shown = b.show && b.type !== "note";
        if (shown) slide++;
        return html`<div class="block-card ${shown ? "" : "private"}" data-index="${i}">
          <div class="block-top">${dragHandle(`${BLOCKS[b.type].label} ${i + 1}`)}<span class="tag ${shown ? "brand" : ""}">${shown ? `On screen ${slide}` : "Private"}</span><b>${BLOCKS[b.type].label}</b>
            <span class="row-tools">${b.type !== "note" ? html`<button class="icon-btn" data-act="block-vis" data-doc="${d.id}" data-i="${i}" aria-label="${shown ? "Keep private" : "Show on screen"}" title="${shown ? "Shown on screen. Tap to keep private." : "Private. Tap to show on screen."}">${icon(shown ? "eye" : "eyeoff")}</button>` : ""}
            <button class="icon-btn" data-act="dblock-move" data-doc="${d.id}" data-i="${i}" data-dir="-1" aria-label="Move up" ${attr(i === 0, "disabled")}>${icon("up")}</button><button class="icon-btn" data-act="dblock-move" data-doc="${d.id}" data-i="${i}" data-dir="1" aria-label="Move down" ${attr(i === d.blocks.length - 1, "disabled")}>${icon("down")}</button>
            <button class="icon-btn" data-act="dblock-edit" data-doc="${d.id}" data-i="${i}" aria-label="Edit">${icon("edit")}</button></span></div>
          <div class="block-body">${blockSummary(b)}</div>
          ${b.notes ? html`<div class="block-notes">${icon("lock")}<span>${b.notes}</span></div>` : ""}
        </div>`;
      }) : empty("Add Scripture, points, keynotes, media or cues below.")}</div>
      <div class="add-blocks">${Object.entries(BLOCKS).map(([k, t]) => html`<button class="chip" data-act="dblock-new" data-doc="${d.id}" data-type="${k}">${icon(t.icon)}${t.label}</button>`)}
        ${S.list("savedBlocks").length ? html`<button class="chip" data-act="saved-blocks" data-doc="${d.id}">${icon("bookmark")}Saved items</button>` : ""}
        ${S.list("layouts").some((l) => l.kind === d.kind) ? html`<button class="chip" data-act="layout-insert" data-kind="${d.kind}" data-id="${d.id}">${icon("layers")}From a layout</button>` : ""}</div></section>`,
    after() { makeSortable($("#sort-list"), (from, to, kb) => { if (moveItem(d.blocks, from, to)) { touch(d); render(); if (kb) $$("#sort-list [data-drag]")[to]?.focus(); } }); },
  };
};
const touch = (d) => { d.updated = new Date().toISOString(); S.save(); };
Actions["block-vis"] = (el) => { const d = S.get("docs", el.dataset.doc), b = d.blocks[+el.dataset.i]; b.show = !b.show; touch(d); render(); };
Actions["dblock-move"] = (el) => { const d = S.get("docs", el.dataset.doc), i = +el.dataset.i, j = i + +el.dataset.dir; if (j < 0 || j >= d.blocks.length) return; [d.blocks[i], d.blocks[j]] = [d.blocks[j], d.blocks[i]]; touch(d); render(); };
Actions["dblock-new"] = (el) => blockEditor(el.dataset.doc, -1, { type: el.dataset.type, show: !["note", "action"].includes(el.dataset.type), translation: "BSB", label: "Cue" });
Actions["dblock-edit"] = (el) => blockEditor(el.dataset.doc, +el.dataset.i, S.get("docs", el.dataset.doc).blocks[+el.dataset.i]);

function qrTargets() {
  const cid = S.state.current;
  return [["", "No QR code"], [`give-${cid}`, "Give"], [`page-${cid}`, "Our landing page"], [`checkin-${cid}`, "Kids check-in"], ...upcomingEvents().map((e) => [e.signup ? `register-event-${e.id}` : `event-${e.id}`, `Event: ${e.title}`]),
    ...S.visible("gatherings").map((g) => [g.registration === "none" ? `gathering-${g.id}` : `register-gathering-${g.id}`, `${g.type === "class" ? "Class" : "Group"}: ${g.name}`])];
}
function blockEditor(docId, i, b) {
  const type = b.type;
  const showToggle = type !== "note" ? html`<label class="check"><input type="checkbox" name="show" ${attr(b.show, "checked")}><span><b>Show on screen</b><br><span class="faint">Unchecked items stay on your presenter page only.</span></span></label>` : html`<p class="faint">Private notes never show on screen.</p>`;
  const notes = type !== "note" ? html`<label class="field"><span>Speaker notes (private)</span><textarea name="notes" style="min-height:70px">${b.notes || ""}</textarea></label>` : "";
  let fields;
  switch (type) {
    case "scripture": fields = html`<div style="display:grid;grid-template-columns:2fr 1fr;gap:8px"><label class="field"><span>Reference</span><input type="text" name="ref" value="${b.ref || ""}" placeholder="Romans 8:28-39" required></label>
        <label class="field"><span>Translation</span><select name="translation">${Bible.translations.map((t) => html`<option ${attr(t === (b.translation || "BSB"), "selected")}>${t}</option>`)}</select></label></div>
      <label class="field"><span>Text</span><textarea name="text" style="min-height:140px">${b.text || ""}</textarea><small>Fill it from the Bible, or type or paste another translation you're licensed to use.</small></label>
      <button type="button" class="btn ghost sm" data-act="fill-bible">${icon("word")}Fill from the Bible</button>`; break;
    case "media": fields = html`${imageField("image", "Picture or graphic", b.image, "", 1920)}
      <label class="field"><span>Video or link (optional)</span><input type="url" name="url" value="${b.url || ""}" placeholder="https://youtube.com/watch?v=..."></label>
      <label class="field"><span>Caption</span><input type="text" name="caption" value="${b.caption || ""}" maxlength="120"></label>`; break;
    case "text": fields = html`<label class="field"><span>Heading</span><input type="text" name="title" value="${b.title || ""}" maxlength="90"></label><label class="field"><span>Text</span><textarea name="text">${b.text || ""}</textarea></label>`; break;
    case "action": fields = html`<label class="field"><span>Cue</span><input type="text" name="label" value="${b.label || "Cue"}" list="cue-list" maxlength="40"><datalist id="cue-list">${CUES.map((c) => html`<option value="${c}">`)}</datalist></label>
      <label class="field"><span>What happens</span><textarea name="text" style="min-height:70px">${b.text || ""}</textarea></label>
      <label class="field"><span>QR code on screen (optional)</span><select name="target">${qrTargets().map(([k, l]) => html`<option value="${k}" ${attr(k === (b.target || ""), "selected")}>${l}</option>`)}</select><small>When this cue is shown on screen, people can scan straight to it.</small></label>`; break;
    default: fields = html`<label class="field"><span>${type === "keynote" ? "Big statement" : type === "question" ? "Question" : type === "note" ? "Note to yourself" : "Point"}</span><textarea name="text" style="min-height:90px" required>${b.text || ""}</textarea></label>`;
  }
  openSheet(`${i < 0 ? "Add" : "Edit"}: ${BLOCKS[type].label}`, html`<form data-form="dblock-save" novalidate><input type="hidden" name="_doc" value="${docId}"><input type="hidden" name="_i" value="${i}"><input type="hidden" name="_type" value="${type}">
    ${fields}${showToggle}${notes}
    ${(() => { const n = S.get("docs", docId).blocks.length; return positionField(i >= 0 ? n : n + 1, i >= 0 ? i : n); })()}
    <div class="btns"><button class="btn">${i < 0 ? "Add" : "Save"}</button>${i >= 0 ? html`<button type="button" class="btn ghost" data-act="item-save" data-kind="block" data-source="${docId}" data-i="${i}">${icon("bookmark")}Save for reuse</button><button type="button" class="btn danger" data-act="dblock-delete" data-doc="${docId}" data-i="${i}">Delete</button>` : ""}</div></form>`, { wide: true });
}
Actions["fill-bible"] = async (el) => {
  const f = el.closest("form"), ref = $("input[name=ref]", f).value, t = $("select[name=translation]", f).value;
  if (!parseRef(ref)) return formError(f, "Enter a reference like John 3:16 first.");
  el.disabled = true; el.textContent = "Loading...";
  try { $("textarea[name=text]", f).value = await Bible.text(ref, t); $("input[name=ref]", f).value = refLabel(parseRef(ref)); }
  catch { formError(f, "That passage couldn't be loaded here. Type or paste the text instead."); }
  el.disabled = false; el.textContent = "Fill from the Bible";
};
Forms["dblock-save"] = (d, f) => {
  const doc = S.get("docs", d._doc), type = d._type;
  const b = { type, show: type === "note" ? false : !!d.show, notes: d.notes || "" };
  if (type === "scripture") { if (!parseRef(d.ref)) return formError(f, "Enter a Bible reference like John 3:16."); Object.assign(b, { ref: refLabel(parseRef(d.ref)), translation: d.translation, text: d.text }); }
  else if (type === "media") { if (!d.image && !d.url) return formError(f, "Add a picture or a link."); if (d.url && !isUrl(d.url)) return formError(f, "The link should start with https://"); Object.assign(b, { image: d.image, url: d.url, caption: d.caption }); }
  else if (type === "text") Object.assign(b, { title: d.title, text: d.text });
  else if (type === "action") Object.assign(b, { label: d.label || "Cue", text: d.text, target: d.target });
  else { if (!d.text) return formError(f, "Write something first."); b.text = d.text; }
  const i = +d._i;
  if (i >= 0) doc.blocks[i] = { ...doc.blocks[i], ...b }; else doc.blocks.push({ id: uid(), ...b });
  if (d._pos !== undefined && d._pos !== "") moveItem(doc.blocks, i >= 0 ? i : doc.blocks.length - 1, +d._pos);
  touch(doc); closeSheet(); render();
};
Actions["dblock-delete"] = (el) => { const d = S.get("docs", el.dataset.doc); d.blocks.splice(+el.dataset.i, 1); touch(d); closeSheet(); render(); };
Actions["doc-publish"] = (el) => { const d = S.get("docs", el.dataset.id); d.published = !d.published; touch(d); toast(d.published ? "Published" : "Back to draft"); render(); };
Actions["doc-details"] = (el) => {
  const d = S.get("docs", el.dataset.id);
  openSheet("Details", html`<form data-form="doc-details" novalidate><input type="hidden" name="id" value="${d.id}">
    <label class="field"><span>Title</span><input type="text" name="title" value="${d.title}" required maxlength="90"></label>
    <label class="field"><span>Main passage</span><input type="text" name="passage" value="${d.passage}" maxlength="40"></label>
    <label class="field"><span>Topic</span><input type="text" name="topic" value="${d.topic || ""}" maxlength="30"><small>Used for the Veritas Logos study guide link.</small></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Date</span><input type="date" name="date" value="${d.date}"></label><label class="field"><span>Time</span><input type="time" name="time" value="${d.time || ""}"></label></div>
    ${d.kind === "sermon" ? html`<label class="field"><span>Location</span><select name="locationId">${locationOptions(d.locationId)}</select></label>` : ""}
    ${d.kind === "lesson" ? html`<label class="check"><input type="checkbox" name="shareWithParents" ${attr(d.shareWithParents, "checked")}><span>Share the on-screen parts with parents</span></label>` : ""}
    <div class="btns"><button class="btn">Save</button><button type="button" class="btn danger" data-act="doc-delete" data-id="${d.id}">Delete</button></div></form>`);
};
Forms["doc-details"] = (d, f) => {
  if (!d.title) return formError(f, "Give it a title.");
  if (d.passage && !parseRef(d.passage)) return formError(f, "That passage doesn't look like a Bible reference.");
  const doc = S.get("docs", d.id);
  Object.assign(doc, { title: d.title, passage: d.passage ? refLabel(parseRef(d.passage)) : "", topic: d.topic, date: d.date || doc.date, time: d.time, ...(doc.kind === "sermon" ? { locationId: d.locationId || null } : {}), ...(doc.kind === "lesson" ? { shareWithParents: !!d.shareWithParents } : {}) });
  touch(doc); closeSheet(); render();
};
Actions["doc-delete"] = (el) => { const d = S.get("docs", el.dataset.id); S.remove("docs", d.id); closeSheet(true); toast("Deleted"); go(`docs-${d.kind}`); };

// ---------- Presenter page: every block in order, with slide numbers and private notes ----------
Screens.resource = (id) => {
  const d = S.get("docs", id);
  if (!d || !canEditDoc(d) && !S.can("present")) return { redirect: "ministry" };
  let slide = 0;
  const text = [`${d.title}${d.passage ? ` (${d.passage})` : ""}`, d.resource ? `\nNotes: ${d.resource}` : "", ...d.blocks.map((b) => {
    const shown = b.show && b.type !== "note"; if (shown) slide++;
    const body = b.type === "scripture" ? `${b.ref}: ${b.text}` : b.type === "action" ? `${b.label}: ${b.text}` : b.type === "text" ? `${b.title} ${b.text}` : b.type === "media" ? b.caption || b.url || "Media" : b.text;
    return `\n[${shown ? `Slide ${slide}` : "Private"}] ${BLOCKS[b.type].label}: ${body}${b.notes ? `\n  Notes: ${b.notes}` : ""}`;
  })].join("\n");
  slide = 0;
  return {
    title: "Presenter page", back: canEditDoc(d) ? `build-${d.id}` : "services",
    body: html`<h1 style="margin-top:16px">${d.title}</h1><p class="muted">${[d.passage, `${fmtDay(fromIsoDay(d.date))}${d.time ? ` at ${timeLabel(d.time)}` : ""}`].filter(Boolean).join(". ")}</p>
      <div class="btns"><a class="btn sm" href="#present-doc-${d.id}">${icon("screen")}Present</a><button class="btn ghost sm" data-act="copy" data-done="Presenter page copied" data-text="${text}">${icon("copy")}Copy as text</button></div>
      <label class="field"><span>Resource notes</span><textarea class="notes" style="min-height:110px" data-input="doc-resource" data-id="${d.id}" ${attr(!canEditDoc(d), "readonly")} placeholder="Reminders, timing, illustrations, people to thank...">${d.resource || ""}</textarea></label>
      <ol class="resource">${d.blocks.map((b) => {
        const shown = b.show && b.type !== "note"; if (shown) slide++;
        return html`<li class="${shown ? "" : "private"}"><div class="res-k">${shown ? `Slide ${slide}` : "Private"} <span class="faint">${BLOCKS[b.type].label}</span></div>
          <div class="res-body">${b.type === "scripture" ? html`<b class="scripture">${b.ref}</b> ${b.text}` : b.type === "media" ? html`${b.image ? html`<img class="thumb" src="${b.image}" alt="">` : ""}${b.caption || b.url}` : b.type === "action" ? html`<b>${b.label}:</b> ${b.text}${b.target ? html` <span class="faint">(QR to #${b.target})</span>` : ""}` : b.type === "text" ? html`<b>${b.title}</b> ${b.text}` : b.text}</div>
          ${b.notes ? html`<div class="block-notes">${icon("lock")}<span>${b.notes}</span></div>` : ""}</li>`;
      })}</ol>`,
  };
};
let resTimer = 0;
Inputs["doc-resource"] = (el) => { clearTimeout(resTimer); resTimer = setTimeout(() => { const d = S.get("docs", el.dataset.id); d.resource = el.value; touch(d); }, 400); };

// ---------- Members' view: the on-screen parts of a published sermon, lesson or study ----------
Screens.outline = (id) => {
  const d = S.get("docs", id);
  if (!d || (!d.published && !canEditDoc(d))) return { redirect: "home" };
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  const blocks = d.blocks.filter((b) => b.show && b.type !== "note");
  return {
    title: d.title, back: g ? `gathering-${g.id}` : "word",
    body: html`<p style="margin:16px 0 4px"><span class="tag brand">${DOC_KINDS[d.kind].label}</span>${g ? html` <span class="tag">${g.name}</span>` : ""}</p><h1>${d.title}</h1>
      <p class="muted">${[d.passage, fmtDay(fromIsoDay(d.date))].filter(Boolean).join(", ")}</p>
      <div class="btns">${listenBtn(`doc:${d.id}`)}${canEditDoc(d) ? html`<a class="btn ghost sm" href="#build-${d.id}">${icon("edit")}Edit</a>` : ""}</div>
      <div class="outline-view">${blocks.map((b) => {
        switch (b.type) {
          case "scripture": return html`<blockquote class="scripture-block"><p>${b.text || ""}</p><cite>${b.ref} ${b.translation || ""}</cite></blockquote>`;
          case "keynote": return html`<p class="keynote">${b.text}</p>`;
          case "point": return html`<p class="point">${b.text}</p>`;
          case "question": return html`<p class="question">${icon("ask")}<span>${b.text}</span></p>`;
          case "text": return html`<section>${b.title ? html`<h3>${b.title}</h3>` : ""}<p class="pre">${b.text}</p></section>`;
          case "media": return html`<figure>${b.image ? html`<img src="${b.image}" alt="${b.caption || ""}">` : ""}${b.url ? html`<p>${ext(b.url, b.caption || "Watch", "btn ghost sm", "play")}</p>` : b.caption ? html`<figcaption class="faint">${b.caption}</figcaption>` : ""}</figure>`;
          case "action": return b.target ? html`<p><a class="btn ghost sm" href="#${b.target}">${icon("chev")}${b.text || b.label}</a></p>` : html`<p class="point">${b.label}${b.text ? `: ${b.text}` : ""}</p>`;
          default: return "";
        }
      })}</div>
      ${d.passage ? veritasPanel(d.passage, d.topic) : ""}`,
  };
};
