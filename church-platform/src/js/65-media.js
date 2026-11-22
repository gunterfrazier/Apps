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
const AUDIO_RATES = [0.75, 1, 1.25, 1.5, 2];
const SLEEP_CHOICES = [[15, "15 minutes"], [30, "30 minutes"], [45, "45 minutes"], [60, "1 hour"], ["end", "End of this sermon"]];

// Where each listener stopped, so a sermon picks up there next time. Kept on this device only.
const LISTEN_POS_KEY = "of.listen.positions";
const listenPositions = () => { try { return JSON.parse(localStorage.getItem(LISTEN_POS_KEY)) || {}; } catch { return {}; } };
function savedListenPosition(id, kind) { const t = +listenPositions()[`${id}:${kind}`]; return t > 10 ? t : 0; }
function writeListenPosition(id, kind, time) {
  try {
    const all = listenPositions(), key = `${id}:${kind}`;
    if (time > 10) all[key] = Math.round(time); else delete all[key];
    const keys = Object.keys(all); if (keys.length > 200) delete all[keys[0]];
    localStorage.setItem(LISTEN_POS_KEY, JSON.stringify(all));
  } catch { /* Storage may be full or blocked. */ }
}

// A deep color picked from the artwork tints the full player and the mini player.
const artTints = new Map();
function artworkTint(url) {
  if (!url) return Promise.resolve("");
  if (artTints.has(url)) return artTints.get(url);
  const job = new Promise((resolve) => {
    const img = new Image();
    if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onerror = () => resolve("");
    img.onload = () => {
      try {
        const n = 24, canvas = document.createElement("canvas"); canvas.width = canvas.height = n;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0, n, n);
        const px = ctx.getImageData(0, 0, n, n).data; let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < px.length; i += 4) {
          const max = Math.max(px[i], px[i + 1], px[i + 2]), min = Math.min(px[i], px[i + 1], px[i + 2]);
          const weight = 0.15 + (max ? (max - min) / max : 0) * (max > 24 && max < 245 ? 1 : 0.2);
          r += px[i] * weight; g += px[i + 1] * weight; b += px[i + 2] * weight; w += weight;
        }
        resolve(w ? deepTint(r / w, g / w, b / w) : "");
      } catch { resolve(""); }   // Artwork from another site that doesn't allow reading its pixels.
    };
    img.src = url;
  });
  artTints.set(url, job);
  return job;
}
/** The same hue, dark enough for white text. */
function deepTint(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const l = (max + min) / 2, sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return `hsl(${Math.round((h * 60 + 360) % 360)} ${Math.round(Math.min(sat, 0.62) * 100)}% ${Math.round(clamp(l, 0.26, 0.34) * 100)}%)`;
}
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
        <button type="button" class="np-icon" data-act="player-minimize" aria-label="Minimize">${icon("down")}</button>
        <div class="np-from"><span class="np-from-k">Playing from</span><span class="np-from-t"></span></div>
        <button type="button" class="np-icon" data-act="audio-close" aria-label="Close player">${icon("x")}</button>
      </header>
      <div class="np-art"></div>
      <div class="np-visual"><video preload="metadata" playsinline></video><div class="np-frame"></div>
        <button type="button" class="np-pill np-fullscreen" data-act="player-fullscreen">${icon("expand")}Full-screen video</button></div>
      <div class="np-info"><div class="np-titles"><h2 id="np-title"></h2><p class="np-byline"></p></div><span class="np-save"></span></div>
      <div class="np-controls">${playbackControls()}</div>
      <p class="np-status" role="status"></p>
      <div class="np-sleep-menu" role="group" aria-label="Sleep timer" hidden></div>
      <div class="np-row"><div class="np-sources"></div><button type="button" class="np-icon np-cast" data-act="audio-cast" aria-label="Cast recording">${icon("cast")}</button></div>
      <section class="np-card np-tx" hidden><h3>Transcript</h3><div class="np-tx-body"></div></section>
      <section class="np-card np-next" hidden><h3>Up next</h3><div class="np-next-body"></div></section>
      <div class="np-links">
        <a class="np-provider-link np-pill" target="_blank" rel="noopener" hidden>Open video on provider site</a>
        <a class="np-notes np-pill" data-act="player-notes">${icon("note")}Sermon notes</a>
      </div>
    </div>`);
    document.body.append(dialog);
    this.dialogue = dialog;
    this.video = $("video", dialog);
    this.audio = new Audio();
    this.audio.preload = "metadata";
    for (const media of [this.audio, this.video]) {
      const refresh = () => { if (media === this.media()) this.syncUI(); };
      media.addEventListener("timeupdate", () => { if (media === this.media()) { this.running = !media.paused; this.tick(); } });
      media.addEventListener("durationchange", () => { if (media === this.media()) this.tick(); });
      media.addEventListener("loadedmetadata", () => {
        if (media !== this.media()) return;
        if (this.pendingSeek !== null) this.seek(this.pendingSeek);
        this.tick();
      });
      for (const type of ["play", "pause", "ended", "playing"]) media.addEventListener(type, refresh);
      media.addEventListener("ended", () => {
        if (media !== this.media()) return;
        const s = this.sermon(); if (s) writeListenPosition(s.id, this.source.kind, 0);
        if (this.sleep === "end") { this.setSleep(null); return; }
        if (this.playlist) this.advancePlaylist();
        else if (this.running) this.advanceSeries();
      });
      media.addEventListener("error", () => {
        if (media === this.media() && media.error) {
          this.error = "This recording could not play. Check the link or try another source.";
          this.syncUI();
        }
      });
    }
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); this.minimize(); });
    // Swipe down from the top of the player to shrink it back to the mini bar, like other phone players.
    let drag = null;
    dialog.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || dialog.scrollTop > 0 || e.target.closest("input, video, .np-controls, .np-frame")) { drag = null; return; }
      drag = { y: e.touches[0].clientY, x: e.touches[0].clientX, dy: 0 };
    }, { passive: true });
    dialog.addEventListener("touchmove", (e) => {
      if (!drag) return;
      const dy = e.touches[0].clientY - drag.y, dx = Math.abs(e.touches[0].clientX - drag.x);
      if (dy < 0 || dx > dy) { drag.dy = 0; dialog.style.transform = ""; return; }
      drag.dy = dy; dialog.style.transition = "none"; dialog.style.transform = `translateY(${Math.min(dy, 400)}px)`;
    }, { passive: true });
    dialog.addEventListener("touchend", () => {
      if (!drag) return;
      const far = drag.dy > 110; drag = null;
      dialog.style.transition = "transform .18s ease-out"; dialog.style.transform = "";
      if (far) this.minimize();
    });
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
  /** The playlist still to play or, without one, the later messages in the same series. */
  upNext() {
    const s = this.sermon(); if (!s) return [];
    if (this.playlist) return this.playlist.filter((id) => audioPlaylist().includes(id)).map(listeningTrack).filter(Boolean);
    if (!s.series) return [];
    return S.list("sermons", s.churchId).filter((x) => x.series === s.series && x.id !== s.id && x.date > s.date && listeningTrack(x.id))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  advanceSeries() {
    if (this.scope !== this.scopeKey()) return;
    const next = this.upNext()[0];
    if (next) this.select(next, preferredSermonSource(next, true), { expand: this.dialogue?.open, startAt: 0 });
  },
  playNext(id) {
    const queue = this.upNext(), i = queue.findIndex((x) => x.id === id); if (i < 0) return;
    const next = queue[i], playlist = this.playlist ? queue.slice(i + 1).map((x) => x.id) : null;
    this.select(next, preferredSermonSource(next, true), { expand: this.dialogue?.open, startAt: 0, playlist });
  },
  setSleep(choice) {
    this.sleep = choice === "end" ? "end" : choice ? Date.now() + choice * 60000 : null;
    this.syncUI();
  },
  advancePlaylist() {
    if (!this.playlist?.length || this.scope !== this.scopeKey()) return;
    const remaining = this.playlist;
    this.playlist = null;
    const saved = audioPlaylist();
    const nextIndex = remaining.findIndex((id) => saved.includes(id) && listeningTrack(id));
    if (nextIndex < 0) return;
    const next = listeningTrack(remaining[nextIndex]);
    this.select(next, preferredSermonSource(next, true), {
      playlist: remaining.slice(nextIndex + 1), expand: this.dialogue?.open,
    });
  },
  select(s, source, { expand = false, startAt = null, play = true, playlist = null } = {}) {
    if (!s || !source) return;
    this.init();
    this.playlist = playlist;
    this.notice = "";
    const sameSermon = s.id === this.sermonId && this.scope === this.scopeKey();
    const previous = this.source, previousMedia = this.media();
    const sameMedia = sameSermon && previous?.kind === source.kind && previous.url === source.url;
    const time = startAt ?? (sameSermon ? this.currentTime() : savedListenPosition(s.id, source.kind));
    this.sermonId = s.id;
    this.scope = this.scopeKey();
    this.source = source;
    if (!sameMedia) {
      this.revision++;
      this.pendingSeek = null;
      this.savedAt = null;
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
    if (this.media() && (startAt !== null || (!sameMedia && time > 0))) this.seek(time);
    if (!sameSermon && startAt === null && time > 0) {
      const notice = this.notice = `Picking up where you left off at ${tc(time)}.`;
      setTimeout(() => { if (this.notice === notice) { this.notice = ""; this.syncUI(); } }, 6000);
    }
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
    this.playlist = null;
    this.sleep = null;
    this.notice = "";
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
      seekforward: () => this.skip(30), seekto: (event) => this.seek(event.seekTime),
      nexttrack: this.upNext().length ? () => this.playNext(this.upNext()[0].id) : null,
    })) {
      try { session.setActionHandler(action, active && handler ? handler : null); } catch { /* The device doesn't offer that control. */ }
    }
  },
  tick() {
    const s = this.sermon(); if (!s) return;
    const time = this.currentTime(), duration = this.duration();
    const fill = $("#mini-player .mp-progress i"), sub = $("#mini-player .mp-sub");
    if (fill) fill.style.width = duration ? `${clamp(time / duration * 100, 0, 100)}%` : "0%";
    if (sub) sub.textContent = this.error || `${tr(this.source.label)} · ${tc(time)}${duration ? ` / ${tc(duration)}` : ""}`;
    if (typeof this.sleep === "number" && Date.now() >= this.sleep) { this.sleep = null; this.pause(); toast("Sleep timer ended. Paused."); }
    // Remember the spot every few seconds; forget it near the end so a finished sermon starts over.
    if (this.media() && duration && Math.abs(time - (this.savedAt ?? -99)) >= 5) {
      this.savedAt = time;
      writeListenPosition(s.id, this.source.kind, duration - time > 20 ? time : 0);
    }
    if (!this.dialogue) return;
    const range = $(".sac-range", this.dialogue);
    range.disabled = !duration;
    range.max = duration || 0;
    range.value = time;
    range.style.setProperty("--pct", `${duration ? clamp(time / duration * 100, 0, 100) : 0}%`);
    $("[data-sac-cur]", this.dialogue).textContent = tc(time);
    $("[data-sac-rem]", this.dialogue).textContent = duration ? `-${tc(Math.max(0, duration - time))}` : "–";
    this.syncTranscript(time);
    this.syncSleepLabel();
  },
  syncExpanded() {
    const s = this.sermon(), dialog = this.dialogue;
    if (!s || !dialog) return;
    const source = this.source;
    dialog.dataset.mode = source.kind === "embed" ? "embed" : source.key;
    const provider = source.kind === "embed";
    $("#np-title", dialog).textContent = s.title;
    $(".np-byline", dialog).textContent = [s.speaker, s.passage].filter(Boolean).join(" · ");
    $(".np-from-t", dialog).textContent = this.playlist ? "Your playlist" : s.series || "Sermons";
    $(".np-notes", dialog).href = `#sermon-${s.id}`;
    $("[data-act=player-minimize]", dialog).setAttribute("aria-label", provider ? "Back" : "Minimize");
    this.applyTint(s);
    const providerLink = $(".np-provider-link", dialog);
    providerLink.hidden = !provider;
    if (provider) providerLink.href = source.url;
    const contentKey = JSON.stringify([s.id, sermonSources(s), sermonArtwork(s)]);
    if (contentKey !== this.expandedKey) {
      this.expandedKey = contentKey;
      $(".np-art", dialog).innerHTML = flat(sermonArtTile(s, 220));
      $(".np-sources", dialog).innerHTML = flat(sourceButtons(s));
      this.buildTranscript(s);
    }
    const saved = audioPlaylist().includes(s.id), listenable = !!listeningTrack(s.id);
    const saveKey = `${s.id}:${saved}:${listenable}`;
    if (this.saveKey !== saveKey) {
      this.saveKey = saveKey;
      $(".np-save", dialog).innerHTML = listenable ? flat(html`<button type="button" class="np-icon np-save-btn" data-act="${saved ? "player-unsave" : "playlist-add"}" data-id="${s.id}"
        aria-pressed="${saved}" aria-label="${saved ? `Remove ${s.title} from playlist` : `Add ${s.title} to playlist`}">${icon(saved ? "check" : "plus")}</button>`) : "";
    }
    const queue = this.upNext().slice(0, 5), nextKey = queue.map((x) => x.id).join();
    if (this.nextKey !== nextKey) {
      this.nextKey = nextKey;
      $(".np-next", dialog).hidden = !queue.length;
      $(".np-next-body", dialog).innerHTML = flat(queue.map((x) => html`<button type="button" class="np-next-row" data-act="player-next" data-id="${x.id}" aria-label="Play ${x.title} next">
        ${sermonArtTile(x, 44)}<span class="np-next-meta"><span class="np-next-t">${x.title}</span><span class="np-next-s">${x.speaker} · ${fmtShort(x.date)}</span></span></button>`));
    }
    const rate = $(".np-rate", dialog);
    rate.textContent = `${this.rate}×`;
    rate.setAttribute("aria-label", `Playback speed ${this.rate}×. Change speed`);
    this.syncSleepLabel();
    updateSourceButtons(dialog, source, s.id);
    $(".np-controls", dialog).hidden = !this.media();
    updatePlayButton($(".sac-play", dialog), this.isPlaying());
    $$("[data-act=audio-rate]", dialog).forEach((button) => button.setAttribute("aria-pressed", +button.dataset.r === this.rate));
    $(".np-status", dialog).textContent = this.error || (provider ? "Use the provider’s controls. To keep listening while browsing, choose sermon audio when available." : this.notice || "");
  },
  applyTint(s) {
    const art = sermonArtwork(s);
    if (this.tintFor === art) return;
    this.tintFor = art; this.tint = "";
    const paint = () => {
      for (const el of [this.dialogue, $("#mini-player")]) if (el) {
        if (this.tint) el.style.setProperty("--np-tint", this.tint); else el.style.removeProperty("--np-tint");
      }
      $("#mini-player")?.classList.toggle("tinted", !!this.tint);
    };
    paint();
    artworkTint(art).then((tint) => { if (this.tintFor === art) { this.tint = tint; paint(); } });
  },
  buildTranscript(s) {
    const lines = (s.transcript || []).filter((p) => p.t != null);
    this.txLines = lines; this.txIndex = -1;
    const card = $(".np-tx", this.dialogue);
    card.hidden = !lines.length;
    $(".np-tx-body", this.dialogue).innerHTML = flat(lines.map((p, i) => html`<button type="button" class="np-tx-line" data-act="seek" data-id="${s.id}" data-t="${p.t}" data-i="${i}" aria-label="Play from ${tc(p.t)}"><span>${p.text}</span></button>`));
  },
  syncTranscript(time) {
    const lines = this.txLines; if (!lines?.length || !this.dialogue?.open || this.source?.kind === "embed") return;
    let i = -1; for (let n = 0; n < lines.length && lines[n].t <= time + 0.5; n++) i = n;
    if (i === this.txIndex) return;
    this.txIndex = i;
    const body = $(".np-tx-body", this.dialogue);
    $$(".np-tx-line", body).forEach((el) => { const n = +el.dataset.i; el.classList.toggle("now", n === i); el.classList.toggle("past", n < i); });
    const cur = $(`.np-tx-line[data-i="${i}"]`, body);
    if (cur) body.scrollTo({ top: cur.offsetTop - body.offsetTop - 12, behavior: "smooth" });
  },
  syncSleepLabel() {
    const button = this.dialogue && $(".np-sleep", this.dialogue); if (!button) return;
    const left = typeof this.sleep === "number" ? Math.max(1, Math.ceil((this.sleep - Date.now()) / 60000)) : 0;
    const text = this.sleep === "end" ? "End" : left ? `${left}m` : "";
    $(".np-sleep-left", button).textContent = text;
    button.classList.toggle("on", !!this.sleep);
    button.setAttribute("aria-label", this.sleep ? `Sleep timer on, ${this.sleep === "end" ? "stops at the end of this sermon" : `${left} minutes left`}` : "Sleep timer");
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
              <button type="button" class="mp-btn mp-hide-xs" data-act="audio-skip" data-sec="30" aria-label="Skip forward 30 seconds">${icon("skipFwd")}</button>
              <button type="button" class="mp-btn" data-act="audio-close" aria-label="Close mini-player">${icon("x")}</button>
            </div>
          </div>`);
      }
      updatePlayButton($("[data-act=audio-toggle]", bar), this.isPlaying());
      if (this.tint) bar.style.setProperty("--np-tint", this.tint); else bar.style.removeProperty("--np-tint");
      bar.classList.toggle("tinted", !!this.tint);
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
    <div class="np-transport">
      <button type="button" class="np-side np-rate" data-act="audio-rate-next">1×</button>
      <button type="button" class="np-skip" data-act="audio-skip" data-sec="-15" aria-label="Skip back 15 seconds">${icon("skipBack")}<span>15</span></button>
      <button type="button" class="sac-play" data-act="audio-toggle" aria-label="Play">${icon("play")}</button>
      <button type="button" class="np-skip" data-act="audio-skip" data-sec="30" aria-label="Skip forward 30 seconds">${icon("skipFwd")}<span>30</span></button>
      <button type="button" class="np-side np-sleep" data-act="sleep-menu" aria-label="Sleep timer">${icon("moon")}<span class="np-sleep-left"></span></button>
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
    ${sources.length ? html`${sourceButtons(s)}${preferredSermonSource(s, true) ? playlistButton(s) : ""}` : html`<p class="muted">No recording is available.${canMedia() ? html` <a href="#media-${s.id}">Add a recording</a>` : ""}</p>`}
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
Actions["audio-rate-next"] = () => Player.setRate(AUDIO_RATES[(AUDIO_RATES.indexOf(Player.rate) + 1) % AUDIO_RATES.length]);
Actions["sleep-menu"] = () => {
  const menu = $(".np-sleep-menu", Player.dialogue); if (!menu) return;
  if (!menu.hidden) { menu.hidden = true; return; }
  menu.innerHTML = flat(html`<span class="np-sleep-k">Stop playing after</span>
    ${SLEEP_CHOICES.map(([v, label]) => html`<button type="button" class="np-pill" data-act="sleep-set" data-v="${v}">${label}</button>`)}
    ${Player.sleep ? html`<button type="button" class="np-pill" data-act="sleep-set" data-v="">Turn off the sleep timer</button>` : ""}`);
  menu.hidden = false;
};
Actions["sleep-set"] = (el) => {
  const v = el.dataset.v;
  Player.setSleep(v === "end" ? "end" : +v || null);
  $(".np-sleep-menu", Player.dialogue).hidden = true;
  toast(!v ? "Sleep timer off" : v === "end" ? "Stops at the end of this sermon" : `Stops in ${SLEEP_CHOICES.find(([x]) => String(x) === v)[1]}`);
};
Actions["player-next"] = (el) => Player.playNext(el.dataset.id);
Actions["player-unsave"] = (el) => writeAudioPlaylist(audioPlaylist().filter((id) => id !== el.dataset.id));
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
    body: html`<div class="btns"><a class="btn ghost" href="#listen">Podcasts &amp; audio playlists</a></div><form data-form="podcast-save" class="panel" style="margin-top:16px" novalidate>
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

// ----- Personal listening playlist -----
const audioPlaylist = () => S.state.audioPlaylists?.[S.state.current] || [];
const listeningTrack = (id) => {
  const s = S.get("sermons", id);
  return s?.churchId === S.state.current && S.inScope(s, { ignoreCampus: true }) && preferredSermonSource(s, true) ? s : null;
};
function writeAudioPlaylist(ids) {
  S.state.audioPlaylists ||= {};
  S.state.audioPlaylists[S.state.current] = ids;
  S.save();
  render();
}
function playlistButton(s) {
  const saved = audioPlaylist().includes(s.id);
  return saved
    ? html`<a class="btn ghost sm" href="#listen-playlist">In your playlist</a>`
    : html`<button class="btn ghost sm" data-act="playlist-add" data-id="${s.id}" aria-label="Add ${s.title} to playlist">${icon("plus")}Add to playlist</button>`;
}
Screens.listen = (section) => {
  if (!S.on("sermons")) return { redirect: "home" };
  const saved = section === "playlist", ids = audioPlaylist();
  const all = S.visible("sermons", { ignoreCampus: true }).filter((s) => preferredSermonSource(s, true))
    .sort((a, b) => b.date.localeCompare(a.date));
  const tracks = saved ? ids.map(listeningTrack).filter(Boolean) : all;
  return { title: "Podcasts & audio", back: "word", tab: "word", body: html`
    ${seg([["listen", "All audio", true], ["listen-playlist", "My playlist", true]], saved ? "listen-playlist" : "listen")}
    ${saved && tracks.length ? html`<div class="btns"><button class="btn" data-act="playlist-play">${icon("play")}Play playlist</button></div>` : ""}
    <section class="sec"><div class="rows">${tracks.length ? tracks.map((s) => html`
      <div class="row playlist-track">
        <button class="icon-btn" data-act="${saved ? "playlist-play" : "mini-play"}" data-id="${s.id}" aria-label="Play ${s.title}">${icon("play")}</button>
        <a class="body" href="#sermon-${s.id}"><span class="t">${s.title}</span><span class="s">${s.speaker} · ${fmtDay(fromIsoDay(s.date))}</span></a>
        <div class="btns playlist-track-actions">${saved ? html`
          <button class="btn ghost sm" data-act="playlist-move" data-id="${s.id}" data-step="-1" aria-label="Move ${s.title} earlier" ${attr(s.id === tracks[0].id, "disabled")}>↑</button>
          <button class="btn ghost sm" data-act="playlist-move" data-id="${s.id}" data-step="1" aria-label="Move ${s.title} later" ${attr(s.id === tracks.at(-1).id, "disabled")}>↓</button>
          <button class="btn ghost sm" data-act="playlist-remove" data-id="${s.id}" aria-label="Remove ${s.title} from playlist">Remove</button>
        ` : playlistButton(s)}</div>
      </div>`) : empty(saved ? "Add audio from All audio or a sermon to start your playlist." : "No audio recordings are available.")}</div></section>` };
};
Actions["playlist-add"] = (el) => {
  const id = el.dataset.id, ids = audioPlaylist();
  if (listeningTrack(id) && !ids.includes(id)) writeAudioPlaylist([...ids, id]);
};
Actions["playlist-remove"] = (el) => writeAudioPlaylist(audioPlaylist().filter((id) => id !== el.dataset.id));
Actions["playlist-move"] = (el) => {
  const ids = [...audioPlaylist()], visible = ids.filter(listeningTrack);
  const index = visible.indexOf(el.dataset.id);
  const neighbor = index >= 0 && visible[index + Number(el.dataset.step)];
  if (!neighbor) return;
  const a = ids.indexOf(el.dataset.id), b = ids.indexOf(neighbor);
  [ids[a], ids[b]] = [ids[b], ids[a]];
  writeAudioPlaylist(ids);
};
Actions["playlist-play"] = (el) => {
  const ids = audioPlaylist().filter(listeningTrack);
  const index = el.dataset.id ? ids.indexOf(el.dataset.id) : 0;
  if (index < 0 || !ids.length) return;
  const s = listeningTrack(ids[index]);
  Player.select(s, preferredSermonSource(s, true), { expand: true, startAt: 0, playlist: ids.slice(index + 1) });
};
