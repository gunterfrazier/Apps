// ---------- Word: sermons, reading plans, notes, and Veritas Logos links ----------

const wordSeg = () => [["word", "Sermons", S.on("sermons")], ["plans", "Reading plans", S.on("plans")], ["notes", "My notes", S.on("sermons")]];

function sermonRow(s) {
  const hasNote = S.state.notes[s.id]?.text;
  return html`<a class="row" href="#sermon-${s.id}" data-search="${s.title} ${s.passage} ${s.speaker} ${s.series}">
    <span class="lead-ic">${icon("play")}</span>
    <span class="body"><span class="t">${s.title}</span><span class="s">${s.passage}, ${s.speaker}</span><span class="s">${fmtShort(s.date)}${hasNote ? " (you took notes)" : ""}</span></span>${icon("chev")}</a>`;
}

function veritasPanel(passage, topic, label = "Study this passage") {
  if (!Veritas.enabled() || !Veritas.read(passage)) return "";
  return html`<div class="veritas"><h3>${icon("book")}${label} in Veritas Logos</h3>
    <p>Read it in five translations with Hebrew and Greek, cross references and study tools.</p>
    <div class="btns">${ext(Veritas.read(passage), `Read ${passage}`, "btn sm", "word")}${ext(Veritas.ask(passage), "Ask about it", "btn ghost sm", "ask")}${topic ? ext(Veritas.guide(topic), `Build a study guide on ${topic}`, "btn ghost sm", "note") : ""}</div></div>`;
}

Screens.word = () => {
  if (!S.on("sermons")) return { redirect: S.on("plans") ? "plans" : "home" };
  const list = sermonsSorted();
  const books = [...new Set(list.map((s) => parseRef(s.passage)?.book).filter(Boolean))];
  return {
    title: "Word", tab: "word",
    body: html`${seg(wordSeg(), "word")}
      ${Veritas.enabled() ? html`<form class="panel" style="margin-top:12px" data-form="bible-lookup" novalidate>
        <label class="field" style="margin-top:0"><span>Look up a passage</span>
        <div style="display:flex;gap:8px"><input type="search" name="ref" placeholder="John 3:16" data-input="bible-ref" autocomplete="off"><a class="btn" id="bible-open" href="${Veritas.home()}" target="_blank" rel="noopener">Open</a></div>
        <small id="bible-hint">Opens in Veritas Logos.</small></label></form>` : ""}
      ${S.on("live") ? html`<a class="row panel" href="#live" style="margin-top:12px;padding:12px 16px"><span class="lead-ic">${icon("live")}</span><span class="body"><span class="t">Watch live</span><span class="s">Stream services as they happen</span></span>${icon("chev")}</a>` : ""}
      <label class="field"><span class="sr">Search sermons</span><input type="search" placeholder="Search titles, passages, speakers and what was said" data-input="sermon-search" value="${sermonQuery}"></label>
      ${books.length > 1 ? html`<div class="chips" role="group" aria-label="Filter by book">${books.map((b) => html`<button class="chip" data-act="sermon-book" data-book="${b}" aria-pressed="${b === sermonBook}">${b}</button>`)}</div>` : ""}
      <div id="sermon-list">${sermonResults()}</div>
      ${canMedia() ? html`<div class="btns"><a class="btn ghost sm" href="#podcast">${icon("music")}Podcast feed</a></div>` : ""}`,
  };
};
Inputs["bible-ref"] = (el) => {
  const link = $("#bible-open"), hint = $("#bible-hint");
  const v = el.value.trim();
  const url = v ? Veritas.read(v) : Veritas.home();
  link.href = url || Veritas.home();
  hint.textContent = !v ? "Opens in Veritas Logos." : url ? `Opens ${parseRef(v).book} ${parseRef(v).chapter}${parseRef(v).verse ? ":" + parseRef(v).verse : ""} in Veritas Logos.` : "Try a reference like John 3:16 or Psalm 23.";
};
Forms["bible-lookup"] = () => $("#bible-open").focus();

