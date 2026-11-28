// ---------- Game night: Bible Board ----------
// A board of categories with five clues each, worth 200 to 1,000. The last player to answer right picks the next clue
// (the host can pick too). Everyone buzzes in on their phone; to be fair on a slow connection, each phone times its own
// reaction from when the clue reached it, and the host waits a moment for buzzes before taking the fastest. The buzzer
// picks one of four answers: right adds the clue's value and they pick next; wrong takes it away and the others may buzz.
// Then a final round: everyone sees the category, wagers in private, and answers the last clue.
// It runs inside the host's "ask" and "reveal" phases (98n-games.js), one clue per round, with steps:
//   pick → buzz → answer (→ buzz again after a wrong answer) → reveal, and at the end wager → final → reveal.

const BOARD_VALUES = [200, 400, 600, 800, 1000];
const BOARD_SECS = { pick: 20, buzz: 15, rebuzz: 10, answer: 10, wager: 30, final: 30 };
const BOARD_WINDOW = 400; // how long the host waits after the first buzz for faster reactions on slower connections
const boardOn = () => GH && ghGame().kind === "board";
const boardLeft = () => GH.board.cats.reduce((n, c) => n + c.clues.filter((x) => !x.used).length, 0);
const boardTotal = () => GH.board.cats.length * BOARD_VALUES.length;
const boardMaxWager = (id) => Math.max(GH.players[id]?.score || 0, 1000);

