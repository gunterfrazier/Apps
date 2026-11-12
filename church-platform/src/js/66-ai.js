// ---------- AI help through Veritas Logos ----------
// Drafts for people who teach: small-group discussion questions, a kids Sunday school lesson from Sunday's passage,
// and a sermon summary and outline. Every prompt carries the passage text from the Bible data shared with
// Veritas Logos, and every result lands in the builders as a draft for a person to check and edit.
// In the preview it asks Claude through the page; on your own site it calls your AI function (see SETUP.md).

const AI = {
  sample: undefined,
  possible() { return !!window.__aiStub || IN_PREVIEW || (typeof Backend !== "undefined" && Backend.on && Backend.aiEnabled); },
  async client() {
    if (window.__aiStub) return { json: window.__aiStub };
    if (typeof Backend !== "undefined" && Backend.on && Backend.aiEnabled) return { json: (prompt) => Backend.ai(prompt) };
    if (IN_PREVIEW) {
      if (this.sample === undefined) { try { this.sample = (await window.claude?.use?.("sample")) || null; } catch { this.sample = null; } }
      if (this.sample) return { json: (prompt) => this.sample.json(prompt, { modelTier: "default" }) };
    }
    return null;
  },
  async json(prompt) { const c = await this.client(); if (!c) throw { code: "unavailable" }; return c.json(prompt); },
};
const canAI = () => S.isMember() && AI.possible() && S.canAny(["build.studies", "build.lessons", "build.sermons", "lead.groups", "teach.classes", "manage.sermons"]);
const AI_RULES = `You help a local church prepare Bible teaching. Stay faithful to the Bible passage you are given and to historic Christian teaching.
Quote Scripture only from the passage text provided (Berean Standard Bible), word for word. Never invent Bible references, quotes, statistics or stories about real people.
Write in plain, warm, everyday English. Reply with JSON only, in exactly the shape asked for.`;
async function passageText(ref) { try { return ref && parseRef(ref) ? await Bible.text(ref, "BSB") : ""; } catch { return ""; } }
const aiError = (e) => ({ not_granted: "AI help is turned off for this page.", rate_limited: "Too many requests right now. Try again in a minute.", unavailable: "AI help isn't set up here yet. See the setup guide." }[e?.code] || "The draft couldn't be written. Try again.");
function aiSheet(title, body) { openSheet(title, html`<div class="ai-sheet">${body}</div>`, { wide: true }); }
const aiWorking = (what) => html`<div class="ai-working" role="status"><span class="ai-dot"></span><span>Writing ${what}...</span></div><p class="faint">Drafted with Veritas Logos. Check it against the passage before you use it.</p>`;
const sermonContext = (s, text) => `Sermon: "${s.title}" by ${s.speaker} on ${s.passage}.${s.summary ? ` Summary: ${s.summary}` : ""}${s.outline?.length ? ` Outline: ${s.outline.join("; ")}.` : ""}
${s.transcript?.length ? `Part of the transcript: ${transcriptText(s).slice(0, 6000)}\n` : ""}Passage text (BSB): ${text || "(not available)"}`;

