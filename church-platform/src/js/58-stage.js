// ---------- Worship team screens: stage display, Musician Control (Follow / Independent / Band Leader), BPM & Transposer ----------
// The stage display is a confidence monitor for the band and the preacher: the words/ChordPro chords now, what's next,
// the clock, time left in this part of the service, visual BPM metronome, instant 1-click key/capo transposition,
// and configurable transition control:
//   - "follow": Follows the booth (or designated Band Leader display).
//   - "independent": The booth still displays audience lyrics and scrolls slides, while the musician transitions
//     between song sections, slides, or chart pages manually on their own display.
//   - "leader": A designated musician/band leader controls song transitions for the band on stage!

function cdText(secs) {
  const s = Math.max(0, Math.round(secs));
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return mmss(s);
}
const segLeftText = (left) => (left >= 0 ? `${cdText(left)} left` : `${cdText(-left)} over`);
function timedSlide(s, segAt) {
  if (s?.kind !== "countdown") return s;
  return { ...s, end: s.to === "length" ? (segAt || Date.now()) + (s.minutes || 5) * 60e3 : s.startAt };
}
/** The words on a slide as plain text (audience/overlay strips inline ChordPro tokens). */
function slideWords(s, stripChords = true) {
  if (!s) return "";
  const rawText = (() => {
    switch (s.kind) {
      case "lyrics": return s.body || (s.instrumental ? `${s.label} (instrumental)` : "");
      case "scripture": return s.verses.map((v) => v.replace(/^\d+\s/, "")).join(" ");
      case "keynote": case "point": case "question": return s.body || "";
      case "title": return [s.title, s.body].filter(Boolean).join("\n");
      case "text": return [s.title, s.body].filter(Boolean).join("\n");
      case "qr": return `QR code: ${s.title}`;
      case "media": return s.body || "Picture or video";
      case "countdown": return s.body || "Countdown";
      case "logo": return "Logo";
      default: return "";
    }
  })();
  return stripChords && typeof stripInlineChords === "function" ? stripInlineChords(rawText) : rawText;
}

/** Resolves the active slide and next slide for a stage display, honoring Independent or Band Leader mode! */
function resolveStageSlides(data, st, view, full) {
  const slides = data?.slides || [];
  if (!slides.length) return { cur: null, next: null, activeIndex: 0 };
  // If this display is in Independent or Band Leader mode and has chosen a slide index, use its own position!
  if (full && (view.syncMode === "independent" || view.syncMode === "leader") && stageLocal.slideIndex != null) {
    const idx = clamp(stageLocal.slideIndex, 0, slides.length - 1);
    return { cur: slides[idx], next: slides[idx + 1] || null, activeIndex: idx };
  }
  const at = liveAt(slides, st);
  const idx = clamp(st?.index || 0, 0, slides.length - 1);
  return { cur: at.cur, next: at.next, activeIndex: idx };
}

/** Broadcasts a song section or slide transition from a Band Leader stage display to other stage displays (and optional booth sync). */
function broadcastStageLeaderMove(tail, slideIndex, songId, sectionLabel) {
  const msg = {
    type: "stage-leader",
    key: tail,
    church: S.state.current,
    leaderIndex: slideIndex,
    songId: songId || "",
    sectionLabel: sectionLabel || "",
    at: Date.now(),
  };
  try { presChannel?.postMessage(msg); } catch {}
  if (typeof Backend !== "undefined" && Backend.on) Backend.broadcast(msg);
}

