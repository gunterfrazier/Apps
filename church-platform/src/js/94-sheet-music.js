// ---------- Sheet music: charts for each instrument, on the stage displays ----------
// A song can carry sheet music for each part (Keys, Bass, Drums...), uploaded as a PDF or as pictures under Songs and lyrics.
// A PDF is split into one picture per page as it's uploaded (pdf.js, loaded only then), so every screen, iPads included,
// just shows pictures. song.charts = [{ id, part, name, pages: [url], starts: { "chorus": 2 } }]: starts says which page each
// section begins on (counted from 0), so the music turns itself when the booth moves to that section.
// Each stage display chooses what it shows (Admin, Screens and devices): the words, sheet music for one instrument, or both.
// Messages from the booth always show. Musicians can also pick their own part on the screen and turn pages by tapping
// either side of the music or with a page-turner pedal (arrow and page keys).

const DEFAULT_INSTRUMENTS = ["Vocals", "Keys", "Piano", "Acoustic guitar", "Electric guitar", "Bass", "Drums", "Strings", "Horns"];
const CHART_MAX_PAGES = 24;
const samePart = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
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
/** A picture, scaled so its longer side is at most 1800 pixels, on white (sheet music scans are often see-through PNGs). */
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
/** Files chosen in the editor, in order, as page pictures. A PDF gives one per page; each picture is one page. */
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
/** Where a page is kept: the church's media storage when there's a server; in the browser otherwise. */
async function storePage(blob, songId, chartId, n) {
  if (Backend.on) return Backend.upload(new File([blob], `page-${n + 1}.jpg`, { type: "image/jpeg" }), `songs/${songId}/${chartId}/${Date.now()}-${n + 1}.jpg`);
  return readAsDataUrl(blob);
}

