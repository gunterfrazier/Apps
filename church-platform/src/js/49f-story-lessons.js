// ---------- Start a lesson from a Bible story: the Veritas Logos Family Library ----------
// Teachers search for a story, person, place, passage or theme. Each Family Library story comes in three age editions
// (5–8, 9–12, 13–17) with scenes, questions, a quiz, a craft, a game, videos, a coloring page and publisher lessons.
// The class's ages pick the edition, the teacher picks 45 or 60 minutes, and the whole timed lesson (or only the
// pieces they want) becomes ordinary blocks they can edit. The data is exported by Veritas Logos
// (npm run family:export) and copied into this app's build as family-lib/.

let familyLib = null, familyLibLoading = null, familyLibFailed = false;
function loadFamilyLib() {
  if (familyLib || familyLibLoading) return familyLibLoading;
  familyLibLoading = fetch("family-lib/lessons.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { familyLib = d; render(); return d; })
    .catch(() => { familyLibFailed = true; familyLibLoading = null; render(); });
  return familyLibLoading;
}
const FAMILY_AGES = [["young", "Ages 5–8"], ["middle", "Ages 9–12"], ["teen", "Ages 13–17"]];
/** The Family Library edition that fits a class: preschool and early grades read the 5–8 edition. */
function classAge(g) {
  const lo = g?.ageMin, hi = g?.ageMax;
  if (lo == null && hi == null) return "young";
  if (lo != null && lo >= 13) return "teen"; // Youth and adult classes get the study edition.
  const mid = ((lo ?? hi) + (hi ?? lo)) / 2;
  return mid <= 8.5 ? "young" : mid <= 12.5 ? "middle" : "teen";
}
const famPic = (file) => (file ? `family-lib/${file}` : "");
const storyPic = (s, age) => famPic(age === "young" ? s.picture?.young : s.picture?.older);
const lessonLength = () => (prefs().lessonLength === 60 ? 60 : 45);

// ----- Search -----
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "");
/** Stories for a search: title, people, theme, scenes, passage or book. Best matches first. */
function searchStories(q) {
  const stories = familyLib?.stories || [];
  const n = norm(q).trim();
  if (!n) return stories;
  const ref = parseRef(q), words = n.split(/\s+/).filter((w) => w.length > 1);
  return stories.map((s) => {
    let score = 0;
    const title = norm(s.title), people = s.people.map(norm), hay = norm([s.topic, s.reference, s.reading, ...s.scenes, s.drawPrompt].join(" "));
    if (title.includes(n)) score += 10;
    if (people.some((p) => p === n || p.startsWith(n))) score += 8;
    if (ref) { const b = parseRef(s.reference)?.book, r2 = parseRef(s.reading)?.book; if (ref.book === b || ref.book === r2) score += ref.chapter && !norm(s.reference + " " + s.reading).includes(`${ref.chapter}`) ? 3 : 7; }
    for (const w of words) { if (title.includes(w)) score += 3; if (people.some((p) => p.includes(w))) score += 3; if (hay.includes(w)) score += 1; }
    return { s, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.s);
}
/** Bible people who match a search, for planning from a person's own passages. */
const searchPeople = (q) => {
  const n = norm(q).trim();
  if (n.length < 2) return [];
  return (familyLib?.people || []).filter((p) => norm(p.name).startsWith(n) || norm(p.name) === n).slice(0, 4);
};

let storyQuery = "";
Screens.storylesson = (docId) => {
  const d = S.get("docs", docId);
  if (!d || !canEditDoc(d)) return { redirect: "docs-lesson" };
  if (!familyLib && !familyLibFailed) loadFamilyLib();
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  return {
    title: "Start from a Bible story", back: `build-${d.id}`, tab: "connect",
    body: html`<p class="muted" style="margin-top:14px">Stories from the Veritas Logos Family Library, written for three age groups.${g ? html` Lessons for <b>${g.name}</b> start with the ${FAMILY_AGES.find(([a]) => a === classAge(g))[1].toLowerCase()} edition, and you can switch on any story.` : ""}</p>
      <label class="field"><span class="sr">Search stories</span><input type="search" id="story-q" placeholder="Search a person, story, place or passage" value="${storyQuery}" data-input="story-search" autocomplete="off"></label>
      <div id="story-results">${familyLibFailed ? html`<div class="panel"><p style="margin:0">The Family Library couldn't load. Check your connection and try again.</p><button class="btn ghost sm" data-act="story-retry" style="margin-top:10px">Try again</button></div>` : familyLib ? storyResults(d) : html`<p class="faint">Loading stories…</p>`}</div>`,
    after: () => { const i = $("#story-q"); if (i && !storyQuery) i.focus(); },
  };
};
Actions["story-retry"] = () => { familyLibFailed = false; loadFamilyLib(); render(); };
let storySearchTimer;
Inputs["story-search"] = (el) => {
  storyQuery = el.value;
  clearTimeout(storySearchTimer);
  storySearchTimer = setTimeout(() => { const box = $("#story-results"), d = S.get("docs", splitRoute().tail); if (box && d && familyLib) box.innerHTML = flat(storyResults(d)); }, 120);
};
function storyCard(s, d, age) {
  return html`<a class="story-card" href="#storyplan-${d.id}~${s.id}">
    ${s.picture ? html`<img src="${storyPic(s, age)}" alt="" loading="lazy" decoding="async">` : html`<span class="story-ph">${icon("book")}</span>`}
    <span class="story-body"><b>${s.title}</b><span>${s.reference}</span><span class="story-topic">${s.topic}</span></span></a>`;
}
function storyResults(d) {
  const g = d.gatheringId && S.get("gatherings", d.gatheringId), age = classAge(g);
  const q = storyQuery.trim(), list = searchStories(q), people = searchPeople(q);
  const extra = people.filter((p) => !list.some((s) => s.people.includes(p.name)) || !p.inStories);
  if (!q) {
    // No search yet: stories that fit the lesson's passage first, then everything by testament.
    const near = d.passage ? searchStories(d.passage).slice(0, 4) : [];
    return html`${near.length ? html`<section class="sec"><h2 class="sec-head">For ${d.passage}</h2><div class="story-grid">${near.map((s) => storyCard(s, d, age))}</div></section>` : ""}
      ${[["old", "Old Testament"], ["new", "New Testament"]].map(([t, label]) => html`<section class="sec"><h2 class="sec-head">${label}</h2><div class="story-grid">${list.filter((s) => s.testament === t).map((s) => storyCard(s, d, age))}</div></section>`)}`;
  }
  return html`${list.length ? html`<p class="faint" role="status">${list.length === 1 ? "1 story" : `${list.length} stories`}</p><div class="story-grid">${list.map((s) => storyCard(s, d, age))}</div>` : ""}
    ${extra.length ? html`<section class="sec"><h2 class="sec-head">${list.length ? "More about these people" : "People"}</h2><div class="rows">${extra.map((p) => html`
      <div class="row"><span class="lead-ic">${icon("user")}</span><span class="body"><span class="t">${p.name}</span><span class="s">${p.title}</span>
        <span class="chips" style="margin-top:6px">${p.passages.map((ref) => html`<button class="chip" data-act="story-passage" data-doc="${d.id}" data-ref="${ref}" title="Plan this lesson on ${ref}">${ref}</button>`)}
        ${S.on("veritas") ? html`<a class="chip" href="${veritasBase()}#person-${p.id}" target="_blank" rel="noopener">${icon("link")}Veritas Logos</a>` : ""}</span></span></div>`)}</div>
      <p class="faint">${list.length ? "" : "There isn't a Family Library story for this yet. "}Tap a passage to plan the lesson on it.</p></section>` : ""}
    ${!list.length && !extra.length ? html`<div class="panel"><p style="margin:0">No stories match “${q}”. Try a name like Moses, a place like Jericho, or a passage like Luke 15.</p></div>` : ""}`;
}
/** Plan on a person's passage: it becomes the lesson's main passage and first Scripture block. */
Actions["story-passage"] = async (el) => {
  const d = S.get("docs", el.dataset.doc), ref = refLabel(parseRef(el.dataset.ref));
  if (!d) return;
  d.passage = ref;
  let b = d.blocks.find((x) => x.type === "scripture" && !x.text);
  if (b) b.ref = ref; else d.blocks.unshift((b = { id: uid(), type: "scripture", ref, translation: "BSB", text: "", show: true, notes: "" }));
  d.updated = new Date().toISOString(); S.save();
  toast(`${ref} is this lesson's passage`); go(`build-${d.id}`);
  await fillScripture(b).catch(() => {}); S.save(); render();
};

// ----- One story: its timed plan, ages, length and pieces -----
const storyPlanState = {};
/** The timed parts of a lesson. The welcome game, story, talk and prayer always fit; video and review when there's time. */
function storyPlan(s, age, len) {
  const video = s.videos.length > 0, craft = !!s.craft;
  const t = len === 60 ? { game: 8, story: 12, video: 6, talk: 10, craft: 15, review: 4, pray: 5 } : { game: 5, story: 10, video: 5, talk: 8, craft: 12, review: 0, pray: 5 };
  if (!video) { t.talk += t.video; t.video = 0; }
  if (!craft) { t.review += t.craft; t.craft = 0; }
  const game = s.game?.[age] || s.game?.young;
  return [
    ["game", age === "teen" ? "Opener" : "Welcome game", t.game, game?.title || "Get talking"],
    ["story", age === "teen" ? "Read and study" : "The story", t.story, `${s.scenes.length} scenes${age === "teen" ? " and the passage" : ", read aloud"}`],
    ["video", "Watch", t.video, s.videos[0]?.title],
    ["talk", "Talk about it", t.talk, "Questions and a quick quiz"],
    ["craft", age === "teen" ? "Activity" : "Craft", t.craft, s.craft?.title],
    ["review", age === "young" ? "Color and review" : "Review", t.review, age === "young" ? "The coloring page" : "Draw or retell the story"],
    ["pray", "Pray and take home", t.pray, "A prayer, and a page for parents"],
  ].filter((p) => p[2] > 0);
}
Screens.storyplan = (arg) => {
  const [docId, storyId] = String(arg).split("~");
  const d = S.get("docs", docId);
  if (!d || !canEditDoc(d)) return { redirect: "docs-lesson" };
  if (!familyLib) { if (!familyLibFailed) loadFamilyLib(); return { title: "Bible story", back: `storylesson-${docId}`, body: html`<p class="faint" style="margin-top:16px">${familyLibFailed ? "The Family Library couldn't load." : "Loading…"}</p>` }; }
  const s = familyLib.stories.find((x) => x.id === storyId);
  if (!s) return { redirect: `storylesson-${docId}` };
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  const st = (storyPlanState[d.id + s.id] ||= { age: classAge(g), len: lessonLength() });
  const ed = s.editions[st.age] || s.editions.young, plan = storyPlan(s, st.age, st.len);
  const hasWork = d.blocks.some((b) => b.type !== "scripture" || b.text);
  const res = s.resources[st.age] || [];
  const piece = (key, label, sub, on = true) => html`<label class="check"><input type="checkbox" name="piece" value="${key}" ${attr(on, "checked")}><span><b>${label}</b>${sub ? html`<br><small class="faint">${sub}</small>` : ""}</span></label>`;
  return {
    title: s.title, back: `storylesson-${d.id}`, tab: "connect",
    body: html`
      <div class="media-hero" style="aspect-ratio:4/3">${s.picture ? html`<img src="${storyPic(s, st.age)}" alt="${s.picture.alt}">` : ""}
        <div class="mh-body" style="padding-right:18px"><span class="mh-k">${s.testament === "old" ? "Old Testament" : "New Testament"} · ${s.topic}</span><span class="mh-title">${s.title}</span><span class="mh-meta">${s.reference}${s.people.length ? ` · ${s.people.slice(0, 4).join(", ")}` : ""}</span></div></div>
      <div class="seg" role="group" aria-label="Age group" style="margin-top:14px">${FAMILY_AGES.map(([a, l]) => html`<button type="button" data-act="story-age" data-key="${d.id + s.id}" data-age="${a}" aria-pressed="${st.age === a}">${l}</button>`)}</div>
      <div class="seg" role="group" aria-label="Lesson length" style="margin-top:8px">${[45, 60].map((m) => html`<button type="button" data-act="story-len" data-key="${d.id + s.id}" data-len="${m}" aria-pressed="${st.len === m}">${m} minutes</button>`)}</div>
      ${g && st.age !== classAge(g) ? html`<p class="faint">${g.name} usually gets ${FAMILY_AGES.find(([a]) => a === classAge(g))[1].toLowerCase()}.</p>` : ""}

      <section class="sec"><h2 class="sec-head">The ${st.len}-minute lesson</h2>
        <ol class="plan-list">${plan.map(([, label, min, sub]) => html`<li><span class="plan-min">${min} min</span><span><b>${label}</b>${sub ? html`<small>${sub}</small>` : ""}</span></li>`)}</ol>
        <details class="panel" style="margin-top:10px"><summary><b>Read the story</b> (${FAMILY_AGES.find(([a]) => a === st.age)[1]})</summary>
          ${ed.paragraphs.map((p, i) => html`<h3 style="margin:14px 0 4px;font-size:1rem">${s.scenes[i] || ""}</h3><p style="margin:0">${p}</p>`)}
          <p style="margin-top:12px"><b>Ask:</b> ${ed.question}</p></details></section>

      <form data-form="story-use" data-doc="${d.id}" data-story="${s.id}" data-age="${st.age}" data-len="${st.len}">
        <section class="sec"><h2 class="sec-head">What to include</h2><div class="panel" style="display:grid;gap:10px">
          ${piece("game", plan[0][1], s.game?.[st.age]?.title || s.game?.young?.title)}
          ${piece("scripture", "Scripture", st.age === "teen" && s.teenReading ? s.teenReading : s.reading)}
          ${piece("story", "The story, scene by scene", `${s.scenes.length} slides with the picture`)}
          ${s.videos.length ? piece("video", "Video", `${s.videos[0].title} (${s.videos[0].creator})`) : ""}
          ${piece("questions", "Questions and quiz", ed.question)}
          ${s.craft ? piece("craft", st.age === "teen" ? "Activity" : "Craft", `${s.craft.title}, ${s.craft.supplies.length} supplies`) : ""}
          ${piece("coloring", "Coloring page", st.age === "teen" ? "Usually for younger kids" : s.drawPrompt, st.age !== "teen")}
          ${piece("pray", "Prayer and big idea", s.topic)}
          ${piece("parents", "Take-home for parents", "Shows in the parent portal when you publish")}
          ${piece("resources", "Teacher resources", res.length ? `${res.length} publisher lesson${res.length === 1 ? "" : "s"}, private to teachers` : "Credits and links, private to teachers")}
        </div></section>
        ${hasWork ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">This lesson already has blocks</legend>
          <label class="check"><input type="radio" name="mode" value="add" checked><span>Add these after them</span></label>
          <label class="check"><input type="radio" name="mode" value="replace"><span>Replace them</span></label></fieldset>` : ""}
        <div class="btns"><button class="btn">${icon("check")}${hasWork ? "Add to the lesson" : "Use this lesson"}</button>
          ${S.on("veritas") ? html`<a class="btn ghost" href="${veritasBase()}#family" target="_blank" rel="noopener">${icon("link")}Family Library</a>` : ""}</div>
        <p class="faint">${familyLib.credit}</p>
      </form>`,
  };
};
Actions["story-age"] = (el) => { storyPlanState[el.dataset.key].age = el.dataset.age; render(); };
Actions["story-len"] = (el) => { storyPlanState[el.dataset.key].len = +el.dataset.len; prefs().lessonLength = +el.dataset.len; S.save(); render(); };

Forms["story-use"] = async (data, f) => {
  const d = S.get("docs", f.dataset.doc), s = familyLib?.stories.find((x) => x.id === f.dataset.story);
  if (!d || !s) return;
  const pieces = new Set([...f.querySelectorAll("input[name=piece]:checked")].map((x) => x.value));
  if (!pieces.size) return formError(f, "Choose at least one part to include.");
  const blocks = storyBlocks(s, f.dataset.age, +f.dataset.len, pieces);
  const replace = data.mode === "replace" || !d.blocks.some((b) => b.type !== "scripture" || b.text);
  // A new lesson keeps nothing but its empty Scripture slot, which the story's reading fills.
  d.blocks = replace ? blocks : [...d.blocks, ...blocks];
  if (!d.passage || replace) { const r = parseRef(s.reference) || parseRef(s.reading); if (r) d.passage = refLabel(r); }
  if (!d.topic) d.topic = s.topic;
  if (d.titleFromStory || !d.title) { d.title = s.title; delete d.titleFromStory; }
  d.storyId = s.id; d.updated = new Date().toISOString(); S.save();
  toast(`${s.title} is in your lesson. Edit anything before you publish.`);
  go(`build-${d.id}`);
  await Promise.all(blocks.filter((b) => b.type === "scripture" && b.ref && !b.text).map((b) => fillScripture(b).catch(() => {})));
  S.save(); render();
};

/** The story as lesson blocks. Teacher-only parts are private; the rest shows on screen and to parents. */
function storyBlocks(s, age, len, pieces) {
  const ed = s.editions[age] || s.editions.young, plan = Object.fromEntries(storyPlan(s, age, len).map(([k, l, m]) => [k, { label: l, min: m }]));
  const B = (type, props, show = true, notes = "") => ({ id: uid(), type, show, notes, ...props });
  const out = [];
  const game = s.game?.[age] || s.game?.young;
  if (pieces.has("game") && game) out.push(B("action", { label: plan.game.label, text: `${game.title} (${plan.game.min} min). ${game.instructions}` }, false));
  if (pieces.has("scripture")) out.push(B("scripture", { ref: age === "teen" && s.teenReading ? s.teenReading.split(";")[0].trim() : s.reading.split(";")[0].trim(), translation: "BSB", text: "" }));
  if (pieces.has("story")) {
    if (s.picture) out.push(B("media", { image: storyPic(s, age), url: "", caption: s.title }));
    ed.paragraphs.forEach((p, i) => out.push(B("text", { title: s.scenes[i] || s.title, text: p }, true, i === 0 ? `${plan.story.label}: about ${plan.story.min} minutes for all ${ed.paragraphs.length} scenes.` : "")));
  }
  if (pieces.has("video") && s.videos[0]) out.push(B("media", { image: "", url: s.videos[0].url, caption: `${s.videos[0].title} (${s.videos[0].creator})` }, true, `About ${plan.video?.min || 5} minutes. Check the video before class.${s.videos[1] ? ` Another option: ${s.videos[1].title}, ${s.videos[1].url}` : ""}`));
  if (pieces.has("questions")) {
    out.push(B("question", { text: ed.question }));
    const a = s.activity;
    out.push(B("question", { text: `${a.prompt} ${a.options.map((o, i) => `${"ABC"[i]}) ${o}`).join("  ")}` }, true, `Answer: ${a.options[a.answer]}. ${a.explanation}`));
  }
  if (pieces.has("craft") && s.craft) {
    const steps = s.craft.steps[age] || s.craft.steps.young || [];
    out.push(B("action", { label: "Craft", text: `${s.craft.title} (${plan.craft?.min || s.craft.minutes} min). You'll need: ${s.craft.supplies.join(", ")}. ${steps.map((x, i) => `${i + 1}. ${x}`).join(" ")}` }, false));
    out.push(B("media", { image: famPic(s.craft.picture), url: "", caption: s.craft.title }));
  }
  if (pieces.has("coloring") && s.picture) out.push(B("media", { image: famPic(s.picture.coloring), url: "", caption: `Coloring page: ${s.drawPrompt}` }, true, plan.review ? `${plan.review.label}: ${plan.review.min} minutes. Print one for each child.` : "Print one for each child to take home."));
  if (pieces.has("pray")) {
    out.push(B("keynote", { text: s.topic }, true, "Today's big idea. Say it together."));
    out.push(B("action", { label: "Prayer", text: `Pray together (${plan.pray.min} min): thank God for what this story shows about ${s.topic.toLowerCase()}, and ask for help to live it this week.` }, false));
  }
  if (pieces.has("parents")) {
    const vid = s.videos[0];
    out.push(B("text", { title: "For parents", text: `Today we learned ${s.title} (${s.reference}). Ask your child: ${ed.question}${vid ? ` Watch it together: ${vid.title}, ${vid.url}` : ""}` }));
  }
  if (pieces.has("resources")) {
    const res = s.resources[age] || [];
    out.push(B("note", { text: `${res.length ? `Publisher lessons for this story: ${res.map((r) => `${r.title} (${r.provider}${r.forTeachers ? ", for teachers" : ""}): ${r.url}`).join("; ")}. ` : ""}${familyLib.credit}` }, false));
  }
  return out;
}
