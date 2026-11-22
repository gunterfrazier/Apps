// ---------- Start from Lessons.church ----------
// Lessons.church (ChurchApps) is a free curriculum library: programs, their studies, and lessons, each lesson in one
// or more versions ("venues") for different ages or settings. Its public API needs no account and allows any site
// (api.lessons.church, CORS *). The lesson builder's "Start from Lessons.church" walks program > study > lesson and
// adds the lesson's outline: its Bible verse, bottom line, the parts of the lesson with what each needs, and the
// question for parents, with a link to the full lesson. The teaching script and videos stay on Lessons.church, where
// the curriculum's providers publish them; teachers play them in class from there or with FreePlay on a TV.

const LC_API = "https://api.lessons.church";
const lcCache = new Map();
let lcErr = "";
function lcGet(path) {
  if (!lcCache.has(path)) {
    lcCache.set(path, fetch(LC_API + path).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { lcCache.set(path, d); render(); return d; })
      .catch(() => { lcCache.delete(path); lcErr = path; render(); }));
  }
  const v = lcCache.get(path);
  return v instanceof Promise ? null : v;
}
const lcState = {};
const lcText = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

Screens.lessonschurch = (docId) => {
  const d = S.get("docs", docId);
  if (!d || !canEditDoc(d)) return { redirect: "docs-lesson" };
  const st = (lcState[docId] ||= {});
  const back = st.studyId ? "study" : st.programId ? "program" : "";
  const intro = html`<p class="muted" style="margin-top:14px">Free curriculum from <a href="https://lessons.church/" target="_blank" rel="noopener">Lessons.church</a>, for preschool through adults. Choose a lesson to add its outline here: the verse, bottom line, the parts of the lesson and the question for parents. The teaching script and videos stay on Lessons.church, where you can play them in class or with the free FreePlay TV app.</p>`;
  const wrap = (body) => ({ title: "Start from Lessons.church", back: `build-${d.id}`, tab: "connect",
    body: html`${intro}${back ? html`<button class="linkish" data-act="lc-up" data-doc="${d.id}" style="margin:4px 0 10px">${icon("back")}Back to ${back === "study" ? "studies" : "programs"}</button>` : ""}${body}` });
  if (lcErr) return wrap(html`<div class="panel"><p style="margin:0">Lessons.church couldn't be reached from here. On your church's website it loads directly; you can also browse <a href="https://lessons.church/" target="_blank" rel="noopener">lessons.church</a>.</p><button class="btn ghost sm" data-act="lc-retry" style="margin-top:10px">Try again</button></div>`);
  const loading = html`<div class="loading" role="status"><span class="ai-dot"></span>Loading Lessons.church...</div>`;
  const row = (act, id, title, sub, image) => html`<button class="row" data-act="${act}" data-doc="${d.id}" data-id="${id}" data-search="${title} ${sub}">${image ? html`<img class="lead-ic" src="${image}" alt="" style="object-fit:cover;border-radius:8px">` : html`<span class="lead-ic">${icon("book")}</span>`}<span class="body"><span class="t">${title}</span>${sub ? html`<span class="s">${sub}</span>` : ""}</span>${icon("chev")}</button>`;
  const search = html`<label class="field"><span class="sr">Search</span><input type="search" placeholder="Search" data-input="filter-rows" data-target="#lc-list" data-empty="#lc-none"></label>`;
  if (!st.programId) {
    const programs = lcGet("/programs/public");
    if (!programs) return wrap(loading);
    return wrap(html`${search}<div class="rows" id="lc-list">${programs.map((p) => row("lc-program", p.id, p.name, [p.age, lcText(p.shortDescription)].filter(Boolean).join(" · ").slice(0, 160), p.image))}</div><div id="lc-none" class="empty" hidden><p>No programs match.</p></div>`);
  }
  if (!st.studyId) {
    const studies = lcGet(`/studies/public/program/${st.programId}`);
    if (!studies) return wrap(loading);
    return wrap(html`${search}<div class="rows" id="lc-list">${studies.map((s) => row("lc-study", s.id, s.name, [s.lessonCount ? plural(s.lessonCount, "lesson") : "", lcText(s.shortDescription)].filter(Boolean).join(" · ").slice(0, 160), s.image))}</div><div id="lc-none" class="empty" hidden><p>No studies match.</p></div>`);
  }
  const lessons = lcGet(`/lessons/public/study/${st.studyId}`);
  if (!lessons) return wrap(loading);
  return wrap(html`${search}<div class="rows" id="lc-list">${lessons.map((l) => row("lc-lesson", l.id, [l.name, l.title].filter(Boolean).join(": "), [l.verse, lcText(l.bottomLine)].filter(Boolean).join(" · ").slice(0, 160), l.image))}</div><div id="lc-none" class="empty" hidden><p>No lessons match.</p></div>`);
};
Actions["lc-retry"] = () => { lcErr = ""; render(); };
Actions["lc-program"] = (el) => { lcState[el.dataset.doc] = { programId: el.dataset.id }; render(); };
Actions["lc-study"] = (el) => { lcState[el.dataset.doc].studyId = el.dataset.id; render(); };
Actions["lc-up"] = (el) => { const st = lcState[el.dataset.doc] || {}; if (st.studyId) delete st.studyId; else delete st.programId; render(); };

