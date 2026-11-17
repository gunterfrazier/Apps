// ---------- Sermon media: player, transcripts, a searchable archive and a podcast feed ----------
// Each sermon can have a video link (YouTube, Vimeo or a file), an audio file for the podcast, and a transcript.
// Transcripts come from a pasted or uploaded text, VTT or SRT file, or from the live captions of the presentation.

const isAudioUrl = (u) => /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u || "");
const sermonVideo = (s) => s.videoUrl || (s.mediaUrl && !isAudioUrl(s.mediaUrl) ? s.mediaUrl : "");
const sermonAudio = (s) => s.audioUrl || (isAudioUrl(s.mediaUrl) ? s.mediaUrl : "");
const canMedia = () => S.isMember() && S.can("manage.sermons");

// ----- Transcripts -----
const tc = (secs) => { const s = Math.max(0, Math.round(secs)), h = Math.floor(s / 3600); return `${h ? `${h}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`; };
/** WebVTT, SRT or plain text into [{ t, text }] paragraphs. Timed cues are joined into paragraphs of about 40 seconds. */
function parseTranscript(raw) {
  const text = String(raw || "").replace(/\r/g, "").trim();
  if (!text) return [];
  const cue = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,]\d{1,3}\s*-->/;
  // "0:12  words" paragraphs, the way an opened file is shown for editing, keep their times.
  if (!cue.test(text) && /^\d{1,2}:\d{2}(:\d{2})?\s{2}/m.test(text)) return text.split(/\n\s*\n/).map((p) => {
    const m = p.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s{2}([\s\S]*)$/);
    return m ? { t: (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3], text: m[4].replace(/\s*\n\s*/g, " ").trim() } : { t: null, text: p.trim() };
  }).filter((p) => p.text);
  if (!cue.test(text)) return text.split(/\n\s*\n/).map((p) => ({ t: null, text: p.replace(/\s*\n\s*/g, " ").trim() })).filter((p) => p.text);
  const cues = [];
  text.split(/\n\s*\n/).forEach((block) => {
    const lines = block.split("\n"), i = lines.findIndex((l) => cue.test(l)); if (i < 0) return;
    const m = lines[i].match(cue), t = (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3];
    const words = lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").trim(); if (words) cues.push({ t, text: words });
  });
  const out = [];
  cues.forEach((c) => { const last = out[out.length - 1]; if (last && c.t - last.t < 40 && last.text.length < 600) last.text += ` ${c.text}`; else out.push({ ...c }); });
  return out;
}
const transcriptText = (s) => (s.transcript || []).map((p) => p.text).join("\n\n");
const transcriptEditText = (s) => (s.transcript || []).map((p) => (p.t != null ? `${tc(p.t)}  ` : "") + p.text).join("\n\n");
function highlight(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return text;
  return html`${text.slice(0, i)}<mark>${text.slice(i, i + q.length)}</mark>${highlight(text.slice(i + q.length), q)}`;
}

// ----- Searching every sermon -----
/** Full-text search over titles, passages, speakers, series, summaries, outlines and transcripts. */
function searchSermons(q, list = sermonsSorted()) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return [];
  return list.map((s) => {
    const fields = [[s.title, 6], [s.passage, 5], [s.series, 3], [s.speaker, 3], [s.topic || "", 3], [s.summary || "", 2], [(s.outline || []).join(" "), 2], [transcriptText(s), 1]];
    let score = 0;
    for (const w of words) { const hit = fields.reduce((n, [f, wt]) => n + (f.toLowerCase().includes(w) ? wt : 0), 0); if (!hit) return null; score += hit; }
    const from = [s.summary || "", ...(s.transcript || []).map((p) => p.text)].find((f) => f.toLowerCase().includes(words[0]));
    let snippet = "";
    if (from) { const i = from.toLowerCase().indexOf(words[0]), a = Math.max(0, i - 60); snippet = `${a ? "..." : ""}${from.slice(a, i + 120)}${i + 120 < from.length ? "..." : ""}`; }
    return { s, score, snippet };
  }).filter(Boolean).sort((a, b) => b.score - a.score || new Date(b.s.date) - new Date(a.s.date));
}
// ----- Series artwork helpers -----
function sermonArtwork(s) {
  if (!s) return "";
  if (s.artwork) return s.artwork;
  const peer = S.list("sermons", s.churchId).find((x) => x.series === s.series && x.artwork);
  if (peer?.artwork) return peer.artwork;
  const c = S.church(s.churchId);
  return c?.podcast?.artwork || "";
}
function sermonArtTile(s, size = 56) {
  const art = sermonArtwork(s);
  const label = s?.series || s?.title || "Sermon";
  return html`<span class="art-tile" style="--sz:${size}px">${art ? html`<img src="${art}" alt="">` : html`<span class="at-k">${label}</span>`}</span>`;
}

let sermonQuery = "", sermonBook = "";
function sermonResults() {
  const list = sermonsSorted().filter((s) => !sermonBook || parseRef(s.passage)?.book === sermonBook);
  if (!sermonQuery.trim()) {
    if (!list.length) return html`<div class="empty"><p>${sermonsSorted().length ? "No sermons on that book yet." : "No sermons have been posted yet."}</p></div>`;
    const series = [...new Set(list.map((s) => s.series))];
    return html`${series.map((name) => {
      const items = list.filter((s) => s.series === name), lead = items[0];
      return html`<section class="sec" style="margin-top:18px"><div class="series-block">
        <div class="series-hero">${sermonArtTile(lead, 72)}<div class="sh-body"><span class="sh-k">Sermon Series</span><span class="sh-title">${name}</span><span class="sh-meta">${plural(items.length, "message")} · Latest ${fmtShort(lead.date)}</span></div></div>
        <div class="rows">${items.map(sermonRow)}</div></div></section>`;
    })}`;
  }
  const hits = searchSermons(sermonQuery, list);
  return hits.length ? html`<p class="faint" style="margin:14px 0 6px">${plural(hits.length, "sermon")}</p><div class="rows">${hits.map(({ s, snippet }) => html`<a class="row" href="#sermon-${s.id}">${sermonArtTile(s, 48)}<span class="body"><span class="t">${highlight(s.title, sermonQuery.split(/\s+/)[0])}</span><span class="s">${s.passage}, ${s.speaker}, ${fmtShort(s.date)}</span>${snippet ? html`<span class="s snippet">${highlight(snippet, sermonQuery.split(/\s+/)[0])}</span>` : ""}</span>${icon("chev")}</a>`)}</div>`
    : html`<div class="empty"><p>No sermons mention "${sermonQuery}". Try a passage like Romans 8, a speaker or a word from the message.</p></div>`;
}
Inputs["sermon-search"] = (el) => { sermonQuery = el.value; $("#sermon-list").innerHTML = flat(sermonResults()); };
Actions["sermon-book"] = (el) => { sermonBook = el.dataset.book === sermonBook ? "" : el.dataset.book; render(); };

// ----- Persistent Spotify-style audio player & mini-player bar -----
const AUDIO_RATES = [1, 1.25, 1.5, 2];
let demoWavUrl = "";
function getDemoAudioUrl() {
  if (demoWavUrl) return demoWavUrl;
  const sr = 8000, secs = 60, n = sr * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / sr, env = Math.min(1, t / 0.4) * (0.25 + 0.15 * Math.sin(t * 0.8));
    const sample = (Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 330 * t) * 0.3 + Math.sin(2 * Math.PI * 440 * t) * 0.2) * env * 1800;
    v.setInt16(44 + i * 2, sample, true);
  }
  demoWavUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return demoWavUrl;
}

const Player = {
  audio: typeof Audio !== "undefined" ? new Audio() : null,
  sermonId: null,
  rate: 1,
  simTime: 0,
  simDur: 0,
  simPlaying: false,
  simTimer: 0,
  ready: false,
  init() {
    if (this.ready || !this.audio) return;
    this.ready = true;
    this.audio.preload = "metadata";
    this.audio.addEventListener("timeupdate", () => this.tick());
    this.audio.addEventListener("loadedmetadata", () => this.tick());
    this.audio.addEventListener("play", () => { this.syncMediaSession(); this.syncUI(); });
    this.audio.addEventListener("pause", () => this.syncUI());
    this.audio.addEventListener("ended", () => { this.stopSim(); this.syncUI(); });
  },
  sermon() { return this.sermonId ? S.get("sermons", this.sermonId) : null; },
  active() { return !!this.sermon(); },
  isPlaying(id = this.sermonId) {
    if (!id || id !== this.sermonId) return false;
    return this.simPlaying || !!(this.audio && !this.audio.paused && !this.audio.ended);
  },
  duration(s = this.sermon()) {
    const d = this.audio?.duration;
    return Number.isFinite(d) && d > 120 ? d : ((s?.minutes || 35) * 60);
  },
  currentTime() {
    if (this.simDur > 0) return this.simTime;
    return this.audio?.currentTime || 0;
  },
  stopSim() { clearInterval(this.simTimer); this.simTimer = 0; this.simPlaying = false; },
  startSim() {
    this.stopSim();
    this.simPlaying = true;
    this.simTimer = setInterval(() => {
      this.simTime = Math.min(this.simDur, this.simTime + 0.25 * this.rate);
      this.tick();
      if (this.simTime >= this.simDur) { this.stopSim(); this.audio?.pause(); this.syncUI(); }
    }, 250);
  },
  load(s, autoPlay = true) {
    if (!s) return;
    this.init();
    const changed = this.sermonId !== s.id;
    this.sermonId = s.id;
    const url = sermonAudio(s);
    if (changed) {
      this.stopSim();
      this.simTime = 0;
      this.simDur = (s.minutes || 35) * 60;
      if (this.audio) {
        this.audio.src = url && !IN_PREVIEW ? url : getDemoAudioUrl();
        this.audio.playbackRate = this.rate;
      }
    }
    if (autoPlay) this.play();
    else this.syncUI();
  },
  play() {
    const s = this.sermon(); if (!s) return;
    this.init();
    const realUrl = sermonAudio(s) && !IN_PREVIEW;
    if (!realUrl) { this.simDur = (s.minutes || 35) * 60; this.startSim(); }
    this.audio?.play().catch(() => {
      if (realUrl) { this.simDur = (s.minutes || 35) * 60; this.startSim(); }
    });
    this.syncMediaSession();
    this.syncUI();
  },
  pause() {
    this.stopSim();
    this.audio?.pause();
    this.syncUI();
  },
  toggle(id) {
    const target = id ? S.get("sermons", id) : this.sermon();
    if (!target) return;
    if (this.sermonId !== target.id) { this.load(target, true); return; }
    if (this.isPlaying(target.id)) this.pause(); else this.play();
  },
  seek(sec) {
    const s = this.sermon(); if (!s) return;
    const dur = this.duration(s), next = clamp(+sec || 0, 0, dur);
    if (this.simDur > 0) this.simTime = next;
    if (this.audio && Number.isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.min(this.audio.duration - 0.5, next % Math.max(1, this.audio.duration));
    }
    this.tick();
  },
  skip(delta) {
    if (!this.sermon()) return;
    this.seek(this.currentTime() + (+delta || 0));
  },
  setRate(r) {
    this.rate = AUDIO_RATES.includes(+r) ? +r : 1;
    if (this.audio) this.audio.playbackRate = this.rate;
    this.syncUI();
  },
  cycleRate() {
    const i = AUDIO_RATES.indexOf(this.rate);
    this.setRate(AUDIO_RATES[(i + 1) % AUDIO_RATES.length]);
  },
  close() {
    this.pause();
    this.sermonId = null;
    this.simTime = 0;
    this.syncUI();
  },
  async cast() {
    const a = this.audio;
    try {
      if (a?.remote?.prompt) { await a.remote.prompt(); return; }
      if (typeof a?.webkitShowPlaybackTargetPicker === "function") { a.webkitShowPlaybackTargetPicker(); return; }
    } catch (e) { if (e?.name === "NotFoundError" || e?.name === "InvalidStateError") toast("No cast or AirPlay speaker found nearby"); return; }
    openSheet("Cast to a speaker or TV", html`<p style="margin-top:0">Stream <b>${this.sermon()?.title || "this sermon"}</b> to a smart speaker, TV or car audio:</p>
      <ul class="steps-list">
        <li><b>iPhone or iPad:</b> open Control Center and tap the <b>AirPlay</b> icon to pick your HomePod, Apple TV or Bluetooth speaker.</li>
        <li><b>Android or Chrome:</b> open the browser menu and choose <b>Cast</b> to send audio to a Chromecast or Google Nest speaker.</li>
      </ul>
      <button class="btn block" data-act="close-sheet">Got it</button>`);
  },
  syncMediaSession() {
    const s = this.sermon();
    if (!s || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    const art = sermonArtwork(s);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.title, artist: s.speaker, album: `${s.series} · ${S.church(s.churchId)?.name || PLATFORM.name}`,
        artwork: isUrl(art) || art.startsWith("data:") ? [{ src: art, sizes: "512x512", type: "image/png" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => this.play());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => this.skip(-15));
      navigator.mediaSession.setActionHandler("seekforward", () => this.skip(15));
    } catch {}
  },
  ensureBar() {
    let bar = $("#mini-player");
    if (!bar) {
      bar = document.createElement("aside");
      bar.id = "mini-player";
      bar.setAttribute("aria-label", "Now playing mini-player");
      bar.hidden = true;
      document.body.appendChild(bar);
    }
    return bar;
  },
  tick() {
    const s = this.sermon(); if (!s) return;
    const cur = this.currentTime(), dur = Math.max(1, this.duration(s)), pct = clamp((cur / dur) * 100, 0, 100);
    const bar = $("#mini-player");
    if (bar && !bar.hidden) {
      const fill = $(".mp-progress i", bar), sub = $(".mp-sub", bar);
      if (fill) fill.style.width = `${pct.toFixed(1)}%`;
      if (sub) sub.textContent = `${s.speaker} · ${tc(cur)} / ${tc(dur)}`;
    }
    const card = $(".sermon-audio-card");
    if (card && card.dataset.id === s.id) {
      const scrub = $(".sac-range", card), elCur = $("[data-sac-cur]", card), elRem = $("[data-sac-rem]", card);
      if (scrub && document.activeElement !== scrub) { scrub.max = Math.round(dur); scrub.value = Math.round(cur); }
      if (elCur) elCur.textContent = tc(cur);
      if (elRem) elRem.textContent = `-${tc(Math.max(0, dur - cur))}`;
    }
  },
  syncUI() {
    const bar = this.ensureBar(), s = this.sermon();
    const hide = !s || document.body.classList.contains("presenting") || document.body.classList.contains("kiosk-mode") || document.documentElement.classList.contains("overlay-page");
    document.body.classList.toggle("has-mini-player", !hide);
    if (hide) { bar.hidden = true; return; }
    const playing = this.isPlaying(s.id), cur = this.currentTime(), dur = Math.max(1, this.duration(s)), pct = clamp((cur / dur) * 100, 0, 100);
    bar.hidden = false;
    bar.innerHTML = flat(html`<div class="mp-progress"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="mp-row">
        <a class="mp-open" href="#sermon-${s.id}">${sermonArtTile(s, 42)}
          <span class="mp-meta"><span class="mp-title">${s.title}</span><span class="mp-sub">${s.speaker} · ${tc(cur)} / ${tc(dur)}</span></span></a>
        <div class="mp-btns">
          <button type="button" class="mp-btn" data-act="audio-skip" data-sec="-15" title="Rewind 15 seconds" aria-label="Rewind 15 seconds">${icon("skipBack")}</button>
          <button type="button" class="mp-btn play" data-act="audio-toggle" data-id="${s.id}" aria-label="${playing ? "Pause" : "Play"}">${icon(playing ? "pause" : "play")}</button>
          <button type="button" class="mp-btn" data-act="audio-skip" data-sec="15" title="Forward 15 seconds" aria-label="Forward 15 seconds">${icon("skipFwd")}</button>
          <button type="button" class="mp-rate" data-act="audio-rate-cycle" aria-label="Playback speed ${this.rate}x">${this.rate}×</button>
          <button type="button" class="mp-btn mp-hide-xs" data-act="audio-cast" title="Cast audio" aria-label="Cast audio">${icon("cast")}</button>
          <button type="button" class="mp-btn" data-act="audio-close" title="Close player" aria-label="Close mini-player">${icon("x")}</button>
        </div>
      </div>`);
    const card = $(".sermon-audio-card");
    if (card && card.dataset.id === s.id) {
      const playBtn = $(".sac-play", card);
      if (playBtn) { playBtn.innerHTML = flat(icon(playing ? "pause" : "play")); playBtn.setAttribute("aria-label", playing ? "Pause sermon" : "Play sermon"); }
      $$("[data-act=audio-rate]", card).forEach((b) => b.setAttribute("aria-pressed", +b.dataset.r === this.rate));
    }
    $$("[data-act=mini-play]").forEach((b) => {
      const on = this.isPlaying(b.dataset.id);
      b.setAttribute("aria-pressed", on);
      b.innerHTML = flat(icon(on ? "pause" : "play"));
    });
  },
};

// ----- Player and transcript on the sermon page -----
function sermonMedia(s) {
  const video = sermonVideo(s), audio = sermonAudio(s);
  const isCur = Player.sermonId === s.id, playing = Player.isPlaying(s.id);
  const dur = isCur ? Player.duration(s) : (s.minutes || 35) * 60, cur = isCur ? Player.currentTime() : 0;
  return html`${video ? html`<div class="sermon-video">${embedView(video, s.title, { video: true })}</div>` : ""}
    <div class="sermon-audio-card" data-id="${s.id}">
      <div class="sac-top">
        ${sermonArtTile(s, 68)}
        <div class="sac-info">
          <span class="sac-k">${s.series || "Message"}</span>
          <span class="sac-title">${s.title}</span>
          <span class="sac-sub">${s.speaker} · ${s.minutes || 35} min${!audio && canMedia() ? html` · <a href="#media-${s.id}">Add audio file</a>` : ""}</span>
        </div>
        <button type="button" class="icon-btn" data-act="audio-cast" data-id="${s.id}" title="Cast to speaker or TV" aria-label="Cast audio">${icon("cast")}</button>
      </div>
      <div class="sac-scrub">
        <input type="range" class="sac-range" min="0" max="${Math.round(dur)}" value="${Math.round(cur)}" data-input="audio-scrub" data-id="${s.id}" aria-label="Seek sermon audio">
        <div class="sac-times"><span data-sac-cur>${tc(cur)}</span><span data-sac-rem>-${tc(Math.max(0, dur - cur))}</span></div>
      </div>
      <div class="sac-controls">
        <div class="sac-transport">
          <button type="button" class="sac-skip" data-act="audio-skip" data-id="${s.id}" data-sec="-15" aria-label="Skip back 15 seconds">${icon("skipBack")}15s</button>
          <button type="button" class="sac-play" data-act="audio-toggle" data-id="${s.id}" aria-label="${playing ? "Pause sermon" : "Play sermon"}">${icon(playing ? "pause" : "play")}</button>
          <button type="button" class="sac-skip" data-act="audio-skip" data-id="${s.id}" data-sec="15" aria-label="Skip forward 15 seconds">15s${icon("skipFwd")}</button>
        </div>
        <div class="sac-actions" role="group" aria-label="Playback speed">
          ${AUDIO_RATES.map((r) => html`<button type="button" class="chip" data-act="audio-rate" data-r="${r}" aria-pressed="${Player.rate === r}">${r}×</button>`)}
        </div>
      </div>
    </div>`;
}
function transcriptSection(s) {
  if (!s.transcript?.length) return "";
  const timed = s.transcript.some((p) => p.t != null);
  return html`<section class="sec"><details class="transcript"><summary><h2>Transcript</h2><span class="faint">${plural(s.transcript.reduce((n, p) => n + p.text.split(/\s+/).length, 0), "word")}</span></summary>
    <label class="field"><span class="sr">Search the transcript</span><input type="search" placeholder="Search the transcript" data-input="transcript-search"></label>
    <div class="tx-body">${s.transcript.map((p) => html`<p data-text="${p.text}">${timed && p.t != null ? html`<button class="tx-t" data-act="seek" data-id="${s.id}" data-t="${p.t}" aria-label="Play from ${tc(p.t)}">${tc(p.t)}</button>` : ""}<span>${p.text}</span></p>`)}</div>
    <p class="faint tx-none" hidden>No matches.</p></details></section>`;
}
Inputs["transcript-search"] = (el) => {
  const box = el.closest(".transcript"), q = el.value.trim(); let shown = 0;
  $$(".tx-body p", box).forEach((p) => { const t = p.dataset.text, hit = !q || t.toLowerCase().includes(q.toLowerCase()); p.hidden = !hit; if (hit) shown++; $("span", p).innerHTML = flat(highlight(t, q)); });
  $(".tx-none", box).hidden = shown > 0;
};
Actions["mini-play"] = (el) => Player.toggle(el.dataset.id);
Actions["audio-toggle"] = (el) => Player.toggle(el.dataset.id || Player.sermonId);
Actions["audio-skip"] = (el) => {
  if (el.dataset.id && Player.sermonId !== el.dataset.id) Player.load(S.get("sermons", el.dataset.id), true);
  Player.skip(+el.dataset.sec || 0);
};
Inputs["audio-scrub"] = (el) => {
  if (el.dataset.id && Player.sermonId !== el.dataset.id) Player.load(S.get("sermons", el.dataset.id), false);
  Player.seek(+el.value || 0);
};
Actions["seek"] = (el) => {
  const id = el.dataset.id || splitRoute().tail;
  if (id && Player.sermonId !== id) Player.load(S.get("sermons", id), true);
  else if (!Player.isPlaying()) Player.play();
  Player.seek(+el.dataset.t || 0);
};
Actions["audio-rate"] = (el) => Player.setRate(+el.dataset.r);
Actions["audio-rate-cycle"] = () => Player.cycleRate();
Actions["audio-cast"] = (el) => {
  if (el.dataset.id && Player.sermonId !== el.dataset.id) Player.load(S.get("sermons", el.dataset.id), false);
  Player.cast();
};
Actions["audio-close"] = () => Player.close();

// ----- Media editor for staff -----
Screens.media = (id) => {
  const s = S.get("sermons", id);
  if (!s || !canMedia()) return { redirect: `sermon-${id}` };
  const live = typeof Backend !== "undefined" && Backend.on;
  const captions = pres.transcript.length ? pres.transcript.join(" ") : "";
  return {
    title: "Media and transcript", back: `sermon-${s.id}`,
    body: html`<h1 style="margin-top:16px">${s.title}</h1><p class="muted" style="margin-top:4px">${s.speaker}, ${fmtShort(s.date)}</p>
      <form data-form="media-save" class="panel" novalidate><input type="hidden" name="id" value="${s.id}">
        ${imageField("artwork", "Series or sermon square artwork", s.artwork, "Square 1:1 album art shown on sermon series cards and in the persistent mini-player.", 1000)}
        <label class="field"><span>Video link</span><input type="url" name="videoUrl" value="${sermonVideo(s)}" placeholder="https://youtu.be/..."><small>YouTube, Vimeo or Facebook, or an MP4 file.</small></label>
        <label class="field"><span>Audio file for the podcast</span><input type="url" name="audioUrl" value="${sermonAudio(s)}" placeholder="https://.../sermon.mp3"><small>An MP3 or M4A link. Podcast apps need one.</small></label>
        <div class="btns"><label class="btn ghost sm">${icon("download")}Upload audio or video<input type="file" class="sr" accept="audio/*,video/*" data-change="media-upload" data-id="${s.id}"></label></div>
        ${live ? "" : html`<p class="faint">Uploads go to your own storage once the app is on your website with Supabase connected. Until then, paste a link.</p>`}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Length in minutes</span><input type="number" name="minutes" min="1" max="300" value="${s.minutes || 35}"></label>
          <label class="field"><span>Audio file size (MB)</span><input type="number" name="audioMb" min="0" step="0.1" value="${s.audioBytes ? (s.audioBytes / 1048576).toFixed(1) : ""}"><small>Podcast apps ask for it. Filled in for uploads.</small></label></div>
        <label class="field"><span>Transcript</span><textarea name="transcript" style="min-height:180px" placeholder="Paste the transcript, or a VTT or SRT captions file">${transcriptEditText(s)}</textarea><small>Blank lines start a new paragraph. Timed captions (VTT or SRT) let people jump to that spot.</small></label>
        <div class="btns"><label class="btn ghost sm">${icon("note")}Open a transcript file<input type="file" class="sr" accept=".txt,.vtt,.srt,text/plain,text/vtt" data-change="transcript-file"></label>
          ${captions ? html`<button type="button" class="btn ghost sm" data-act="transcript-captions">${icon("chat")}Use captions from the last presentation</button>` : ""}</div>
        <button class="btn block" style="margin-top:14px">Save</button></form>
      ${AI.possible() ? html`<section class="sec"><h2 class="sec-head">Write with Veritas Logos</h2><div class="panel">
        <p style="margin-top:0">Draft a summary and outline for this sermon from its passage${s.transcript?.length ? " and transcript" : ""}. You can edit it before anyone sees it.</p>
        <button class="btn ghost sm" data-act="ai-recap" data-id="${s.id}">${icon("bolt")}Draft a summary and outline</button></div></section>` : ""}`,
  };
};
Forms["media-save"] = (d, f) => {
  for (const k of ["videoUrl", "audioUrl"]) if (d[k] && !isUrl(d[k])) return formError(f, "Links should start with https://");
  const s = S.get("sermons", d.id);
  Object.assign(s, { artwork: d.artwork || "", videoUrl: d.videoUrl, audioUrl: d.audioUrl, mediaUrl: d.videoUrl || d.audioUrl, minutes: Math.max(1, +d.minutes || s.minutes), audioBytes: d.audioMb ? Math.round(+d.audioMb * 1048576) : s.audioBytes || 0, transcript: parseTranscript(d.transcript) });
  S.save(); toast("Saved"); go(`sermon-${s.id}`);
};
Inputs["transcript-file"] = (el) => {
  const file = el.files?.[0]; if (!file) return;
  if (file.size > 2e6) { toast("That file is too big for a transcript"); return; }
  const r = new FileReader();
  r.onload = () => { const ta = $('textarea[name="transcript"]', el.form); const parts = parseTranscript(r.result); ta.value = parts.map((p) => (p.t != null ? `${tc(p.t)}  ` : "") + p.text).join("\n\n"); ta.dataset.raw = r.result; toast(`${plural(parts.length, "paragraph")} read`); };
  r.readAsText(file);
};
Actions["transcript-captions"] = (el) => { const ta = $('textarea[name="transcript"]', el.closest("form")); ta.value = pres.transcript.join(" ").replace(/([.?!])\s+/g, "$1 ").replace(/(.{500,}?[.?!])\s/g, "$1\n\n"); toast("Captions added"); };
Inputs["media-upload"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  if (typeof Backend === "undefined" || !Backend.on) { toast("Uploading needs Supabase. Paste a link for now."); el.value = ""; return; }
  const form = el.closest("form"), isAudio = file.type.startsWith("audio/");
  try {
    toast("Uploading..."); const url = await Backend.upload(file, `sermons/${el.dataset.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "-")}`);
    form[isAudio ? "audioUrl" : "videoUrl"].value = url; if (isAudio) form.audioMb.value = (file.size / 1048576).toFixed(1);
    toast("Uploaded. Save to keep it.");
  } catch (e) { toast(`Upload failed: ${e.message || "try again"}`); }
};
// ----- Podcast feed -----
const xmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const podcastOf = (c = S.church()) => ({ title: `${c.name} sermons`, author: c.name, description: c.tagline || `Sunday messages from ${c.name}.`, email: c.email || "", category: "Christianity", artwork: c.logo || "", language: "en-us", ...(c.podcast || {}) });
const feedUrl = (c = S.church()) => (typeof Backend !== "undefined" && Backend.on ? Backend.podcastUrl(c.id) : "");
/** An RSS 2.0 feed with the Apple Podcasts tags Spotify and others also read. */
function podcastXml(c = S.church()) {
  const p = podcastOf(c), eps = S.list("sermons", c.id).filter((s) => sermonAudio(s)).sort((a, b) => new Date(b.date) - new Date(a.date));
  const site = c.website || appLink(`church-${c.id}`), art = isUrl(p.artwork) ? p.artwork : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xmlEsc(p.title)}</title>
  <link>${xmlEsc(site)}</link>
  <language>${xmlEsc(p.language)}</language>
  <description>${xmlEsc(p.description)}</description>
  <itunes:author>${xmlEsc(p.author)}</itunes:author>
  <itunes:owner><itunes:name>${xmlEsc(p.author)}</itunes:name><itunes:email>${xmlEsc(p.email)}</itunes:email></itunes:owner>
  <itunes:explicit>false</itunes:explicit>
  <itunes:type>episodic</itunes:type>
  <itunes:category text="Religion &amp; Spirituality"><itunes:category text="${xmlEsc(p.category)}"/></itunes:category>${art ? `
  <itunes:image href="${xmlEsc(art)}"/>
  <image><url>${xmlEsc(art)}</url><title>${xmlEsc(p.title)}</title><link>${xmlEsc(site)}</link></image>` : ""}${feedUrl(c) ? `
  <atom:link href="${xmlEsc(feedUrl(c))}" rel="self" type="application/rss+xml"/>` : ""}
${eps.map((s) => { const audio = sermonAudio(s), type = /\.m4a(\?|$)/i.test(audio) ? "audio/x-m4a" : "audio/mpeg";
  return `  <item>
    <title>${xmlEsc(s.title)}</title>
    <description>${xmlEsc([s.summary, `${s.passage}. ${s.speaker}.`, s.series ? `Series: ${s.series}.` : ""].filter(Boolean).join(" "))}</description>
    <enclosure url="${xmlEsc(audio)}" length="${s.audioBytes || 0}" type="${type}"/>
    <guid isPermaLink="false">${xmlEsc(`${c.id}:${s.id}`)}</guid>
    <pubDate>${new Date(s.date).toUTCString()}</pubDate>
    <itunes:duration>${(s.minutes || 35) * 60}</itunes:duration>
    <itunes:author>${xmlEsc(s.speaker)}</itunes:author>
    <link>${xmlEsc(appLink(`sermon-${s.id}`))}</link>${s.transcript?.length ? `
    <podcast:transcript url="${xmlEsc(appLink(`sermon-${s.id}`))}" type="text/html"/>` : ""}
  </item>`; }).join("\n")}
</channel>
</rss>
`;
}
function podcastChecks(c = S.church()) {
  const p = podcastOf(c), all = S.list("sermons", c.id), eps = all.filter((s) => sermonAudio(s));
  return [
    [eps.length > 0, eps.length ? `${plural(eps.length, "episode")} with audio` : "No sermons have an audio file yet"],
    [isUrl(p.artwork), isUrl(p.artwork) ? "Cover art is online" : "Cover art needs to be a web link (3000 × 3000 pixels is best). Upload it once Supabase is connected, or paste a link"],
    [!!p.email, p.email ? `Owner email: ${p.email}` : "Add an owner email. Apple Podcasts uses it to confirm the show is yours"],
    [!!feedUrl(c), feedUrl(c) ? "The feed has a public address" : "The feed gets a public address once Supabase is connected. Until then, download it to check it"],
    [eps.every((s) => s.audioBytes), eps.every((s) => s.audioBytes) ? "Every episode has its file size" : `${plural(eps.filter((s) => !s.audioBytes).length, "episode")} without a file size. Most apps still play them`],
  ];
}
Screens.podcast = () => {
  if (!canMedia()) return { redirect: "admin" };
  const c = S.church(), p = podcastOf(c), url = feedUrl(c);
  return {
    title: "Podcast", back: "admin-sermons",
    body: html`<form data-form="podcast-save" class="panel" style="margin-top:16px" novalidate>
        <label class="field" style="margin-top:0"><span>Show name</span><input type="text" name="title" value="${p.title}" required maxlength="100"></label>
        <label class="field"><span>Description</span><textarea name="description" maxlength="1000" style="min-height:70px">${p.description}</textarea></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Author</span><input type="text" name="author" value="${p.author}" maxlength="80"></label>
          <label class="field"><span>Owner email</span><input type="email" name="email" value="${p.email}" maxlength="80"></label></div>
        <label class="field"><span>Cover art link</span><input type="url" name="artwork" value="${isUrl(p.artwork) ? p.artwork : ""}" placeholder="https://.../cover.jpg"><small>Square, 1400 to 3000 pixels, JPG or PNG.</small></label>
        <button class="btn">Save</button></form>
      <section class="sec"><h2 class="sec-head">Ready for podcast apps?</h2><div class="rows">${podcastChecks(c).map(([ok, t]) => html`<div class="row"><span class="lead-ic" style="${ok ? "background:var(--ok-soft);color:var(--ok)" : "background:var(--warn-soft);color:var(--warn)"}">${icon(ok ? "check" : "info")}</span><span class="body"><span class="s" style="color:var(--ink)">${t}</span></span></div>`)}</div></section>
      <div class="btns">${url ? html`<button class="btn" data-act="copy" data-text="${url}" data-done="Feed address copied">${icon("link")}Copy feed address</button>` : ""}<button class="btn ghost" data-act="podcast-download">${icon("download")}Download feed.xml</button></div>
      <p class="faint">Submit the feed address once in Apple Podcasts Connect and Spotify for Podcasters. New sermons with audio show up on their own.</p>`,
  };
};
Forms["podcast-save"] = (d, f) => {
  if (!d.title) return formError(f, "Name the show.");
  if (d.artwork && !isUrl(d.artwork)) return formError(f, "The cover art link should start with https://");
  S.church().podcast = { title: d.title, description: d.description, author: d.author, email: d.email, artwork: d.artwork }; S.save(); toast("Saved"); render();
};
Actions["podcast-download"] = () => saveFile("feed.xml", podcastXml());
