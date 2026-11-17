// ---------- Sheet music, ChordPro Live Transposer, BPM Metronome, Auto-Scroll & Musician Stage Control ----------
// Enhances stage displays and song charts with:
//   1. Instant 1-click key transposition (e.g., G to A, or Capo chord view) for both ChordPro lyrics and SVG chord charts.
//   2. Visual BPM metronome flash indicator in the stage header (with tap-tempo and beat-1 accent).
//   3. Foot-pedal and tap auto-scroll for worship musicians on stage.
//   4. Three-mode stage transition control:
//        - "follow": Follows the booth (or designated Band Leader display).
//        - "independent": Musician manually controls their own song sections, slides, and chart pages without affecting the booth's audience lyrics.
//        - "leader": Specific musician/worship leader display controls song section transitions for the band!

const DEFAULT_INSTRUMENTS = ["Vocals", "Keys", "Piano", "Acoustic guitar", "Electric guitar", "Bass", "Drums", "Strings", "Horns"];
const CHART_MAX_PAGES = 24;
const samePart = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const CHROMATIC_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CHROMATIC_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEY_CHOICES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm"]);

function noteIndex(note) {
  const clean = String(note || "").trim();
  const s = CHROMATIC_SHARP.indexOf(clean);
  if (s >= 0) return s;
  return CHROMATIC_FLAT.indexOf(clean);
}

/** Transposes a single note (like "F#" or "Bb") by `semitones`, choosing sharps or flats from target key context. */
function transposeNote(note, semitones, preferFlats = false) {
  const idx = noteIndex(note);
  if (idx < 0) return note;
  const next = ((idx + semitones) % 12 + 12) % 12;
  return (preferFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP)[next];
}

