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

// ----- Persistent sermon audio and video player -----
const AUDIO_RATES = [1, 1.25, 1.5, 2];
function isSermonVideoFile(url) {
  try { return /\.(mp4|m4v|webm|ogv|mov|m3u8)$/i.test(new URL(url).pathname); }
  catch { return false; }
}

function sermonSources(s) {
  if (!s) return [];
  const audio = sermonAudio(s), video = sermonVideo(s), sources = [];
  const demo = !Backend.on && S.church(s.churchId)?.sample;
  // Sample sermons have placeholder URLs. Play a clearly labeled sample in the demo.
  if (isUrl(audio) && !(demo && /\.example\//i.test(audio))) sources.push({ key: "audio", kind: "audio", label: "Sermon audio", url: audio });
  if (isUrl(video)) {
    const kind = isSermonVideoFile(video) ? "video" : "embed";
    sources.push({ key: "video", kind, label: "Watch video", url: video });
    if (kind === "video") sources.push({ key: "video-audio", kind, label: "Listen to video", url: video });
  }
  if (demo && !sources.length) sources.push({ key: "sample", kind: "audio", label: "Demo audio" });
  return sources;
}

function preferredSermonSource(s, forListening = false) {
  const sources = sermonSources(s);
  return forListening ? sources.find((source) => source.key !== "video") : sources[0];
}

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
  sermonId: null,
  source: null,
  rate: 1,
  error: "",
  pendingSeek: null,
  revision: 0,
  scope: "",
  route: "",
  dialogue: null,
  focusReturn: null,
  init() {
    if (this.dialogue) return;
    const dialog = document.createElement("dialog");
    dialog.id = "now-playing";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "np-title");
    dialog.innerHTML = flat(html`<div class="np-shell">
      <header class="np-head">
        <button type="button" class="btn ghost sm" data-act="player-minimize">Minimize</button>
        <button type="button" class="icon-btn" data-act="audio-close" aria-label="Close player">${icon("x")}</button>
      </header>
      <div class="np-art"></div>
      <div class="np-visual"><video preload="metadata" playsinline></video><div class="np-frame"></div>
        <button type="button" class="btn ghost sm np-fullscreen" data-act="player-fullscreen">${icon("expand")}Full-screen video</button></div>
      <div class="np-info"><h2 id="np-title"></h2><p class="muted np-byline"></p></div>
      <div class="np-sources"></div>
      <p class="np-status" role="status"></p>
      <div class="np-controls">${playbackControls()}</div>
      <a class="np-provider-link btn ghost sm" target="_blank" rel="noopener" hidden>Open video on provider site</a>
      <a class="np-notes btn ghost sm" data-act="player-notes">Sermon notes &amp; transcript</a>
    </div>`);
    document.body.append(dialog);
    this.dialogue = dialog;
    this.video = $("video", dialog);
    this.audio = new Audio();
    this.audio.preload = "metadata";
    for (const media of [this.audio, this.video]) {
      const refresh = () => { if (media === this.media()) this.syncUI(); };
      media.addEventListener("timeupdate", () => { if (media === this.media()) this.tick(); });
      media.addEventListener("durationchange", () => { if (media === this.media()) this.tick(); });
      media.addEventListener("loadedmetadata", () => {
        if (media !== this.media()) return;
        if (this.pendingSeek !== null) this.seek(this.pendingSeek);
        this.tick();
      });
      for (const type of ["play", "pause", "ended", "playing"]) media.addEventListener(type, refresh);
      media.addEventListener("error", () => {
        if (media === this.media() && media.error) {
          this.error = "This recording could not play. Check the link or try another source.";
          this.syncUI();
        }
      });
    }
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.minimize(); });
    document.addEventListener("fullscreenchange", () => { this.video.controls = document.fullscreenElement === this.video; });
  },
  scopeKey() { return JSON.stringify([S.state.current, S.me().id]); },
  sermon() { return this.sermonId ? S.get("sermons", this.sermonId) : null; },
  media() { return this.source?.kind === "video" ? this.video : this.source?.kind === "audio" ? this.audio : null; },
  isPlaying(id = this.sermonId) {
    const media = this.media();
    return !!(id && id === this.sermonId && media && !media.paused && !media.ended && !media.error);
  },
  duration() {
    const duration = this.media()?.duration;
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  },
  currentTime() { return this.pendingSeek ?? this.media()?.currentTime ?? 0; },
  select(s, source, { expand = false, startAt = null, play = true } = {}) {
    if (!s || !source) return;
    this.init();
    const sameSermon = s.id === this.sermonId && this.scope === this.scopeKey();
    const previous = this.source, previousMedia = this.media();
    const sameMedia = sameSermon && previous?.kind === source.kind && previous.url === source.url;
    const time = startAt ?? (sameSermon ? this.currentTime() : 0);
    this.sermonId = s.id;
    this.scope = this.scopeKey();
    this.source = source;
    if (!sameMedia) {
      this.revision++;
      this.pendingSeek = null;
      this.error = "";
      previousMedia?.pause();
      previousMedia?.removeAttribute("src");
      previousMedia?.load();
      $(".np-frame", this.dialogue).replaceChildren();
      if (source.kind === "embed") {
        $(".np-frame", this.dialogue).innerHTML = flat(embedView(source.url, s.title, { video: true }));
      } else {
        const media = this.media();
        media.src = source.url || getDemoAudioUrl();
        media.playbackRate = this.rate;
      }
    }
    if (this.media() && (!sameMedia || startAt !== null) && time > 0) this.seek(time);
    if (expand || source.key === "video") this.expand();
    if (play && this.media() && !this.isPlaying()) this.play();
    this.syncMediaSession();
    this.syncUI();
  },
  play() {
    const media = this.media();
    if (!media) return;
    const revision = ++this.revision;
    this.error = "";
    if (media.error) media.load();
    media.play().catch((error) => {
      if (this.revision !== revision || media !== this.media() || error.name === "AbortError") return;
      this.error = error.name === "NotAllowedError" ? "Tap Play to start this recording." : "This recording could not play. Check the link or try another source.";
      this.syncUI();
    });
    this.syncUI();
  },
  pause() { this.revision++; this.media()?.pause(); this.syncUI(); },
  toggle() { if (this.isPlaying()) this.pause(); else this.play(); },
  seek(sec) {
    const media = this.media();
    if (!media) return;
    const time = Math.max(0, +sec || 0);
    if (!media.readyState) {
      this.pendingSeek = time;
    } else {
      this.pendingSeek = null;
      try { media.currentTime = this.duration() ? Math.min(time, this.duration()) : time; } catch { /* This stream is not seekable. */ }
    }
    this.tick();
  },
  skip(delta) { this.seek(this.currentTime() + delta); },
  setRate(rate) {
    this.rate = AUDIO_RATES.includes(rate) ? rate : 1;
    if (this.media()) this.media().playbackRate = this.rate;
    this.syncUI();
  },
  expand() {
    if (!this.sermon()) return;
    this.init();
    this.route = location.hash;
    this.syncExpanded();
    if (!this.dialogue.open) {
      this.focusReturn = document.activeElement;
      if (this.dialogue.showModal) this.dialogue.showModal();
      else this.dialogue.setAttribute("open", "");
      // Keep incoming app notifications above the modal and available to open.
      const alert = $("#foreground-alert");
      if (alert) this.dialogue.append(alert);
    }
    this.syncUI();
  },
  hideExpanded(restoreFocus = true) {
    if (!this.dialogue?.open) return;
    if (this.dialogue.close) this.dialogue.close();
    else this.dialogue.removeAttribute("open");
    const alert = $("#foreground-alert", this.dialogue);
    if (alert) document.body.append(alert);
    if (restoreFocus) {
      const button = this.focusReturn?.isConnected ? this.focusReturn : $(".mp-open");
      button?.focus({ preventScroll: true });
    }
    this.focusReturn = null;
    queueMicrotask(() => OpeningSummary.show());
  },
  minimize(restoreFocus = true) {
    // Embedded players cannot be left playing invisibly. Direct recordings keep their existing media element.
    if (this.source?.kind === "embed") { this.close(restoreFocus); return; }
    if (this.source?.key === "video") this.source = { ...this.source, key: "video-audio", label: "Listen to video" };
    const button = this.focusReturn;
    this.hideExpanded(false);
    this.syncUI();
    if (restoreFocus) (button?.isConnected ? button : $(".mp-open"))?.focus({ preventScroll: true });
  },
  close(restoreFocus = true) {
    const media = this.media();
    this.revision++;
    this.pendingSeek = null;
    this.sermonId = null;
    this.source = null;
    this.error = "";
    this.hideExpanded(restoreFocus);
    if (media) { media.pause(); media.removeAttribute("src"); media.load(); }
    if (this.dialogue) $(".np-frame", this.dialogue).replaceChildren();
    this.syncMediaSession();
    this.syncUI();
  },
  async cast() {
    const media = this.media();
    if (!media) return;
    try {
      if (media.remote?.prompt) { await media.remote.prompt(); return; }
      if (typeof media.webkitShowPlaybackTargetPicker === "function") { media.webkitShowPlaybackTargetPicker(); return; }
    } catch (e) { if (e?.name === "NotFoundError" || e?.name === "InvalidStateError") toast("No cast or AirPlay speaker found nearby"); return; }
    this.minimize(false);
    openSheet("Cast to a speaker or TV", html`<p style="margin-top:0">Stream <b>${this.sermon()?.title || "this sermon"}</b> to a speaker or TV:</p>
      <ul class="steps-list">
        <li><b>iPhone or iPad:</b> open Control Center and tap the <b>AirPlay</b> icon.</li>
        <li><b>Android or Chrome:</b> open the browser menu and choose <b>Cast</b>.</li>
      </ul>
      <button class="btn block" data-act="close-sheet">Got it</button>`);
  },
  syncMediaSession() {
    const session = navigator.mediaSession, s = this.sermon();
    if (!session || typeof MediaMetadata === "undefined") return;
    const active = s && this.media(), art = active ? sermonArtwork(s) : "";
    try {
      session.metadata = active ? new MediaMetadata({
        title: s.title, artist: s.speaker, album: s.series || "",
        artwork: isUrl(art) || art.startsWith("data:") ? [{ src: art }] : [],
      }) : null;
    } catch { /* A browser may reject a particular artwork URL. */ }
    for (const [action, handler] of Object.entries({
      play: () => this.play(), pause: () => this.pause(), seekbackward: () => this.skip(-15),
      seekforward: () => this.skip(15), seekto: (event) => this.seek(event.seekTime),
    })) {
      try { session.setActionHandler(action, active ? handler : null); } catch { /* The device doesn't offer that control. */ }
    }
  },
  tick() {
    const s = this.sermon(); if (!s) return;
    const time = this.currentTime(), duration = this.duration();
    const fill = $("#mini-player .mp-progress i"), sub = $("#mini-player .mp-sub");
    if (fill) fill.style.width = duration ? `${clamp(time / duration * 100, 0, 100)}%` : "0%";
    if (sub) sub.textContent = this.error || `${tr(this.source.label)} · ${tc(time)}${duration ? ` / ${tc(duration)}` : ""}`;
    if (!this.dialogue) return;
    const range = $(".sac-range", this.dialogue);
    range.disabled = !duration;
    range.max = duration || 0;
    range.value = time;
    $("[data-sac-cur]", this.dialogue).textContent = tc(time);
    $("[data-sac-rem]", this.dialogue).textContent = duration ? tc(duration) : "–";
  },
  syncExpanded() {
    const s = this.sermon(), dialog = this.dialogue;
    if (!s || !dialog) return;
    const source = this.source;
    dialog.dataset.mode = source.kind === "embed" ? "embed" : source.key;
    const provider = source.kind === "embed";
    $("#np-title", dialog).textContent = s.title;
    $(".np-byline", dialog).textContent = [s.speaker, s.series].filter(Boolean).join(" · ");
    $(".np-notes", dialog).href = `#sermon-${s.id}`;
    $("[data-act=player-minimize]", dialog).textContent = provider ? "Back" : "Minimize";
    const providerLink = $(".np-provider-link", dialog);
    providerLink.hidden = !provider;
    if (provider) providerLink.href = source.url;
    const contentKey = JSON.stringify([s.id, sermonSources(s), sermonArtwork(s)]);
    if (contentKey !== this.expandedKey) {
      this.expandedKey = contentKey;
      $(".np-art", dialog).innerHTML = flat(sermonArtTile(s, 220));
      $(".np-sources", dialog).innerHTML = flat(sourceButtons(s));
    }
    updateSourceButtons(dialog, source, s.id);
    $(".np-controls", dialog).hidden = !this.media();
    updatePlayButton($(".sac-play", dialog), this.isPlaying());
    $$("[data-act=audio-rate]", dialog).forEach((button) => button.setAttribute("aria-pressed", +button.dataset.r === this.rate));
    $(".np-status", dialog).textContent = this.error || (provider ? "Use the provider’s controls. To keep listening while browsing, choose sermon audio when available." : "");
  },
  syncUI() {
    const s = this.sermon();
    if (this.sermonId && (!s || this.scope !== this.scopeKey())) { this.close(false); return; }
    if (this.dialogue?.open && this.route !== location.hash) { this.minimize(false); return; }
    this.syncExpanded();
    const show = !!(s && this.media() && !this.dialogue?.open && !document.body.matches(".presenting, .kiosk-mode") &&
      !document.documentElement.classList.contains("overlay-page"));
    document.body.classList.toggle("has-mini-player", show);
    let bar = $("#mini-player");
    if (!bar && show) {
      bar = document.createElement("aside");
      bar.id = "mini-player";
      bar.setAttribute("aria-label", "Now playing mini-player");
      document.body.append(bar);
    }
    if (bar) bar.hidden = !show;
    if (show) {
      const key = JSON.stringify([s.id, s.title, sermonArtwork(s)]);
      if (this.barKey !== key) {
        this.barKey = key;
        bar.innerHTML = flat(html`<div class="mp-progress"><i></i></div>
          <div class="mp-row">
            <button type="button" class="mp-open" data-act="player-expand" aria-label="Open player for ${s.title}">${sermonArtTile(s, 42)}
              <span class="mp-meta"><span class="mp-title">${s.title}</span><span class="mp-sub"></span></span></button>
            <div class="mp-btns">
              <button type="button" class="mp-btn play" data-act="audio-toggle"></button>
              <button type="button" class="mp-btn mp-hide-xs" data-act="audio-skip" data-sec="15" aria-label="Skip forward 15 seconds">${icon("skipFwd")}</button>
              <button type="button" class="mp-btn" data-act="audio-close" aria-label="Close mini-player">${icon("x")}</button>
            </div>
          </div>`);
      }
      updatePlayButton($("[data-act=audio-toggle]", bar), this.isPlaying());
    }
    $$(".sermon-audio-card").forEach((card) => {
      const current = card.dataset.id === s?.id;
      updateSourceButtons(card, current ? this.source : null, card.dataset.id);
      const open = $("[data-act=player-expand]", card);
      if (open) open.hidden = !current;
    });
    $$("[data-act=mini-play]").forEach((button) => updatePlayButton(button, this.isPlaying(button.dataset.id), button.dataset.title));
    this.tick();
  },
};

