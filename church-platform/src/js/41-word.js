// ---------- Word: sermons, interactive fill-in-the-blank notes, Live Pew Sync, reading plans & Veritas Logos ----------
// Pastors can wrap words in [brackets] in a sermon outline (e.g., "Abiding in the [Vine] bears [fruit]") to create
// interactive tap-to-reveal or type-to-fill blanks that save directly to the member's personal journal.
// Preachers and the tech booth can toggle Live Pew Sync to push the active Scripture slide, outline point, or a live
// congregation poll to everyone currently viewing the sermon or in Sanctuary Mode.

const wordSeg = () => [["word", "Sermons", S.on("sermons")], ["bible", "Bible", true], ["plans", "Reading plans", S.on("plans")], ["notes", "My notes", true]];

// Ensure sample sermons have bracketed fill-in-the-blank outline examples if none contain brackets yet
{
  const prevLoad = S.load.bind(S);
  S.load = function () {
    prevLoad();
    (this.state.sermons || []).forEach((s) => {
      if (Array.isArray(s.outline) && s.outline.length && !s.outline.some((line) => /\[[^\]]+\]/.test(line))) {
        s.outline = s.outline.map((line) => {
          const words = String(line).split(" ");
          if (words.length < 4) return line;
          // Bracket the last meaningful 5+ letter word in each point for interactive fill-in-the-blank demo
          for (let i = words.length - 1; i >= 1; i--) {
            const clean = words[i].replace(/[^a-zA-Z]/g, "");
            if (clean.length >= 5) {
              words[i] = words[i].replace(clean, `[${clean}]`);
              break;
            }
          }
          return words.join(" ");
        });
      }
    });
  };
}

let pewChannel = null;
try { pewChannel = "BroadcastChannel" in window ? new BroadcastChannel("our-faithful-pew-sync") : null; } catch { pewChannel = null; }
if (pewChannel) {
  pewChannel.onmessage = (e) => {
    const c = S.church();
    if (!c || e.data?.churchId !== c.id) return;
    c.livePew = e.data.pew;
    if (location.hash.startsWith("#sermon-") || location.hash === "#word" || location.hash === "#home") render();
  };
}

function broadcastPewSync(pewPatch) {
  const c = S.church(); if (!c) return;
  c.livePew = pewPatch ? { ...(c.livePew || {}), ...pewPatch, updatedAt: new Date().toISOString() } : null;
  S.save();
  try { pewChannel?.postMessage({ churchId: c.id, pew: c.livePew }); } catch {}
  if (typeof Backend !== "undefined" && Backend.on) {
    Backend.broadcast({ type: "pew-sync", churchId: c.id, pew: c.livePew }, `church:${c.id}`);
  }
}

function sermonRow(s) {
  const hasNote = S.state.notes[s.id]?.text || Object.keys(S.state.notes[s.id]?.blanks || {}).length;
  const playing = typeof Player !== "undefined" && Player.isPlaying(s.id);
  const isLivePew = S.church()?.livePew?.active && S.church()?.livePew?.sermonId === s.id;
  return html`<div class="row sermon-row" data-search="${s.title} ${s.passage} ${s.speaker} ${s.series}">
    <a href="#sermon-${s.id}" style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;color:inherit;text-decoration:none">
      ${typeof sermonArtTile === "function" ? sermonArtTile(s, 52) : html`<span class="lead-ic">${icon("play")}</span>`}
      <span class="body"><span class="t">${s.title}${isLivePew ? html` <span class="tag ok" style="font-size:.7rem">Live Pew Sync</span>` : ""}</span><span class="s">${s.passage} · ${s.speaker}</span><span class="s">${fmtShort(s.date)} · ${s.minutes || 35} min${hasNote ? " · Notes saved" : ""}</span></span>
    </a>
    ${sermonSources(s).length ? html`<button type="button" class="sr-play" data-act="mini-play" data-id="${s.id}" data-title="${s.title}" aria-label="${playing ? `Pause ${s.title}` : `Play ${s.title}`}">${icon(playing ? "pause" : "play")}</button>` : ""}
  </div>`;
}