// ----- The song editor's Sheet music section -----
function songChartsHtml() {
  const e = songEd; if (!e) return "";
  const ro = e.ro, labels = e.parts.map((p) => p.label.trim()).filter(Boolean);
  return html`<div class="sp-head-row"><h3 class="sp-h">Sheet music</h3></div>
    <p class="faint" style="margin:0 0 8px">A chart for each instrument, shown on the stage displays set to that instrument. Upload a PDF or pictures of the pages.${e.publicDomain ? "" : " Use music your church is licensed to copy, like charts from SongSelect or the publisher."}</p>
    ${e.charts.length ? html`<div class="sm-charts">${e.charts.map((c, i) => html`<div class="sm-chart">
      <div class="sm-chart-top"><span class="sm-thumbs">${c.pages.slice(0, 3).map((u) => html`<img src="${u}" alt="">`)}</span>
        <span class="body"><b>${c.part}</b><span class="faint">${plural(c.pages.length, "page")}${c.name ? `, ${c.name}` : ""}</span></span>
        ${ro ? "" : html`<button type="button" class="icon-btn sm" data-act="chart-remove" data-i="${i}" aria-label="Remove the ${c.part} sheet music">${icon("trash")}</button>`}</div>
      ${c.pages.length > 1 && labels.length ? html`<details class="sm-starts"${c.open ? " open" : ""}><summary>Turn pages with the song${Object.keys(c.starts || {}).length ? `: ${plural(Object.keys(c.starts).length, "section")} set` : ""}</summary>
        <p class="faint" style="margin:4px 0 8px">The page each section starts on. When the booth reaches that section, the music turns to it. Leave a section on "Keep going" and musicians turn the page themselves.</p>
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
    e.fileId ||= e.id || uid();   // a new song's pages are filed under the ID it will get
    const chartId = uid(), pages = [];
    for (let n = 0; n < blobs.length; n++) { busy(`Saving page ${n + 1} of ${blobs.length}...`); pages.push(await storePage(blobs[n], e.fileId, chartId, n)); }
    // A second upload for the same instrument replaces the first.
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
  const t = ev.target; if (!t.matches?.("[data-chart-start]") || !songEd) return;
  const c = songEd.charts[+t.dataset.chartStart]; if (!c) return;
  c.starts ||= {}; if (t.value === "") delete c.starts[t.dataset.label]; else c.starts[t.dataset.label] = +t.value;
  c.open = true;
});

// ----- What a stage display shows -----
/** { lyrics, part }: from this screen's own choice, else the device's settings, else just the words. */
function stageView() {
  const d = thisDevice(), key = d ? `stageView:${d.id}` : "stageView";
  let mine = null; try { mine = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* storage unavailable */ }
  const set = mine || (d?.type === "stage" ? d.settings?.stage : null) || {};
  return { lyrics: set.lyrics !== false, part: set.part || "" };
}
function setStageView(v) {
  const d = thisDevice(); try { localStorage.setItem(d ? `stageView:${d.id}` : "stageView", JSON.stringify(v)); } catch { /* storage unavailable */ }
}
let stageRedraw = null;
const stagePg = { key: "", label: "", page: 0 };
/** The page to show: a new chart starts where its section starts (or page 1); a new section turns to its page, if set. */
function chartPageFor(chart, label) {
  const l = String(label || "").trim().toLowerCase(), start = chart.starts?.[l];
  if (stagePg.key !== chart.id) Object.assign(stagePg, { key: chart.id, label: l, page: start ?? 0 });
  else if (stagePg.label !== l) Object.assign(stagePg, { label: l, page: start ?? stagePg.page });
  stagePg.page = clamp(stagePg.page, 0, chart.pages.length - 1);
  return stagePg.page;
}
/** The music area of a stage display. Two pages side by side on a wide screen. */
function stageMusicHtml(chart, song, label) {
  const p = chartPageFor(chart, label), wide = innerWidth > innerHeight * 1.15 && chart.pages.length > 1;
  const first = wide ? Math.min(p, chart.pages.length - 2) : p, shown = wide ? [first, first + 1] : [p];
  return html`<div class="sm-music ${wide ? "two" : ""}" data-music>
    <button type="button" class="sm-turn prev" data-act="sm-page" data-d="-1" aria-label="Previous page" ${attr(first === 0, "disabled")}></button>
    ${shown.map((n) => html`<img src="${chart.pages[n]}" alt="${song.title}, ${chart.part}, page ${n + 1}">`)}
    <button type="button" class="sm-turn next" data-act="sm-page" data-d="1" aria-label="Next page" ${attr(shown[shown.length - 1] >= chart.pages.length - 1, "disabled")}></button>
    <span class="sm-pg">${song.title}, ${chart.part}. ${wide ? `Pages ${shown[0] + 1}-${shown[1] + 1}` : `Page ${p + 1}`} of ${chart.pages.length}</span></div>`;
}
Actions["sm-page"] = (el) => {
  const wide = !!$(".sm-music.two"), n = +el.dataset.d * (wide ? 2 : 1);
  stagePg.page = Math.max(0, stagePg.page + n); stagePg.manual = true; stageRedraw?.();
};
document.addEventListener("keydown", (ev) => {
  if (!$(".stage-mon.full .sm-music") || ev.target.closest?.("input, textarea, select, #scrim")) return;
  const d = ["ArrowRight", "PageDown", " ", "ArrowDown"].includes(ev.key) ? 1 : ["ArrowLeft", "PageUp", "ArrowUp"].includes(ev.key) ? -1 : 0;
  if (!d) return;
  ev.preventDefault(); Actions["sm-page"]({ dataset: { d } });
});
/** The button on a stage display that lets the person in front of it choose what it shows. */
const stageViewBtn = () => html`<button type="button" class="sm-view-btn" data-act="stage-view" aria-label="Choose what this screen shows">${icon("music")}<span>${stageView().part || "Words"}</span></button>`;
Actions["stage-view"] = () => {
  const v = stageView(), d = thisDevice();
  openSheet("What this screen shows", html`<form data-form="stage-view" novalidate>
    <label class="check"><input type="checkbox" name="lyrics" ${attr(v.lyrics, "checked")}><span>The words: lyrics, Scripture and what's next</span></label>
    <label class="field"><span>Sheet music for</span><select name="part"><option value="">No sheet music</option>${instrumentList().map((p) => html`<option ${attr(samePart(p, v.part), "selected")}>${p}</option>`)}</select>
      <small>Songs without music for this instrument show the words. Messages from the booth always show.</small></label>
    <div class="btns"><button class="btn">Show it</button>${d?.settings?.stage ? html`<button type="button" class="btn ghost" data-act="stage-view-reset">Use the screen's settings</button>` : ""}</div></form>`);
};
Forms["stage-view"] = (d, f) => {
  if (!d.lyrics && !d.part) return formError(f, "Choose the words, sheet music or both.");
  setStageView({ lyrics: !!d.lyrics, part: d.part || "" }); closeSheet(true); stageRedraw?.();
};
Actions["stage-view-reset"] = () => { const d = thisDevice(); try { localStorage.removeItem(d ? `stageView:${d.id}` : "stageView"); } catch { /* storage unavailable */ } closeSheet(true); stageRedraw?.(); };

// ----- Stage display settings under Admin, Screens and devices -----
{
  const fields = deviceMapFields;
  deviceMapFields = (d) => {
    const v = d.settings?.stage || {}, parts = instrumentList();
    return html`${fields(d)}<div class="dev-opt" data-for="stage" ${attr(d.type !== "stage", "hidden")}><fieldset class="field" style="border:0;padding:0"><legend class="flabel">On this display</legend>
      <label class="check"><input type="checkbox" name="stageLyrics" ${attr(v.lyrics !== false, "checked")}><span>The words: lyrics, Scripture and what's next</span></label>
      <label class="field"><span>Sheet music for</span><select name="stagePart"><option value="">No sheet music</option>${parts.map((p) => html`<option ${attr(samePart(p, v.part), "selected")}>${p}</option>`)}</select>
        <small>Add sheet music to a song under Songs and lyrics. Songs without music for this instrument show the words. The clock, timers and messages from the booth always show. Musicians can change this on the screen itself.</small></label></fieldset></div>`;
  };
  const mapSettings = deviceMapSettings;
  deviceMapSettings = (d) => ({ ...mapSettings(d), ...(d.type === "stage" ? { stage: { lyrics: !!d.stageLyrics || !d.stagePart, part: d.stagePart || "" } } : {}) });
  const summary = deviceSummary;
  deviceSummary = (d) => {
    const s = summary(d), v = d.settings?.stage;
    if (d.type !== "stage" || !v?.part) return s;
    return `${s}. ${v.part} sheet music${v.lyrics !== false ? " and the words" : ""}`;
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
