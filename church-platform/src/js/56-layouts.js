// ---------- Named layouts, saving all or part of a segment or block, and drag-to-reorder ----------
// A layout is a named, reusable order of segments (for service plans) or blocks (for the sermon, lesson and study builders).
// When saving a layout or a single segment, each item can keep everything, keep only some sections
// (song verses, Bible verses, paragraphs, sermon items, parts of a graphic), or keep just the empty slot.

const LAYOUT_KINDS = {
  service: { label: "Service layouts", one: "service", perm: "services.plan", back: "services", items: "segments" },
  sermon: { label: "Sermon layouts", one: "sermon", perm: "build.sermons", back: "docs-sermon", items: "items" },
  lesson: { label: "Lesson layouts", one: "lesson", perm: "build.lessons", back: "docs-lesson", items: "items" },
  study: { label: "Study guide layouts", one: "study guide", perm: "build.studies", back: "docs-study", items: "items" },
};
const short = (t, n) => { t = String(t || ""); return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, "")}...` : t; };
const paras = (t) => String(t || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const verseNum = (v) => v.match(/^(\d+)\s/)?.[1] || "";
/** Each section of a song once, in the order it's first sung. */
function songOrderLabels(song) {
  const seen = new Set();
  return songOrder(song).filter((l) => !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()));
}
function blockText(b) { return b.type === "scripture" ? b.ref || "" : b.type === "media" ? b.caption || b.url || "Picture" : b.type === "action" ? `${b.label || "Cue"}${b.text ? `: ${b.text}` : ""}` : b.type === "text" ? b.title || b.text || "" : b.text || ""; }
/** The kind of content an item holds: song, scripture, text, sermon, media, action, or nothing to split. */
function contentKind(item, isBlock) { return isBlock ? ({ scripture: "scripture", text: "text", media: "media", action: "action" })[item.type] || "single" : SEGMENT_TYPES[item.type]?.content || "text"; }

/** Sections an item can be split into when saving part of it. */
function contentSections(item, isBlock) {
  const k = contentKind(item, isBlock), c = isBlock ? item : item.content || {};
  if (k === "song") { const song = S.get("songs", c.songId); if (!song) return []; const keep = c.sections?.length ? c.sections : songOrderLabels(song); return keep.map((l) => ({ key: l, label: l })); }
  if (k === "scripture") return splitVerses(c.text).map((v) => ({ key: verseNum(v), label: `Verse ${verseNum(v)}: ${short(v.replace(/^\d+\s/, ""), 70)}` })).filter((x) => x.key);
  if (k === "text") return paras(c.text).map((p, i) => ({ key: String(i), label: short(p, 80) }));
  if (k === "sermon") { const blocks = c.blocks || S.get("docs", c.docId)?.blocks || []; return blocks.map((b) => ({ key: b.id, label: `${BLOCKS[b.type].label}${b.show && b.type !== "note" ? "" : " (private)"}: ${blockText(b).slice(0, 60)}` })); }
  if (k === "media") return [["image", "Picture"], ["url", "Video link"], ["caption", "Caption"]].filter(([f]) => c[f]).map(([key, label]) => ({ key, label }));
  if (k === "action") return [["label", "Cue name"], ["text", "What happens"], ["target", "QR code"]].filter(([f]) => c[f]).map(([key, label]) => ({ key, label }));
  return [];
}
function refForVerses(ref, nums) {
  const r = parseRef(ref); if (!r || !nums.length) return ref;
  const ns = nums.map(Number).sort((a, b) => a - b), ranges = [];
  ns.forEach((n) => { const last = ranges[ranges.length - 1]; if (last && n === last[1] + 1) last[1] = n; else ranges.push([n, n]); });
  return `${refLabel({ book: r.book, chapter: r.chapter })}:${ranges.map(([a, b]) => a === b ? a : `${a}-${b}`).join(", ")}`;
}
/** A copy of an item keeping everything ("all"), some sections ("some", with keys), or just the empty slot ("empty"). */
function trimItem(item, isBlock, mode, keys = [], { leader = true, notes = true } = {}) {
  const copy = JSON.parse(JSON.stringify(item)); copy.id = uid();
  const k = contentKind(item, isBlock), c = isBlock ? copy : (copy.content ||= {});
  if (!notes) copy.notes = "";
  if (!isBlock && !leader) copy.leader = "";
  if (mode === "empty") {
    if (isBlock) { ["ref", "text", "title", "image", "url", "caption", "target"].forEach((f) => { if (f in copy) copy[f] = ""; }); }
    else copy.content = k === "scripture" ? { translation: c.translation || "BSB" } : {};
    return copy;
  }
  if (mode !== "some") return copy;
  const set = new Set(keys);
  if (k === "song") { const song = S.get("songs", c.songId); c.sections = song ? (c.sections?.length ? c.sections : songOrderLabels(song)).filter((l) => set.has(l)) : []; }
  if (k === "scripture") { const vs = splitVerses(c.text).filter((v) => set.has(verseNum(v))); c.ref = refForVerses(c.ref, vs.map(verseNum)); c.text = vs.join(" "); }
  if (k === "text") c.text = paras(c.text).filter((_, i) => set.has(String(i))).join("\n\n");
  if (k === "sermon") { const d = S.get("docs", c.docId); c.blocks = (c.blocks || d?.blocks || []).filter((b) => set.has(b.id)).map((b) => ({ ...JSON.parse(JSON.stringify(b)), id: uid() })); c.title = c.title || d?.title || copy.title; }
  if (k === "media" || k === "action") ["image", "url", "caption", "label", "text", "target"].forEach((f) => { if (f in c && !set.has(f)) c[f] = ""; });
  return copy;
}

/** Radio buttons for everything / some sections / empty slot (/ leave out), with section checkboxes. */
function partsPicker(prefix, item, isBlock, { skip = false } = {}) {
  const secs = contentSections(item, isBlock);
  const k = contentKind(item, isBlock);
  return html`<div class="parts">
    <div class="radios">
      <label><input type="radio" name="${prefix}mode" value="all" checked data-change="parts-mode"><span>Everything</span></label>
      ${secs.length > 1 ? html`<label><input type="radio" name="${prefix}mode" value="some" data-change="parts-mode"><span>Choose ${k === "song" ? "verses" : k === "scripture" ? "Bible verses" : k === "sermon" ? "items" : "parts"}</span></label>` : ""}
      ${k !== "single" || isBlock ? html`<label><input type="radio" name="${prefix}mode" value="empty" data-change="parts-mode"><span>${isBlock ? "Empty placeholder" : "Just the slot"}</span></label>` : ""}
      ${skip ? html`<label><input type="radio" name="${prefix}mode" value="skip" data-change="parts-mode"><span>Leave out</span></label>` : ""}
    </div>
    ${secs.length > 1 ? html`<div class="part-list" hidden>${secs.map((s) => html`<label class="check"><input type="checkbox" name="${prefix}keys" value="${s.key}" checked><span>${s.label}</span></label>`)}</div>` : ""}
  </div>`;
}
Inputs["parts-mode"] = (el) => { const list = $(".part-list", el.closest(".parts")); if (list) list.hidden = el.value !== "some"; };

// ----- Save one segment or block for reuse -----
function sourceItem(kind, source, i) { return kind === "segment" ? S.get("services", source)?.segments[i] : S.get("docs", source)?.blocks[i]; }
Actions["item-save"] = (el) => {
  const kind = el.dataset.kind, item = sourceItem(kind, el.dataset.source, +el.dataset.i), isBlock = kind === "block";
  openSheet(isBlock ? "Save this item for reuse" : "Save this segment for reuse", html`<form data-form="item-save" novalidate>
    <input type="hidden" name="kind" value="${kind}"><input type="hidden" name="source" value="${el.dataset.source}"><input type="hidden" name="i" value="${el.dataset.i}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${isBlock ? `${BLOCKS[item.type].label}: ${blockText(item).slice(0, 40)}` : item.title}" required maxlength="60"><small>Shown in your ${isBlock ? "saved items" : "saved segments"} list.</small></label>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">What to keep</legend>${partsPicker("p_", item, isBlock)}</fieldset>
    ${!isBlock ? html`<label class="check"><input type="checkbox" name="leader" checked><span>Who leads it${item.leader ? ` (${item.leader})` : ""}</span></label>` : ""}
    <label class="check"><input type="checkbox" name="notes" checked><span>${isBlock ? "Speaker notes" : "Notes for the team"}</span></label>
    <button class="btn block">Save</button></form>`, { wide: true });
};
Forms["item-save"] = (d, f, fd) => {
  if (!d.name) return formError(f, "Give it a name.");
  const isBlock = d.kind === "block", item = sourceItem(d.kind, d.source, +d.i);
  const keys = fd.getAll("p_keys");
  if (d.p_mode === "some" && !keys.length) return formError(f, "Choose at least one section, or keep everything.");
  const copy = trimItem(item, isBlock, d.p_mode, keys, { leader: !!d.leader, notes: !!d.notes });
  if (isBlock) S.add("savedBlocks", { name: d.name, kind: S.get("docs", d.source).kind, block: copy, at: new Date().toISOString() });
  else { delete copy.id; S.add("library", { ...copy, name: d.name }); }
  closeSheet(); toast(`Saved "${d.name}"`);
};

// ----- Save a whole layout -----
function layoutSource(kind, id) { const isDoc = kind !== "service"; const src = isDoc ? S.get("docs", id) : S.get("services", id); return { src, isDoc, items: isDoc ? src.blocks : src.segments }; }
Actions["layout-save"] = (el) => {
  const { src, isDoc, items } = layoutSource(el.dataset.kind, el.dataset.id);
  const kind = isDoc ? src.kind : "service";
  const existing = S.list("layouts").filter((l) => l.kind === kind);
  openSheet("Save as a layout", html`<form data-form="layout-save" novalidate><input type="hidden" name="kind" value="${el.dataset.kind}"><input type="hidden" name="id" value="${src.id}">
    <label class="field"><span>Layout name</span><input type="text" name="name" required maxlength="60" placeholder="${isDoc ? "Three-point sermon" : "Communion Sunday"}" list="layout-names"><datalist id="layout-names">${existing.map((l) => html`<option value="${l.name}">`)}</datalist>
      <small>${existing.length ? "Use an existing name to update that layout." : `Start new ${LAYOUT_KINDS[kind].one}s from it later.`}</small></label>
    <h3 style="margin-top:16px">${isDoc ? "Items" : "Segments"}, in order</h3>
    <p class="faint" style="margin-top:2px">For each one, keep everything, only some sections, just an empty slot to fill in later, or leave it out.</p>
    <div class="layout-items">${items.map((it, i) => html`<div class="layout-item"><b>${i + 1}. ${isDoc ? `${BLOCKS[it.type].label}: ${blockText(it).slice(0, 50) || "(empty)"}` : it.title}</b>${!isDoc ? html` <span class="faint">${SEGMENT_TYPES[it.type]?.label}, ${it.minutes} min</span>` : ""}
      ${partsPicker(`i${i}_`, it, isDoc, { skip: true })}</div>`)}</div>
    ${!isDoc ? html`<label class="check"><input type="checkbox" name="leader" checked><span>Keep who leads each segment</span></label>` : ""}
    <label class="check"><input type="checkbox" name="notes" checked><span>${isDoc ? "Keep speaker notes" : "Keep team notes"}</span></label>
    <button class="btn block">Save layout</button></form>`, { wide: true });
};
Forms["layout-save"] = (d, f, fd) => {
  if (!d.name) return formError(f, "Name the layout.");
  const { src, isDoc, items } = layoutSource(d.kind, d.id);
  const kind = isDoc ? src.kind : "service";
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const mode = d[`i${i}_mode`] || "all";
    if (mode === "skip") continue;
    const keys = fd.getAll(`i${i}_keys`);
    out.push(trimItem(items[i], isDoc, mode === "some" && !keys.length ? "empty" : mode, keys, { leader: !!d.leader, notes: !!d.notes }));
  }
  if (!out.length) return formError(f, "Keep at least one item.");
  const same = S.list("layouts").find((l) => l.kind === kind && l.name.toLowerCase() === d.name.toLowerCase());
  const rec = { kind, name: d.name, items: out, updated: new Date().toISOString(), authorId: S.me().id };
  if (same) S.update("layouts", same.id, rec); else S.add("layouts", rec);
  closeSheet(); toast(same ? `Layout "${d.name}" updated` : `Layout "${d.name}" saved`);
};

// ----- Layout lists -----
const canLayouts = (kind) => S.isMember() && S.can(LAYOUT_KINDS[kind].perm);
const layoutItemLabel = (kind, it) => kind === "service" ? `${it.title} (${SEGMENT_TYPES[it.type]?.label}, ${it.minutes} min)${Object.keys(it.content || {}).filter((k) => k !== "translation").length ? "" : ", slot only"}` : `${BLOCKS[it.type].label}: ${blockText(it) || "empty placeholder"}`;
Screens.layouts = (kind) => {
  const k = LAYOUT_KINDS[kind];
  if (!k || !canLayouts(kind)) return { redirect: "ministry" };
  const list = S.list("layouts").filter((l) => l.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: k.label, back: k.back,
    body: html`<p class="muted" style="margin-top:16px">${kind === "service" ? "Named orders of service you can start any plan from. Save one from a service plan with Save as layout." : `Named outlines you can start any ${k.one} from. Save one from the builder with Save as layout.`}</p>
      <div class="rows">${list.length ? list.map((l) => html`<button class="row" data-act="layout-open" data-id="${l.id}"><span class="lead-ic">${icon("layers")}</span><span class="body"><span class="t">${l.name}</span>
        <span class="s">${plural(l.items.length, kind === "service" ? "segment" : "item")}${kind === "service" ? `, ${l.items.reduce((n, s) => n + (+s.minutes || 0), 0)} min` : ""}, updated ${ago(l.updated)}</span></span>${icon("chev")}</button>`) : empty("No layouts yet.")}</div>`,
  };
};
Actions["layout-open"] = (el) => {
  const l = S.get("layouts", el.dataset.id);
  openSheet(l.name, html`<form data-form="layout-rename" novalidate><input type="hidden" name="id" value="${l.id}">
    <label class="field" style="margin-top:0"><span>Name</span><div style="display:flex;gap:8px"><input type="text" name="name" value="${l.name}" maxlength="60" required><button class="btn ghost">Rename</button></div></label></form>
    <ol class="layout-preview">${l.items.map((it) => html`<li>${layoutItemLabel(l.kind, it)}</li>`)}</ol>
    <div class="btns">${l.kind === "service" ? html`<button class="btn" data-act="plan-new" data-layout="${l.id}">${icon("plus")}New service from this layout</button>`
      : html`<button class="btn" data-act="new-doc" data-kind="${l.kind}" data-layout="${l.id}">${icon("plus")}New ${LAYOUT_KINDS[l.kind].one} from this layout</button>`}
      <button class="btn danger" data-act="layout-delete" data-id="${l.id}">Delete</button></div>`, { wide: true });
};
Forms["layout-rename"] = (d, f) => {
  if (!d.name) return formError(f, "Enter a name.");
  const l = S.get("layouts", d.id);
  if (S.list("layouts").some((x) => x.id !== l.id && x.kind === l.kind && x.name.toLowerCase() === d.name.toLowerCase())) return formError(f, "Another layout already has that name.");
  S.update("layouts", d.id, { name: d.name, updated: new Date().toISOString() }); closeSheet(); toast("Renamed"); render();
};
Actions["layout-delete"] = (el) => { S.remove("layouts", el.dataset.id); closeSheet(); toast("Layout deleted"); render(); };
const layoutCopy = (l) => l.items.map((it) => ({ ...JSON.parse(JSON.stringify(it)), id: uid() }));
function layoutOptions(kind, selected) {
  const list = S.list("layouts").filter((l) => l.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
  return list.length ? html`<optgroup label="Layouts">${list.map((l) => html`<option value="layout:${l.id}" ${attr(l.id === selected, "selected")}>${l.name}</option>`)}</optgroup>` : "";
}
// Add a layout's segments or items to the end of what's already there.
Actions["layout-insert"] = (el) => {
  const kind = el.dataset.kind, list = S.list("layouts").filter((l) => l.kind === kind);
  openSheet("Add from a layout", html`<div class="rows">${list.map((l) => html`<button class="row" data-act="layout-insert-go" data-layout="${l.id}" data-target="${el.dataset.id}"><span class="lead-ic">${icon("layers")}</span><span class="body"><span class="t">${l.name}</span><span class="s">${plural(l.items.length, kind === "service" ? "segment" : "item")}</span></span>${icon("plus")}</button>`)}</div>
    <p class="faint">Its ${kind === "service" ? "segments are" : "items are"} added after what's already here.</p>`);
};
Actions["layout-insert-go"] = (el) => {
  const l = S.get("layouts", el.dataset.layout);
  if (l.kind === "service") S.get("services", el.dataset.target).segments.push(...layoutCopy(l));
  else { const d = S.get("docs", el.dataset.target); d.blocks.push(...layoutCopy(l)); d.updated = new Date().toISOString(); }
  S.save(); closeSheet(); toast(`Added "${l.name}"`); render();
};