function veritasPanel(passage, topic, label = "Study this passage") {
  const logos = Logos.shown() && Logos.link(passage) ? ext(Logos.link(passage), "Open in Logos", "btn ghost sm", "link") : "";
  if (!Veritas.enabled() || !Veritas.read(passage)) return logos ? html`<div class="btns">${logos}</div>` : "";
  return html`<div class="veritas"><h3>${icon("book")}${label} in Veritas Logos</h3>
    <p>Read it in five translations with Hebrew and Greek, cross references and study tools.</p>
    <div class="btns">${ext(Veritas.read(passage), `Read ${passage}`, "btn sm", "word")}${ext(Veritas.ask(passage), "Ask about it", "btn ghost sm", "ask")}${topic ? ext(Veritas.guide(topic), `Build a study guide on ${topic}`, "btn ghost sm", "note") : ""}${logos}</div></div>`;
}

Screens.word = () => {
  if (!S.on("sermons")) return { redirect: S.on("plans") ? "plans" : "home" };
  const list = sermonsSorted();
  const books = [...new Set(list.map((s) => parseRef(s.passage)?.book).filter(Boolean))];
  const livePew = S.church()?.livePew;
  const liveSermon = livePew?.active && livePew.sermonId ? S.get("sermons", livePew.sermonId) : null;
  return {
    title: "Word", tab: "word",
    body: html`${seg(wordSeg(), "word")}
      ${liveSermon ? html`<a class="row panel pew-live-banner" href="#sermon-${liveSermon.id}" style="margin-top:12px;padding:12px 16px">
        <span class="lead-ic" style="background:var(--ok);color:#fff">${icon("live")}</span>
        <span class="body"><span class="t">Live in the Sanctuary: ${liveSermon.title}</span><span class="s">Tap to follow interactive fill-in-the-blank notes &amp; live Scripture sync</span></span>
        ${icon("chev")}
      </a>` : ""}
      <form class="panel" style="margin-top:12px" data-form="bible-lookup" novalidate>
        <label class="field" style="margin-top:0"><span>Look up a passage</span>
        <div style="display:flex;gap:8px"><input type="search" name="ref" placeholder="John 3:16" data-input="bible-ref" autocomplete="off"><button class="btn" id="bible-open">Open</button></div>
        <small id="bible-hint">${lookupHint("")}</small></label></form>
      ${S.on("live") ? html`<a class="row panel" href="#live" style="margin-top:12px;padding:12px 16px"><span class="lead-ic">${icon("live")}</span><span class="body"><span class="t">Watch live</span><span class="s">Stream services as they happen</span></span>${icon("chev")}</a>` : ""}
      <label class="field"><span class="sr">Search sermons</span><input type="search" placeholder="Search titles, passages, speakers and what was said" data-input="sermon-search" value="${sermonQuery}"></label>
      ${books.length > 1 ? html`<div class="chips" role="group" aria-label="Filter by book">${books.map((b) => html`<button class="chip" data-act="sermon-book" data-book="${b}" aria-pressed="${b === sermonBook}">${b}</button>`)}</div>` : ""}
      <div id="sermon-list">${sermonResults()}</div>
      ${canMedia() ? html`<div class="btns"><a class="btn ghost sm" href="#podcast">${icon("music")}Podcast feed</a></div>` : ""}`,
  };
};
const lookupWhere = () => ({ app: "the Bible here", veritas: "Veritas Logos", logos: "Logos" })[bibleOpen()];
function lookupHint(v) { const r = v && parseRef(v); return !v ? `Opens in ${lookupWhere()}.` : r ? `Opens ${refLabel(r)} in ${lookupWhere()}.` : "Try a reference like John 3:16 or Psalm 23."; }
Inputs["bible-ref"] = (el) => { $("#bible-hint").textContent = lookupHint(el.value.trim()); };
Forms["bible-lookup"] = (d) => {
  const href = bibleHref(String(d.ref || "").trim());
  if (!href) { if (!String(d.ref || "").trim()) go("bible"); else toast("Try a reference like John 3:16 or Psalm 23"); return; }
  if (href.startsWith("#")) go(href.slice(1)); else window.open(href, "_blank", "noopener");
};

