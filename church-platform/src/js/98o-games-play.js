// ---------- Game night: the player's phone ----------
// #play-ABCD opens for anyone, signed in or not. The phone shows the question's answer buttons and the player's own
// score; the big screen shows the rest. A reload rejoins the same game as the same player.

let PL = null, plDrawn = "", plTick = 0;
const PL_KEY = "ofc-game-me";
const plOrdinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
function plSave() { try { const { net, st, sent, pick, arrival, ...keep } = PL; sessionStorage.setItem(PL_KEY, JSON.stringify(keep)); } catch { /* private mode */ } }
function plRestore(code) {
  if (PL && (!code || PL.code === code)) return PL;
  try {
    const p = JSON.parse(sessionStorage.getItem(PL_KEY) || "null");
    if (p && (!code || p.code === code)) { PL = { ...p, st: null, sent: {}, pick: [], arrival: {} }; plConnect(); }
  } catch { /* nothing saved */ }
  return PL;
}
function plConnect() {
  PL.net?.close();
  PL.net = GameNet.connect(PL.room, plHeard);
  plHello();
  clearInterval(plTick); plTick = setInterval(plTimer, 250);
}
function plHello() { PL.helloAt = Date.now(); PL.net.send("hello", { pid: PL.pid, name: PL.name }); }
function plLeave() { PL?.net?.close(); clearInterval(plTick); PL = null; plDrawn = ""; try { sessionStorage.removeItem(PL_KEY); } catch { /* nothing */ } }

const plKey = (st = PL?.st) => st ? `${st.gi}:${st.ri}` : "";
function plHeard(event, st) {
  if (event !== "state" || !PL) return;
  PL.st = st;
  // The host doesn't know this phone yet (it reloaded, or this phone just joined): say hello again.
  if (st.phase !== "ended" && !st.you?.[PL.pid] && Date.now() - (PL.helloAt || 0) > 2000) plHello();
  // A new question, or Fake Out moving from writing to voting: start this phone's clock from what the host says is left.
  const clock = `${plKey(st)}:${st.q?.step || ""}`;
  if (st.phase === "ask" && PL.arrival.clock !== clock) { if (PL.arrival.key !== plKey(st)) PL.pick = []; PL.arrival = { key: plKey(st), clock, at: Date.now(), left: st.left, limit: st.limit }; }
  plDraw();
}
const plLeft = () => PL?.arrival?.key === plKey() ? Math.max(0, PL.arrival.at + PL.arrival.left - Date.now()) : 0;
const plElapsed = () => PL.arrival.limit - plLeft();
function plTimer() {
  if (!PL?.st || PL.st.phase !== "ask") return;
  const el = $("[data-pl-left]"); if (el) el.textContent = Math.ceil(plLeft() / 1000);
}
function plSend(value) {
  PL.sent[plKey()] = value;
  PL.net.send("answer", { pid: PL.pid, key: plKey(), value, ms: plElapsed() });
}
function plDraw() {
  if (splitRoute().head !== "play") return;
  const st = PL?.st, you = st?.you?.[PL?.pid];
  const sig = JSON.stringify([st?.phase, plKey(st), st?.count, you, PL?.pick, st?.phase === "ask" ? (st.kind === "board" ? st.q : [st.q?.first, st.q?.clues?.length, st.q?.step]) : 0, st?.phase === "lobby" ? 0 : st?.top]);
  if (sig === plDrawn) return;
  const typed = $("[data-pl-guess]")?.value || "";
  plDrawn = sig;
  $("#app").innerHTML = flat(Screens.play(PL.code).page);
  const g = $("[data-pl-guess]"); if (g) { g.value = typed && !you?.done ? typed : ""; g.focus(); }
}