/** A new board for this game: categories from the night's bank, each clue's answers shuffled. */
function boardBuild() {
  const bank = gameShuffle(GH.bank?.board || []), n = ghGame().rounds;
  GH.board = { gi: GH.gi, cats: bank.slice(0, n).map(([, [name, clues]]) => ({ name, clues: clues.slice(0, 5).map(([q, opts, ref], k) => {
    const shuffled = gameShuffle(opts.map((t, j) => ({ t, right: !j })));
    return { v: BOARD_VALUES[k], q, options: shuffled.map((o) => o.t), answer: shuffled.findIndex((o) => o.right), ref, used: false };
  }) })), picker: "", final: null };
  const finals = GH.bank?.boardFinal || [];
  const f = finals[Math.floor(Math.random() * finals.length)];
  if (f) { const shuffled = gameShuffle(f[2].map((t, j) => ({ t, right: !j }))); GH.board.final = { cat: f[0], q: f[1], options: shuffled.map((o) => o.t), answer: shuffled.findIndex((o) => o.right), ref: f[3] }; }
  // The first pick goes to someone at random.
  const ids = Object.keys(GH.players); GH.board.picker = ids[Math.floor(Math.random() * ids.length)] || "";
}
function boardStep(step, secs) { GH.item.step = step; GH.limit = secs * 1000; GH.startedAt = Date.now(); }
/** A new round of the board: someone picks a clue (or, once the board is clear, the final round). */
function boardAsk() {
  if (!GH.board || GH.board.gi !== GH.gi) boardBuild();
  GH.answers = {}; GH.last = {}; GH.phase = "ask";
  if (!boardLeft() && GH.board.final) { GH.item = { final: true }; boardStep("wager", BOARD_SECS.wager); }
  else { GH.item = { final: false, cat: -1, i: -1, locked: [], buzzes: [], answering: "" }; boardStep("pick", BOARD_SECS.pick); }
  ghUpdate();
}
const boardClue = () => GH.item.final ? GH.board.final : GH.board.cats[GH.item.cat]?.clues[GH.item.i];
function boardPick(c, i) {
  const it = GH.item, clue = GH.board.cats[c]?.clues[i];
  if (it.step !== "pick" || !clue || clue.used) return;
  clue.used = true; it.cat = c; it.i = i; it.buzzAt = Date.now();
  boardStep("buzz", BOARD_SECS.buzz); ghUpdate();
}
/** Takes the fastest reaction among the buzzes that came in. */
function boardTakeBuzz() {
  const it = GH.item; if (it.step !== "buzz" || !it.buzzes.length) return;
  const fastest = it.buzzes.filter((b) => !it.locked.includes(b.pid)).sort((a, b) => a.ms - b.ms)[0];
  it.buzzes = []; if (!fastest) return;
  it.answering = fastest.pid; boardStep("answer", BOARD_SECS.answer); ghUpdate();
}
function boardChoose(pid, i) {
  const it = GH.item, clue = boardClue(); if (it.step !== "answer" || it.answering !== pid) return;
  const a = (GH.answers[pid] ||= { points: 0 });
  a.picked = i;
  if (i === clue.answer) { a.correct = true; a.points += clue.v; it.right = pid; GH.board.picker = pid; ghReveal(); return; }
  a.points -= clue.v; it.locked.push(pid); it.answering = "";
  if (it.locked.length >= ghPlayers().length) { ghReveal(); return; }
  boardStep("buzz", BOARD_SECS.rebuzz); ghUpdate();
}
/** A message from a phone during Bible Board. */
function boardHeard(p) {
  const it = GH.item, v = p.value || {};
  if (v.type === "pick" && !it.final && p.pid === GH.board.picker) boardPick(+v.c, +v.i);
  else if (v.type === "buzz" && it.step === "buzz" && !it.locked.includes(p.pid) && !it.buzzes.some((b) => b.pid === p.pid)) {
    it.buzzes.push({ pid: p.pid, ms: Math.max(0, +v.ms || 0) });
    if (it.buzzes.length === 1) setTimeout(boardTakeBuzz, BOARD_WINDOW);
  } else if (v.type === "choose") boardChoose(p.pid, +v.i);
  else if (v.type === "wager" && it.final && it.step === "wager") {
    const a = (GH.answers[p.pid] ||= { points: 0 });
    a.wager = Math.max(0, Math.min(boardMaxWager(p.pid), Math.round(+v.n || 0)));
    if (ghPlayers().every((x) => GH.answers[x.id]?.wager !== undefined)) { boardStep("final", BOARD_SECS.final); ghUpdate(); return; }
    ghSave(); ghSend();
  } else if (v.type === "final" && it.final && it.step === "final") {
    const a = (GH.answers[p.pid] ||= { points: 0 }); if (a.picked !== undefined) return;
    a.picked = +v.i; a.wager ||= 0; a.correct = a.picked === GH.board.final.answer; a.points = a.correct ? a.wager : -a.wager;
    if (ghPlayers().every((x) => GH.answers[x.id]?.picked !== undefined)) { setTimeout(() => { if (GH?.item === it && it.step === "final") ghReveal(); }, 600); }
    ghSave(); ghSend();
  }
}
/** Time ran out on a step. */
function boardTimeout() {
  const it = GH.item;
  if (it.step === "pick") { const open = []; GH.board.cats.forEach((c, ci) => c.clues.forEach((x, i) => { if (!x.used) open.push([ci, i]); })); const [c, i] = open[0] || []; if (c !== undefined) boardPick(c, Math.min(...open.filter(([ci]) => ci === c).map(([, i2]) => i2))); }
  else if (it.step === "buzz") ghReveal();
  else if (it.step === "answer") boardChoose(it.answering, -1);
  else if (it.step === "wager") { for (const x of ghPlayers()) { const a = (GH.answers[x.id] ||= { points: 0 }); a.wager ??= 0; } boardStep("final", BOARD_SECS.final); ghUpdate(); }
  else if (it.step === "final") { for (const x of ghPlayers()) { const a = (GH.answers[x.id] ||= { points: 0 }); if (a.picked === undefined) { a.picked = -1; a.points = -(a.wager || 0); } } ghReveal(); }
}
/** After a clue's answer: the next clue, the final round, or the game's end. */
function boardNext() {
  if (GH.item.final || (!boardLeft() && !GH.board.final)) { GH.phase = "standings"; ghUpdate(); return; }
  GH.ri++; boardAsk();
}

/** What phones and the big screen see. */
function boardQ() {
  const it = GH.item, clue = boardClue(), name = (id) => GH.players[id]?.name || "";
  if (it.final) return { final: true, step: it.step, cat: GH.board.final.cat, ...(it.step === "final" || GH.phase === "reveal" ? { q: clue.q, options: clue.options } : {}) };
  const q = { final: false, step: it.step, board: GH.board.cats.map((c) => ({ name: c.name, clues: c.clues.map((x) => ({ v: x.v, used: x.used })) })), picker: GH.board.picker, pickerName: name(GH.board.picker) };
  if (clue) Object.assign(q, { cat: GH.board.cats[it.cat].name, v: clue.v, q: clue.q, options: clue.options, answering: it.answering, answeringName: name(it.answering), locked: it.locked.map(name) });
  return q;
}
function boardReveal() {
  const it = GH.item, clue = boardClue(); if (!clue) return null;
  const name = (id) => GH.players[id]?.name || "";
  if (it.final) return { answer: clue.answer, ref: clue.ref, results: ghPlayers().map((p) => ({ name: p.name, wager: GH.answers[p.id]?.wager || 0, right: !!GH.answers[p.id]?.correct })) };
  return { answer: clue.answer, ref: clue.ref, right: name(it.right), wrong: it.locked.map(name) };
}
function boardYou(id, you) {
  const it = GH.item, a = GH.answers[id];
  if (it.final) {
    Object.assign(you, { maxWager: boardMaxWager(id), wager: a?.wager, done: it.step === "wager" ? a?.wager !== undefined : a?.picked !== undefined, picked: a?.picked });
  } else Object.assign(you, { picker: GH.board.picker === id, locked: it.locked.includes(id), answering: it.answering === id, buzzed: it.buzzes.some((b) => b.pid === id), picked: a?.picked });
  if (GH.phase === "reveal") { you.points = GH.last[id] || 0; you.correct = !!a?.correct; }
  return you;
}