// ----- Interactive Fill-in-the-Blank Parser & Renderer -----
function ensureSermonNoteObj(sermonId) {
  const cur = S.state.notes[sermonId];
  if (!cur || typeof cur !== "object") {
    S.state.notes[sermonId] = { text: "", blanks: {}, revealed: [], at: new Date().toISOString() };
  } else {
    cur.blanks ||= {};
    cur.revealed ||= [];
  }
  return S.state.notes[sermonId];
}

/** Renders an outline point, turning any [bracketed] words into interactive tap-to-reveal / type-to-fill inputs. */
function renderFillInLine(sermon, lineIdx, lineText, isHighlighted) {
  const noteObj = S.state.notes[sermon.id] || {};
  const blanks = noteObj.blanks || {};
  const revealed = noteObj.revealed || [];
  let blankCounter = 0;
  const parts = String(lineText || "").split(/(\[[^\]]+\])/g);
  const rendered = parts.map((chunk) => {
    const m = chunk.match(/^\[([^\]]+)\]$/);
    if (!m) return html`${chunk}`;
    const answer = m[1].trim();
    const key = `${lineIdx}:${blankCounter++}`;
    const isRevealed = revealed.includes(key);
    const typed = blanks[key] ?? (isRevealed ? answer : "");
    const matched = typed.trim().toLowerCase() === answer.toLowerCase();
    return html`<span class="fib-wrap ${matched ? "is-correct" : typed ? "is-typed" : ""}">
      <input type="text" class="fib-input" data-input="fib-type" data-sermon="${sermon.id}" data-key="${key}" data-answer="${answer}" value="${typed}" placeholder="${"_".repeat(Math.max(5, Math.min(12, answer.length)))}" style="width:${Math.max(7, answer.length + 3)}ch" aria-label="Fill in the blank">
      <button type="button" class="fib-reveal-btn" data-act="fib-reveal" data-sermon="${sermon.id}" data-key="${key}" data-answer="${answer}" title="${matched ? "Revealed" : "Tap to reveal answer"}">${matched ? "✓" : "?"}</button>
    </span>`;
  });
  return html`<li class="fib-item ${isHighlighted ? "pew-active-point" : ""}">${rendered}${isHighlighted ? html` <span class="tag ok" style="font-size:.7rem;margin-left:6px">Live now</span>` : ""}</li>`;
}

/** Converts the sermon outline (with any filled-in blanks) into plain text for the member's personal journal. */
function buildFilledOutlineText(s) {
  const noteObj = S.state.notes[s.id] || {};
  const blanks = noteObj.blanks || {}, revealed = noteObj.revealed || [];
  return (s.outline || []).map((line, lineIdx) => {
    let bc = 0;
    const filled = String(line).replace(/\[([^\]]+)\]/g, (_, ans) => {
      const key = `${lineIdx}:${bc++}`;
      const val = blanks[key] || (revealed.includes(key) ? ans : ans);
      return `[${val.toUpperCase()}]`;
    });
    return `${lineIdx + 1}. ${filled}`;
  }).join("\n");
}

Inputs["fib-type"] = (el) => {
  const sId = el.dataset.sermon, key = el.dataset.key, ans = el.dataset.answer;
  const n = ensureSermonNoteObj(sId);
  n.blanks[key] = el.value;
  n.at = new Date().toISOString();
  const wrap = el.closest(".fib-wrap");
  if (wrap) {
    const ok = el.value.trim().toLowerCase() === ans.toLowerCase();
    wrap.classList.toggle("is-correct", ok);
    wrap.classList.toggle("is-typed", !!el.value.trim() && !ok);
  }
  S.save();
  const st = $("#note-status"); if (st) st.textContent = "Saved";
};

Actions["fib-reveal"] = (el) => {
  const sId = el.dataset.sermon, key = el.dataset.key, ans = el.dataset.answer;
  const n = ensureSermonNoteObj(sId);
  if (!n.revealed.includes(key)) n.revealed.push(key);
  n.blanks[key] = ans;
  n.at = new Date().toISOString();
  S.save(); render();
};

