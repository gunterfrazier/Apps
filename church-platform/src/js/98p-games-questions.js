// ---------- Game night: a church's own questions ----------
// Hosts write their own questions for each game, alone or drafted from a sermon (AI, checked by a person before they're
// added). Each is a gameQuestions record: only people who can host read them (upgrade-33.sql), so players can't look up
// the answers. A night can use the built-in questions, the church's, both, or one set of the church's.

const GQ_GAMES = { quiz: "Bible Quiz", scramble: "Name Scramble", order: "In Order", who: "Who Am I?", fake: "Fake Out" };
const gqAll = (game) => (S.state.gameQuestions || []).filter((q) => q.churchId === S.state.current && (!game || q.game === game));
const gqSets = () => [...new Set(gqAll().map((q) => q.set).filter(Boolean))].sort();

/** A church question in the same shape as the built-in banks (98m-games-bank.js). */
function gqTuple(q) {
  if (q.game === "quiz") return [q.q, [q.right, ...(q.wrong || [])], q.ref || ""];
  if (q.game === "scramble") return [q.word, q.hint, q.ref || ""];
  if (q.game === "who") return [q.name, q.clues || [], q.ref || "", q.also || []];
  if (q.game === "fake") return [q.q, q.answer, q.ref || ""];
  return [q.title, (q.events || []).map((e) => [e.t, e.ref || ""])];
}
/** The questions a night draws on for each game: { quiz: [[key, tuple]], ... }. */
function gqBank(source) {
  const out = {};
  for (const kind of Object.keys(GAME_KINDS)) {
    const built = kind === "quiz" ? GAME_QUIZ : kind === "scramble" ? GAME_NAMES : kind === "order" ? GAME_ORDER : kind === "who" ? GAME_WHO : kind === "fake" ? GAME_FAKE : [];
    const ours = gqAll(kind).filter((q) => !source.startsWith("set:") || q.set === source.slice(4));
    out[kind] = [...(source === "both" || source === "builtin" ? built.map((t, i) => [`b${i}`, t]) : []), ...(source !== "builtin" ? ours.map((q) => [`c${q.id}`, gqTuple(q)]) : [])];
  }
  return out;
}
const gqSummary = (q) => q.game === "quiz" ? q.q : q.game === "scramble" ? `${q.word}: ${q.hint}` : q.game === "who" ? `${q.name}: ${(q.clues || [])[0] || ""}` : q.game === "fake" ? `${q.q} (${q.answer})` : `${q.title}: ${(q.events || []).map((e) => e.t).join(" → ")}`;

Screens.gameqs = (tail) => {
  if (!S.on("games")) return { redirect: "home" };
  if (!S.can("host.games")) return { redirect: "games" };
  const game = GQ_GAMES[tail] ? tail : "quiz", list = gqAll(game), sets = gqSets();
  const bySet = {}; for (const q of list) (bySet[q.set || ""] ||= []).push(q);
  return {
    title: "Your questions", back: "games", tab: "games",
    body: html`<p class="muted" style="margin-top:14px">Questions your church writes, for game nights here. Only people who can host see them, so players can't look up the answers.</p>
      <div class="seg" role="group" aria-label="Game" style="margin-top:10px">${Object.entries(GQ_GAMES).map(([k, l]) => html`<a href="#gameqs-${k}" ${attr(k === game, 'aria-current="page"')}>${l} <small class="faint">${gqAll(k).length}</small></a>`)}</div>
      <div class="btns" style="margin:14px 0"><button class="btn" data-act="gq-edit" data-game="${game}">${icon("plus")}Add ${{ quiz: "a question", scramble: "a name", order: "events", who: "a person", fake: "a fact" }[game]}</button>
        ${gqCanDraft() ? html`<button class="btn ghost" data-act="gq-ai">${icon("bolt")}Make questions from a sermon</button>` : ""}</div>
      ${list.length ? Object.entries(bySet).sort(([a], [b]) => a.localeCompare(b)).map(([set, qs]) => html`<section class="sec"><h2 class="sec-head">${set || "No set"} <small class="faint">${qs.length}</small></h2>
        <div class="rows">${qs.map((q) => html`<div class="row"><span class="body"><span class="t">${gqSummary(q)}</span><span class="s">${q.game === "quiz" ? `Answer: ${q.right}${q.ref ? ` · ${q.ref}` : ""}` : q.ref || ""}</span></span>
          <button class="icon-btn" data-act="gq-edit" data-id="${q.id}" aria-label="Edit">${icon("edit")}</button><button class="icon-btn" data-act="gq-del" data-id="${q.id}" aria-label="Delete">${icon("trash")}</button></div>`)}</div></section>`)
        : html`<div class="empty panel"><p>No ${GQ_GAMES[game]} questions of your own yet.</p></div>`}
      ${sets.length ? html`<p class="faint">Sets: ${sets.join(", ")}. When you open a room you can play just one set.</p>` : ""}`,
  };
};