/** Renders the Musician Controls Bar (Transposer, Capo, BPM Metronome, Auto-Scroll, and Section Jumper). */
function stageMusicianBar(data, cur, song, view, tail) {
  const slides = data?.slides || [];
  const origKey = song?.key || "D";
  const targetKey = view.targetKey || origKey;
  const semi = semitonesBetween(origKey, targetKey, view.capo);
  const playedKey = transposeNote(origKey, semi, FLAT_KEYS.has(targetKey));
  const bpm = stageLocal.bpmOverride || song?.bpm || 76;
  const timeSig = song?.timeSig || "4/4";
  currentStageBpm = bpm;
  currentStageTimeSig = timeSig;

  // Song sections for the current song (or all songs in the service so musicians in Independent mode can jump between songs too!)
  const parts = song ? songParts(song) : [];
  const serviceSongs = [...new Map(slides.filter((s) => s.songId).map((s) => [s.songId, S.get("songs", s.songId)])).values()].filter(Boolean);

  return html`<div class="sm-musician-bar">
    <div class="sm-ctl-row">
      <label class="sm-ctl-group" title="Who controls transitions on this screen">
        <span class="sm-ctl-lbl">Control</span>
        <select data-change="sm-sync-mode" aria-label="Stage transition control mode">
          <option value="follow" ${attr(view.syncMode === "follow", "selected")}>Follow Booth / Leader</option>
          <option value="independent" ${attr(view.syncMode === "independent", "selected")}>Independent (Manual)</option>
          <option value="leader" ${attr(view.syncMode === "leader", "selected")}>Band Leader (Master)</option>
        </select>
      </label>

      ${song ? html`<div class="sm-ctl-group" role="group" aria-label="ChordPro and Chart Key Transposer">
        <span class="sm-ctl-lbl">Key</span>
        <button type="button" class="sm-mini-btn" data-act="sm-key-step" data-orig="${origKey}" data-step="-1" title="Transpose down ½ step">♭</button>
        <select data-change="sm-key-pick" aria-label="Target Key">
          ${KEY_CHOICES.map((k) => html`<option value="${k}" ${attr(targetKey === k, "selected")}>${k}${k === origKey ? " (Orig)" : ""}</option>`)}
        </select>
        <button type="button" class="sm-mini-btn" data-act="sm-key-step" data-orig="${origKey}" data-step="1" title="Transpose up ½ step">♯</button>
        <select data-change="sm-capo-pick" aria-label="Capo Fret" title="Guitar Capo Fret">
          ${[0, 1, 2, 3, 4, 5, 6, 7].map((c) => html`<option value="${c}" ${attr(view.capo === c, "selected")}>${c === 0 ? "No Capo" : `Capo ${c} (Play ${playedKey})`}</option>`)}
        </select>
      </div>` : ""}

      <div class="sm-ctl-group" role="group" aria-label="Band Metronome BPM">
        <button type="button" class="sm-bpm-pill ${view.metronome ? "on" : ""}" data-act="sm-bpm-toggle" title="Toggle visual BPM flash">
          <span class="sm-bpm-dot" data-bpm-dot></span>
          <b>${bpm} BPM</b>
          <span class="sm-bpm-sig">${timeSig} · Beat <span data-bpm-beat>1</span></span>
        </button>
        <button type="button" class="sm-mini-btn" data-act="sm-bpm-step" data-d="-2" title="Slower">−</button>
        <button type="button" class="sm-mini-btn" data-act="sm-bpm-step" data-d="2" title="Faster">+</button>
        <button type="button" class="sm-mini-btn" data-act="sm-bpm-tap" title="Tap tempo">Tap</button>
      </div>

      <button type="button" class="sm-mini-btn ${view.autoScroll ? "on" : ""}" data-act="sm-autoscroll" title="Foot-pedal / hands-free auto-scroll">
        Scroll ${view.autoScroll ? `${view.autoScroll}x` : "Off"}
      </button>
    </div>

    ${parts.length || view.syncMode !== "follow" ? html`<div class="sm-sec-nav" role="group" aria-label="Song section navigation">
      <button type="button" class="sm-nav-btn" data-act="sm-slide-step" data-tail="${tail}" data-d="-1" title="Previous slide / section (Left Pedal)">◀ Prev</button>
      ${serviceSongs.length > 1 && view.syncMode !== "follow" ? html`<select class="sm-song-jump" data-change="sm-song-jump" data-tail="${tail}" aria-label="Jump to song">
        ${serviceSongs.map((sg) => html`<option value="${sg.id}" ${attr(sg.id === song?.id, "selected")}>🎵 ${sg.title}</option>`)}
      </select>` : ""}
      <div class="sm-part-chips">
        ${parts.map((p) => {
          const on = sameLabel(p.label, cur?.label);
          return html`<button type="button" class="sm-part-chip pt-${p.type} ${on ? "on" : ""}" data-act="sm-jump-section" data-tail="${tail}" data-song="${song.id}" data-label="${p.label}">${p.label}</button>`;
        })}
      </div>
      <button type="button" class="sm-nav-btn" data-act="sm-slide-step" data-tail="${tail}" data-d="1" title="Next slide / section (Right Pedal)">Next ▶</button>
    </div>` : ""}
  </div>`;
}