Actions["fib-reveal-all"] = (el) => {
  const s = S.get("sermons", el.dataset.id); if (!s) return;
  const n = ensureSermonNoteObj(s.id);
  (s.outline || []).forEach((line, lineIdx) => {
    let bc = 0;
    String(line).replace(/\[([^\]]+)\]/g, (_, ans) => {
      const key = `${lineIdx}:${bc++}`;
      if (!n.revealed.includes(key)) n.revealed.push(key);
      n.blanks[key] = ans.trim();
    });
  });
  n.at = new Date().toISOString();
  S.save(); toast("All blanks revealed"); render();
};

Actions["fib-reset"] = (el) => {
  const s = S.get("sermons", el.dataset.id); if (!s) return;
  const n = ensureSermonNoteObj(s.id);
  n.blanks = {}; n.revealed = []; n.at = new Date().toISOString();
  S.save(); toast("Blanks reset"); render();
};

Actions["fib-save-journal"] = (el) => {
  const s = S.get("sermons", el.dataset.id); if (!s) return;
  const n = ensureSermonNoteObj(s.id);
  const outlineText = buildFilledOutlineText(s);
  const existing = String(n.text || "").trim();
  n.text = existing ? `${existing}\n\n--- Sermon Outline ---\n${outlineText}` : `--- Sermon Outline ---\n${outlineText}`;
  n.at = new Date().toISOString();
  S.save(); toast("Saved completed outline into your personal journal below"); render();
};

// ----- Live Pew Sync Panel (Congregation View + Preacher/Booth Push Controls) -----
function renderPewSyncSection(s) {
  const c = S.church(), pew = c?.livePew;
  const canPush = S.isMember() && S.canAny(["present", "manage.sermons", "build.sermons", "manage.church"]);
  const isThisLive = pew?.active && pew?.sermonId === s.id;
  const me = S.me().id;
  const poll = isThisLive ? pew.poll : null;
  const totalVotes = poll ? (poll.options || []).reduce((n, o) => n + (o.voters?.length || 0), 0) : 0;

  return html`
    ${isThisLive ? html`<div class="pew-sync-card">
      <div class="pew-sync-head">
        <span class="pew-live-dot"></span>
        <b>Live Pew Sync</b>
        <span class="faint" style="font-size:.8rem">Following the sanctuary screen in real time</span>
      </div>
      ${pew.activeRef ? html`<div class="pew-pushed-scripture">
        <span class="faint" style="font-size:.76rem;text-transform:uppercase">Active Scripture on screen</span>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:2px">
          <b class="scripture" style="font-size:1.1rem">${pew.activeRef}</b>
          ${readLink(pew.activeRef, "Open in Bible", "btn sm")}
        </div>
        ${pew.activeSlideText ? html`<p class="muted" style="margin:6px 0 0;font-family:var(--serif)">${pew.activeSlideText}</p>` : ""}
      </div>` : ""}
      ${poll ? html`<div class="pew-live-poll">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
          <b>Live Poll: ${poll.question}</b>
          <span class="faint" style="font-size:.78rem">${plural(totalVotes, "response")}</span>
        </div>
        <div class="board-poll">
          ${(poll.options || []).map((o) => {
            const voted = (o.voters || []).includes(me);
            const pctV = totalVotes ? Math.round(((o.voters?.length || 0) / totalVotes) * 100) : 0;
            return html`<button type="button" class="board-poll-opt ${voted ? "voted" : ""}" data-act="pew-poll-vote" data-opt="${o.id}">
              <span class="board-poll-bar" style="width:${pctV}%"></span>
              <span class="board-poll-label">${voted ? "✓ " : ""}${o.label}</span>
              <span class="board-poll-pct">${pctV}% (${o.voters?.length || 0})</span>
            </button>`;
          })}
        </div>
      </div>` : ""}
    </div>` : ""}

    ${canPush ? html`<details class="panel pew-booth-box" style="margin-top:14px"${isThisLive ? " open" : ""}>
      <summary style="cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:space-between">
        <span>${icon("live")} Preacher &amp; Booth Live Pew Sync Controls</span>
        <span class="tag ${isThisLive ? "ok" : ""}">${isThisLive ? "Broadcasting Live" : "Off"}</span>
      </summary>
      <div style="margin-top:10px">
        <p class="faint" style="margin-top:0">Push the active outline point, Scripture passage, or a live poll to everyone viewing this sermon or in Sanctuary Mode.</p>
        <div class="btns" style="margin-top:8px">
          <button type="button" class="btn ${isThisLive ? "danger" : ""} sm" data-act="pew-toggle-live" data-id="${s.id}">
            ${icon("live")}${isThisLive ? "Stop Live Pew Sync" : "Start Live Pew Sync for this sermon"}
          </button>
          <button type="button" class="btn ghost sm" data-act="pew-push-scripture" data-id="${s.id}" data-ref="${s.passage}">
            ${icon("book")}Push ${s.passage} to pews
          </button>
          <button type="button" class="btn ghost sm" data-act="pew-poll-modal" data-id="${s.id}">
            ${icon("ask")}${poll ? "Update / Clear Live Poll" : "Launch Live Pew Poll"}
          </button>
        </div>
        ${(s.outline || []).length ? html`<div style="margin-top:10px">
          <span class="faint" style="font-size:.8rem"><b>Push active outline point to congregation:</b></span>
          <div class="chips" style="margin-top:6px">
            ${s.outline.map((_, idx) => html`<button type="button" class="chip ${isThisLive && pew.outlineIndex === idx ? "seg-active" : ""}" data-act="pew-push-point" data-id="${s.id}" data-idx="${idx}">Point ${idx + 1}</button>`)}
          </div>
        </div>` : ""}
      </div>
    </details>` : ""}
  `;
}