/** Transposes a full chord symbol (e.g., "G/B", "F#m7b5", "Asus4", "D7") by `semitones`. */
function transposeChord(chord, semitones, preferFlats = false) {
  if (!semitones) return chord;
  return String(chord || "").replace(/\b([A-G][#b]?)(m|maj|min|dim|aug|sus|add|[0-9])*(\/[A-G][#b]?)?/g, (full, root, mod, slash) => {
    if (full === "tacet" || full === "N.C.") return full;
    const newRoot = transposeNote(root, semitones, preferFlats);
    const rest = full.slice(root.length, slash ? full.length - slash.length : full.length);
    const newSlash = slash ? "/" + transposeNote(slash.slice(1), semitones, preferFlats) : "";
    return newRoot + rest + newSlash;
  });
}

/** Calculates semitone shift between two keys (e.g., "D" -> "E" = +2), minus any guitar capo fret. */
function semitonesBetween(origKey, targetKey, capo = 0) {
  const o = noteIndex(String(origKey || "D").replace(/m$/, ""));
  const t = targetKey ? noteIndex(String(targetKey).replace(/m$/, "")) : o;
  const baseShift = (o >= 0 && t >= 0) ? (t - o) : 0;
  return ((baseShift - (+capo || 0)) % 12 + 12) % 12;
}

/** Strips inline ChordPro `[G]` tokens from lyrics for audience/congregation projection while keeping plain words. */
function stripInlineChords(text) {
  return String(text || "").replace(/\[([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|[0-9])*(?:\/[A-G][#b]?)?)\]/g, "");
}

/** Renders ChordPro lyrics (lines containing <code>[G]Amazing [D]grace</code>) with transposed chords stacked above syllables. */
function renderChordProLyrics(text, semitones = 0, preferFlats = false) {
  const lines = String(text || "").split("\n");
  return html`<div class="chordpro-block">${lines.map((line) => {
    if (!/\[([A-G][#b]?[^\]]*)\]/.test(line)) {
      return html`<div class="cp-line plain">${line || "\u00A0"}</div>`;
    }
    const tokens = line.split(/(\[[A-G][#b]?[^\]]*\])/g);
    const pairs = [];
    let pendingChord = "";
    tokens.forEach((tok) => {
      const m = tok.match(/^\[([A-G][#b]?[^\]]*)\]$/);
      if (m) {
        if (pendingChord) pairs.push([pendingChord, "\u00A0"]);
        pendingChord = transposeChord(m[1], semitones, preferFlats);
      } else if (tok || pendingChord) {
        pairs.push([pendingChord, tok || "\u00A0"]);
        pendingChord = "";
      }
    });
    if (pendingChord) pairs.push([pendingChord, "\u00A0"]);
    return html`<div class="cp-line">${pairs.map(([ch, word]) => html`<span class="cp-seg"><b class="cp-chord">${ch || "\u00A0"}</b><span class="cp-word">${word}</span></span>`)}</div>`;
  })}</div>`;
}

/** Every instrument the church uses: the usual ones and any a song's sheet music names. */
function instrumentList() {
  const seen = new Map();
  [...DEFAULT_INSTRUMENTS, ...S.list("songs").flatMap((s) => (s.charts || []).map((c) => c.part))].forEach((p) => { const k = String(p || "").trim(); if (k && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k); });
  return [...seen.values()];
}
const chartFor = (song, part) => part ? (song?.charts || []).find((c) => samePart(c.part, part) && c.pages?.length) : null;

// ----- Turning PDFs and pictures into pages -----
let pdfjsLoading = null;
function loadPdfJs() {
  pdfjsLoading ||= import(new URL("vendor/pdfjs/pdf.min.js", location.href).href).then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.js", location.href).href; return m;
  }).catch((e) => { pdfjsLoading = null; throw e; });
  return pdfjsLoading;
}
const canvasJpeg = (cv) => new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.85));
async function pictureToPage(file) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(`${file.name} isn't a picture this browser can open.`)); i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return canvasJpeg(cv);
}
async function pdfToPages(file, progress) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (doc.numPages > CHART_MAX_PAGES) throw new Error(`That PDF has ${doc.numPages} pages. Sheet music can have up to ${CHART_MAX_PAGES}; split it into one PDF per song.`);
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    progress?.(n, doc.numPages);
    const page = await doc.getPage(n), base = page.getViewport({ scale: 1 }), scale = 1800 / Math.max(base.width, base.height), vp = page.getViewport({ scale });
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    out.push(await canvasJpeg(cv));
  }
  return out;
}
async function filesToPages(files, progress) {
  const pages = [];
  for (const f of files) {
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) pages.push(...await pdfToPages(f, progress));
    else if (f.type.startsWith("image/")) { progress?.(pages.length + 1); pages.push(await pictureToPage(f)); }
    else throw new Error(`${f.name} isn't a PDF or a picture.`);
    if (pages.length > CHART_MAX_PAGES) throw new Error(`Sheet music can have up to ${CHART_MAX_PAGES} pages.`);
  }
  return pages;
}
async function storePage(blob, songId, chartId, n) {
  if (Backend.on) return Backend.upload(new File([blob], `page-${n + 1}.jpg`, { type: "image/jpeg" }), `songs/${songId}/${chartId}/${Date.now()}-${n + 1}.jpg`);
  return readAsDataUrl(blob);
}