// ----- The big screen -----
const boardPts = (n) => `${n < 0 ? "−" : "+"}${Math.abs(n).toLocaleString()}`;
function boardStage(st) {
  const q = st.q, reveal = st.phase === "reveal", letters = "ABCD";
  const head = html`<div class="gm-qhead"><span>${st.name} · ${q.final ? "Final round" : `Clue ${Math.min(st.ri + 1, boardTotal())} of ${boardTotal()}`}</span>
    ${reveal ? html`<span>${st.reveal?.ref || ""}</span>` : html`<span class="gm-clock" aria-hidden="true"><b data-gm-left>${Math.ceil(st.left / 1000)}</b></span>`}</div>
    ${reveal ? "" : html`<div class="gm-timebar"><span data-gm-bar style="width:${(st.left / st.limit) * 100}%"></span></div>`}`;
  const opts = (answer) => html`<div class="gm-opts">${q.options.map((o, i) => html`<div class="gm-opt gm-o${i} ${answer !== undefined ? (i === answer ? "right" : "wrong") : ""}"><span class="gm-shape" aria-hidden="true"></span><b>${o}</b></div>`)}</div>`;
  let main;
  if (q.final) {
    if (q.step === "wager" && !reveal) main = html`<div class="gm-center"><p class="gm-kicker">Final round</p><h1 class="gm-title">${q.cat}</h1><p class="gm-blurb">Wager some or all of your points on your phone. You'll see the clue next.</p></div>`;
    else main = html`<p class="gm-kicker" style="text-align:center">Final round · ${q.cat}</p><h1 class="gm-q">${q.q}</h1>${opts(reveal ? st.reveal.answer : undefined)}`;
  } else if (q.step === "pick" && !reveal) {
    main = html`<div class="bb-grid" style="--n:${q.board.length}">${q.board.map((c) => html`<div class="bb-cat">${c.name}</div>`)}
      ${BOARD_VALUES.map((v, i) => q.board.map((c, ci) => c.clues[i].used ? html`<span class="bb-tile used"></span>`
        : html`<button class="bb-tile" data-act="board-pick" data-c="${ci}" data-i="${i}" aria-label="${c.name} for ${v}">${v}</button>`))}</div>
      <p class="gm-dim" style="text-align:center">${q.pickerName ? `${q.pickerName} picks the next clue on their phone` : "Pick a clue"}. You can also click one here.</p>`;
  } else {
    const status = reveal ? (st.reveal.right ? html`<p class="bb-status good">${st.reveal.right} ${boardPts(q.v)}</p>` : html`<p class="bb-status">Nobody got it</p>`)
      : q.step === "answer" ? html`<p class="bb-status">${q.answeringName} is answering…</p>` : html`<p class="bb-status buzz">Buzz in on your phone!</p>`;
    main = html`<p class="gm-kicker" style="text-align:center">${q.cat} · ${q.v}</p><h1 class="gm-q">${q.q}</h1>${opts(reveal ? st.reveal.answer : undefined)}${status}
      ${q.locked?.length ? html`<p class="gm-dim" style="text-align:center">${reveal ? "Missed" : "Locked out"}: ${listJoin(q.locked)}</p>` : ""}`;
  }
  return html`<div class="gm-question">${head}${main}${reveal ? html`<div class="gm-after">${gmTeams(st)}${gmBoard(st, 5)}</div>` : ""}</div>`;
}
Actions["board-pick"] = (el) => { if (boardOn()) boardPick(+el.dataset.c, +el.dataset.i); };