// ----- Saved builder items -----
Actions["saved-blocks"] = (el) => {
  const d = S.get("docs", el.dataset.doc), list = S.list("savedBlocks").sort((a, b) => (a.kind === d.kind ? 0 : 1) - (b.kind === d.kind ? 0 : 1) || a.name.localeCompare(b.name));
  openSheet("Saved items", html`<div class="rows">${list.map((s) => html`<div class="row"><span class="lead-ic">${icon(BLOCKS[s.block.type].icon)}</span><button class="body link-row" data-act="saved-block-add" data-doc="${d.id}" data-id="${s.id}"><span class="t">${s.name}</span><span class="s">${BLOCKS[s.block.type].label}, from a ${DOC_KINDS[s.kind]?.label.toLowerCase() || "document"}</span></button>
    <button class="icon-btn" data-act="saved-block-delete" data-doc="${d.id}" data-id="${s.id}" aria-label="Delete ${s.name}">${icon("trash")}</button></div>`)}</div>`);
};
Actions["saved-block-add"] = (el) => {
  const d = S.get("docs", el.dataset.doc), s = S.get("savedBlocks", el.dataset.id);
  d.blocks.push({ ...JSON.parse(JSON.stringify(s.block)), id: uid() }); d.updated = new Date().toISOString();
  S.save(); closeSheet(); toast(`Added "${s.name}"`); render();
};
Actions["saved-block-delete"] = (el) => { S.remove("savedBlocks", el.dataset.id); Actions["saved-blocks"]({ dataset: { doc: el.dataset.doc } }); };