Actions["pew-toggle-live"] = (el) => {
  const s = S.get("sermons", el.dataset.id); if (!s) return;
  const cur = S.church()?.livePew;
  if (cur?.active && cur.sermonId === s.id) {
    broadcastPewSync({ active: false, sermonId: null, outlineIndex: null, activeRef: "", activeSlideText: "", poll: null });
    toast("Live Pew Sync ended");
  } else {
    broadcastPewSync({ active: true, sermonId: s.id, outlineIndex: 0, activeRef: s.passage, activeSlideText: s.summary || "" });
    toast("Live Pew Sync is now broadcasting to the congregation!");
  }
  render();
};

Actions["pew-push-point"] = (el) => {
  const s = S.get("sermons", el.dataset.id); if (!s) return;
  const idx = +el.dataset.idx;
  broadcastPewSync({ active: true, sermonId: s.id, outlineIndex: idx, activeSlideText: String(s.outline?.[idx] || "").replace(/\[([^\]]+)\]/g, "$1") });
  toast(`Pushed Point ${idx + 1} to congregation pews`);
  render();
};

Actions["pew-push-scripture"] = (el) => {
  const s = S.get("sermons", el.dataset.id); if (!s) return;
  broadcastPewSync({ active: true, sermonId: s.id, activeRef: el.dataset.ref || s.passage });
  toast(`Pushed ${el.dataset.ref || s.passage} to congregation pews`);
  render();
};

Actions["pew-poll-modal"] = (el) => {
  const s = S.get("sermons", el.dataset.id); if (!s) return;
  const existing = S.church()?.livePew?.poll;
  openSheet("Launch Live Congregation Poll", html`<form data-form="pew-poll-save" novalidate>
    <input type="hidden" name="sermonId" value="${s.id}">
    <label class="field"><span>Poll question</span><input type="text" name="question" required maxlength="140" value="${existing?.question || "Which takeaway from today's message speaks most to where you are this week?"}"></label>
    <label class="field"><span>Choices (one per line)</span><textarea name="options" rows="4" required>${existing?.options ? existing.options.map((o) => o.label).join("\n") : "Resting and abiding in Christ daily\nLetting go of anxious self-effort\nBearing fruit in my home and workplace\nAsking for prayer and community support"}</textarea></label>
    <div class="btns">
      <button class="btn">Push live poll to pews</button>
      ${existing ? html`<button type="button" class="btn danger" data-act="pew-poll-clear">Clear poll</button>` : ""}
    </div>
  </form>`);
};