Screens.sermon = (id) => {
  const s = S.get("sermons", id);
  if (!s) return { redirect: "word" };
  const note = S.state.notes[s.id];
  const saved = S.state.saved.includes(s.id);
  return {
    title: s.title, back: "word", tab: "word",
    body: html`
      <p class="faint" style="margin:16px 0 2px">${s.series}</p>
      <h1>${s.title}</h1>
      <p class="muted" style="margin-top:4px">${s.speaker}, ${fmtDay(s.date)}${s.time ? ` at ${timeLabel(s.time)}` : ""}${s.locationId && multiCampus() ? `, ${locName(s.locationId)}` : ""}</p>
      ${sermonMedia(s)}
      <div class="btns">
        <button class="btn ${saved ? "soft" : "ghost"} sm" data-act="toggle-save" data-id="${s.id}" aria-pressed="${saved}">${icon("bookmark")}${saved ? "Saved" : "Save"}</button>
        <button class="btn ghost sm" data-act="copy" data-done="Sermon details copied" data-text="${`${s.title} (${s.passage}), ${s.speaker}, ${S.church().name}, ${fmtShort(s.date)}\n${appLink(`sermon-${s.id}`)}`}">${icon("share")}Share</button>
        ${canMedia() ? html`<a class="btn ghost sm" href="#media-${s.id}">${icon("edit")}Media and transcript</a>` : ""}
      </div>
      ${canAI() ? html`<div class="ai-row"><span class="ai-label">${icon("bolt")}Veritas Logos can draft</span><button class="btn ghost sm" data-act="ai-questions" data-id="${s.id}">Discussion questions</button>${S.can("build.lessons") ? html`<button class="btn ghost sm" data-act="ai-lesson" data-id="${s.id}">A kids lesson</button>` : ""}</div>` : ""}
      ${s.summary ? html`<p class="lead" style="margin-top:18px">${s.summary}</p>` : ""}
      <p><span class="faint">Scripture</span><br><span class="scripture" style="font-size:1.2rem">${s.passage}</span></p>
      ${veritasPanel(s.passage, s.topic)}
      ${s.outline?.length ? html`<section class="sec"><h2>Outline</h2><ol class="outline">${s.outline.map((p) => html`<li>${p}</li>`)}</ol></section>` : ""}
      ${s.docId && S.get("docs", s.docId) ? html`<div class="btns"><a class="btn ghost sm" href="#outline-${s.docId}">${icon("note")}Full sermon outline</a></div>` : ""}
      ${transcriptSection(s)}
      <section class="sec"><div class="sec-head"><h2>My notes</h2><span class="faint" id="note-status" aria-live="polite">${note?.at ? `Saved ${ago(note.at)}` : ""}</span></div>
        <label class="sr" for="note">Notes for ${s.title}</label>
        <textarea class="notes" id="note" data-input="sermon-note" data-id="${s.id}" placeholder="Write what stood out, questions to ask your group, a verse to memorize...">${note?.text || ""}</textarea>
        <p class="faint">Notes are private to you.</p>
      </section>`,
  };
};
let noteTimer = 0;
Inputs["sermon-note"] = (el) => {
  clearTimeout(noteTimer);
  $("#note-status").textContent = "Saving...";
  noteTimer = setTimeout(() => {
    const text = el.value;
    if (text.trim()) S.state.notes[el.dataset.id] = { text, at: new Date().toISOString() };
    else delete S.state.notes[el.dataset.id];
    S.save();
    $("#note-status").textContent = text.trim() ? "Saved" : "";
  }, 500);
};
Actions["toggle-save"] = (el) => {
  const id = el.dataset.id, list = S.state.saved;
  const i = list.indexOf(id);
  if (i < 0) list.push(id); else list.splice(i, 1);
  S.save(); toast(i < 0 ? "Saved to Me" : "Removed from saved"); render();
};

Screens.plans = () => {
  const plans = S.list("plans");
  return {
    title: "Word", tab: "word",
    body: html`${seg(wordSeg(), "plans")}
      <div class="rows" style="margin-top:14px">${plans.length ? plans.map((p) => {
        const st = planState(p), done = st ? st.done.length : 0;
        return html`<a class="row" href="#plan-${p.id}"><span class="lead-ic">${icon("book")}</span><span class="body"><span class="t">${p.name}</span>
          <span class="s">${st ? (done >= p.days.length ? "Finished" : `Day ${nextPlanDay(p) + 1} of ${p.days.length}`) : `${p.days.length} days`}</span>
          ${st ? html`<span class="progress" style="display:block;margin-top:6px"><i style="width:${Math.round(done / p.days.length * 100)}%"></i></span>` : ""}</span>${icon("chev")}</a>`;
      }) : empty("Your church hasn't added a reading plan yet.")}</div>`,
  };
};