Actions["sm-slide-step"] = (el) => {
  const tail = el.dataset.tail, data = routeData(tail), slides = data?.slides || [];
  if (!slides.length) return;
  const v = stageView();
  if (v.syncMode === "follow") setStageView({ syncMode: "independent" });
  const curIdx = stageLocal.slideIndex ?? stageLastOperatorState.index ?? 0;
  const nextIdx = clamp(curIdx + (+el.dataset.d), 0, slides.length - 1);
  stageLocal.slideIndex = nextIdx;
  const targetSlide = slides[nextIdx];
  if (v.syncMode === "leader") {
    broadcastStageLeaderMove(tail, nextIdx, targetSlide?.songId, targetSlide?.label);
  }
  stageRedraw?.();
};

Actions["sm-jump-section"] = (el) => {
  const tail = el.dataset.tail, songId = el.dataset.song, label = el.dataset.label;
  const data = routeData(tail), slides = data?.slides || [];
  const v = stageView();
  if (v.syncMode === "follow") setStageView({ syncMode: "independent" });
  const hitIdx = slides.findIndex((s) => s.songId === songId && sameLabel(s.label, label));
  if (hitIdx >= 0) {
    stageLocal.slideIndex = hitIdx;
    stagePg.manual = false;
    if (v.syncMode === "leader") {
      broadcastStageLeaderMove(tail, hitIdx, songId, label);
    }
  } else {
    // Even if this section wasn't in the booth's slide subset, turn the musician's chart to that section!
    stagePg.label = "";
    const song = S.get("songs", songId), chart = chartFor(song, v.part);
    if (chart) chartPageFor(chart, label, "follow");
    if (v.syncMode === "leader") broadcastStageLeaderMove(tail, stageLocal.slideIndex ?? 0, songId, label);
  }
  stageRedraw?.();
};

Inputs["sm-song-jump"] = (el) => {
  const tail = el.dataset.tail, songId = el.value;
  const data = routeData(tail), slides = data?.slides || [];
  const hitIdx = slides.findIndex((s) => s.songId === songId);
  if (hitIdx >= 0) {
    stageLocal.slideIndex = hitIdx;
    stagePg.manual = false;
    if (stageView().syncMode === "leader") {
      broadcastStageLeaderMove(tail, hitIdx, songId, slides[hitIdx]?.label || "");
    }
    stageRedraw?.();
  }
};

// ----- Stage display -----
let stageLastOperatorState = { index: 0, segAt: Date.now(), startedAt: Date.now() };