function updatePlayButton(button, playing, title = "") {
  if (!button) return;
  const label = `${playing ? "Pause" : "Play"}${title ? ` ${title}` : ""}`;
  if (button.getAttribute("aria-label") === label) return;
  button.setAttribute("aria-label", label);
  button.innerHTML = flat(icon(playing ? "pause" : "play"));
}

function sourceButtons(s) {
  return html`<div class="btns" role="group" aria-label="Playback source">
    ${sermonSources(s).map((source) => html`<button type="button" class="btn ghost sm" data-act="audio-source" data-id="${s.id}"
      data-source="${source.key}" aria-pressed="false">${icon(source.key === "video" ? "play" : "music")}${source.label}</button>`)}
  </div>`;
}

function updateSourceButtons(root, source, id) {
  $$("[data-act=audio-source]", root).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.id === id && source?.key === button.dataset.source));
  });
}

function playbackControls() {
  return html`<div class="sac-scrub">
      <input type="range" class="sac-range" min="0" max="0" value="0" step="any" data-input="audio-scrub" aria-label="Seek recording" disabled>
      <div class="sac-times"><span data-sac-cur>0:00</span><span data-sac-rem>–</span></div>
    </div>
    <div class="sac-controls">
      <div class="sac-transport">
        <button type="button" class="sac-skip" data-act="audio-skip" data-sec="-15" aria-label="Skip back 15 seconds">${icon("skipBack")}15s</button>
        <button type="button" class="sac-play" data-act="audio-toggle" aria-label="Play">${icon("play")}</button>
        <button type="button" class="sac-skip" data-act="audio-skip" data-sec="15" aria-label="Skip forward 15 seconds">15s${icon("skipFwd")}</button>
      </div>
      <div class="sac-actions" role="group" aria-label="Playback speed">
        ${AUDIO_RATES.map((rate) => html`<button type="button" class="chip" data-act="audio-rate" data-r="${rate}" aria-pressed="${rate === 1}">${rate}×</button>`)}
        <button type="button" class="icon-btn" data-act="audio-cast" aria-label="Cast recording">${icon("cast")}</button>
      </div>
    </div>`;
}