// ----- Writing one by hand -----
Actions["gq-edit"] = (el) => {
  const q = el.dataset.id ? S.get("gameQuestions", el.dataset.id) : null, game = q?.game || el.dataset.game || "quiz";
  const v = (k) => q?.[k] || "", sets = gqSets();
  const setField = html`<label class="field"><span>Set <small class="faint">(optional)</small></span><input type="text" name="set" value="${v("set")}" maxlength="60" list="gq-sets" placeholder="Like: Advent series"><datalist id="gq-sets">${sets.map((s) => html`<option value="${s}">`)}</datalist></label>`;
  let fields;
  if (game === "quiz") fields = html`<label class="field"><span>Question</span><input type="text" name="q" value="${v("q")}" maxlength="140" required></label>
    <label class="field"><span>Right answer</span><input type="text" name="right" value="${v("right")}" maxlength="60" required></label>
    ${[0, 1, 2].map((i) => html`<label class="field"><span>Wrong answer ${i + 1}</span><input type="text" name="wrong${i}" value="${q?.wrong?.[i] || ""}" maxlength="60" required></label>`)}
    <label class="field"><span>Bible reference</span><input type="text" name="ref" value="${v("ref")}" maxlength="40" placeholder="John 3:16"></label>`;
  else if (game === "scramble") fields = html`<label class="field"><span>Name or place</span><input type="text" name="word" value="${v("word")}" maxlength="12" required><small>One word, 3 to 12 letters. Players unscramble it.</small></label>
    <label class="field"><span>Clue</span><input type="text" name="hint" value="${v("hint")}" maxlength="80" required></label>
    <label class="field"><span>Bible reference</span><input type="text" name="ref" value="${v("ref")}" maxlength="40"></label>`;
  else if (game === "who") fields = html`<label class="field"><span>Who</span><input type="text" name="name" value="${v("name")}" maxlength="30" required placeholder="Like: Barnabas"></label>
    <label class="field"><span>Also accept <small class="faint">(optional)</small></span><input type="text" name="also" value="${(q?.also || []).join(", ")}" maxlength="80" placeholder="Other names, with commas: Joseph of Cyprus"></label>
    <p class="faint" style="margin:0">Five clues, hardest first. They show one at a time.</p>
    ${[0, 1, 2, 3, 4].map((i) => html`<label class="field"><span>Clue ${i + 1}</span><input type="text" name="c${i}" value="${q?.clues?.[i] || ""}" maxlength="100" required></label>`)}
    <label class="field"><span>Bible reference</span><input type="text" name="ref" value="${v("ref")}" maxlength="40"></label>`;
  else if (game === "fake") fields = html`<label class="field"><span>Fact with a blank</span><input type="text" name="q" value="${v("q")}" maxlength="140" required placeholder="Lydia sold ____ cloth."><small>Write ____ where the answer goes. Pick something few people know, so fakes sound true.</small></label>
    <label class="field"><span>The real answer</span><input type="text" name="answer" value="${v("answer")}" maxlength="40" required placeholder="Purple"></label>
    <label class="field"><span>Bible reference</span><input type="text" name="ref" value="${v("ref")}" maxlength="40"></label>`;
  else fields = html`<label class="field"><span>Title</span><input type="text" name="title" value="${v("title")}" maxlength="60" required placeholder="Like: Paul's journeys"></label>
    <p class="faint" style="margin:0">Four events, in the order they happened. Players see them shuffled.</p>
    ${[0, 1, 2, 3].map((i) => html`<div class="gq-ev"><label class="field"><span>${["First", "Second", "Third", "Last"][i]}</span><input type="text" name="e${i}" value="${q?.events?.[i]?.t || ""}" maxlength="70" required></label>
      <label class="field"><span>Reference</span><input type="text" name="r${i}" value="${q?.events?.[i]?.ref || ""}" maxlength="40"></label></div>`)}`;
  openSheet(q ? "Edit question" : `Add to ${GQ_GAMES[game]}`, html`<form data-form="gq-save"><input type="hidden" name="id" value="${q?.id || ""}"><input type="hidden" name="game" value="${game}">
    ${fields}${setField}<button class="btn">${q ? "Save" : "Add"}</button></form>`);
};
/** A question from a form or a draft, checked: { ...fields } or a message saying what's missing. */
function gqClean(game, d) {
  const t = (s, n) => String(s || "").trim().slice(0, n);
  if (game === "quiz") {
    const out = { q: t(d.q, 140), right: t(d.right, 60), wrong: [0, 1, 2].map((i) => t(d.wrong?.[i] ?? d[`wrong${i}`], 60)), ref: t(d.ref, 40) };
    if (!out.q || !out.right || out.wrong.some((w) => !w)) return "Fill in the question, the right answer and three wrong ones.";
    if (new Set([out.right, ...out.wrong].map((x) => x.toLowerCase())).size < 4) return "The four answers need to be different.";
    return out;
  }
  if (game === "scramble") {
    const word = gameNorm(d.word);
    if (word.length < 3 || word.length > 12) return "The name is one word of 3 to 12 letters.";
    if (!t(d.hint, 80)) return "Add a clue.";
    return { word, hint: t(d.hint, 80), ref: t(d.ref, 40) };
  }
  if (game === "who") {
    const clues = (d.clues || [0, 1, 2, 3, 4].map((i) => d[`c${i}`])).map((c) => t(c, 100)).filter(Boolean).slice(0, 5);
    const name = t(d.name, 30), also = (Array.isArray(d.also) ? d.also : String(d.also || "").split(",")).map((x) => t(x, 30)).filter(Boolean).slice(0, 4);
    if (!gameNorm(name)) return "Say who it is.";
    if (clues.length < 5) return "Write five clues.";
    if (clues.some((c) => gameNorm(c).includes(gameNorm(name)))) return "A clue gives the name away. Leave the name out of the clues.";
    return { name, also, clues, ref: t(d.ref, 40) };
  }
  if (game === "fake") {
    let text = t(d.q, 140); const answer = t(d.answer, 40);
    if (!text || !answer) return "Write the fact and its real answer.";
    if (!text.includes("____")) text = text.replace(/_{2,}/, "____");
    if (!text.includes("____")) return "Put ____ where the answer goes.";
    return { q: text, answer, ref: t(d.ref, 40) };
  }
  const events = (d.events || [0, 1, 2, 3].map((i) => ({ t: d[`e${i}`], ref: d[`r${i}`] }))).slice(0, 4).map((e) => ({ t: t(e?.t, 70), ref: t(e?.ref, 40) }));
  if (!t(d.title, 60) || events.length < 4 || events.some((e) => !e.t)) return "Add a title and four events.";
  return { title: t(d.title, 60), events };
}
Forms["gq-save"] = (d, f) => {
  if (!S.can("host.games")) return;
  const clean = gqClean(d.game, d);
  if (typeof clean === "string") return formError(f, clean);
  const rec = { game: d.game, ...clean, set: String(d.set || "").trim().slice(0, 60), by: S.me().id, at: new Date().toISOString() };
  if (d.id) S.update("gameQuestions", d.id, rec); else S.add("gameQuestions", rec);
  closeSheet(true); toast(d.id ? "Saved" : "Added"); render();
};
Actions["gq-del"] = (el) => {
  const q = S.get("gameQuestions", el.dataset.id); if (!q) return;
  S.remove("gameQuestions", q.id); render(); toast("Deleted");
};