/** st = { index, black, logo, segAt, startedAt, msg } from the operator. */
function stageMonitor(data, st, full, tail = "") {
  stageLastOperatorState = st;
  const view = full ? stageView() : { lyrics: true, part: "", syncMode: "follow", targetKey: "", capo: 0, metronome: false, autoScroll: 0 };
  const resolved = resolveStageSlides(data, st, view, full);
  const cur = timedSlide(resolved.cur, st.segAt), next = resolved.next;
  const now = Date.now();
  const timer = cur?.minutes != null
    ? html`<span class="sm-timer ${cur.minutes * 60 - (now - st.segAt) / 1000 < 0 ? "over" : ""}" data-seg-start="${st.segAt}" data-mins="${cur.minutes}" title="Time left in ${cur.section}">${segLeftText(cur.minutes * 60 - (now - (st.segAt || now)) / 1000)}</span>`
    : html`<span class="sm-timer" data-since="${st.startedAt || now}" title="Time since the presentation started">${cdText((now - (st.startedAt || now)) / 1000)}</span>`;
  const audience = st.black ? "Screen is black" : st.logo ? "Logo on screen" : "";
  const song = (cur?.songId && S.get("songs", cur.songId)) || ( data?.slides?.find((s) => s.songId) && S.get("songs", data.slides.find((s) => s.songId).songId) );
  const chart = chartFor(song, view.part);

  const origKey = song?.key || "D";
  const targetKey = view.targetKey || origKey;
  const semi = semitonesBetween(origKey, targetKey, view.capo);
  const preferFlats = FLAT_KEYS.has(transposeNote(origKey, semi, true));

  const nowBody = !cur ? html`<span class="faint">No slides</span>`
    : cur.kind === "countdown" ? html`<span class="sm-count" data-cd-end="${cur.end}">${cdText((cur.end - now) / 1000)}</span>`
    : cur.kind === "scripture" ? html`${slideWords(cur)}<span class="sm-ref">${cur.ref}</span>`
    : cur.kind === "lyrics" && full && /\[[A-G][#b]?/.test(cur.body || "") ? renderChordProLyrics(cur.body, semi, preferFlats)
    : slideWords(cur, !full);

  const nextLine = html`<div class="sm-next"><span class="sm-label">Next${next && next.section !== cur?.section ? `: ${next.section}` : ""}</span>${next ? slideWords(next).split("\n").slice(0, 2).join("\n") : "End of the service"}</div>`;
  const nextName = html`<div class="sm-next short"><span class="sm-label">Next</span>${next ? [next.section !== cur?.section ? next.section : "", next.label].filter(Boolean).join(", ") || "Next slide" : "End of the service"}</div>`;
  const words = view.lyrics || !chart;

  return html`<div class="stage-mon ${full ? "full" : ""} ${chart ? "with-music" : ""} ${chart && view.lyrics ? "and-words" : ""}" aria-label="Stage display">
    <div class="sm-top">
      <span class="sm-clock" data-clock>${fmtClock(now)}</span>
      ${full ? html`${stageViewBtn()}${orientationSelect()}` : ""}
      <span class="sm-sec">${cur?.section || data?.title || ""}${cur?.label ? `, ${cur.label}` : ""}${full && view.syncMode !== "follow" ? html` <span class="tag ${view.syncMode === "leader" ? "ok" : "brand"}" style="font-size:.7rem;vertical-align:middle">${view.syncMode === "leader" ? "Band Leader" : "Independent"}</span>` : ""}</span>
      ${timer}
    </div>
    ${full ? stageMusicianBar(data, cur, song, view, tail) : ""}
    ${st.msg ? html`<div class="sm-msg" role="status">${st.msg}</div>` : ""}
    ${audience ? html`<div class="sm-aud">${audience}</div>` : ""}
    ${chart ? stageMusicHtml(chart, song, cur?.label || "", view) : view.part && song ? html`<p class="sm-nochart">No ${view.part.toLowerCase()} music for ${song.title}</p>` : ""}
    ${words ? html`<div class="sm-now ${cur?.kind === "lyrics" || cur?.kind === "scripture" ? "words" : ""}">${nowBody}</div>${nextLine}` : nextName}
    ${cur?.notes ? html`<div class="sm-notes">${cur.notes}</div>` : ""}
  </div>`;
}
const routeData = (tail) => { const [kind, ...rest] = tail.split("-"); return slidesFor(kind, rest.join("-")); };

/** #stage-service-ID: a full-screen stage display for a second screen, following the operator or controlled by the musician/band leader. */
Screens.stage = (tail) => {
  if (tail === "follow") return startFollow("stage");
  let st = { index: 0, segAt: Date.now(), startedAt: Date.now() };
  const draw = () => {
    applyBrand();
    $("#app").innerHTML = flat(stageMonitor(routeData(tail), st, true, tail));
    syncMetronomeTimer();
    syncAutoScrollTimer();
  };
  stageRedraw = draw;
  document.body.classList.add("presenting");
  draw();
  const handleIncoming = (msg) => {
    if (!msg || location.hash !== `#stage-${tail}`) return;
    // 1. Message from a Band Leader stage display
    if (msg.type === "stage-leader" && msg.key === tail) {
      const v = stageView();
      if (v.syncMode === "follow") {
        stageLocal.slideIndex = null;
        st = { ...st, index: msg.leaderIndex };
        draw();
      }
      return;
    }
    // 2. Message from the Booth operator
    if (msg.key === tail) {
      S.load();
      if (msg.church) S.state.current = msg.church;
      const v = stageView();
      if (v.syncMode === "independent" || v.syncMode === "leader") {
        // Keep booth messages (st.msg), timers, and black/logo status, but do NOT overwrite the musician's slide position!
        st = { ...st, msg: msg.msg, black: msg.black, logo: msg.logo, segAt: msg.segAt, startedAt: msg.startedAt };
        if (stageLocal.slideIndex == null) stageLocal.slideIndex = msg.index || 0;
      } else {
        stageLocal.slideIndex = null;
        st = msg;
      }
      draw();
    }
  };
  if (Backend.on) Backend.onBroadcast((m) => handleIncoming(m));
  if (presChannel) presChannel.onmessage = (e) => handleIncoming(e.data);
};

// Foot-pedal & keyboard navigation on Stage Display:
// In Independent or Band Leader mode, Left/Right/Space/PageUp/PageDown transitions sections/slides (or chart pages if multi-page chart).
document.addEventListener("keydown", (ev) => {
  if (!location.hash.startsWith("#stage-") || ev.target.closest?.("input, textarea, select, #scrim")) return;
  const d = ["ArrowRight", "PageDown", " ", "ArrowDown", "Enter"].includes(ev.key) ? 1 : ["ArrowLeft", "PageUp", "ArrowUp"].includes(ev.key) ? -1 : 0;
  if (!d) return;
  ev.preventDefault();
  const v = stageView();
  const tail = location.hash.slice(7);
  if ($(".stage-mon.full .sm-music") && v.syncMode === "follow") {
    Actions["sm-page"]({ dataset: { d } });
  } else {
    Actions["sm-slide-step"]({ dataset: { tail, d } });
  }
});

// ----- Livestream overlay -----
const OVERLAY_KINDS = ["lyrics", "scripture", "keynote", "point", "question"];
function overlayHtml(s, st = {}) {
  const words = s && !st.black && !st.logo && !s.instrumental && OVERLAY_KINDS.includes(s.kind) ? slideWords(s, true) : "";
  return html`<div class="ov">${words ? html`<div class="ov-lt ${s.kind}"><div class="ov-text">${words}</div>${s.kind === "scripture" ? html`<div class="ov-ref">${s.ref}</div>` : ""}</div>` : ""}
    <div class="ov-cc" data-captions ${attr(!st.captions, "hidden")}>${st.captions || ""}</div></div>`;
}
Screens.overlay = (tail) => {
  if (tail === "follow") return startFollow("overlay");
  let st = { index: 0 };
  const draw = () => {
    const data = routeData(tail);
    $("#app").innerHTML = flat(html`<div class="ov-frame">${overlayHtml(data && liveAt(data.slides, st).cur, st)}</div>`);
  };
  document.documentElement.classList.add("overlay-page");
  draw();
  if (Backend.on) Backend.onBroadcast((m) => presChannel?.onmessage?.({ data: m }));
  if (presChannel) presChannel.onmessage = (e) => {
    if (e.data?.key !== tail || location.hash !== `#overlay-${tail}`) return;
    S.load(); if (e.data.church) S.state.current = e.data.church;
    const words = e.data.index !== st.index || e.data.black !== st.black || e.data.logo !== st.logo || JSON.stringify(e.data.live) !== JSON.stringify(st.live);
    st = e.data;
    if (words) draw(); else { const cc = $("[data-captions]"); if (cc) { cc.textContent = st.captions || ""; cc.hidden = !st.captions; } }
  };
};
Actions["pres-overlay"] = (el) => {
  const key = el.dataset.key, data = routeData(key), cur = data?.slides[pres.index];
  const url = appLink(`overlay-${key}`);
  openSheet("Livestream overlay", html`<p class="muted" style="margin-top:0">Lyrics, scripture and live captions as a lower third over your video. The background is see-through.</p>
    <div class="ov-frame preview">${overlayHtml(cur?.kind && OVERLAY_KINDS.includes(cur.kind) ? cur : data?.slides.find((s) => s.kind === "lyrics" || s.kind === "scripture"), { captions: pres.cc ? pres.captions : "" })}</div>
    <ol class="steps-list"><li>In OBS, vMix or Streamlabs, add a <b>Browser</b> source.</li><li>Paste the address below and set the size to 1920 by 1080.</li><li>Run the slides from this screen on the same computer. The overlay follows along.</li></ol>
    <div class="copy-line"><input type="text" readonly value="${url}" aria-label="Overlay address"><button class="btn sm" data-act="copy" data-text="${url}">${icon("copy")}Copy</button></div>
    ${IN_PREVIEW ? demoNote("The overlay works once the app is on your own website. To follow along from another computer, connect Supabase (see the setup guide).") : html`<div class="btns"><button class="btn ghost" data-act="pres-open" data-route="overlay-${key}" data-name="our-faithful-overlay">${icon("screen")}Open overlay window</button></div>`}`, { wide: true });
};
Actions["pres-open"] = (el) => {
  const w = window.open(`${location.pathname}#${el.dataset.route}`, el.dataset.name, "popup,width=1280,height=720");
  if (!w) toast("Allow pop-ups to open the window"); else setTimeout(presBroadcast, 800);
};

// ----- Messages to the stage -----
Forms["stage-msg"] = (d) => { pres.msg = d.msg.slice(0, 80); presBroadcast(); render(); toast(pres.msg ? "Sent to the stage" : "Message cleared"); };
Actions["stage-msg-clear"] = () => { pres.msg = ""; presBroadcast(); render(); };

// ----- Live captions from the microphone (Chrome, Edge and Safari) -----
let recog = null;
Actions["pres-captions"] = () => {
  if (recog) { pres.cc = false; const r = recog; recog = null; try { r.stop(); } catch {} pres.captions = ""; presBroadcast(); render(); toast("Captions off"); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast("Live captions need Chrome, Edge or Safari"); return; }
  const r = new SR();
  r.continuous = true; r.interimResults = true; r.lang = lang() === "es" ? "es-US" : (navigator.language || "en-US");
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) pres.transcript.push(t.trim()); else interim += t; }
    pres.captions = `${pres.transcript.slice(-2).join(" ")} ${interim}`.trim().slice(-160);
    $$("[data-captions]").forEach((x) => { x.textContent = pres.captions; x.hidden = !pres.captions; });
    presBroadcast();
  };
  const stop = (msg) => { if (recog !== r) return; pres.cc = false; recog = null; pres.captions = ""; try { r.stop(); } catch {} presBroadcast(); render(); toast(msg); };
  r.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    stop({ "not-allowed": "Allow the microphone to turn on captions", "service-not-allowed": "Allow the microphone to turn on captions", "audio-capture": "No microphone found", network: "Captions need an internet connection" }[e.error] || "Captions stopped");
  };
  let quick = 0;
  r.onend = () => {
    if (!pres.cc || recog !== r) return;
    quick = Date.now() - r.startedAt < 2000 ? quick + 1 : 0;
    if (quick > 3) return stop("Captions stopped");
    try { r.startedAt = Date.now(); r.start(); } catch { stop("Captions stopped"); }
  };
  try { r.startedAt = Date.now(); r.start(); recog = r; pres.cc = true; render(); toast("Captions on. Speak near the microphone."); } catch { toast("Captions couldn't start"); }
};