function plQuestion(st, you) {
  if (st.kind === "board") return boardPhone(st, you);
  const q = st.q, sent = PL.sent[plKey(st)], done = you?.done;
  if (st.kind === "quiz") {
    return html`<p class="pl-q">${q.q}</p><div class="pl-opts">${q.options.map((o, i) => html`<button class="gm-opt gm-o${i} ${done && you.picked === i ? "picked" : ""}" data-act="play-quiz" data-i="${i}" ${attr(done, "disabled")}><span class="gm-shape" aria-hidden="true"></span><b>${o}</b></button>`)}</div>
      ${done ? html`<p class="pl-wait">Answer locked in. Look at the big screen.</p>` : ""}`;
  }
  if (st.kind === "scramble") {
    const tries = 3 - (you?.tries || 0);
    return html`<p class="pl-q">${q.hint}</p><div class="gm-tiles pl-tiles">${[...q.letters].map((ch) => html`<span>${ch}</span>`)}</div>
      ${q.first ? html`<p class="pl-dim">Starts with ${q.first}</p>` : ""}
      ${you?.solved ? html`<p class="pl-wait pl-good">You got it! Look at the big screen.</p>` : done ? html`<p class="pl-wait">Out of tries. The answer is coming up.</p>`
        : html`<form data-form="play-guess" class="pl-guess"><input type="text" name="guess" data-pl-guess maxlength="${q.len + 4}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Your answer" placeholder="${q.len} letters" required><button class="btn">Guess</button></form>
          <p class="pl-dim">${you?.tries ? `Not quite. ${plural(tries, "try", "tries")} left.` : `${plural(tries, "try", "tries")}`}</p>`}`;
  }
  if (st.kind === "who") {
    const tries = 3 - (you?.tries || 0);
    return html`<p class="pl-q">Who am I?</p><ol class="pl-clues">${q.clues.map((c, i) => html`<li><span class="gm-letter">${i + 1}</span>${c}</li>`)}</ol>
      ${you?.solved ? html`<p class="pl-wait pl-good">You got it! Look at the big screen.</p>` : done ? html`<p class="pl-wait">Out of tries. The answer is coming up.</p>`
        : html`<form data-form="play-guess" class="pl-guess"><input type="text" name="guess" data-pl-guess maxlength="30" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Your guess" placeholder="Their name" required><button class="btn">Guess</button></form>
          <p class="pl-dim">${you?.tries ? `Not quite. ${plural(tries, "try", "tries")} left.` : `${plural(tries, "try", "tries")}. A new clue comes every few seconds.`}</p>`}`;
  }
  if (st.kind === "fake") {
    const labels = "ABCDEFGHIJKLMNOP";
    if (q.step === "write") return html`<p class="pl-q">${q.q}</p>
      ${you?.wrote ? html`<p class="pl-wait">Your fake is in. Get ready to vote.</p>`
        : html`<form data-form="play-fake" class="pl-guess"><input type="text" name="fake" data-pl-guess maxlength="40" autocomplete="off" spellcheck="false" aria-label="Your fake answer" placeholder="A fake answer that sounds true" required><button class="btn">Send</button></form>
          ${you?.tooTrue ? html`<p class="pl-wait pl-good">That's the real answer! Keep it secret and write a fake one.</p>` : html`<p class="pl-dim">Fool the others: they'll try to spot the real answer.</p>`}`}`;
    return html`<p class="pl-q">${q.q}</p><p class="pl-dim">Which one is true?</p>
      <div class="pl-events">${q.choices.map((c, i) => { const mine = you?.mine?.includes(c.id); return html`<button class="pl-ev ${you?.picked === c.id ? "on" : ""}" data-act="play-fake-vote" data-id="${c.id}" ${attr(done || mine, "disabled")}>
        <span class="gm-letter">${labels[i]}</span><b>${c.t}</b>${mine ? html`<small class="pl-dim" style="margin-left:auto">Yours</small>` : ""}</button>`; })}</div>
      ${done ? html`<p class="pl-wait">Vote locked in. Look at the big screen.</p>` : ""}`;
  }
  const pick = done ? sent || [] : PL.pick, labels = "ABCD";
  return html`<p class="pl-q">${q.title}: tap them from earliest to latest</p>
    <div class="pl-events">${q.events.map((e, i) => { const at = pick.indexOf(e.id); return html`<button class="pl-ev ${at >= 0 ? "on" : ""}" data-act="play-order-pick" data-id="${e.id}" ${attr(done || at >= 0, "disabled")}>
      <span class="gm-letter">${at >= 0 ? at + 1 : labels[i]}</span><b>${e.t}</b></button>`; })}</div>
    ${done ? html`<p class="pl-wait">Locked in. Look at the big screen.</p>` : html`<div class="btns pl-btns"><button class="btn ghost" data-act="play-order-undo" ${attr(!pick.length, "disabled")}>Undo</button>
      <button class="btn" data-act="play-order-send" ${attr(pick.length < q.events.length, "disabled")}>Lock in</button></div>`}`;
}
function plReveal(st, you) {
  if (st.kind === "board") return boardPhoneReveal(st, you);
  const r = st.reveal, q = st.q;
  const answer = st.kind === "quiz" ? q.options[r.answer] : st.kind === "scramble" ? r.word : st.kind === "who" ? r.name : st.kind === "fake" ? r.answer
    : r.answer.map((id) => q.events.find((e) => e.id === id)?.t).join(" → ");
  if (st.kind === "fake") return html`<div class="pl-result ${you?.points ? "good" : "miss"}">
    <p class="pl-big">${you?.correct ? "You found the truth!" : you?.picked ? "Fooled!" : "No vote"}</p>
    ${you?.fooled ? html`<p class="pl-dim">You fooled ${plural(you.fooled, "player")}.</p>` : ""}
    ${you?.points ? html`<p class="pl-points">+${you.points.toLocaleString()}</p>` : ""}
    <p class="pl-dim">The truth: <b>${answer}</b></p></div>`;
  return html`<div class="pl-result ${you?.correct ? "good" : you?.points ? "some" : "miss"}">
    <p class="pl-big">${you?.correct ? "Correct!" : you?.points ? "Partly right" : you?.done || you?.tries ? "Not this time" : "No answer"}</p>
    ${you?.points ? html`<p class="pl-points">+${you.points.toLocaleString()}</p>` : ""}
    <p class="pl-dim">${st.kind === "order" ? "The order" : "The answer"}: <b>${answer}</b></p></div>`;
}
Screens.play = (tail) => {
  const code = gameNorm(tail).slice(0, 4);
  plRestore(code);
  const st = PL?.st, you = st?.you?.[PL?.pid];
  let body;
  if (!PL) {
    let saved = ""; try { saved = sessionStorage.getItem("ofc-game-name") || ""; } catch { /* nothing */ }
    const name = saved || (Backend.user || !Backend.on ? S.me()?.name || "" : "");
    body = html`<div class="pl-join"><h1>Game night</h1><p class="pl-dim">Type the code on the big screen and your name. No app or account needed.</p>
      <form data-form="play-join" class="pl-form">
        <label class="field"><span>Code</span><input type="text" name="code" value="${code}" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" required class="pl-codein"></label>
        <label class="field"><span>Your name</span><input type="text" name="name" value="${name}" maxlength="24" autocomplete="nickname" required></label>
        <p class="error" role="alert" data-pl-error hidden></p>
        <button class="btn pl-go">Join</button></form></div>`;
  } else if (!st) body = html`<div class="pl-center"><span class="ai-dot"></span><p>Joining ${PL.title || "the game"}…</p></div>`;
  else if (st.phase === "ended") body = html`<div class="pl-center"><h1>Thanks for playing!</h1><p class="pl-dim">The host ended game night.</p><button class="btn" data-act="play-leave">Join another game</button></div>`;
  else {
    const team = you?.team ? html`<span class="gm-team" style="--t:${GAME_TEAMS[you.team - 1][1]}">${GAME_TEAMS[you.team - 1][0]}</span>` : "";
    const standing = you ? html`<p class="pl-standing">${plOrdinal(you.rank)} of ${st.count} · <b>${you.score.toLocaleString()}</b> points</p>` : "";
    if (st.phase === "lobby") body = html`<div class="pl-center"><h1>You're in, ${PL.name}!</h1>${team}<p class="pl-dim">Look at the big screen. The game starts soon.</p><p class="pl-dim">${plural(st.count, "player")} so far</p></div>`;
    else if (st.phase === "intro") body = html`<div class="pl-center"><p class="pl-dim">Game ${st.gi + 1} of ${st.games.length}</p><h1>${st.name}</h1><p>${st.blurb}</p><p class="pl-dim">Get ready…</p>${standing}</div>`;
    else if (st.phase === "ask") body = html`<div class="pl-ask"><div class="pl-bar"><span>${st.kind === "board" ? (st.q?.final ? "Final round" : `Clue ${st.ri + 1}`) : `Round ${st.ri + 1} of ${st.rounds}`}</span><span class="gm-clock"><b data-pl-left>${Math.ceil(plLeft() / 1000)}</b></span></div>${plQuestion(st, you)}</div>`;
    else if (st.phase === "reveal") body = html`<div class="pl-center">${plReveal(st, you)}${standing}</div>`;
    else {
      const final = st.phase === "final";
      body = html`<div class="pl-center"><p class="pl-dim">${final ? "Final scores" : `After ${st.name}`}</p>
        <h1>${you?.rank === 1 ? "You're in first!" : you ? `You're ${plOrdinal(you.rank)}` : ""}</h1>${team}${standing}
        ${st.teams ? html`<div class="pl-teams">${st.teams.map((t) => html`<span class="gm-team" style="--t:${t.color}">${t.name} ${t.score.toLocaleString()}</span>`)}</div>` : ""}
        ${final ? html`<p>Thanks for playing!</p>` : html`<p class="pl-dim">Next up: ${st.games[st.gi + 1]?.name || "final scores"}</p>`}</div>`;
    }
    body = html`<header class="pl-top"><b>${PL.name}</b>${team}<span class="pl-dim">${st.title}</span></header>${body}`;
  }
  return { page: html`<div class="gm gm-phone" role="main">${body}</div>` };
};

Forms["play-join"] = async (d, f) => {
  const code = gameNorm(d.code), name = String(d.name || "").trim().slice(0, 24), err = $("[data-pl-error]", f), btn = $("button", f);
  const fail = (msg) => { err.textContent = msg; err.hidden = false; btn.disabled = false; };
  if (code.length !== 4) return fail("The code is 4 letters.");
  if (!name) return fail("Type your name.");
  btn.disabled = true; err.hidden = true;
  try {
    const room = await GameNet.join(code, name), pid = await GameNet.me();
    try { sessionStorage.setItem("ofc-game-name", name); } catch { /* private mode */ }
    PL = { code, room: room.room, title: room.title || "", church: room.church || "", pid, name, st: null, sent: {}, pick: [], arrival: {} };
    plSave(); plConnect();
    if (location.hash !== `#play-${code}`) history.replaceState(null, "", `#play-${code}`);
    plDrawn = ""; plDraw();
  } catch (e) { fail(e.message || "Couldn't join. Try again."); }
};
Actions["play-quiz"] = (el) => { const you = PL?.st?.you?.[PL.pid]; if (PL?.st?.phase !== "ask" || you?.done) return; plSend(+el.dataset.i); };
Forms["play-guess"] = (d, f) => { const g = gameNorm(d.guess); if (!g || PL?.st?.phase !== "ask") return; plSend(g); f.reset(); };
Forms["play-fake"] = (d, f) => { const t = String(d.fake || "").trim(); if (!t || PL?.st?.phase !== "ask") return; plSend(t.slice(0, 40)); f.reset(); };
Actions["play-fake-vote"] = (el) => { const you = PL?.st?.you?.[PL.pid]; if (PL?.st?.phase !== "ask" || PL.st.q?.step !== "vote" || you?.done) return; plSend(el.dataset.id); };
Actions["play-order-pick"] = (el) => { if (!PL || PL.pick.includes(el.dataset.id) || PL.pick.length >= 4) return; PL.pick = [...PL.pick, el.dataset.id]; plDraw(); };
Actions["play-order-undo"] = () => { if (!PL) return; PL.pick = PL.pick.slice(0, -1); plDraw(); };
Actions["play-order-send"] = () => { if (!PL || PL.pick.length < (PL.st?.q?.events?.length || 4)) return; plSend(PL.pick); };
Actions["play-leave"] = () => { plLeave(); go("play"); };
