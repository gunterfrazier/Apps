// ---------- New lesson: "Start from", searchable ----------
// Instead of a blind list, the teacher searches everything a new lesson can start from (a blank page, the church's
// saved layouts and, for lessons, the Family Library stories) and sees up front what each one brings: which age
// editions there are, a full timed lesson, a video that plays on the screen, a craft and a game. Picking a story goes
// straight to its lesson plan, where they choose the edition, the length and the parts.

const BLOCK_WORD = { scripture: "Scripture", point: "point", text: "text", question: "question", media: "media", song: "song", action: "action" };
function startFromOptions(kind, q, age) {
  const n = norm(q).trim();
  const layouts = S.list("layouts").filter((l) => l.kind === kind && (!n || norm(l.name).includes(n))).sort((a, b) => a.name.localeCompare(b.name));
  const storiesOn = kind === "lesson" && S.on("storylessons");
  const stories = storiesOn && familyLib ? searchStories(q) : [];
  const word = DOC_KINDS[kind].label.toLowerCase();
  const opt = (value, title, sub, badges, pic) => html`<button type="button" class="sf-opt" data-act="sf-pick" data-value="${value}" data-title="${title}" aria-pressed="false">
    ${pic === undefined ? "" : pic ? html`<img src="${pic}" alt="" loading="lazy" decoding="async">` : html`<span class="sf-ic">${icon("book")}</span>`}
    <span class="sf-body"><b>${title}</b>${sub ? html`<span class="faint">${sub}</span>` : ""}${badges?.length ? html`<span class="sf-badges">${badges}</span>` : ""}</span></button>`;
  const badge = (text, cls = "", ic, title) => html`<span class="sf-badge ${cls}" ${title ? raw(`title="${esc(title)}"`) : ""}>${ic ? icon(ic) : ""}${text}</span>`;
  const storyOpt = (s, fits = true) => {
    const ages = FAMILY_AGES.filter(([a]) => s.editions[a]);
    const playable = s.videos.some((v) => mediaFromLink(v.url, "video")?.type === "frame");
    return opt(`story:${s.id}`, s.title, `${s.reference}, ${s.topic}`, [
      badge("Full lesson", "", "check"),
      ...ages.map(([a, label]) => badge(label, a === age ? "mine" : "", "", a === age ? "The edition for this class" : "")),
      s.videos.length ? badge(playable ? "Video plays on screen" : "Video link", "", "play") : badge("No video", "off"),
      s.craft ? badge("Craft") : "", s.game ? badge("Game") : "",
      typeof storyBgSet === "function" && storyBgSet(s.id) ? badge("Story pictures", "", "image") : "",
    ], storyPic(s, fits ? age : closestEdition(s, age)));
  };
  // Stories written for the class's age group come first; the rest follow a divider that says so. They can still be
  // used: the lesson uses the edition closest to the class's ages.
  const fit = stories.filter((s) => s.editions[age]), other = stories.filter((s) => !s.editions[age]);
  const ageLabel = (FAMILY_AGES.find(([a]) => a === age) || [, ""])[1];
  const blank = !n || norm(`blank ${word}`).includes(n);
  return html`
    ${blank ? opt("", `A blank ${word}`, "Start with an empty page and add blocks yourself.") : ""}
    ${layouts.length ? html`<p class="sf-head">Your layouts</p>${layouts.map((l) => opt(`layout:${l.id}`, l.name, plural((l.items || []).length, "part")))}` : ""}
    ${storiesOn ? html`<p class="sf-head">Family Library stories${familyLib ? html` <span class="faint">${stories.length}</span>` : ""}</p>
      ${familyLibFailed ? html`<p class="faint">The Family Library couldn't load. Check your connection and reopen this.</p>`
        : !familyLib ? html`<p class="faint">Loading stories…</p>`
        : stories.length ? html`${fit.map((s) => storyOpt(s))}
          ${other.length ? html`<div class="sf-divider" role="separator">${icon("info")}<span><b>Not written for ${ageLabel.replace("Ages", "ages")}</b>, this class's age group. You can still use them; the lesson uses the closest age edition, so check it fits.</span></div>${other.map((s) => storyOpt(s, false))}` : ""}`
        : html`<p class="faint">No stories match “${q}”. Try a person like Moses, a place like Jericho, or a passage like Luke 15.</p>`}` : ""}
    ${!blank && !layouts.length && !storiesOn ? html`<p class="faint">Nothing matches “${q}”.</p>` : ""}`;
}
function startFromRefresh(form) {
  const box = form?.querySelector(".sf-list"); if (!box) return;
  const g = S.get("gatherings", form.elements.gatheringId?.value || "");
  box.innerHTML = flat(startFromOptions(form.elements.kind.value, form.elements.sfq.value, classAge(g)));
  const chosen = form.elements.from.value;
  box.querySelectorAll(".sf-opt").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === chosen)));
}
/** The "Start from" field for the New lesson / sermon / study sheet. */
function startFromField(kind, selected = "") {
  const k = DOC_KINDS[kind];
  if (kind === "lesson" && S.on("storylessons")) loadFamilyLib()?.then(() => startFromRefresh($(".sf-list")?.closest("form")));
  const sel = selected ? `layout:${selected}` : "", l = selected && S.get("layouts", selected);
  return html`<div class="field sf"><span>Start from</span><input type="hidden" name="from" value="${sel}">
    <div class="sf-chosen" aria-live="polite">${icon("check")}<span>${l ? l.name : `A blank ${k.label.toLowerCase()}`}</span></div>
    <input type="search" name="sfq" placeholder="${kind === "lesson" && S.on("storylessons") ? "Search stories, people, passages or layouts" : "Search your layouts"}" data-input="sf-search" autocomplete="off" aria-label="Search what to start from">
    <div class="sf-list"></div></div>`;
}
let sfTimer;
Inputs["sf-search"] = (el) => { clearTimeout(sfTimer); sfTimer = setTimeout(() => startFromRefresh(el.form), 100); };
Actions["sf-pick"] = (el) => {
  const form = el.closest("form"); form.elements.from.value = el.dataset.value;
  form.querySelector(".sf-chosen span").textContent = el.dataset.title;
  form.querySelectorAll(".sf-opt").forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
  // A story names the lesson and sets its passage unless the teacher already typed them.
  const s = el.dataset.value.startsWith("story:") && familyLib?.stories.find((x) => x.id === el.dataset.value.slice(6));
  if (form.elements.title) form.elements.title.placeholder = s ? s.title : form.classList.contains("new-lesson") ? "What's this lesson called?" : "";
  if (form.elements.passage) form.elements.passage.placeholder = s ? s.reference : "John 15:1-8";
  // New lesson: a library story brings its own title, passage and every part; a blank lesson or layout asks for a title.
  const note = form.querySelector(".sf-story-note"), details = form.querySelector(".sf-details");
  if (note && details) {
    note.hidden = !s; details.hidden = Boolean(s);
    if (s) note.querySelector("span").innerHTML = `<b>${esc(s.title)}</b> (${esc(s.reference)}) builds the whole lesson: the story, Scripture, video, questions, craft, coloring page, prayer and the family page. You can change any of it after.`;
    else if (!form.elements.title.value) form.elements.title.focus({ preventScroll: true });
  }
};
// Enter in the search picks the first match rather than creating the lesson.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.name !== "sfq") return;
  e.preventDefault(); e.target.form.querySelector(".sf-opt")?.click();
});