// ----- One clock for every timer on screen -----
function tickTimers() {
  const now = Date.now();
  $$("[data-clock]").forEach((el) => { el.textContent = fmtClock(now); });
  $$("[data-cd-end]").forEach((el) => { el.textContent = cdText((+el.dataset.cdEnd - now) / 1000); });
  $$("[data-seg-start]").forEach((el) => { const left = +el.dataset.mins * 60 - (now - +el.dataset.segStart) / 1000; el.textContent = segLeftText(left); el.classList.toggle("over", left < 0); });
  $$("[data-since]").forEach((el) => { el.textContent = cdText((now - +el.dataset.since) / 1000); });
}
setInterval(tickTimers, 1000);

function orientationSelect() {
  const mode = typeof screen === "undefined" ? "" : screen.orientation?.type?.split("-")[0];
  return html`<select class="pres-orientation" data-change="pres-orientation" aria-label="Screen orientation">
    <option value="">Orientation${mode ? ` (${mode})` : ""}</option>
    <option value="auto">Follow device</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
  </select>`;
}
Inputs["pres-orientation"] = async (el) => {
  const orientation = screen.orientation;
  const mode = el.value;
  if (!mode) return;
  if (mode === "auto") {
    orientation?.unlock?.();
  } else {
    try {
      if (!orientation?.lock) throw new Error();
      try { await orientation.lock(mode); }
      catch {
        if (document.fullscreenElement || !document.documentElement.requestFullscreen) throw new Error();
        await document.documentElement.requestFullscreen();
        try { await orientation.lock(mode); }
        catch { await document.exitFullscreen(); throw new Error(); }
      }
    } catch { toast("This device requires you to rotate the screen manually."); }
  }
  el.selectedIndex = 0;
};
addEventListener("hashchange", () => {
  if (!/^#(?:present|stage)-/.test(location.hash)) screen.orientation?.unlock?.();
});