// ----- The song editor's Sheet music & Key/BPM section -----
function songChartsHtml() {
  const e = songEd; if (!e) return "";
  const ro = e.ro, labels = e.parts.map((p) => p.label.trim()).filter(Boolean);
  return html`
    <div class="sp-head-row" style="margin-top:14px"><h3 class="sp-h">Key, Tempo (BPM) &amp; ChordPro</h3></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
      <label class="field" style="margin:0"><span>Original Key</span><select name="songKey" data-sp-meta="key" ${attr(ro, "disabled")}>${KEY_CHOICES.map((k) => html`<option value="${k}" ${attr((e.key || "D") === k, "selected")}>Key of ${k}</option>`)}</select></label>
      <label class="field" style="margin:0"><span>Tempo (BPM)</span><input type="number" name="songBpm" data-sp-meta="bpm" min="40" max="220" value="${e.bpm || 76}" ${attr(ro, "readonly")}></label>
      <label class="field" style="margin:0"><span>Time signature</span><select name="songTimeSig" data-sp-meta="timeSig" ${attr(ro, "disabled")}>${["4/4", "3/4", "6/8", "9/8", "2/4"].map((ts) => html`<option value="${ts}" ${attr((e.timeSig || "4/4") === ts, "selected")}>${ts}</option>`)}</select></label>
    </div>
    <p class="faint" style="margin:0 0 10px">Tip: You can type inline chords in <code>[brackets]</code> inside any section's lyrics (like <code>[G]Amazing [D]grace</code>)—musicians on stage can transpose them into any key or capo position while the audience screen shows only the clean words.</p>

    <div class="sp-head-row"><h3 class="sp-h">Sheet music</h3></div>
    <p class="faint" style="margin:0 0 8px">A chart for each instrument, shown on the stage displays set to that instrument. Upload a PDF or pictures of the pages.${e.publicDomain ? "" : " Use music your church is licensed to copy, like charts from SongSelect or the publisher."}</p>
    ${e.charts.length ? html`<div class="sm-charts">${e.charts.map((c, i) => html`<div class="sm-chart">
      <div class="sm-chart-top"><span class="sm-thumbs">${c.pages.slice(0, 3).map((u) => html`<img src="${u}" alt="">`)}</span>
        <span class="body"><b>${c.part}</b><span class="faint">${plural(c.pages.length, "page")}${c.name ? `, ${c.name}` : ""}</span></span>
        ${ro ? "" : html`<button type="button" class="icon-btn sm" data-act="chart-remove" data-i="${i}" aria-label="Remove the ${c.part} sheet music">${icon("trash")}</button>`}</div>
      ${c.pages.length > 1 && labels.length ? html`<details class="sm-starts"${c.open ? " open" : ""}><summary>Turn pages with the song${Object.keys(c.starts || {}).length ? `: ${plural(Object.keys(c.starts).length, "section")} set` : ""}</summary>
        <p class="faint" style="margin:4px 0 8px">The page each section starts on. When the booth or band leader reaches that section, the music turns to it. Leave a section on "Keep going" and musicians turn the page themselves.</p>
        <div class="sm-start-grid">${labels.map((l) => html`<label><span>${l}</span><select data-chart-start="${i}" data-label="${l.toLowerCase()}" ${attr(ro, "disabled")}><option value="">Keep going</option>${c.pages.map((_, n) => html`<option value="${n}" ${attr(c.starts?.[l.toLowerCase()] === n, "selected")}>Page ${n + 1}</option>`)}</select></label>`)}</div></details>` : ""}
    </div>`)}</div>` : ""}
    ${ro ? "" : html`<div class="sm-add">
      <label class="field" style="margin:0"><span>Instrument</span><input type="text" id="chart-part" list="chart-parts" maxlength="30" placeholder="Keys, Bass, Drums..." value="${e.chartPart || ""}"><datalist id="chart-parts">${instrumentList().map((p) => html`<option value="${p}">`)}</datalist></label>
      <label class="btn ghost sm sm-file">${icon("upload")}Upload a PDF or pictures<input type="file" accept="application/pdf,image/*" multiple data-change="chart-files" class="sr"></label>
      <span class="faint" id="chart-busy" role="status"></span></div>`}`;
}
const redrawCharts = () => { const box = $("#song-charts"); if (box) box.innerHTML = flat(songChartsHtml()); };
Inputs["chart-files"] = async (el) => {
  const e = songEd, files = [...(el.files || [])]; el.value = "";
  if (!e || !files.length) return;
  const part = ($("#chart-part")?.value || "").trim().replace(/\s+/g, " ");
  if (!part) { toast("Type the instrument first, like Keys or Bass"); $("#chart-part")?.focus(); return; }
  const busy = (t) => { const b = $("#chart-busy"); if (b) b.textContent = t; };
  e.chartPart = part;
  try {
    busy("Reading the music...");
    const blobs = await filesToPages(files, (n, of) => busy(of ? `Reading page ${n} of ${of}...` : `Reading page ${n}...`));
    if (!blobs.length) throw new Error("That file has no pages.");
    e.fileId ||= e.id || uid();
    const chartId = uid(), pages = [];
    for (let n = 0; n < blobs.length; n++) { busy(`Saving page ${n + 1} of ${blobs.length}...`); pages.push(await storePage(blobs[n], e.fileId, chartId, n)); }
    const at = e.charts.findIndex((c) => samePart(c.part, part)), chart = { id: chartId, part, name: files.length === 1 ? files[0].name.replace(/\.[^.]+$/, "").slice(0, 60) : "", pages, starts: {} };
    if (at >= 0) e.charts.splice(at, 1, chart); else e.charts.push(chart);
    e.chartPart = "";
    redrawCharts(); toast(`${part}: ${plural(pages.length, "page")} added. Save the song to keep it.`);
  } catch (err) {
    busy("");
    toast(err?.message?.includes("module") || err?.message?.includes("import") ? "The PDF reader didn't load. Check the connection and try again, or upload pictures of the pages." : err?.message || "That file couldn't be read.");
  }
};
Actions["chart-remove"] = (el) => { const [c] = songEd.charts.splice(+el.dataset.i, 1); redrawCharts(); toast(`${c.part} sheet music removed. Save the song to keep the change.`); };
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.matches?.("[data-sp-meta]") && songEd) {
    songEd[t.dataset.spMeta] = t.dataset.spMeta === "bpm" ? (+t.value || 76) : t.value;
    return;
  }
  if (!t.matches?.("[data-chart-start]") || !songEd) return;
  const c = songEd.charts[+t.dataset.chartStart]; if (!c) return;
  c.starts ||= {}; if (t.value === "") delete c.starts[t.dataset.label]; else c.starts[t.dataset.label] = +t.value;
  c.open = true;
});