// ----- The phone -----
function boardPhone(st, you) {
  const q = st.q, letters = "ABCD";
  if (q.final) {
    if (q.step === "wager") return html`<p class="pl-dim">Final round</p><p class="pl-q">${q.cat}</p>
      ${you?.done ? html`<p class="pl-wait">Wager in: ${(you.wager || 0).toLocaleString()}. Get ready.</p>`
        : html`<form data-form="play-wager" class="pl-form"><label class="field"><span>Your wager, 0 to ${you?.maxWager?.toLocaleString()}</span><input type="number" name="n" min="0" max="${you?.maxWager}" step="100" inputmode="numeric" required></label>
          <button class="btn pl-go">Wager</button></form><p class="pl-dim">Right adds it to your score. Wrong takes it away.</p>`}`;
    return html`<p class="pl-dim">Final round · ${q.cat}</p><p class="pl-q">${q.q}</p><div class="pl-opts">${q.options.map((o, i) => html`<button class="gm-opt gm-o${i} ${you?.picked === i ? "picked" : ""}" data-act="play-board-final" data-i="${i}" ${attr(you?.done, "disabled")}><span class="gm-shape" aria-hidden="true"></span><b>${o}</b></button>`)}</div>
      ${you?.done ? html`<p class="pl-wait">Locked in. Look at the big screen.</p>` : ""}`;
  }
  if (q.step === "pick") {
    if (!you?.picker) return html`<div class="pl-center"><p class="pl-q">${q.pickerName || "Someone"} is picking a clue…</p></div>`;
    return html`<p class="pl-q">Your pick!</p><div class="bb-grid pl-grid" style="--n:${q.board.length}">${q.board.map((c) => html`<div class="bb-cat">${c.name}</div>`)}
      ${BOARD_VALUES.map((v, i) => q.board.map((c, ci) => c.clues[i].used ? html`<span class="bb-tile used"></span>` : html`<button class="bb-tile" data-act="play-board-pick" data-c="${ci}" data-i="${i}" aria-label="${c.name} for ${v}">${v}</button>`))}</div>`;
  }
  const clue = html`<p class="pl-dim">${q.cat} · ${q.v}</p><p class="pl-q">${q.q}</p>`;
  if (q.step === "answer") {
    if (!you?.answering) return html`${clue}<p class="pl-wait">${q.answeringName} is answering…</p>`;
    return html`${clue}<p class="pl-dim">You buzzed first! Pick your answer.</p><div class="pl-opts">${q.options.map((o, i) => html`<button class="gm-opt gm-o${i}" data-act="play-board-choose" data-i="${i}"><span class="gm-shape" aria-hidden="true"></span><b>${o}</b></button>`)}</div>`;
  }
  if (you?.locked) return html`${clue}<p class="pl-wait">Not this time. The others can buzz in.</p>`;
  return html`${clue}<button class="bb-buzz" data-act="play-board-buzz" ${attr(you?.buzzed, "disabled")}>${you?.buzzed ? "Buzzed!" : "Buzz"}</button>
    <ol class="pl-clues bb-opts-list">${q.options.map((o, i) => html`<li><span class="gm-letter">${letters[i]}</span>${o}</li>`)}</ol>`;
}
function boardPhoneReveal(st, you) {
  const r = st.reveal, q = st.q, answer = q.options?.[r.answer] || "";
  const pts = you?.points || 0;
  return html`<div class="pl-result ${pts > 0 ? "good" : pts < 0 ? "miss" : ""}">
    <p class="pl-big">${pts > 0 ? "Correct!" : pts < 0 ? "Not this time" : q.final ? "No wager" : r.right ? `${r.right} got it` : "Nobody got it"}</p>
    ${pts ? html`<p class="pl-points" style="${pts < 0 ? "color:#f08a8d" : ""}">${boardPts(pts)}</p>` : ""}
    <p class="pl-dim">The answer: <b>${answer}</b></p></div>`;
}
Actions["play-board-pick"] = (el) => plSend({ type: "pick", c: +el.dataset.c, i: +el.dataset.i });
Actions["play-board-buzz"] = () => { if (PL?.st?.q?.step !== "buzz") return; plSend({ type: "buzz", ms: plElapsed() }); };
Actions["play-board-choose"] = (el) => plSend({ type: "choose", i: +el.dataset.i });
Actions["play-board-final"] = (el) => { if (PL?.st?.you?.[PL.pid]?.done) return; plSend({ type: "final", i: +el.dataset.i }); };
Forms["play-wager"] = (d) => plSend({ type: "wager", n: +d.n || 0 });