// ----- Discussion questions -----
let aiLast = null;
async function draftQuestions({ title, passage, context }) {
  const text = await passageText(passage);
  const out = await AI.json(`${AI_RULES}

${context || `Topic: ${title}. Passage: ${passage}.`}
${context ? "" : `Passage text (BSB): ${text}`}

Write 6 small-group discussion questions on this passage: 2 that notice what the text says, 2 that ask what it means, and 2 that apply it to everyday life this week. Add one short prayer prompt.
JSON shape: {"questions":[{"kind":"notice"|"mean"|"apply","text":"..."}],"prayer":"..."}`);
  if (!Array.isArray(out?.questions) || !out.questions.length) throw { code: "bad" };
  return { questions: out.questions.filter((q) => q?.text).slice(0, 8).map((q) => ({ kind: ["notice", "mean", "apply"].includes(q.kind) ? q.kind : "apply", text: String(q.text) })), prayer: String(out.prayer || ""), text };
}
const KIND_LABEL = { notice: "Notice", mean: "Mean", apply: "Apply" };
function questionsHtml(r, actions) {
  return html`<ol class="ai-list">${r.questions.map((q) => html`<li><span class="tag">${KIND_LABEL[q.kind]}</span> ${q.text}</li>`)}</ol>
    ${r.prayer ? html`<p><b>Prayer:</b> ${r.prayer}</p>` : ""}<p class="faint">Drafted with Veritas Logos. Check it against the passage before you use it.</p><div class="btns">${actions}</div>`;
}
Actions["ai-questions"] = async (el) => {
  const s = S.get("sermons", el.dataset.id);
  aiSheet("Discussion questions", aiWorking("questions"));
  try {
    const r = aiLast = { ...(await draftQuestions({ title: s.title, passage: s.passage, context: sermonContext(s, await passageText(s.passage)) })), sermon: s.id };
    if (!$("#scrim")) return;
    $("#scrim .ai-sheet").innerHTML = flat(questionsHtml(r, html`${S.can("build.studies") ? html`<button class="btn" data-act="ai-to-study">${icon("book")}Make a study guide</button>` : ""}<button class="btn ghost" data-act="ai-copy">${icon("copy")}Copy</button>`));
  } catch (e) { if ($("#scrim")) $("#scrim .ai-sheet").innerHTML = flat(html`<p class="err">${aiError(e)}</p>`); }
};
Actions["ai-copy"] = () => copyText([...aiLast.questions.map((q, i) => `${i + 1}. ${q.text}`), aiLast.prayer ? `\nPrayer: ${aiLast.prayer}` : ""].join("\n"), "Questions copied");
Actions["ai-to-study"] = () => {
  const s = S.get("sermons", aiLast.sermon), g = S.visible("gatherings", { ignoreCampus: true }).find((x) => x.type === "group" && isLeader(x));
  const doc = S.add("docs", { kind: "study", title: `${s.title}: discussion guide`, passage: s.passage, topic: s.topic || "", date: isoDay(new Date()), time: "19:00", locationId: g?.locationId || null, gatheringId: g?.id || null, authorId: S.me().id, published: false, shareWithParents: false, resource: "",
    blocks: [{ id: uid(), type: "scripture", ref: s.passage, translation: "BSB", text: aiLast.text || "", show: true, notes: "" }, ...aiBlocks(aiLast)], updated: new Date().toISOString() });
  closeSheet(true); toast("Study guide drafted"); go(`build-${doc.id}`);
};
const aiBlocks = (r) => [...r.questions.map((q) => ({ id: uid(), type: "question", text: q.text, show: true, notes: KIND_LABEL[q.kind] })),
  ...(r.prayer ? [{ id: uid(), type: "text", title: "Pray together", text: r.prayer, show: true, notes: "" }] : []),
  { id: uid(), type: "note", text: "Questions drafted with Veritas Logos. Check them against the passage before you meet.", show: false, notes: "" }];

// ----- In the builders -----
Actions["ai-build"] = async (el) => {
  const d = S.get("docs", el.dataset.id);
  if (d.kind === "lesson" && !d.blocks.some((b) => b.type !== "scripture")) { lessonFromPassage(d); return; }
  if (!d.passage) { toast("Add a main passage under Details first"); return; }
  aiSheet("Draft with Veritas Logos", aiWorking("questions"));
  try {
    const r = aiLast = await draftQuestions({ title: d.title, passage: d.passage });
    if (!$("#scrim")) return;
    $("#scrim .ai-sheet").innerHTML = flat(questionsHtml(r, html`<button class="btn" data-act="ai-add" data-id="${d.id}">${icon("plus")}Add ${plural(r.questions.length, "question")}</button>`));
  } catch (e) { if ($("#scrim")) $("#scrim .ai-sheet").innerHTML = flat(html`<p class="err">${aiError(e)}</p>`); }
};
Actions["ai-add"] = (el) => { const d = S.get("docs", el.dataset.id); d.blocks.push(...aiBlocks(aiLast)); d.updated = new Date().toISOString(); S.save(); closeSheet(true); toast("Questions added. Edit or reorder them below."); render(); };