function sermonMedia(s) {
  const sources = sermonSources(s);
  return html`<div class="sermon-audio-card" data-id="${s.id}">
    <div class="sac-top">
      ${sermonArtTile(s, 68)}
      <div class="sac-info">
        <span class="sac-k">Sermon recording</span>
        <span class="sac-title">${s.title}</span>
        <span class="sac-sub">${s.speaker} · ${s.minutes || 35} min</span>
      </div>
    </div>
    ${sources.length ? sourceButtons(s) : html`<p class="muted">No recording is available.${canMedia() ? html` <a href="#media-${s.id}">Add a recording</a>` : ""}</p>`}
    <button type="button" class="btn ghost sm sac-open" data-act="player-expand" hidden>${icon("expand")}Open player</button>
  </div>`;
}
function transcriptSection(s) {
  if (!s.transcript?.length) return "";
  const canSeek = !!preferredSermonSource(s, true);
  return html`<section class="sec"><details class="transcript"><summary><h2>Transcript</h2><span class="faint">${plural(s.transcript.reduce((n, p) => n + p.text.split(/\s+/).length, 0), "word")}</span></summary>
    <label class="field"><span class="sr">Search the transcript</span><input type="search" placeholder="Search the transcript" data-input="transcript-search"></label>
    <div class="tx-body">${s.transcript.map((p) => {
      let time = "";
      if (p.t != null) time = canSeek ? html`<button type="button" class="tx-t" data-act="seek" data-id="${s.id}" data-t="${p.t}" aria-label="Play from ${tc(p.t)}">${tc(p.t)}</button>`
        : html`<span class="faint">${tc(p.t)} </span>`;
      return html`<p data-text="${p.text}">${time}<span data-transcript-line>${p.text}</span></p>`;
    })}</div>
    <p class="faint tx-none" hidden>No matches.</p></details></section>`;
}
Inputs["transcript-search"] = (el) => {
  const box = el.closest(".transcript"), q = el.value.trim(); let shown = 0;
  $$(".tx-body p", box).forEach((p) => { const t = p.dataset.text, hit = !q || t.toLowerCase().includes(q.toLowerCase()); p.hidden = !hit; if (hit) shown++; $("[data-transcript-line]", p).innerHTML = flat(highlight(t, q)); });
  $(".tx-none", box).hidden = shown > 0;
};
Actions["mini-play"] = (el) => {
  const s = S.get("sermons", el.dataset.id);
  if (Player.sermonId === s?.id && Player.media()) Player.toggle();
  else Player.select(s, preferredSermonSource(s, true) || preferredSermonSource(s));
};
Actions["audio-source"] = (el) => {
  const s = S.get("sermons", el.dataset.id);
  Player.select(s, sermonSources(s).find((source) => source.key === el.dataset.source), { expand: true });
};
Actions["audio-toggle"] = () => Player.toggle();
Actions["audio-skip"] = (el) => Player.skip(+el.dataset.sec || 0);
Inputs["audio-scrub"] = (el) => Player.seek(+el.value || 0);
Actions["seek"] = (el) => {
  const s = S.get("sermons", el.dataset.id || splitRoute().tail);
  const source = Player.sermonId === s?.id && Player.media() ? Player.source : preferredSermonSource(s, true);
  Player.select(s, source, { startAt: +el.dataset.t || 0 });
};
Actions["audio-rate"] = (el) => Player.setRate(+el.dataset.r);
Actions["audio-cast"] = () => Player.cast();
Actions["audio-close"] = () => Player.close();
Actions["player-expand"] = () => Player.expand();
Actions["player-minimize"] = () => Player.minimize();
Actions["player-notes"] = () => {
  const sermon = Player.sermon();
  Player.minimize(false);
  if (sermon) go(`sermon-${sermon.id}`);
};
Actions["player-fullscreen"] = async () => {
  const video = Player.video;
  if (!video) return;
  try {
    if (video.requestFullscreen) await video.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else throw new Error("Fullscreen unavailable");
  } catch {
    $(".np-status", Player.dialogue).textContent = "Full-screen video isn’t available on this device.";
  }
};
window.addEventListener("hashchange", () => {
  if (Player.dialogue?.open && Player.route !== location.hash) Player.minimize(false);
});

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