// ----- Reordering: drag the handle, use the arrows, or pick a position when editing -----
/** Moves an item in a list from one index to another. */
function moveItem(list, from, to) { if (from === to || to < 0 || to >= list.length) return false; const [x] = list.splice(from, 1); list.splice(to, 0, x); return true; }
function positionField(count, current) {
  return html`<label class="field"><span>Position</span><select name="_pos">${Array.from({ length: count }, (_, i) => html`<option value="${i}" ${attr(i === current, "selected")}>${i + 1} of ${count}${i === 0 ? " (first)" : i === count - 1 ? " (last)" : ""}</option>`)}</select></label>`;
}
/** Drag-to-reorder for a list whose children carry data-index and a [data-drag] handle. Works with mouse, pen and touch. */
function makeSortable(list, onMove) {
  if (!list) return;
  $$("[data-drag]", list).forEach((handle) => {
    handle.addEventListener("pointerdown", (e) => {
      const card = handle.closest("[data-index]"); if (!card) return;
      e.preventDefault(); handle.setPointerCapture(e.pointerId);
      const cards = $$(":scope > [data-index]", list), from = +card.dataset.index;
      const startY = e.clientY, startScroll = window.scrollY;
      const mids = cards.map((c) => { const r = c.getBoundingClientRect(); return r.top + window.scrollY + r.height / 2; });
      let to = from, scroller = 0, lastY = e.clientY;
      card.classList.add("dragging");
      const place = () => {
        const y = lastY + window.scrollY;
        card.style.transform = `translateY(${lastY - startY + window.scrollY - startScroll}px)`;
        let slot = mids.findIndex((m) => y < m); if (slot < 0) slot = cards.length;
        to = slot > from ? slot - 1 : slot;
        cards.forEach((c, i) => { c.classList.toggle("drop-before", i === slot && slot !== from && slot !== from + 1); c.classList.toggle("drop-after", slot === cards.length && i === cards.length - 1 && from !== cards.length - 1); });
      };
      const move = (ev) => {
        lastY = ev.clientY; place();
        clearInterval(scroller);
        const edge = ev.clientY < 90 ? -14 : ev.clientY > window.innerHeight - 140 ? 14 : 0;
        if (edge) scroller = setInterval(() => { window.scrollBy(0, edge); place(); }, 16);
      };
      const done = () => {
        clearInterval(scroller);
        handle.removeEventListener("pointermove", move);
        cards.forEach((c) => c.classList.remove("drop-before", "drop-after", "dragging"));
        card.style.transform = "";
        if (to !== from) onMove(from, to);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", done, { once: true });
      handle.addEventListener("pointercancel", done, { once: true });
    });
    // Keyboard: arrow keys on the handle move the item.
    handle.addEventListener("keydown", (e) => {
      const i = +handle.closest("[data-index]").dataset.index;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onMove(i, i + (e.key === "ArrowUp" ? -1 : 1), true); }
    });
  });
}
const dragHandle = (label) => html`<button type="button" class="drag-handle" data-drag aria-label="${label}. Drag, or use the arrow keys, to move it" title="Drag to reorder">${icon("grip")}</button>`;