Screens.plan = (id) => {
  const p = S.get("plans", id);
  if (!p) return { redirect: "plans" };
  const st = planState(p);
  return {
    title: p.name, back: "plans", tab: "word",
    body: html`<h1 style="margin-top:16px">${p.name}</h1><p class="muted">${p.description}</p>
      ${st ? html`<div class="progress" style="margin:12px 0"><i style="width:${Math.round(st.done.length / p.days.length * 100)}%"></i></div><p class="faint">${st.done.length} of ${p.days.length} days read. Started ${fmtShort(st.started)}.</p>`
        : html`<button class="btn block" style="margin-top:12px" data-act="plan-start" data-plan="${p.id}">Start this plan</button>`}
      <div class="rows" style="margin-top:14px">${p.days.map((refs, d) => {
        const done = st?.done.includes(d);
        const link = Veritas.enabled() && Veritas.read(refs[0]);
        return html`<div class="row"><label class="check" style="padding:0;flex:1"><input type="checkbox" data-change="plan-toggle" data-plan="${p.id}" data-day="${d}" ${done ? raw("checked") : ""}>
          <span><span class="t">Day ${d + 1}</span><span class="s scripture">${refs.join(", ")}</span></span></label>
          ${link ? ext(link, "Read", "btn ghost sm") : ""}</div>`;
      })}</div>
      ${st ? html`<div class="btns"><button class="btn ghost sm" data-act="plan-stop" data-plan="${p.id}">Stop this plan</button></div>` : ""}`,
  };
};
function ensurePlan(id) { return S.state.progress[id] ||= { started: new Date().toISOString(), done: [] }; }
Actions["plan-start"] = (el) => { ensurePlan(el.dataset.plan); S.save(); toast("Plan started. Today's reading is on Home."); render(); };
Actions["plan-stop"] = (el) => { delete S.state.progress[el.dataset.plan]; S.save(); render(); };
Actions["plan-done"] = (el) => {
  const st = ensurePlan(el.dataset.plan), d = +el.dataset.day;
  if (!st.done.includes(d)) st.done.push(d);
  S.save(); toast(`Day ${d + 1} done`); render();
};
Inputs["plan-toggle"] = (el) => {
  const st = ensurePlan(el.dataset.plan), d = +el.dataset.day;
  st.done = el.checked ? [...new Set([...st.done, d])] : st.done.filter((x) => x !== d);
  S.save(); render();
};

Screens.notes = () => {
  const items = Object.entries(S.state.notes).map(([id, n]) => ({ s: S.get("sermons", id), n })).filter((x) => x.s && x.s.churchId === S.state.current).sort((a, b) => new Date(b.n.at) - new Date(a.n.at));
  const all = items.map(({ s, n }) => `${s.title} (${s.passage}), ${fmtShort(s.date)}\n${n.text}`).join("\n\n---\n\n");
  return {
    title: "Word", tab: "word",
    body: html`${seg(wordSeg(), "notes")}
      <div class="rows" style="margin-top:14px">${items.length ? items.map(({ s, n }) => html`<a class="row" href="#sermon-${s.id}"><span class="lead-ic">${icon("note")}</span><span class="body"><span class="t">${s.title}</span><span class="s">${n.text.slice(0, 90)}${n.text.length > 90 ? "..." : ""}</span><span class="s">Edited ${ago(n.at)}</span></span>${icon("chev")}</a>`)
        : empty("Notes you take on a sermon show up here.", html`<a class="btn ghost" href="#word">Browse sermons</a>`)}</div>
      ${items.length ? html`<div class="btns"><button class="btn ghost" data-act="copy" data-done="All notes copied" data-text="${all}">${icon("copy")}Copy all notes</button></div>` : ""}`,
  };
};