// ----- Drafting from a sermon -----
const gqCanDraft = () => S.isMember() && AI.possible() && S.canAny(["host.games", "build.studies", "build.lessons", "build.sermons", "lead.groups", "teach.classes", "manage.sermons"]);
let gqDraft = null;
const gqSermons = () => (S.state.sermons || []).filter((s) => s.churchId === S.state.current && s.passage).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 25);
Actions["gq-ai"] = () => {
  const sermons = gqSermons();
  openSheet("Make questions from a sermon", html`<form data-form="gq-ai">
    ${sermons.length ? html`<label class="field"><span>Sermon</span><select name="sermon"><option value="">A passage instead</option>${sermons.map((s, i) => html`<option value="${s.id}" ${attr(!i, "selected")}>${s.title}${s.date ? ` (${s.date})` : ""} · ${s.passage}</option>`)}</select></label>` : ""}
    <label class="field"><span>${sermons.length ? "Or a passage" : "Passage"}</span><input type="text" name="passage" maxlength="40" placeholder="Luke 15:11-32"></label>
    <fieldset class="field" style="border:0;padding:0"><legend>Make</legend>
      ${Object.entries(GQ_GAMES).map(([k, l]) => html`<label class="check"><input type="checkbox" name="m_${k}" checked><span>${l}</span></label>`)}</fieldset>
    <button class="btn">${icon("bolt")}Draft questions</button>
    <p class="faint">You check every question before it's added.</p></form>`);
};
Forms["gq-ai"] = async (d, f) => {
  const s = d.sermon ? S.get("sermons", d.sermon) : null, ref = s ? s.passage : String(d.passage || "").trim();
  if (!s && !parseRef(ref)) return formError(f, "Pick a sermon or type a passage, like Luke 15:11-32.");
  const want = Object.keys(GQ_GAMES).filter((k) => d[`m_${k}`]);
  if (!want.length) return formError(f, "Pick at least one game.");
  aiSheet("Make questions from a sermon", aiWorking("questions"));
  try {
    const text = await passageText(ref);
    const context = s ? sermonContext(s, text) : `Passage: ${ref}.\nPassage text (BSB): ${text || "(not available)"}`;
    const ask = [want.includes("quiz") && `"quiz": 8 multiple-choice questions, each with one right answer and three wrong but believable answers (each answer under 60 characters)`,
      want.includes("scramble") && `"names": up to 6 people or places named in the passage, each one word of 3 to 12 letters, with a short clue that doesn't contain the word`,
      want.includes("who") && `"who": up to 3 people from the passage, each with exactly 5 clues from hardest to easiest that never say their name`,
      want.includes("fake") && `"fake": up to 5 lesser-known facts from the passage, each a sentence with ____ where a short answer (1 to 3 words) goes, and that answer`,
      want.includes("order") && `"order": up to 2 sets of exactly 4 events from the passage, listed in the order they happened (an empty list if the passage doesn't tell events in order)`].filter(Boolean).join("; ");
    const out = await AI.json(`${AI_RULES}

${context}

Write questions for a church game night about this ${s ? "sermon and its passage" : "passage"}, for all ages. Every answer must come straight from the passage${s ? " or the sermon" : ""}. Give a Bible reference for each, inside ${ref}.
Write: ${ask}.
JSON shape: {"quiz":[{"q":"...","right":"...","wrong":["...","...","..."],"ref":"..."}],"names":[{"word":"...","hint":"...","ref":"..."}],"order":[{"title":"...","events":[{"t":"...","ref":"..."}]}],"who":[{"name":"...","clues":["..."],"ref":"..."}],"fake":[{"q":"... ____ ...","answer":"...","ref":"..."}]}`);
    const items = [];
    for (const x of (want.includes("quiz") ? out?.quiz : null) || []) { const c = gqClean("quiz", x); if (typeof c !== "string") items.push({ game: "quiz", ...c }); }
    for (const x of (want.includes("scramble") ? out?.names : null) || []) { const c = gqClean("scramble", x); if (typeof c !== "string") items.push({ game: "scramble", ...c }); }
    for (const x of (want.includes("order") ? out?.order : null) || []) { const c = gqClean("order", x); if (typeof c !== "string") items.push({ game: "order", ...c }); }
    for (const x of (want.includes("who") ? out?.who : null) || []) { const c = gqClean("who", x); if (typeof c !== "string") items.push({ game: "who", ...c }); }
    for (const x of (want.includes("fake") ? out?.fake : null) || []) { const c = gqClean("fake", x); if (typeof c !== "string") items.push({ game: "fake", ...c }); }
    if (!items.length) throw { code: "bad" };
    gqDraft = { items, set: s ? `From "${s.title}"` : `From ${ref}` };
    gqDraftShow();
  } catch (e) { const box = $("#scrim .ai-sheet"); if (box) box.innerHTML = flat(html`<p class="err" role="alert">${aiError(e)}</p><button class="btn ghost" data-act="gq-ai">Try again</button>`); }
};
function gqDraftShow() {
  const d = gqDraft; if (!d) return;
  openSheet("Check the questions", html`<form data-form="gq-ai-add">
    <p class="faint">Drafted with Veritas Logos. Uncheck any you don't want. You can edit them after they're added.</p>
    <div class="gq-draft">${d.items.map((q, i) => html`<label class="check gq-draft-item"><input type="checkbox" name="k${i}" checked><span><small class="tag">${GQ_GAMES[q.game]}</small> <b>${gqSummary(q)}</b>
      ${q.game === "quiz" ? html`<br><small>Right: ${q.right}. Wrong: ${q.wrong.join(", ")}.${q.ref ? ` ${q.ref}` : ""}</small>` : q.game === "who" ? html`<br><small>${q.clues.join(" · ")}</small>` : q.ref ? html`<br><small>${q.ref}</small>` : ""}</span></label>`)}</div>
    <label class="field"><span>Set</span><input type="text" name="set" value="${d.set}" maxlength="60" required><small>Play just this set on the night, or mix it with the rest.</small></label>
    <button class="btn">Add the checked questions</button></form>`, { wide: true });
}
Forms["gq-ai-add"] = (d, f) => {
  if (!gqDraft || !S.can("host.games")) return;
  const set = String(d.set || "").trim().slice(0, 60), at = new Date().toISOString();
  const keep = gqDraft.items.filter((_, i) => d[`k${i}`]);
  if (!keep.length) return formError(f, "Check at least one question.");
  for (const q of keep) S.add("gameQuestions", { ...q, set, by: S.me().id, at });
  gqDraft = null; closeSheet(true);
  toast(`Added ${plural(keep.length, "question")}`);
  go(`gameqs-${keep[0].game}`);
};
