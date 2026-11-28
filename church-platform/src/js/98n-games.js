// ---------- Game night: rooms, the connection between the big screen and phones, and the host ----------
// The host's screen runs the game: it picks each question, keeps time and scores, and sends what everyone sees.
// Players' phones send only their answers. With the server, they meet on the private game:<room> channel
// (upgrade-32.sql), and players without an account join with an anonymous sign-in of their own, kept apart from the
// app's sign-in. Without the server (the preview), tabs of one browser meet over a BroadcastChannel.

const GAME_KINDS = {
  quiz: { name: "Bible Quiz", blurb: "Four answers, one is right. The faster you answer, the more you score.", secs: 20 },
  scramble: { name: "Name Scramble", blurb: "Unscramble a Bible name or place. Three tries each.", secs: 30 },
  order: { name: "In Order", blurb: "Put four events in the order they happened.", secs: 35 },
  who: { name: "Who Am I?", blurb: "Clues about someone in the Bible, one at a time. Guess early for more points.", secs: 40 },
  board: { name: "Bible Board", blurb: "Pick a category and a value, buzz in first, and answer right to win the points. Wrong answers lose them. Ends with a final round you wager on.", secs: 20 },
  fake: { name: "Fake Out", blurb: "Write a believable fake answer, then find the real one. Score for the truth and for every player you fool. Best with 4 or more.", secs: 45, vote: 25 },
};
const WHO_CLUES = 5;
const GAME_TEAMS = [["Salt", "#e9a23b"], ["Light", "#4f8ff7"], ["Vine", "#3fb26e"], ["Rock", "#d9643f"]];
const GAME_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
const GAME_SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
const gameJoinUrl = (code = "") => `${APP_HOME}#play${code ? `-${code}` : ""}`;
const gameShuffle = (a) => { const out = [...a]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const gameNorm = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "");