// ----- What a stage display shows + Musician Sync Mode, Transposer, Metronome & Auto-Scroll -----
/**
 * stageView() returns:
 *   - lyrics: boolean (show words / ChordPro lyrics)
 *   - part: string (instrument chart name, e.g. "Keys", "Bass")
 *   - syncMode: "follow" | "independent" | "leader"
 *       * "follow": follows Booth or Band Leader transitions
 *       * "independent": musician manually transitions between sections/slides/pages on their own screen while Booth controls audience lyrics
 *       * "leader": this musician's display controls song section transitions for all following stage displays
 *   - targetKey: string (transposed key override, or "" for song's original key)
 *   - capo: number (0..7)
 *   - metronome: boolean (flash visual BPM indicator in header)
 *   - autoScroll: number (0 = off, 1 = slow, 2 = medium, 3 = fast)
 */
function stageView() {
  const d = thisDevice(), key = d ? `stageView:${d.id}` : "stageView";
  let mine = null; try { mine = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* storage unavailable */ }
  const devStage = d?.type === "stage" ? (d.settings?.stage || {}) : {};
  const set = { ...devStage, ...(mine || {}) };
  return {
    lyrics: set.lyrics !== false,
    part: set.part || "",
    syncMode: set.syncMode || devStage.syncMode || "follow",
    targetKey: set.targetKey || "",
    capo: +set.capo || 0,
    metronome: set.metronome !== false,
    autoScroll: +set.autoScroll || 0,
  };
}
function setStageView(patch) {
  const cur = stageView();
  const next = { ...cur, ...patch };
  const d = thisDevice();
  try { localStorage.setItem(d ? `stageView:${d.id}` : "stageView", JSON.stringify(next)); } catch { /* storage unavailable */ }
  syncMetronomeTimer();
  syncAutoScrollTimer();
  return next;
}

let stageRedraw = null;
const stagePg = { key: "", label: "", page: 0, manual: false };
// Local state for a musician in "independent" or "leader" mode
const stageLocal = { slideIndex: null, songId: "", sectionLabel: "", bpmOverride: 0 };

/** The page to show: in independent mode (or after manual page turn), stay on the musician's page unless they pick a section; in follow mode, turn with the section. */
function chartPageFor(chart, label, syncMode = "follow") {
  const l = String(label || "").trim().toLowerCase(), start = chart.starts?.[l];
  if (stagePg.key !== chart.id) {
    Object.assign(stagePg, { key: chart.id, label: l, page: start ?? 0, manual: false });
  } else if (stagePg.label !== l && (syncMode !== "independent" || !stagePg.manual)) {
    Object.assign(stagePg, { label: l, page: start ?? stagePg.page });
  }
  stagePg.page = clamp(stagePg.page, 0, chart.pages.length - 1);
  return stagePg.page;
}