/** A lesson: choose the version (age or setting), then add its outline. */
Actions["lc-lesson"] = async (el) => {
  const d = S.get("docs", el.dataset.doc), st = lcState[el.dataset.doc] || {};
  const lesson = (lcCache.get(`/lessons/public/study/${st.studyId}`) || []).find((l) => l.id === el.dataset.id);
  if (!d || !lesson) return;
  openSheet([lesson.name, lesson.title].filter(Boolean).join(": "), html`<div class="loading" role="status"><span class="ai-dot"></span>Loading the lesson...</div>`);
  let venues;
  try { const r = await fetch(`${LC_API}/venues/public/lesson/${lesson.id}`); if (!r.ok) throw 0; venues = await r.json(); }
  catch { openSheet("Lessons.church", html`<p>This lesson couldn't load. Try again in a moment.</p>`); return; }
  const program = (lcCache.get("/programs/public") || []).find((p) => p.id === st.programId);
  const study = (lcCache.get(`/studies/public/program/${st.programId}`) || []).find((s) => s.id === st.studyId);
  const url = program?.slug && study?.slug && lesson.slug ? `https://lessons.church/${program.slug}/${study.slug}/${lesson.slug}/` : "https://lessons.church/";
  lcPick = { docId: d.id, lesson, venues, program, study, url };
  openSheet([lesson.name, lesson.title].filter(Boolean).join(": "), html`
    ${lesson.verse ? html`<p style="margin-top:0"><b>${lesson.verse}</b></p>` : ""}
    ${lesson.bottomLine ? html`<p>${lcText(lesson.bottomLine)}</p>` : ""}
    <p class="faint">${[program?.name, study?.name].filter(Boolean).join(" › ")} · <a href="${url}" target="_blank" rel="noopener">Open on Lessons.church</a></p>
    <form data-form="lc-use" novalidate>
      ${venues.length > 1 ? html`<fieldset class="field"><legend>Version</legend>${venues.map((v, i) => html`<label class="check"><input type="radio" name="venue" value="${v.id}" ${attr(i === 0, "checked")}><span>${v.name}</span></label>`)}</fieldset>` : html`<input type="hidden" name="venue" value="${venues[0]?.id || ""}">`}
      ${d.blocks.some((b) => b.type !== "scripture" || b.text) ? html`<fieldset class="field"><legend>Your lesson already has content</legend>
        <label class="check"><input type="radio" name="mode" value="add" checked><span>Add this after it</span></label>
        <label class="check"><input type="radio" name="mode" value="replace"><span>Replace it</span></label></fieldset>` : ""}
      <button class="btn">${icon("plus")}Add the outline to my lesson</button></form>`);
};
let lcPick = null;
Forms["lc-use"] = async (data) => {
  const p = lcPick, d = p && S.get("docs", p.docId);
  if (!d) return;
  const venue = p.venues.find((v) => v.id === data.venue) || p.venues[0];
  const B = (type, props, show = true, notes = "") => ({ id: uid(), type, show, notes, ...props });
  const l = p.lesson, credit = `From Lessons.church: ${[p.program?.name, p.study?.name, [l.name, l.title].filter(Boolean).join(": ")].filter(Boolean).join(" › ")}${venue ? ` (${venue.name})` : ""}. Full lesson, teaching script and videos: ${p.url}`;
  const blocks = [B("note", { text: `${credit} Play it in class from there, or on a classroom TV with FreePlay (freeplay.church).` }, false)];
  const ref = l.verse && parseRef(l.verse.split(/[;,]/)[0]);
  if (ref) blocks.push(B("scripture", { ref: refLabel(ref), translation: "BSB", text: "" }));
  if (l.bottomLine) blocks.push(B("keynote", { text: lcText(l.bottomLine) }, true, "The bottom line. Say it together."));
  for (const sec of (venue?.sections || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
    const materials = lcText(sec.materials);
    blocks.push(B("action", { label: lcText(sec.name) || "Lesson part", text: materials ? `You'll need: ${materials}` : "See this part on Lessons.church." }, false));
  }
  if (l.parentQuestion) blocks.push(B("text", { title: "For parents", text: `Today's lesson: ${[l.title || l.name, l.verse].filter(Boolean).join(", ")}. Ask your child: ${lcText(l.parentQuestion)}` }));
  const replace = data.mode === "replace" || !d.blocks.some((b) => b.type !== "scripture" || b.text);
  d.blocks = replace ? blocks : [...d.blocks, ...blocks];
  if ((!d.passage || replace) && ref) d.passage = refLabel(ref);
  if (!d.title || d.titleFromStory) { d.title = l.title || l.name; delete d.titleFromStory; }
  d.lessonsChurch = { lessonId: l.id, venueId: venue?.id || "", url: p.url };
  d.updated = new Date().toISOString(); S.save();
  closeSheet(true); lcPick = null;
  toast("The lesson outline is in. Edit anything before you publish.");
  go(`build-${d.id}`);
  await Promise.all(blocks.filter((b) => b.type === "scripture" && !b.text).map((b) => fillScripture(b).catch(() => {})));
  S.save(); render();
};