// ----- A kids Sunday school lesson -----
const myClasses = () => S.visible("gatherings", { ignoreCampus: true }).filter((g) => g.type === "class" && (S.can("manage.classes") || isLeader(g)));
Actions["ai-lesson"] = (el) => {
  const s = S.get("sermons", el.dataset.id), kidsOnly = myClasses().filter((g) => g.ageMax != null && g.ageMax <= 12), classes = kidsOnly.length ? kidsOnly : myClasses();
  if (!classes.length) { toast("You need a kids class to write a lesson for"); return; }
  aiSheet("Draft a kids lesson", html`<form data-form="ai-lesson" novalidate><input type="hidden" name="sermon" value="${s.id}">
    <p class="muted" style="margin-top:0">From "${s.title}" on ${s.passage}. You'll get a full lesson in the lesson builder to edit: the big idea, the story in kids' words, questions, an activity and a memory verse.</p>
    <label class="field"><span>Class</span><select name="gatheringId">${classes.map((g) => html`<option value="${g.id}">${g.name}${g.ageMin != null ? `, ages ${g.ageMin} to ${g.ageMax}` : ""}</option>`)}</select></label>
    <button class="btn block">${icon("bolt")}Draft the lesson</button></form>`);
};
Forms["ai-lesson"] = async (d, f) => {
  const s = S.get("sermons", d.sermon), g = S.get("gatherings", d.gatheringId);
  const doc = S.add("docs", { kind: "lesson", title: s.title, passage: s.passage, topic: s.topic || "", date: isoDay(nextMeeting(g) || new Date()), time: g.schedule?.time || "09:00", locationId: g.locationId || null, gatheringId: g.id, authorId: S.me().id, published: false, shareWithParents: true, resource: "",
    blocks: [{ id: uid(), type: "scripture", ref: s.passage, translation: "BSB", text: "", show: true, notes: "" }], updated: new Date().toISOString() });
  await lessonFromPassage(doc, s);
};
async function lessonFromPassage(doc, sermon) {
  const g = doc.gatheringId && S.get("gatherings", doc.gatheringId), ages = g?.ageMin != null ? `${g.ageMin} to ${g.ageMax}` : "4 to 10";
  aiSheet("Draft a kids lesson", aiWorking(`a lesson for ages ${ages}`));
  try {
    const text = await passageText(doc.passage);
    const out = await AI.json(`${AI_RULES}

${sermon ? sermonContext(sermon, text) : `Passage: ${doc.passage}. Passage text (BSB): ${text}`}

Write a 45-minute Sunday school lesson on this passage for children ages ${ages}. Keep words short and concrete for that age.
JSON shape: {"bigIdea":"one sentence a child can remember","story":"the passage retold for kids, 150 to 250 words","questions":["4 questions, simplest first"],"activity":{"name":"...","supplies":"...","steps":"..."},"memoryVerse":"one short verse quoted exactly from the passage text","memoryRef":"its reference","parents":"two sentences for parents about what their child learned and one question to ask at home"}`);
    if (!out?.bigIdea || !out?.story) throw { code: "bad" };
    const verse = out.memoryVerse && text.includes(String(out.memoryVerse).replace(/[“”"]/g, "").slice(0, 25)) ? out.memoryVerse : "";
    doc.blocks = [
      { ...(doc.blocks.find((b) => b.type === "scripture") || { id: uid(), type: "scripture", ref: doc.passage, translation: "BSB", show: true, notes: "" }), text },
      { id: uid(), type: "keynote", text: String(out.bigIdea), show: true, notes: "Say it together a few times." },
      { id: uid(), type: "text", title: "The story", text: String(out.story), show: true, notes: "" },
      ...(out.questions || []).slice(0, 5).map((q) => ({ id: uid(), type: "question", text: String(q), show: true, notes: "" })),
      ...(out.activity ? [{ id: uid(), type: "action", label: "Craft", text: `${out.activity.name}. ${out.activity.supplies ? `You'll need: ${out.activity.supplies}. ` : ""}${out.activity.steps || ""}`, show: false, notes: "" }] : []),
      ...(verse ? [{ id: uid(), type: "keynote", text: `${verse} (${out.memoryRef || doc.passage})`, show: true, notes: "Memory verse" }] : []),
      ...(out.parents ? [{ id: uid(), type: "text", title: "For parents", text: String(out.parents), show: true, notes: "" }] : []),
      { id: uid(), type: "note", text: "Drafted with Veritas Logos. Read it through and check it against the passage before you teach.", show: false, notes: "" },
    ];
    doc.updated = new Date().toISOString(); S.save();
    closeSheet(true); toast("Lesson drafted. Edit anything before you publish it."); go(`build-${doc.id}`); render();
  } catch (e) { S.save(); if ($("#scrim")) $("#scrim .ai-sheet").innerHTML = flat(html`<p class="err">${aiError(e)}</p><p class="faint">The lesson was still created, so you can write it by hand.</p><a class="btn ghost" href="#build-${doc.id}">Open the lesson</a>`); }
}

// ----- Sermon summary and outline -----
Actions["ai-recap"] = async (el) => {
  const s = S.get("sermons", el.dataset.id);
  aiSheet("Summary and outline", aiWorking("a summary"));
  try {
    const out = await AI.json(`${AI_RULES}

${sermonContext(s, await passageText(s.passage))}

Write a summary of this sermon for the church app in 2 or 3 sentences, and an outline of 3 or 4 short points.
JSON shape: {"summary":"...","outline":["...","..."]}`);
    if (!out?.summary) throw { code: "bad" };
    aiLast = { summary: String(out.summary), outline: (out.outline || []).map(String).slice(0, 6), sermon: s.id };
    if (!$("#scrim")) return;
    $("#scrim .ai-sheet").innerHTML = flat(html`<p>${aiLast.summary}</p><ol class="ai-list">${aiLast.outline.map((p) => html`<li>${p}</li>`)}</ol>
      <p class="faint">Drafted with Veritas Logos. ${s.summary ? "Using it replaces the current summary and outline." : ""}</p>
      <div class="btns"><button class="btn" data-act="ai-recap-use">Use this</button><button class="btn ghost" data-act="close-sheet">Not now</button></div>`);
  } catch (e) { if ($("#scrim")) $("#scrim .ai-sheet").innerHTML = flat(html`<p class="err">${aiError(e)}</p>`); }
};
Actions["ai-recap-use"] = () => { const s = S.get("sermons", aiLast.sermon); Object.assign(s, { summary: aiLast.summary, outline: aiLast.outline }); S.save(); closeSheet(true); toast("Summary and outline saved"); go(`sermon-${s.id}`); };