/** Transposes an SVG data-URL chart on the fly when the musician selects a new key or capo! */
function transposeChartPageUrl(url, origKey, targetKey, capo = 0) {
  const semi = semitonesBetween(origKey, targetKey, capo);
  if (!semi || !String(url || "").startsWith("data:image/svg+xml")) return url;
  try {
    const rawSvg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
    const playedKey = transposeNote(String(origKey || "D").replace(/m$/, ""), semi, FLAT_KEYS.has(targetKey));
    const preferFlats = FLAT_KEYS.has(playedKey);
    // Transpose chord text inside SVG chart boxes (>Chord</text>) and update the Key header
    const updated = rawSvg
      .replace(/Key of ([A-G][#b]?m?)/g, `Key of ${playedKey}${capo ? ` (Capo ${capo}, Concert ${targetKey || origKey})` : ""}`)
      .replace(/(font-size="30" font-weight="700" fill="#1d2430">)([^<]+)(<\/text>)/g, (_, pre, ch, post) => `${pre}${transposeChord(ch, semi, preferFlats)}${post}`);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(updated)}`;
  } catch {
    return url;
  }
}

/** The music area of a stage display. Two pages side by side on a wide screen, with live key transposition. */
function stageMusicHtml(chart, song, label, view = stageView()) {
  const p = chartPageFor(chart, label, view.syncMode), wide = innerWidth > innerHeight * 1.15 && chart.pages.length > 1;
  const first = wide ? Math.min(p, chart.pages.length - 2) : p, shown = wide ? [first, first + 1] : [p];
  const origKey = song?.key || "D";
  const targetKey = view.targetKey || origKey;
  return html`<div class="sm-music ${wide ? "two" : ""}" data-music>
    <button type="button" class="sm-turn prev" data-act="sm-page" data-d="-1" aria-label="Previous page" ${attr(first === 0, "disabled")}></button>
    ${shown.map((n) => html`<img src="${transposeChartPageUrl(chart.pages[n], origKey, targetKey, view.capo)}" alt="${song.title}, ${chart.part}, page ${n + 1}">`)}
    <button type="button" class="sm-turn next" data-act="sm-page" data-d="1" aria-label="Next page" ${attr(shown[shown.length - 1] >= chart.pages.length - 1, "disabled")}></button>
    <span class="sm-pg">${song.title}, ${chart.part} · Key of ${transposeNote(origKey, semitonesBetween(origKey, targetKey, view.capo), FLAT_KEYS.has(targetKey))}${view.capo ? ` (Capo ${view.capo})` : ""} · ${wide ? `Pages ${shown[0] + 1}-${shown[1] + 1}` : `Page ${p + 1}`} of ${chart.pages.length}</span></div>`;
}
Actions["sm-page"] = (el) => {
  const wide = !!$(".sm-music.two"), n = +el.dataset.d * (wide ? 2 : 1);
  stagePg.page = Math.max(0, stagePg.page + n); stagePg.manual = true; stageRedraw?.();
};

// ----- Visual BPM Metronome & Foot-Pedal / Tap Auto-Scroll Timers -----
let metronomeTimer = 0;
let metronomeBeat = 0;
let currentStageBpm = 76;
let currentStageTimeSig = "4/4";
let tapTimes = [];

function syncMetronomeTimer() {
  clearInterval(metronomeTimer);
  metronomeTimer = 0;
  const v = stageView();
  if (!v.metronome || !document.body.classList.contains("presenting")) return;
  const bpm = clamp(stageLocal.bpmOverride || currentStageBpm || 76, 40, 220);
  const beatsPerBar = parseInt(String(currentStageTimeSig || "4/4").split("/")[0], 10) || 4;
  const intervalMs = Math.round(60000 / bpm);
  metronomeTimer = setInterval(() => {
    const dot = $("[data-bpm-dot]");
    if (!dot) return;
    metronomeBeat = (metronomeBeat % beatsPerBar) + 1;
    dot.classList.remove("flash", "beat1");
    void dot.offsetWidth;
    dot.classList.add("flash");
    if (metronomeBeat === 1) dot.classList.add("beat1");
    const num = $("[data-bpm-beat]");
    if (num) num.textContent = String(metronomeBeat);
  }, intervalMs);
}

let autoScrollTimer = 0;
function syncAutoScrollTimer() {
  clearInterval(autoScrollTimer);
  autoScrollTimer = 0;
  const v = stageView();
  if (!v.autoScroll || !document.body.classList.contains("presenting")) return;
  const pxPerTick = v.autoScroll * 1.5;
  autoScrollTimer = setInterval(() => {
    const scroller = $(".stage-mon.full .sm-now") || $(".stage-mon.full .sm-music");
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      scroller.scrollTop += pxPerTick;
    }
  }, 60);
}

Actions["sm-key-step"] = (el) => {
  const v = stageView(), origKey = el.dataset.orig || "D";
  const curKey = v.targetKey || origKey;
  const nextKey = transposeNote(curKey, +el.dataset.step, false);
  setStageView({ targetKey: nextKey });
  stageRedraw?.();
};
Inputs["sm-key-pick"] = (el) => { setStageView({ targetKey: el.value }); stageRedraw?.(); };
Inputs["sm-capo-pick"] = (el) => { setStageView({ capo: +el.value || 0 }); stageRedraw?.(); };
Actions["sm-bpm-toggle"] = () => { const v = stageView(); setStageView({ metronome: !v.metronome }); stageRedraw?.(); };
Actions["sm-bpm-step"] = (el) => {
  stageLocal.bpmOverride = clamp((stageLocal.bpmOverride || currentStageBpm || 76) + (+el.dataset.d), 40, 220);
  syncMetronomeTimer();
  stageRedraw?.();
};
Actions["sm-bpm-tap"] = () => {
  const now = Date.now();
  tapTimes = tapTimes.filter((t) => now - t < 4000);
  tapTimes.push(now);
  if (tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    stageLocal.bpmOverride = clamp(Math.round(60000 / avg), 40, 220);
    syncMetronomeTimer();
    stageRedraw?.();
  }
};
Actions["sm-autoscroll"] = () => {
  const v = stageView();
  const next = (v.autoScroll + 1) % 4;
  setStageView({ autoScroll: next });
  toast(next ? `Auto-scroll speed ${next}x` : "Auto-scroll off");
  stageRedraw?.();
};
Inputs["sm-sync-mode"] = (el) => {
  const mode = el.value;
  setStageView({ syncMode: mode });
  toast(mode === "independent" ? "Independent Mode: You control your own display manually" : mode === "leader" ? "Band Leader Mode: Your section transitions guide the stage" : "Following Booth / Band Leader");
  stageRedraw?.();
};

/** The button on a stage display that lets the musician choose their instrument, key/capo, and sync mode. */
const stageViewBtn = () => {
  const v = stageView();
  const modeBadge = v.syncMode === "independent" ? "Manual" : v.syncMode === "leader" ? "Leader" : "Sync";
  return html`<button type="button" class="sm-view-btn" data-act="stage-view" aria-label="Choose what this screen shows">${icon("music")}<span>${v.part || "Words"} · ${modeBadge}</span></button>`;
};

Actions["stage-view"] = () => {
  const v = stageView(), d = thisDevice();
  openSheet("Musician Stage Display Settings", html`<form data-form="stage-view" novalidate>
    <label class="check"><input type="checkbox" name="lyrics" ${attr(v.lyrics, "checked")}><span>Show words &amp; ChordPro lyrics</span></label>
    <label class="field"><span>Sheet music instrument</span><select name="part"><option value="">No sheet music (Words / ChordPro only)</option>${instrumentList().map((p) => html`<option ${attr(samePart(p, v.part), "selected")}>${p}</option>`)}</select></label>

    <fieldset class="field" style="border:0;padding:0;margin-top:12px">
      <legend style="font-weight:700;margin-bottom:6px">Who controls song &amp; slide transitions on this display?</legend>
      <label class="check"><input type="radio" name="syncMode" value="follow" ${attr(v.syncMode === "follow", "checked")}><span><b>Follow Booth / Band Leader</b><br><span class="faint">Automatically transitions when the booth or band leader moves to the next section</span></span></label>
      <label class="check"><input type="radio" name="syncMode" value="independent" ${attr(v.syncMode === "independent", "checked")}><span><b>Independent Musician Control (Manual)</b><br><span class="faint">Booth still runs audience lyrics, but you control your own song sections, slides, and chart pages manually</span></span></label>
      <label class="check"><input type="radio" name="syncMode" value="leader" ${attr(v.syncMode === "leader", "checked")}><span><b>Band Leader Master Control</b><br><span class="faint">Your section taps transition songs for all other stage displays (and optionally the booth)</span></span></label>
    </fieldset>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
      <label class="field"><span>Transpose to Key</span><select name="targetKey"><option value="">Song's original key</option>${KEY_CHOICES.map((k) => html`<option value="${k}" ${attr(v.targetKey === k, "selected")}>Key of ${k}</option>`)}</select></label>
      <label class="field"><span>Guitar Capo</span><select name="capo">${[0, 1, 2, 3, 4, 5, 6, 7].map((c) => html`<option value="${c}" ${attr(v.capo === c, "selected")}>${c === 0 ? "No Capo" : `Capo Fret ${c}`}</option>`)}</select></label>
    </div>

    <label class="check" style="margin-top:8px"><input type="checkbox" name="metronome" ${attr(v.metronome, "checked")}><span>Flash visual BPM metronome indicator in stage header</span></label>

    <div class="btns"><button class="btn">Apply to this screen</button>${d?.settings?.stage ? html`<button type="button" class="btn ghost" data-act="stage-view-reset">Reset to device defaults</button>` : ""}</div></form>`, { wide: true });
};
Forms["stage-view"] = (d, f) => {
  if (!d.lyrics && !d.part) return formError(f, "Choose the words, sheet music or both.");
  setStageView({
    lyrics: !!d.lyrics,
    part: d.part || "",
    syncMode: d.syncMode || "follow",
    targetKey: d.targetKey || "",
    capo: +d.capo || 0,
    metronome: !!d.metronome,
  });
  closeSheet(true); stageRedraw?.();
};
Actions["stage-view-reset"] = () => { const d = thisDevice(); try { localStorage.removeItem(d ? `stageView:${d.id}` : "stageView"); } catch { /* storage unavailable */ } closeSheet(true); stageRedraw?.(); };

// ----- Stage display settings under Admin, Screens and devices -----
{
  const fields = deviceMapFields;
  deviceMapFields = (d) => {
    const v = d.settings?.stage || {}, parts = instrumentList();
    return html`${fields(d)}<div class="dev-opt" data-for="stage" ${attr(d.type !== "stage", "hidden")}><fieldset class="field" style="border:0;padding:0"><legend class="flabel">On this stage display</legend>
      <label class="check"><input type="checkbox" name="stageLyrics" ${attr(v.lyrics !== false, "checked")}><span>The words: lyrics, ChordPro chords, Scripture and what's next</span></label>
      <label class="field"><span>Sheet music for</span><select name="stagePart"><option value="">No sheet music</option>${parts.map((p) => html`<option ${attr(samePart(p, v.part), "selected")}>${p}</option>`)}</select></label>
      <label class="field"><span>Default transition control mode</span><select name="stageSyncMode">
        <option value="follow" ${attr((v.syncMode || "follow") === "follow", "selected")}>Follow Booth / Band Leader</option>
        <option value="independent" ${attr(v.syncMode === "independent", "selected")}>Independent Manual Musician Control (local only)</option>
        <option value="leader" ${attr(v.syncMode === "leader", "selected")}>Band Leader (controls song transitions on stage)</option>
      </select><small>Musicians can also switch between Follow, Independent Manual, and Band Leader directly on their display.</small></label></fieldset></div>`;
  };
  const mapSettings = deviceMapSettings;
  deviceMapSettings = (d) => ({ ...mapSettings(d), ...(d.type === "stage" ? { stage: { lyrics: !!d.stageLyrics || !d.stagePart, part: d.stagePart || "", syncMode: d.stageSyncMode || "follow" } } : {}) });
  const summary = deviceSummary;
  deviceSummary = (d) => {
    const s = summary(d), v = d.settings?.stage;
    if (d.type !== "stage") return s;
    const modeTxt = v?.syncMode === "leader" ? ", Band Leader control" : v?.syncMode === "independent" ? ", Independent manual control" : "";
    return `${s}${v?.part ? `. ${v.part} sheet music${v.lyrics !== false ? " and words" : ""}` : ""}${modeTxt}`;
  };
}

// ----- Sample sheet music for the demo: chord charts for Blessed Assurance (public domain), drawn as pictures -----
function chartSvg(title, part, sub, sections, pageNo, pages) {
  const W = 850, esc2 = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let y = 150, out = "";
  for (const [name, rows, note] of sections) {
    out += `<text x="60" y="${y}" font-size="26" font-weight="700" fill="#1d2430">${esc2(name)}</text>${note ? `<text x="${W - 60}" y="${y}" font-size="18" text-anchor="end" fill="#6b7280">${esc2(note)}</text>` : ""}`;
    y += 18;
    for (const bars of rows) {
      const bw = (W - 120) / 4;
      bars.forEach((b, i) => { const x = 60 + i * bw; out += `<rect x="${x}" y="${y}" width="${bw}" height="62" fill="none" stroke="#1d2430" stroke-width="2"/><text x="${x + 14}" y="${y + 42}" font-size="30" font-weight="700" fill="#1d2430">${esc2(b)}</text>`; });
      y += 78;
    }
    y += 34;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="1100" viewBox="0 0 ${W} 1100" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>
    <text x="60" y="70" font-size="40" font-weight="800" fill="#1d2430">${esc2(title)}</text><text x="${W - 60}" y="70" font-size="24" font-weight="700" text-anchor="end" fill="#4250d6">${esc2(part)}</text>
    <text x="60" y="104" font-size="20" fill="#6b7280">${esc2(sub)}</text>${out}<text x="${W / 2}" y="1070" font-size="18" text-anchor="middle" fill="#6b7280">Page ${pageNo} of ${pages}. Sample chart, public domain hymn.</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function sampleCharts() {
  const t = "Blessed Assurance", sub = "Fanny Crosby, Phoebe Knapp. Key of D, 9/8";
  const verse = [["D", "D", "G", "D"], ["D", "D", "E7", "A"], ["D", "D", "G", "D"], ["D", "A7", "D", "D"]];
  const chorus = [["D", "D", "A", "A"], ["A7", "A7", "D", "D"], ["D", "D", "G", "D"], ["D", "A7", "D", "D"]];
  const bass = (rows) => rows.map((r) => r.map((c) => c.replace(/7$/, "")));
  return [
    { id: "chart-assurance-keys", part: "Keys", name: "Blessed Assurance, keys", starts: { intro: 0, "verse 1": 0, "verse 2": 0, "verse 3": 0, chorus: 1, outro: 1 },
      pages: [chartSvg(t, "Keys", sub, [["Intro", [["D", "G", "A7", "D"]], "Piano alone"], ["Verse 1, 2, 3", verse, "Full band from verse 1"]], 1, 2),
        chartSvg(t, "Keys", sub, [["Chorus", chorus, "After each verse"], ["Outro", [["G", "D", "A7", "D"]], "Hold the last chord"]], 2, 2)] },
    { id: "chart-assurance-bass", part: "Bass", name: "Blessed Assurance, bass", starts: {},
      pages: [chartSvg(t, "Bass", sub, [["Intro", [["tacet", "tacet", "tacet", "tacet"]], "Rest; come in on the verse"], ["Verse", bass(verse)], ["Chorus", bass(chorus), "Walk up into each chorus"], ["Outro", [["G", "D", "A", "D"]]]], 1, 1)] },
  ];
}