const GameNet = {
  live: () => Backend.configured(),
  guest: null,
  /** The app's own sign-in for members; for everyone else, an anonymous sign-in kept for this tab only. */
  async client() {
    if (Backend.user) return Backend.client;
    if (!this.guest) {
      const { createClient } = await import(GAME_SUPABASE_JS);
      this.guest = createClient(PLATFORM.supabaseUrl, PLATFORM.supabasePublishableKey, { auth: { storageKey: "ofc-game-guest", storage: sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    }
    const { data } = await this.guest.auth.getSession();
    if (!data.session) {
      const { error } = await this.guest.auth.signInAnonymously();
      if (error) throw new Error(/anonymous/i.test(error.message) ? "Joining without an account isn't turned on yet. Sign in to the app to play, or ask the host." : error.message);
    }
    return this.guest;
  },
  /** Who this player is: their account (or anonymous sign-in), or in the preview an id for this tab. */
  async me() {
    if (!this.live()) { let id = sessionStorage.getItem("ofc-game-pid"); if (!id) { id = uid(); sessionStorage.setItem("ofc-game-pid", id); } return id; }
    const { data } = await (await this.client()).auth.getUser();
    return data.user.id;
  },
  rooms() { try { return JSON.parse(localStorage.getItem("ofc-games") || "{}"); } catch { return {}; } },
  async open(title) {
    if (this.live()) {
      const { data, error } = await Backend.client.rpc("game_open", { c: S.state.current, room_title: title });
      if (error) throw new Error(error.message);
      return data;
    }
    const rooms = this.rooms(), now = Date.now();
    for (const [k, r] of Object.entries(rooms)) if (r.until < now) delete rooms[k];
    let code;
    do { code = Array.from({ length: 4 }, () => GAME_LETTERS[Math.floor(Math.random() * GAME_LETTERS.length)]).join(""); } while (rooms[code]);
    const room = uid().replace(/[^a-z0-9]/gi, "").toLowerCase();
    rooms[code] = { room, title, church: S.church()?.name || "", until: now + 6 * 3600e3 };
    localStorage.setItem("ofc-games", JSON.stringify(rooms));
    return { room, code };
  },
  async join(code, name) {
    code = gameNorm(code);
    if (this.live()) {
      const { data, error } = await (await this.client()).rpc("game_join", { p_code: code, p_name: name });
      if (error) throw new Error(error.message);
      return data;
    }
    const r = this.rooms()[code];
    if (!r || r.until < Date.now()) throw new Error("No game with that code is open. Check the code on the screen.");
    return { room: r.room, title: r.title, church: r.church };
  },
  async close(room, code) {
    if (this.live()) { await Backend.client.rpc("game_close", { p_room: room }).catch(() => {}); return; }
    const rooms = this.rooms(); delete rooms[code]; localStorage.setItem("ofc-games", JSON.stringify(rooms));
  },
  /** The room's channel: onMsg(event, payload) hears the others; send(event, payload) talks to them. */
  connect(room, onMsg) {
    if (!this.live()) {
      const bc = new BroadcastChannel(`ofc-game-${room}`);
      bc.onmessage = (e) => onMsg(e.data.event, e.data.payload);
      return { send: (event, payload) => bc.postMessage({ event, payload }), close: () => bc.close() };
    }
    let ch;
    const ready = this.client().then((c) => {
      ch = c.channel(`game:${room}`, { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: "*" }, ({ event, payload }) => onMsg(event, payload)).subscribe();
      return c;
    });
    return { send: (event, payload) => ready.then(() => ch.send({ type: "broadcast", event, payload })).catch(() => {}), close: () => ready.then((c) => c.removeChannel(ch)).catch(() => {}) };
  },
};

// ----- The host: the night's state, kept for this tab so a reload carries on -----
let GH = null, ghNet = null, ghBeat = 0, ghTick = 0, ghDrawn = "";
const GH_KEY = "ofc-game-host";
function ghSave() { try { sessionStorage.setItem(GH_KEY, JSON.stringify(GH)); } catch { /* full or private mode */ } }
function ghLoad() {
  if (GH) return GH;
  try { const g = JSON.parse(sessionStorage.getItem(GH_KEY) || "null"); if (g && g.until > Date.now() && g.phase !== "ended") { GH = g; ghConnect(); } } catch { /* nothing saved */ }
  return GH;
}
function ghConnect() {
  ghNet?.close();
  ghNet = GameNet.connect(GH.room, ghHeard);
  clearInterval(ghBeat); clearInterval(ghTick);
  ghBeat = setInterval(() => ghSend(), 3000);
  ghTick = setInterval(ghTimer, 250);
}
const ghGame = () => GH.games[GH.gi];
const ghKey = () => `${GH.gi}:${GH.ri}`;
const ghPlayers = () => Object.entries(GH.players).map(([id, p]) => ({ id, ...p }));
const ghLeft = () => Math.max(0, GH.limit - (Date.now() - GH.startedAt));

function ghTeamFor() {
  if (!GH.teams) return 0;
  const n = Array.from({ length: GH.teams }, (_, i) => ghPlayers().filter((p) => p.team === i + 1).length);
  return n.indexOf(Math.min(...n)) + 1;
}
/** Even teams, shuffled. */
function ghBalance() {
  if (!GH.teams) return;
  gameShuffle(ghPlayers()).forEach((p, i) => { GH.players[p.id].team = (i % GH.teams) + 1; });
}
/** Each team's score is the average of its players', so a smaller team isn't behind for being small. */
function ghTeamScores() {
  if (!GH.teams) return null;
  return Array.from({ length: GH.teams }, (_, i) => {
    const ps = ghPlayers().filter((p) => p.team === i + 1);
    return { team: i + 1, name: GAME_TEAMS[i][0], color: GAME_TEAMS[i][1], players: ps.length, score: ps.length ? Math.round(ps.reduce((n, p) => n + p.score, 0) / ps.length) : 0 };
  });
}
const ghRanked = () => ghPlayers().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

/** A fresh question for the current game, not used yet tonight. */
function ghPick(kind) {
  // The night's questions for this game (gqBank, 98p-games-questions.js), each with a key so none repeats.
  const bank = GH.bank?.[kind] || [], used = (GH.used[kind] ||= []);
  let left = bank.filter(([key]) => !used.includes(key));
  if (!left.length) { GH.used[kind] = []; left = bank; }
  const [key, tuple] = left[Math.floor(Math.random() * left.length)]; GH.used[kind].push(key);
  if (kind === "quiz") {
    const [q, opts, ref] = tuple, shuffled = gameShuffle(opts.map((t, k) => ({ t, right: !k })));
    return { q, options: shuffled.map((o) => o.t), answer: shuffled.findIndex((o) => o.right), ref };
  }
  if (kind === "scramble") {
    const [word, hint, ref] = tuple;
    let letters = word; for (let n = 0; n < 20 && letters === word; n++) letters = gameShuffle([...word]).join("");
    return { word, hint, ref, letters };
  }
  if (kind === "who") {
    const [name, clues, ref, also] = tuple;
    return { name, clues: clues.slice(0, WHO_CLUES), ref, accept: [name, ...(also || [])].map(gameNorm) };
  }
  if (kind === "fake") { const [q, answer, ref] = tuple; return { q, answer, ref, step: "write", choices: null }; }
  const [title, events] = tuple, ids = "abcd";
  const list = events.map(([t, ref], k) => ({ id: ids[k], t, ref }));
  let shown = gameShuffle(list); for (let n = 0; n < 10 && shown.every((e, k) => e.id === list[k].id); n++) shown = gameShuffle(list);
  return { title, events: shown, answer: list.map((e) => e.id), refs: list };
}

function ghAsk() {
  const g = ghGame();
  if (g.kind === "board") { boardAsk(); return; }
  GH.item = ghPick(g.kind); GH.answers = {}; GH.last = {};
  GH.phase = "ask"; GH.limit = GAME_KINDS[g.kind].secs * 1000; GH.startedAt = Date.now();
  ghUpdate();
}
/** Who Am I?: how many clues are showing. One more every fifth of the time. */
const ghClues = () => GH.phase === "reveal" ? WHO_CLUES : Math.min(WHO_CLUES, 1 + Math.floor((Date.now() - GH.startedAt) / (GH.limit / WHO_CLUES)));
/** Fake Out: the fakes are in (or time is up). Show them with the truth, each the same once, and vote. */
function ghVote() {
  const it = GH.item; if (GH.phase !== "ask" || it.step !== "write") return;
  const byText = new Map();
  for (const [id, a] of Object.entries(GH.answers)) {
    if (!a.fake) continue;
    const k = gameNorm(a.fake); if (!byText.has(k)) byText.set(k, { t: a.fake, by: [] });
    byText.get(k).by.push(id);
  }
  if (!byText.size) { it.step = "vote"; it.choices = [{ id: "c0", t: it.answer, truth: true, by: [] }]; ghReveal(); return; }
  it.choices = gameShuffle([...byText.values(), { t: it.answer, truth: true, by: [] }]).map((c, i) => ({ ...c, id: `c${i}` }));
  it.step = "vote"; GH.limit = GAME_KINDS.fake.vote * 1000; GH.startedAt = Date.now();
  ghUpdate();
}
/** Fake Out scores: 1,000 for finding the truth, 500 for each other player who picked your fake. */
function ghScoreFake() {
  const it = GH.item, votes = Object.entries(GH.answers).filter(([, a]) => a.vote);
  for (const [id, a] of Object.entries(GH.answers)) {
    const picked = it.choices?.find((c) => c.id === a.vote);
    a.correct = !!picked?.truth;
    a.fooled = votes.filter(([vid, v]) => vid !== id && it.choices.find((c) => c.id === v.vote)?.by.includes(id)).length;
    a.points = (a.correct ? 1000 : 0) + 500 * a.fooled;
  }
}
/** The answers are in (or time is up): score them and show the answer. */
function ghReveal() {
  if (GH.phase !== "ask") return;
  if (ghGame().kind === "fake") ghScoreFake();
  GH.phase = "reveal"; GH.last = {};
  for (const [id, a] of Object.entries(GH.answers)) {
    if (!GH.players[id] || !a.points) continue;
    GH.players[id].score += a.points; GH.last[id] = a.points;
  }
  ghUpdate();
}
function ghNext() {
  if (!GH) return;
  const g = ghGame();
  if (GH.phase === "lobby") {
    if (!ghPlayers().length) { toast("Wait for someone to join first."); return; }
    ghBalance(); GH.phase = "intro";
  } else if (GH.phase === "intro") { ghAsk(); return; }
  else if (GH.phase === "ask" && g.kind === "board") { if (GH.item.step !== "pick") boardTimeout(); return; }
  else if (GH.phase === "reveal" && g.kind === "board") { boardNext(); return; }
  else if (GH.phase === "ask") { if (g.kind === "fake" && GH.item.step === "write") ghVote(); else ghReveal(); return; }
  else if (GH.phase === "reveal") {
    if (GH.ri + 1 < g.rounds) { GH.ri++; ghAsk(); return; }
    GH.phase = "standings";
  } else if (GH.phase === "standings") {
    if (GH.gi + 1 < GH.games.length) { GH.gi++; GH.ri = 0; GH.phase = "intro"; } else GH.phase = "final";
  } else return;
  ghUpdate();
}

/** What a player's phone needs about them. */
function ghYou(id, ranked) {
  const p = GH.players[id], a = GH.answers?.[id], g = ghGame();
  const you = { score: p.score, rank: ranked.findIndex((r) => r.id === id) + 1, team: p.team || 0 };
  if (g.kind === "board" && (GH.phase === "ask" || GH.phase === "reveal") && GH.item) return boardYou(id, you);
  if (GH.phase === "ask" || GH.phase === "reveal") {
    if (g.kind === "scramble" || g.kind === "who") Object.assign(you, { tries: a?.tries || 0, solved: !!a?.solved, done: !!a && (a.solved || a.tries >= 3) });
    else if (g.kind === "fake") {
      const voting = GH.item.step === "vote";
      Object.assign(you, { wrote: !!a?.fake, voted: !!a?.vote, tooTrue: !!a?.tooTrue && !a?.fake, done: voting ? !!a?.vote : !!a?.fake, picked: a?.vote || "" });
      if (voting) you.mine = GH.item.choices.filter((c) => c.by.includes(id)).map((c) => c.id);
      if (GH.phase === "reveal") you.fooled = a?.fooled || 0;
    } else you.done = !!a;
    if (a && g.kind !== "scramble" && g.kind !== "who" && g.kind !== "fake") you.picked = a.value;
    if (GH.phase === "reveal") { you.points = GH.last[id] || 0; you.correct = !!a?.correct; }
  }
  return you;
}
/** What everyone sees: the question without its answer until the reveal. */
function ghState() {
  const g = ghGame(), it = GH.item, ranked = ghRanked(), asking = GH.phase === "ask" || GH.phase === "reveal";
  let q = null, reveal = null;
  if (asking && it && g.kind === "board") { q = boardQ(); if (GH.phase === "reveal") reveal = boardReveal(); }
  else if (asking && it) {
    if (g.kind === "quiz") q = { q: it.q, options: it.options };
    if (g.kind === "scramble") q = { letters: it.letters, hint: it.hint, len: it.word.length, first: GH.phase === "ask" && ghLeft() < GH.limit / 2 ? it.word[0] : "" };
    if (g.kind === "order") q = { title: it.title, events: it.events.map(({ id, t }) => ({ id, t })) };
    if (g.kind === "who") q = { clues: it.clues.slice(0, ghClues()), total: WHO_CLUES };
    if (g.kind === "fake") q = { q: it.q, step: it.step, choices: it.step === "vote" ? it.choices.map(({ id, t }) => ({ id, t })) : null };
    if (GH.phase === "reveal") {
      if (g.kind === "quiz") reveal = { answer: it.answer, ref: it.ref, counts: it.options.map((_, i) => Object.values(GH.answers).filter((a) => a.value === i).length) };
      if (g.kind === "scramble") reveal = { word: it.word, ref: it.ref };
      if (g.kind === "order") reveal = { answer: it.answer, refs: it.refs };
      if (g.kind === "who") reveal = { name: it.name, ref: it.ref };
      if (g.kind === "fake") reveal = { answer: it.answer, ref: it.ref, choices: (it.choices || []).map((c) => ({ id: c.id, t: c.t, truth: !!c.truth,
        by: c.by.map((id) => GH.players[id]?.name).filter(Boolean), votes: Object.values(GH.answers).filter((a) => a.vote === c.id).length })) };
    }
  }
  const you = {}; for (const p of ranked) you[p.id] = ghYou(p.id, ranked);
  return {
    v: 1, phase: GH.phase, code: GH.code, title: GH.title, church: GH.church, gi: GH.gi, ri: GH.ri, games: GH.games.map((x) => ({ kind: x.kind, name: GAME_KINDS[x.kind].name, rounds: x.rounds })),
    kind: g.kind, name: GAME_KINDS[g.kind].name, blurb: GAME_KINDS[g.kind].blurb, rounds: g.rounds, limit: GH.limit || 0, left: GH.phase === "ask" ? ghLeft() : 0,
    q, reveal, count: ranked.length, done: Object.values(you).filter((y) => y.done).length, teams: ghTeamScores(),
    top: ranked.slice(0, 5).map((p) => ({ name: p.name, score: p.score, team: p.team || 0 })), you,
  };
}
function ghSend() { if (GH && ghNet) ghNet.send("state", ghState()); }
function ghUpdate() { ghSave(); ghSend(); ghDraw(); }

function ghHeard(event, p) {
  if (!GH || !p?.pid) return;
  if (event === "hello") {
    const name = String(p.name || "").trim().slice(0, 24) || "Player";
    if (!GH.players[p.pid]) GH.players[p.pid] = { name, score: 0, team: 0, at: Date.now() };
    GH.players[p.pid].name = name;
    if (GH.teams && !GH.players[p.pid].team && GH.phase !== "lobby") GH.players[p.pid].team = ghTeamFor();
    ghUpdate(); return;
  }
  if (event !== "answer" || GH.phase !== "ask" || p.key !== ghKey() || !GH.players[p.pid]) return;
  if (ghGame().kind === "board") { boardHeard(p); return; }
  const g = ghGame(), it = GH.item, ms = Math.max(0, Math.min(GH.limit, +p.ms || 0)), speed = 1 - ms / GH.limit;
  const prev = GH.answers[p.pid];
  if (g.kind === "quiz") {
    if (prev) return;
    const correct = +p.value === it.answer;
    GH.answers[p.pid] = { value: +p.value, ms, correct, points: correct ? Math.round(500 + 500 * speed) : 0 };
  } else if (g.kind === "scramble") {
    const a = (GH.answers[p.pid] ||= { tries: 0, solved: false, points: 0 });
    if (a.solved || a.tries >= 3) return;
    if (gameNorm(p.value) === it.word) Object.assign(a, { solved: true, correct: true, ms, points: Math.round((500 + 500 * speed) * [1, 0.75, 0.5][a.tries]) });
    else a.tries++;
  } else if (g.kind === "who") {
    const a = (GH.answers[p.pid] ||= { tries: 0, solved: false, points: 0 });
    if (a.solved || a.tries >= 3) return;
    const clues = ghClues();
    if (it.accept.includes(gameNorm(p.value))) Object.assign(a, { solved: true, correct: true, clues, points: Math.round((1000 - (clues - 1) * 175) * [1, 0.75, 0.5][a.tries]) });
    else a.tries++;
  } else if (g.kind === "fake") {
    const a = (GH.answers[p.pid] ||= {});
    if (it.step === "write") {
      if (a.fake) return;
      const text = String(p.value || "").trim().slice(0, 40);
      if (!text) return;
      // Writing the real answer would give it away: ask for a fake one instead.
      if (gameNorm(text) === gameNorm(it.answer)) a.tooTrue = true; else a.fake = text;
    } else {
      if (a.vote || !it.choices.some((c) => c.id === p.value) || it.choices.find((c) => c.id === p.value).by.includes(p.pid)) return;
      a.vote = p.value;
    }
  } else {
    if (prev || !Array.isArray(p.value)) return;
    const right = it.answer.filter((id, k) => p.value[k] === id).length, all = right === it.answer.length;
    GH.answers[p.pid] = { value: p.value.slice(0, 4), ms, correct: all, right, points: Math.round(600 * right / it.answer.length + (all ? 400 * speed : 0)) };
  }
  const st = ghState();
  ghSave(); ghNet.send("state", st);
  const step = it.step;
  if (st.done >= st.count) setTimeout(() => { if (GH?.phase !== "ask" || GH.item !== it || it.step !== step) return; if (g.kind === "fake" && step === "write") ghVote(); else ghReveal(); }, 700);
  else ghPatch(st);
}
/** Time's up: show the answer. And keep the clock on the big screen moving. */
function ghTimer() {
  if (!GH) return;
  if (GH.phase === "ask" && ghLeft() <= 0 && ghGame().kind === "board") { boardTimeout(); return; }
  if (GH.phase === "ask" && ghLeft() <= 0) { if (ghGame().kind === "fake" && GH.item.step === "write") ghVote(); else ghReveal(); return; }
  // Who Am I?: a new clue.
  if (GH.phase === "ask" && ghGame().kind === "who" && ghClues() !== GH.item.shown) { GH.item.shown = ghClues(); ghSend(); ghDrawn = ""; ghDraw(); return; }
  if (GH.phase !== "ask" || splitRoute().head !== "gameroom") return;
  const left = ghLeft(), el = $("[data-gm-left]");
  if (el) el.textContent = Math.ceil(left / 1000);
  const bar = $("[data-gm-bar]"); if (bar) bar.style.width = `${(left / GH.limit) * 100}%`;
  // Name Scramble shows the first letter halfway.
  if (ghGame().kind === "scramble" && left < GH.limit / 2 && !$("[data-gm-first]")?.textContent) { const f = $("[data-gm-first]"); if (f) { f.textContent = `Starts with ${GH.item.word[0]}`; ghSend(); } }
}
const gmDoneText = (st) => `${st.done} of ${st.count} ${st.kind === "fake" ? (st.q?.step === "vote" ? "voted" : "wrote a fake") : st.kind === "who" || st.kind === "scramble" ? "done" : "answered"}`;
function ghPatch(st) {
  const el = $("[data-gm-done]"); if (el) el.textContent = gmDoneText(st);
}
function ghDraw() {
  if (splitRoute().head !== "gameroom") return;
  const key = `${GH?.phase}:${GH?.gi}:${GH?.ri}:${GH?.item?.step || ""}:${GH?.item?.answering || ""}:${GH?.item?.locked?.length || 0}:${GH?.board ? boardLeft() : ""}:${GH ? Object.keys(GH.players).length : 0}:${GH ? ghPlayers().map((p) => p.name + p.team).join() : ""}`;
  if (key === ghDrawn && GH?.phase === "ask") { ghPatch(ghState()); return; }
  ghDrawn = key;
  $("#app").innerHTML = flat(Screens.gameroom().page);
}
async function ghEnd() {
  if (!GH) return;
  const was = GH; GH.phase = "ended"; ghSend(); ghSave();
  clearInterval(ghBeat); clearInterval(ghTick);
  setTimeout(() => ghNet?.close(), 500);
  GH = null; ghDrawn = "";
  try { sessionStorage.removeItem(GH_KEY); } catch { /* nothing */ }
  await GameNet.close(was.room, was.code);
}

// ----- Screens: Game night (join, and set up a night) -----
Screens.games = () => {
  if (!S.on("games")) return { redirect: "home" };
  const host = S.can("host.games"), open = ghLoad(), c = S.church();
  const kinds = Object.entries(GAME_KINDS);
  return {
    title: "Game night", back: "home", tab: "games",
    body: html`
      <section class="panel gm-joinbox" style="margin-top:16px">
        <h2 style="margin:0 0 4px">Join a game</h2>
        <p class="muted" style="margin:0 0 10px">Type the 4 letters on the big screen.</p>
        <form data-form="game-code" class="gm-codeform"><input type="text" name="code" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD" aria-label="Game code" required>
          <button class="btn">Join</button></form></section>
      ${open ? html`<section class="panel" style="margin-top:14px"><h2 style="margin:0 0 4px">Your game night is open</h2>
        <p class="muted" style="margin:0 0 10px">Code <b class="gm-mono">${open.code}</b>. ${plural(Object.keys(open.players).length, "player")} so far.</p>
        <div class="btns"><a class="btn" href="#gameroom">${icon("screen")}Go to the big screen</a><button class="btn ghost" data-act="game-end">End the night</button></div></section>` : ""}
      ${host && !open ? html`<section class="sec"><h2 class="sec-head">Host a game night</h2>
        <p class="faint" style="margin-top:-6px">Put this screen on a TV or projector. Everyone plays on their own phone: no app and no account. Every question comes from Scripture.</p>
        <form data-form="games-open" class="panel">
          <label class="field"><span>Name</span><input type="text" name="title" value="${c.name} game night" maxlength="80" required></label>
          <fieldset class="field" style="border:0;padding:0"><legend>Games, in this order</legend>
            ${kinds.map(([k, g]) => html`<div class="gm-pick"><label class="check" style="margin:0"><input type="checkbox" name="g_${k}" checked><span><b>${g.name}</b><br><small class="faint">${g.blurb}</small></span></label>
              <label class="gm-rounds"><span class="sr">${g.name} rounds</span><select name="r_${k}">${(k === "board" ? [3, 4, 5] : [3, 5, 8, 10]).map((n) => html`<option value="${n}" ${attr(n === 5, "selected")}>${n} ${k === "board" ? "categories" : "rounds"}</option>`)}</select></label></div>`)}
          </fieldset>
          ${gqAll().length ? html`<label class="field"><span>Questions</span><select name="source">
            <option value="both">Built-in and yours</option><option value="ours">Only yours</option><option value="builtin">Only built-in</option>
            ${gqSets().map((s) => html`<option value="set:${s}">Only the set "${s}"</option>`)}</select></label>` : ""}
          <fieldset class="field" style="border:0;padding:0"><legend>Teams</legend><div class="radios">
            ${[[0, "Everyone for themselves"], [2, "2 teams"], [3, "3 teams"], [4, "4 teams"]].map(([n, l]) => html`<label><input type="radio" name="teams" value="${n}" ${attr(!n, "checked")}><span>${l}</span></label>`)}</div>
            <small>Teams are split evenly when you start. A team's score is the average of its players, so a smaller team isn't behind.</small></fieldset>
          <button class="btn">${icon("play")}Open the room</button>
        </form></section>` : ""}
      ${host ? html`<a class="row panel" href="#gameqs" style="margin-top:14px"><span class="lead-ic">${icon("edit")}</span><span class="body"><span class="t">Your questions</span><span class="s">${gqAll().length ? plural(gqAll().length, "question") : "Write your own, or make them from a sermon"}</span></span>${icon("chev")}</a>` : ""}
      ${!host ? html`<p class="faint" style="margin-top:14px">Leaders who can host game nights start them here.</p>` : ""}`,
  };
};
Forms["game-code"] = (d, f) => {
  const code = gameNorm(d.code);
  if (code.length !== 4) return formError(f, "The code is 4 letters.");
  go(`play-${code}`);
};
Forms["games-open"] = async (d, f) => {
  if (!S.can("host.games")) return;
  const games = Object.keys(GAME_KINDS).filter((k) => d[`g_${k}`]).map((k) => ({ kind: k, rounds: +d[`r_${k}`] || 5 }));
  if (!games.length) return formError(f, "Pick at least one game.");
  const source = String(d.source || "both"), bank = gqBank(source);
  const empty = games.filter((g) => !bank[g.kind].length).map((g) => GAME_KINDS[g.kind].name);
  if (empty.length) return formError(f, `There are no questions of yours for ${listJoin(empty)} ${source.startsWith("set:") ? "in that set" : "yet"}. Add some, or use the built-in ones.`);
  const title = String(d.title || "").trim() || "Game night";
  let r;
  try { r = await GameNet.open(title); } catch (e) { return formError(f, e.message); }
  GH = { room: r.room, code: r.code, title, church: S.church().name, games, teams: +d.teams || 0, players: {}, phase: "lobby", gi: 0, ri: 0,
    item: null, answers: {}, last: {}, used: {}, bank, limit: 0, startedAt: 0, until: Date.now() + 6 * 3600e3 };
  ghSave(); ghConnect(); go("gameroom");
};
Actions["game-end"] = async () => { await ghEnd(); toast("Game night ended"); go("games"); };
Actions["game-next"] = () => ghNext();
Actions["game-shuffle"] = () => { ghBalance(); ghUpdate(); };
Actions["game-team"] = (el) => { const p = GH?.players[el.dataset.id]; if (!p || !GH.teams) return; p.team = (p.team % GH.teams) + 1; ghUpdate(); };
Actions["game-full"] = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
document.addEventListener("keydown", (e) => {
  if (splitRoute().head !== "gameroom" || !GH || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
  if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); ghNext(); }
});

// ----- The big screen -----
const gmTeamChip = (t) => t ? html`<span class="gm-team" style="--t:${GAME_TEAMS[t - 1][1]}">${GAME_TEAMS[t - 1][0]}</span>` : "";
function gmBoard(st, n = 8) {
  const ranked = GH ? ghRanked().slice(0, n) : [];
  return html`<ol class="gm-board">${ranked.map((p, i) => html`<li><span class="gm-place">${i + 1}</span><b>${p.name}</b>${gmTeamChip(p.team)}
    ${GH.phase === "reveal" && GH.last[p.id] ? html`<span class="gm-plus" style="${GH.last[p.id] < 0 ? "color:#f08a8d" : ""}">${GH.last[p.id] < 0 ? "−" : "+"}${Math.abs(GH.last[p.id]).toLocaleString()}</span>` : ""}<span class="gm-score">${p.score.toLocaleString()}</span></li>`)}</ol>`;
}
function gmTeams(st) {
  if (!st.teams) return "";
  const best = Math.max(...st.teams.map((t) => t.score));
  return html`<div class="gm-teams">${st.teams.map((t) => html`<div class="gm-teambox ${t.score === best && best > 0 ? "lead" : ""}" style="--t:${t.color}"><b>${t.name}</b><span>${t.score.toLocaleString()}</span><small>${plural(t.players, "player")}</small></div>`)}</div>`;
}
function gmStage(st) {
  const it = GH.item, reveal = st.phase === "reveal";
  if (st.phase === "lobby") {
    return html`<div class="gm-lobby">
      <div class="gm-join"><p class="gm-kicker">Join on your phone</p>
        <div class="gm-qr">${raw(qrSvg(gameJoinUrl(st.code), { size: 220 }))}</div>
        <p class="gm-url">${gameJoinUrl().replace(/^https?:\/\//, "")}</p>
        <p class="gm-kicker">Code</p><div class="gm-code" aria-label="Game code ${st.code.split("").join(" ")}">${st.code}</div></div>
      <div class="gm-players"><h2>${st.count ? plural(st.count, "player") : "Waiting for players"}</h2>
        <div class="gm-chips">${ghPlayers().map((p) => html`<button type="button" class="gm-chip" data-act="game-team" data-id="${p.id}" ${attr(!GH.teams, "disabled")} style="${GH.teams && p.team ? `--t:${GAME_TEAMS[p.team - 1][1]}` : ""}">${p.name}</button>`)}</div>
        ${GH.teams ? html`<p class="gm-dim">${GH.teams} teams, split evenly when you start. Tap a name to move them.</p>` : ""}
        <p class="gm-dim">Tonight: ${GH.games.map((g) => `${GAME_KINDS[g.kind].name} (${g.rounds})`).join(", ")}</p></div></div>`;
  }
  if (st.phase === "intro") {
    return html`<div class="gm-center"><p class="gm-kicker">Game ${st.gi + 1} of ${st.games.length}</p><h1 class="gm-title">${st.name}</h1><p class="gm-blurb">${st.blurb}</p><p class="gm-dim">${plural(st.rounds, "round")}</p></div>`;
  }
  if (st.phase === "standings" || st.phase === "final") {
    const final = st.phase === "final", ranked = ghRanked();
    return html`<div class="gm-center"><p class="gm-kicker">${final ? "Final scores" : `After ${st.name}`}</p>
      ${final && ranked[0] ? html`<h1 class="gm-title">${st.teams ? `${[...st.teams].sort((a, b) => b.score - a.score)[0].name} wins!` : `${ranked[0].name} wins!`}</h1>` : ""}
      ${gmTeams(st)}${gmBoard(st, final ? 10 : 8)}
      ${!final ? html`<p class="gm-dim">Next up: ${st.games[st.gi + 1]?.name || "final scores"}</p>` : ""}</div>`;
  }
  if (st.kind === "board") return boardStage(st);
  // A question, and its answer.
  const head = html`<div class="gm-qhead"><span>${st.name} · Round ${st.ri + 1} of ${st.rounds}</span>
    ${reveal ? html`<span>${it.ref || (it.refs ? "" : "")}</span>` : html`<span class="gm-clock" aria-hidden="true"><b data-gm-left>${Math.ceil(st.left / 1000)}</b></span>`}</div>
    ${reveal ? "" : html`<div class="gm-timebar"><span data-gm-bar style="width:${(st.left / st.limit) * 100}%"></span></div>`}`;
  let main = "";
  if (st.kind === "quiz") {
    main = html`<h1 class="gm-q">${it.q}</h1><div class="gm-opts">${it.options.map((o, i) => html`<div class="gm-opt gm-o${i} ${reveal ? (i === it.answer ? "right" : "wrong") : ""}"><span class="gm-shape" aria-hidden="true"></span><b>${o}</b>
      ${reveal ? html`<span class="gm-count">${st.reveal.counts[i]}</span>` : ""}</div>`)}</div>`;
  } else if (st.kind === "scramble") {
    main = html`<p class="gm-kicker">${it.hint}</p><div class="gm-tiles ${reveal ? "solved" : ""}">${[...(reveal ? it.word : it.letters)].map((ch) => html`<span>${ch}</span>`)}</div>
      ${reveal ? "" : html`<p class="gm-dim" data-gm-first>${st.q.first ? `Starts with ${st.q.first}` : ""}</p>`}`;
  } else if (st.kind === "who") {
    const clues = reveal ? it.clues : st.q.clues;
    main = html`<h1 class="gm-q">${reveal ? it.name : "Who am I?"}</h1>
      <ol class="gm-clues">${clues.map((c, i) => html`<li class="${!reveal && i === clues.length - 1 ? "new" : ""}"><span class="gm-letter">${i + 1}</span><b>${c}</b></li>`)}</ol>
      ${reveal ? "" : html`<p class="gm-dim" style="text-align:center">Clue ${clues.length} of ${WHO_CLUES}. Guessing earlier scores more.</p>`}`;
  } else if (st.kind === "fake") {
    const voting = it.step === "vote", labels = "ABCDEFGHIJKLMNOP";
    main = html`<h1 class="gm-q">${it.q}</h1>
      ${reveal ? html`<ol class="gm-fakes">${st.reveal.choices.map((c, i) => html`<li class="${c.truth ? "truth" : ""}"><span class="gm-letter">${labels[i]}</span><b>${c.t}</b>
          <small>${c.truth ? "The truth" : `${listJoin(c.by)}'s fake`}</small><span class="gm-count">${plural(c.votes, "vote")}</span></li>`)}</ol>`
        : voting ? html`<p class="gm-kicker" style="text-align:center">One of these is true. Pick it on your phone.</p><ol class="gm-fakes">${it.choices.map((c, i) => html`<li><span class="gm-letter">${labels[i]}</span><b>${c.t}</b></li>`)}</ol>`
        : html`<p class="gm-blurb" style="text-align:center;margin:auto">Write a fake answer on your phone that sounds true.</p>`}`;
  } else {
    const order = reveal ? it.refs : it.events, labels = "ABCD";
    main = html`<h1 class="gm-q">${it.title}: earliest first</h1><ol class="gm-events ${reveal ? "solved" : ""}">${order.map((e) => html`<li><span class="gm-letter">${labels[it.events.findIndex((x) => x.id === e.id)]}</span><b>${e.t}</b>${reveal && e.ref ? html`<small>${e.ref}</small>` : ""}</li>`)}</ol>`;
  }
  return html`<div class="gm-question">${head}${main}
    ${reveal ? html`<div class="gm-after">${gmTeams(st)}${gmBoard(st, 5)}</div>` : html`<p class="gm-dim gm-answered" data-gm-done>${gmDoneText(st)}</p>`}</div>`;
}
Screens.gameroom = () => {
  if (!ghLoad()) return { redirect: "games" };
  const st = ghState();
  const next = { lobby: "Start", intro: "First question", ask: st.kind === "board" ? { pick: "", wager: "Start the final", answer: "Time's up" }[st.q?.step] ?? "Show the answer" : st.kind === "fake" && st.q?.step === "write" ? "Start the vote" : "Show the answer",
    reveal: st.kind === "board" ? (!GH.board || st.q?.final ? "See scores" : boardLeft() ? "Back to the board" : GH.board.final ? "Final round" : "See scores") : st.ri + 1 < st.rounds ? "Next question" : "See scores",
    standings: st.gi + 1 < st.games.length ? `Next: ${st.games[st.gi + 1]?.name}` : "Final scores", final: "" }[st.phase];
  return {
    page: html`<div class="gm gm-big gm-at-${st.phase}" role="main">
      <header class="gm-top"><b>${st.title}</b>${st.phase !== "lobby" ? html`<span class="gm-codepill">Join: <b>${st.code}</b></span>` : ""}</header>
      <div class="gm-stage">${gmStage(st)}</div>
      <nav class="gm-host" aria-label="Host controls">
        <a class="gm-hbtn" href="#games">${icon("back")}Game night</a>
        ${st.phase === "lobby" && GH.teams ? html`<button class="gm-hbtn" data-act="game-shuffle">Shuffle teams</button>` : ""}
        <button class="gm-hbtn" data-act="game-full">${icon("expand")}Full screen</button>
        <button class="gm-hbtn" data-act="game-end">End the night</button>
        ${next ? html`<button class="gm-hbtn gm-next" data-act="game-next">${next} ${icon("next")}<small>Space</small></button>` : ""}
      </nav></div>`,
  };
};