Forms["pew-poll-save"] = (d, f) => {
  const q = String(d.question || "").trim();
  const opts = String(d.options || "").split("\n").map((x) => x.trim()).filter(Boolean);
  if (!q || opts.length < 2) return formError(f, "Enter a question and at least two choices.");
  broadcastPewSync({
    active: true,
    sermonId: d.sermonId,
    poll: { id: uid(), question: q, options: opts.map((label) => ({ id: uid(), label, voters: [] })) },
  });
  closeSheet(true); toast("Live poll pushed to everyone in Sanctuary / Sermon view"); render();
};

Actions["pew-poll-clear"] = () => {
  broadcastPewSync({ poll: null });
  closeSheet(true); toast("Live poll cleared"); render();
};

Actions["pew-poll-vote"] = (el) => {
  const c = S.church(), poll = c?.livePew?.poll; if (!poll) return;
  const me = S.me().id;
  poll.options.forEach((o) => {
    o.voters = (o.voters || []).filter((u) => u !== me);
    if (o.id === el.dataset.opt) o.voters.push(me);
  });
  broadcastPewSync({ poll });
  render();
};

Screens.sermon = (id) => {
  const s = S.get("sermons", id);
  if (!s) return { redirect: "word" };
  const note = S.state.notes[s.id];
  const saved = S.state.saved.includes(s.id);
  const pew = S.church()?.livePew;
  const activePointIdx = pew?.active && pew?.sermonId === s.id ? pew.outlineIndex : null;
  const hasBrackets = (s.outline || []).some((l) => /\[[^\]]+\]/.test(l));

  return {
    title: s.title, back: "word", tab: "word",
    body: html`
      ${renderPewSyncSection(s)}
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
      <div class="btns" style="margin-top:0">${listenBtn(`passage:${s.passage}`, "Listen to the passage")}${s.summary || s.transcript?.length ? listenBtn(`sermon:${s.id}`, "Read sermon text aloud") : ""}</div>
      ${veritasPanel(s.passage, s.topic)}
      ${xrefPanel(s.passage)}
      ${pastPanel(s.passage, { sermon: s.id, label: "Also on this passage" })}
      ${s.outline?.length ? html`<section class="sec">
        <div class="sec-head">
          <h2>Interactive sermon outline</h2>
          ${hasBrackets ? html`<div class="btns" style="margin:0">
            <button type="button" class="btn ghost sm" data-act="fib-reveal-all" data-id="${s.id}">Reveal blanks</button>
            <button type="button" class="btn ghost sm" data-act="fib-reset" data-id="${s.id}">Reset</button>
            <button type="button" class="btn sm" data-act="fib-save-journal" data-id="${s.id}">${icon("note")}Save to my journal</button>
          </div>` : ""}
        </div>
        ${hasBrackets ? html`<p class="faint" style="margin:-2px 0 8px">Type in the blanks or tap <b>?</b> to reveal each key word—your progress saves automatically.</p>` : ""}
        <ol class="outline fib-outline">${s.outline.map((p, idx) => renderFillInLine(s, idx, p, activePointIdx === idx))}</ol>
      </section>` : ""}
      ${s.docId && S.get("docs", s.docId) ? html`<div class="btns"><a class="btn ghost sm" href="#outline-${s.docId}">${icon("note")}Full sermon outline</a></div>` : ""}
      ${transcriptSection(s)}
      <section class="sec"><div class="sec-head"><h2>My notes</h2><div style="display:flex;align-items:center;gap:8px"><span class="faint" id="note-status" aria-live="polite">${note?.at ? `Saved ${ago(note.at)}` : ""}</span><button type="button" class="btn ghost sm" data-act="toggle-sanctuary">${icon(typeof prefs === "function" && prefs().theme === "sanctuary" ? "sun" : "moon")}${typeof prefs === "function" && prefs().theme === "sanctuary" ? "Standard view" : "Sanctuary OLED"}</button></div></div>
        <label class="sr" for="note">Notes for ${s.title}</label>
        <textarea class="notes" id="note" data-input="sermon-note" data-id="${s.id}" placeholder="Write what stood out, questions to ask your group, a verse to memorize...">${note?.text || ""}</textarea>
        <p class="faint">Notes and filled-in blanks are private to you and saved in your personal journal.</p>
      </section>`,
  };
};
let noteTimer = 0;
Inputs["sermon-note"] = (el) => {
  clearTimeout(noteTimer);
  $("#note-status").textContent = "Saving...";
  noteTimer = setTimeout(() => {
    const text = el.value;
    const n = ensureSermonNoteObj(el.dataset.id);
    n.text = text;
    n.at = new Date().toISOString();
    if (!text.trim() && !Object.keys(n.blanks || {}).length) delete S.state.notes[el.dataset.id];
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
        return html`<div class="row"><label class="check" style="padding:0;flex:1"><input type="checkbox" data-change="plan-toggle" data-plan="${p.id}" data-day="${d}" ${done ? raw("checked") : ""}>
          <span><span class="t">Day ${d + 1}</span><span class="s scripture">${refs.join(", ")}</span></span></label>
          ${readLink(refs[0], "Read", "btn ghost sm")}</div>`;
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
  const verseNotes = Object.entries(S.state.verseNotes || {}).map(([k, n]) => ({ k, n, sp: noteSpan(k) })).filter((x) => x.sp).sort((a, b) => new Date(b.n.at) - new Date(a.n.at));
  const runs = [];
  Object.entries(S.state.highlights || {}).map(([k, c]) => { const [b, ch, v] = k.split(".").map(Number); return { b, ch, v, c }; }).filter((x) => BOOKS[x.b])
    .sort((x, y) => vkey(x.b, x.ch, x.v) - vkey(y.b, y.ch, y.v)).forEach((x) => { const r = runs[runs.length - 1]; if (r && r.b === x.b && r.c === x.ch && r.color === x.c && r.v2 === x.v - 1) r.v2 = x.v; else runs.push({ b: x.b, c: x.ch, v1: x.v, v2: x.v, color: x.c }); });
  const all = [...items.map(({ s, n }) => `${s.title} (${s.passage}), ${fmtShort(s.date)}\n${n.text || buildFilledOutlineText(s)}`), ...verseNotes.map(({ sp, n }) => `${spanLabel(sp)}\n${n.text}`)].join("\n\n---\n\n");
  const snip = (t) => `${String(t || "").slice(0, 90)}${String(t || "").length > 90 ? "..." : ""}`;
  return {
    title: "Word", tab: "word",
    body: html`${seg(wordSeg(), "notes")}
      ${items.length || verseNotes.length || runs.length ? "" : html`<div class="rows" style="margin-top:14px">${empty("Notes you take on a sermon or a Bible verse, and verses you highlight, show up here.", html`<a class="btn ghost" href="#bible">Open the Bible</a>`)}</div>`}
      ${items.length ? html`<section class="sec"><h2 class="sec-head">Sermon notes</h2><div class="rows">${items.map(({ s, n }) => html`<a class="row" href="#sermon-${s.id}"><span class="lead-ic">${icon("note")}</span><span class="body"><span class="t">${s.title}</span><span class="s">${snip(n.text || `${Object.keys(n.blanks || {}).length} fill-in-the-blank answers saved`)}</span><span class="s">${s.passage}, ${fmtShort(s.date)}</span></span>${icon("chev")}</a>`)}</div></section>` : ""}
      ${verseNotes.length ? html`<section class="sec"><h2 class="sec-head">Bible notes</h2><div class="rows">${verseNotes.map(({ sp, n }) => html`<a class="row" href="#bible-${spanSlug(sp)}"><span class="lead-ic">${icon("book")}</span><span class="body"><span class="t">${spanLabel(sp)}</span><span class="s">${snip(n.text)}</span><span class="s">${ago(n.at)}</span></span>${icon("chev")}</a>`)}</div></section>` : ""}
      ${runs.length ? html`<section class="sec"><h2 class="sec-head">Highlights</h2><div class="chips hl-chips">${runs.map((r) => html`<a class="chip hl-${r.color}" href="#bible-${spanSlug(r)}">${spanLabel(r)}</a>`)}</div></section>` : ""}
      ${all ? html`<div class="btns"><button class="btn ghost" data-act="copy" data-done="All notes copied" data-text="${all}">${icon("copy")}Copy all notes</button></div>` : ""}`,
  };
};
