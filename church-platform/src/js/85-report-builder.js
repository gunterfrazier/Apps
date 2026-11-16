// ---------- Report documents: view, print, export, and custom reports that run on a schedule ----------
// Any report page can be opened as a clean document (#rview-page:giving), printed or saved as a PDF, and downloaded
// as Excel (.xlsx), Word (.doc), CSV or a web page (.html). The document is built from what the page itself shows:
// while a page renders in "collect" mode, its number tiles, charts, breakdowns and tables are also kept as data.
// Custom reports (#reports-custom, #rbuild-new) pick any of those parts, with their own range and location. One with a
// schedule runs the first time someone who can see it opens the app after it's due, saves a copy (reportRuns) and
// notifies the people chosen. Copies keep their numbers, so last month's report still says what it said then.

// ----- Collecting what a report page shows -----
const ReportDoc = { on: false, items: [], nextTitle: "" };
const humanFile = (f) => { const s = String(f).replace(/-/g, " "); return s.charAt(0).toUpperCase() + s.slice(1); };
const round2 = (x) => Math.round((+x || 0) * 100) / 100;
{
  const st = statTile, sc = stackedColumns, sb = segBar, hb = hBars, rt = reportTable;
  statTile = (label, value, sub, delta) => {
    if (ReportDoc.on) { const last = ReportDoc.items[ReportDoc.items.length - 1], t = { label: String(label), value: String(value), sub: String(sub || "") };
      if (last?.kind === "stats") last.tiles.push(t); else ReportDoc.items.push({ kind: "stats", tiles: [t] }); }
    return st(label, value, sub, delta);
  };
  stackedColumns = (id, o) => { if (ReportDoc.on) ReportDoc.items.push({ kind: "chart", title: o.title, labels: [...o.labels], series: o.series.map(([n, v]) => [n, v.map(round2)]), money: !!o.money }); return sc(id, o); };
  segBar = (parts) => { if (ReportDoc.on) ReportDoc.items.push({ kind: "bars", title: ReportDoc.nextTitle, rows: parts.map(([l, v]) => [l, round2(v)]), share: true }); ReportDoc.nextTitle = ""; return sb(parts); };
  hBars = (items, show) => { if (ReportDoc.on) ReportDoc.items.push({ kind: "bars", title: ReportDoc.nextTitle, rows: items.map(([l, v]) => [l, round2(v)]), money: show === money }); ReportDoc.nextTitle = ""; return hb(items, show); };
  reportTable = (id, file, head, rows, o = {}) => {
    if (ReportDoc.on) ReportDoc.items.push({ kind: "table", title: o.title || humanFile(file), head: [...head], rows: rows.slice(0, 2000).map((r) => r.map((c) => (typeof c === "number" ? c : String(c ?? "")))), numeric: o.numeric || [] });
    return rt(id, file, head, rows, o);
  };
}
/** hBars with a name for exports and custom reports (the heading above it on the page). */
const hBarsT = (title, items, show) => { ReportDoc.nextTitle = title; return hBars(items, show); };
const segBarT = (title, parts) => { ReportDoc.nextTitle = title; return segBar(parts); };
const PART_KIND_LABEL = { stats: "Numbers", chart: "Chart", bars: "Breakdown", table: "Table" };
const reportPagesFor = () => REPORT_TABS.filter(([k, , ok]) => k !== "custom" && ok()).map(([k, l]) => [k, l]);
const pageLabel = (k) => (REPORT_TABS.find(([x]) => x === k)?.[1]) || "Overview";
/** Everything one report page shows, as data. Each part has a key that stays the same from run to run. */
function reportCollect(page) {
  ReportDoc.on = true; ReportDoc.items = []; ReportDoc.nextTitle = "";
  try { if (page) REPORT_PAGES[page](); else reportOverview(); } catch (e) { console.warn("report", page, e); } finally { ReportDoc.on = false; }
  const seen = {};
  return ReportDoc.items.splice(0).map((it) => {
    it.title ||= it.kind === "stats" ? it.tiles.map((t) => t.label).join(", ") : (it.rows || []).slice(0, 4).map((r) => r[0]).join(", ");
    const base = `${page || "overview"}|${it.kind}|${it.title}`; seen[base] = (seen[base] || 0) + 1;
    const words = `${it.title} ${(it.tiles || []).map((t) => t.label).join(" ")}`;
    return { ...it, key: seen[base] > 1 ? `${base}#${seen[base]}` : base, page, pageLabel: pageLabel(page), giving: page === "giving" || /\bgiv|given|fund|pledge|gift/i.test(words) };
  });
}
/** Runs fn with a different range and location for the reports, then puts them back. */
function reportScoped(range, campus, fn) {
  const r0 = reportRange, cid = S.state.current, had = cid in S.state.campus, c0 = S.state.campus[cid];
  if (REPORT_RANGES[range]) reportRange = range; if (campus) S.state.campus[cid] = campus;
  try { return fn(); } finally { reportRange = r0; if (had) S.state.campus[cid] = c0; else delete S.state.campus[cid]; }
}
function reportDoc({ title, pages, keys = null, range = reportRange, campus = S.campus(), note = "" }) {
  const avail = new Set(reportPagesFor().map(([k]) => k));
  const items = reportScoped(range, campus, () => pages.filter((p) => avail.has(p)).flatMap((p) => reportCollect(p)));
  const chosen = keys ? items.filter((i) => keys.includes(i.key)) : items;
  return { title, church: S.church().name, range: REPORT_RANGES[range]?.[0] || "", campus: campus && campus !== "all" ? S.location(campus)?.name || "One location" : "All locations",
    at: new Date().toISOString(), note, items: chosen, giving: chosen.some((i) => i.giving) };
}
const pageDoc = (page) => reportDoc({ title: page ? `${pageLabel(page)} report` : "Church overview", pages: [page] });

// ----- Showing a document -----
const docShow = (it, col, v) => typeof v !== "number" ? v : it.money && col > 0 ? money(v) : v.toLocaleString();
/** Any part as rows and columns, for tables and every export. */
function itemTable(it) {
  if (it.kind === "table") return { head: it.head, rows: it.rows, numeric: it.numeric };
  if (it.kind === "stats") return { head: ["Measure", "Value", "Note"], rows: it.tiles.map((t) => [t.label, t.value, t.sub]), numeric: [] };
  if (it.kind === "bars") { const total = it.rows.reduce((n, [, v]) => n + v, 0) || 1;
    return { head: ["Name", it.money ? "Amount" : "Number", ...(it.share ? ["Share"] : [])], rows: it.rows.map(([l, v]) => [l, v, ...(it.share ? [`${Math.round((v / total) * 100)}%`] : [])]), numeric: [1] }; }
  const multi = it.series.length > 1;
  return { head: ["Period", ...it.series.map(([n]) => n), ...(multi ? ["Total"] : [])], numeric: it.series.map((_, i) => i + 1).concat(multi ? [it.series.length + 1] : []),
    rows: it.labels.map((l, i) => [l, ...it.series.map(([, v]) => v[i] || 0), ...(multi ? [round2(it.series.reduce((n, [, v]) => n + (v[i] || 0), 0))] : [])]) };
}
const docTable = (it, cls = "") => { const t = itemTable(it);
  return html`<div class="table-wrap ${cls}"><table class="mini-table"><thead><tr>${t.head.map((h, i) => html`<th class="${t.numeric.includes(i) ? "num" : ""}">${h}</th>`)}</tr></thead>
    <tbody>${t.rows.map((r) => html`<tr>${r.map((c, i) => html`<td class="${t.numeric.includes(i) ? "num" : ""}">${docShow(it, i, c)}</td>`)}</tr>`)}</tbody></table></div>`; };
function renderDoc(doc) {
  let page = null;
  const c = S.church();
  return html`<article class="report-doc">
    <header class="rd-top">${c?.logo ? html`<img src="${c.logo}" alt="">` : ""}<div><p class="rd-church">${doc.church}</p><h1>${doc.title}</h1>
      <p class="rd-meta">${doc.range ? `Last ${doc.range}. ` : ""}${doc.campus}. Prepared ${fmtWhen(doc.at)}.</p>${doc.note ? html`<p class="rd-note">${doc.note}</p>` : ""}</div></header>
    ${doc.items.length ? doc.items.map((it, i) => {
      const head = it.pageLabel !== page ? ((page = it.pageLabel), html`<h2 class="rd-page">${it.pageLabel}</h2>`) : "";
      const body = it.kind === "stats" ? html`<div class="stat-tiles">${it.tiles.map((t) => statTile(t.label, t.value, t.sub))}</div>`
        : it.kind === "chart" ? html`${stackedColumns(`rd${i}`, { title: it.title, labels: it.labels, series: it.series, money: it.money })}${docTable(it, "print-only")}`
        : it.kind === "bars" ? html`<h3 class="rd-h">${it.title}</h3>${it.share ? html`<div class="panel">${segBar(it.rows)}</div>` : hBars(it.rows, it.money ? money : (n) => n.toLocaleString())}`
        : html`<h3 class="rd-h">${it.title}</h3>${it.rows.length ? docTable(it) : html`<p class="muted">Nothing here in this range.</p>`}`;
      return html`${head}<section class="rd-sec">${body}</section>`; }) : html`<p class="muted">Nothing to show. Choose some parts for this report.</p>`}
    <footer class="rd-foot">${doc.church}. Made with ${PLATFORM.name}.</footer></article>`;
}

// ----- Exports -----
const docFile = (doc, ext) => `${slugify(`${doc.church} ${doc.title}`).slice(0, 60)}-${doc.at.slice(0, 10)}.${ext}`;
function reportCsv(doc) {
  const out = [csvLine([doc.title]), csvLine([doc.church]), csvLine([`${doc.range ? `Last ${doc.range}, ` : ""}${doc.campus}`]), csvLine([`Prepared ${fmtWhen(doc.at)}`]), ""];
  doc.items.forEach((it) => { const t = itemTable(it); out.push(csvLine([`${it.pageLabel}: ${it.title}`]), csvLine(t.head), ...t.rows.map(csvLine), ""); });
  return out.join("\n");
}
const xesc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
/** Plain HTML with tables, for Word and for a web page someone can email or print. */
function reportStatic(doc, word) {
  const bar = (v, max) => word ? "" : `<span class="b" style="width:${max ? Math.round((v / max) * 100) : 0}%"></span>`;
  const parts = doc.items.map((it) => {
    const t = itemTable(it), max = it.kind === "chart" || it.kind === "bars" ? Math.max(...t.rows.map((r) => +r[r.length - (it.share ? 2 : 1)] || 0), 0) : 0;
    const valCol = it.kind === "bars" ? 1 : t.head.length - 1;
    return `<h2>${xesc(it.pageLabel)}: ${xesc(it.title)}</h2><table><thead><tr>${t.head.map((h) => `<th>${xesc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td${typeof c === "number" ? ' class="n"' : ""}>${xesc(docShow(it, i, c))}${max && i === valCol ? bar(+c || 0, max) : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }).join("");
  const css = `body{font-family:${word ? "Calibri,Arial" : "system-ui,Segoe UI,Arial"},sans-serif;color:#1d2430;max-width:900px;margin:24px auto;padding:0 16px}h1{margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}.m{color:#555}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #c9ccd2;padding:4px 8px;text-align:left;vertical-align:top}th{background:#eef0f3}td.n{text-align:right;white-space:nowrap}.b{display:block;height:6px;background:#2a78d6;border-radius:3px;margin-top:3px}@media print{h2{break-after:avoid}tr{break-inside:avoid}}`;
  return `<!DOCTYPE html><html${word ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"' : ' lang="en"'}><head><meta charset="utf-8"><title>${xesc(doc.title)}</title><style>${css}</style></head><body>
<p class="m">${xesc(doc.church)}</p><h1>${xesc(doc.title)}</h1><p class="m">${xesc(`${doc.range ? `Last ${doc.range}. ` : ""}${doc.campus}. Prepared ${fmtWhen(doc.at)}.`)}</p>${doc.note ? `<p>${xesc(doc.note)}</p>` : ""}
${parts}<p class="m" style="margin-top:28px">${xesc(doc.church)}. Made with ${xesc(PLATFORM.name)}.</p></body></html>`;
}
// A real Excel workbook: a summary sheet and one sheet for each part, zipped without compression (no library needed).
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipFiles(files, type) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const [name, text] of files) {
    const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nb.length, 2], [28, 0, 2]].forEach(([o, v, n]) => n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nb.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]].forEach(([o, v, n]) => n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type });
}
const colName = (i) => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
function sheetXml(rows, bold) {
  const widths = []; rows.forEach((r) => r.forEach((c, i) => { widths[i] = Math.min(60, Math.max(widths[i] || 8, String(c ?? "").length + 2)); }));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : ""}<sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
    const ref = `${colName(ci)}${ri + 1}`, s = bold.includes(ri) ? ' s="1"' : "";
    return typeof c === "number" && Number.isFinite(c) ? `<c r="${ref}"${s}><v>${c}</v></c>` : c == null || c === "" ? "" : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xesc(c)}</t></is></c>`;
  }).join("")}</row>`).join("")}</sheetData></worksheet>`;
}
function reportXlsx(doc) {
  const sheets = [["Summary", [[doc.title], [doc.church], [`${doc.range ? `Last ${doc.range}, ` : ""}${doc.campus}`], [`Prepared ${fmtWhen(doc.at)}`], ...(doc.note ? [[doc.note]] : [])], [0]]];
  const stats = doc.items.filter((i) => i.kind === "stats");
  if (stats.length) { const s = sheets[0][1]; s.push([]); sheets[0][2].push(s.length); s.push(["Part", "Measure", "Value", "Note"]); stats.forEach((it) => it.tiles.forEach((t) => s.push([it.pageLabel, t.label, t.value, t.sub]))); }
  doc.items.filter((i) => i.kind !== "stats").forEach((it) => { const t = itemTable(it); sheets.push([`${it.title}`, [[`${it.pageLabel}: ${it.title}`], [], t.head, ...t.rows], [0, 2]]); });
  const used = new Set();
  sheets.forEach((s) => { let n = s[0].replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet", base = n.slice(0, 27), k = 2; while (used.has(n.toLowerCase())) n = `${base} (${k++})`; used.add(n.toLowerCase()); s[0] = n; });
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', rns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${rns}"><sheets>${sheets.map((s, i) => `<sheet name="${xesc(s[0])}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rns}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${rns}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s[1], s[2])]),
  ];
  return zipFiles(files, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
function reportPrint(doc) {
  // A computer with a report printer chosen (QZ Tray) sends it there; otherwise the print dialog.
  if (typeof printPrefs === "function" && printPrefs().printers?.report) return printJob("report", `<div class="pj-report">${flat(renderDoc(doc))}</div>`, { title: doc.title || "Report" });
  if (IN_PREVIEW) { toast("Printing works once the app is on your own website. Download it as a web page or Word file to print it here."); return; }
  $("#print-report")?.remove();
  const box = document.createElement("div"); box.id = "print-report"; box.innerHTML = flat(renderDoc(doc));
  document.body.appendChild(box); document.body.classList.add("print-report");
  const done = () => { document.body.classList.remove("print-report"); box.remove(); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done); setTimeout(() => window.print(), 60);
}
const REPORT_FORMATS = [["print", "Print", "Or save it as a PDF from the print window", "screen"], ["xlsx", "Excel (.xlsx)", "A sheet for each part, ready to sort and chart", "download"],
  ["doc", "Word (.doc)", "Tables you can edit and add to", "note"], ["html", "Web page (.html)", "Opens in any browser, easy to email or print", "globe"], ["csv", "CSV", "Every table in one file, for other programs", "list"]];
function reportExport(doc, f) {
  if (!doc) return;
  if (f === "print") return reportPrint(doc);
  if (f === "xlsx") return saveFile(docFile(doc, "xlsx"), reportXlsx(doc));
  if (f === "doc") return saveFile(docFile(doc, "doc"), new Blob([reportStatic(doc, true)], { type: "application/msword" }));
  if (f === "html") return saveFile(docFile(doc, "html"), new Blob([reportStatic(doc, false)], { type: "text/html" }));
  if (f === "csv") return saveFile(docFile(doc, "csv"), new Blob([reportCsv(doc)], { type: "text/csv" }));
}
const exportButtons = (extra = "") => html`<div class="rd-tools">${REPORT_FORMATS.map(([k, l, , ic]) => html`<button class="btn ${k === "print" ? "" : "ghost"} sm" data-act="rx" data-fmt="${k}">${icon(ic)}${k === "print" ? "Print or PDF" : l.replace(/ \(.*/, "")}</button>`)}${extra}</div>`;

// ----- The document screen: #rview-page:giving, #rview-custom:<id>, #rview-run:<id> -----
let rviewDoc = null;
Screens.rview = (tail = "") => {
  if (!canReports()) return { redirect: hasAdminTools() ? "admin" : "me" };
  const i = tail.indexOf(":"), type = i < 0 ? tail : tail.slice(0, i), id = i < 0 ? "" : tail.slice(i + 1);
  let back = "reports", extra = "";
  if (type === "page") { const page = id === "overview" ? "" : id; if (page && !reportPagesFor().some(([k]) => k === page)) return { redirect: "reports" }; rviewDoc = pageDoc(page); back = page ? `reports-${page}` : "reports"; }
  else if (type === "custom") { const r = S.get("customReports", id); if (!r || !reportCanRun(r)) return { redirect: "reports-custom" }; rviewDoc = customDoc(r); back = "reports-custom";
    extra = html`<button class="btn ghost sm" data-act="rb-run" data-id="${r.id}">${icon("bookmark")}Save a copy</button><a class="btn ghost sm" href="#rbuild-${r.id}">${icon("edit")}Change</a>`; }
  else if (type === "run") { const run = S.get("reportRuns", id); if (!run || (run.giving && !S.can("view.giving"))) return { redirect: "reports-custom" }; rviewDoc = run.doc; back = "reports-custom"; }
  else return { redirect: "reports" };
  return { title: rviewDoc.title, back, body: html`<div style="margin-top:12px">${exportButtons(extra)}</div>${renderDoc(rviewDoc)}` };
};
Actions["rx"] = (el) => { const page = el.dataset.page; reportExport(page != null ? pageDoc(page === "overview" ? "" : page) : rviewDoc, el.dataset.fmt); if (page != null) closeSheet(); };
Actions["rx-menu"] = (el) => { const page = el.dataset.page || "overview";
  openSheet("Print or export", html`<div class="rows"><a class="row" href="#rview-page:${page}"><span class="lead-ic">${icon("eye")}</span><span class="body"><span class="t">View as a report</span><span class="s">A clean page with every number, chart and table, ready to read or print</span></span>${icon("chev")}</a>
    ${REPORT_FORMATS.map(([k, l, s, ic]) => html`<button class="row" data-act="rx" data-fmt="${k}" data-page="${page}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${l}</span><span class="s">${s}</span></span></button>`)}
    <a class="row" href="#rbuild-new"><span class="lead-ic">${icon("plus")}</span><span class="body"><span class="t">Build a custom report</span><span class="s">Pick the parts you want, and have it run every week or month</span></span>${icon("chev")}</a></div>`); };
// Every report page gets the button, next to the range and location.
{
  const reports = Screens.reports;
  Screens.reports = (tab = "") => { const v = reports(tab); if (!v?.body || tab === "custom" || !canReports()) return v;
    return { ...v, body: html`<div class="rd-bar"><button class="btn ghost sm" data-act="rx-menu" data-page="${tab || "overview"}">${icon("download")}Print or export</button></div>${v.body}` }; };
}

// ----- Custom reports -----
// customReports: { name, note, range, campus, parts: [keys], freq: "none" | "weekly" | "monthly", weekday, monthday, notify: [userIds], by, created, giving }
const customPages = (r) => [...new Set((r.parts || []).map((k) => { const p = k.split("|")[0]; return p === "overview" ? "" : p; }))];
const customDoc = (r) => reportDoc({ title: r.name, pages: customPages(r), keys: r.parts, range: r.range, campus: r.campus || "all", note: r.note || "" });
const reportCanRun = (r) => canReports() && (!r.giving || S.can("view.giving")) && customPages(r).every((p) => reportPagesFor().some(([k]) => k === p));
/** People who may read reports here: the ones a report can notify. */
const reportReaders = () => S.members().filter((m) => { if (!S.user(m.userId)) return false; const r = S.role(m.churchId, m.userId); return S.isPrimary(m.churchId, m.userId) || r?.perms?.["view.reports"] || r?.perms?.["view.giving"]; });
const reportScheduleText = (r) => r.freq === "weekly" ? `Every ${DAYS[+r.weekday || 0]}` : r.freq === "monthly" ? `Monthly on the ${ordinal(+r.monthday || 1)}` : "Runs when you open it";
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
REPORT_TABS.push(["custom", "Custom", () => true]);
REPORT_PAGES.custom = () => {
  const list = S.list("customReports").filter((r) => !r.giving || S.can("view.giving")).sort((a, b) => a.name.localeCompare(b.name));
  const runs = S.list("reportRuns").filter((x) => !x.giving || S.can("view.giving")).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
  return html`<section class="sec"><div class="sec-head"><h2>Custom reports</h2><a class="btn sm" href="#rbuild-new">${icon("plus")}New report</a></div>
      <p class="muted" style="margin-top:0">Pick the numbers, charts and tables you want from any report, with their own range and location. Give it a schedule and it runs by itself every week or month, saves a copy and lets the people you choose know.</p>
      <div class="rows">${list.length ? list.map((r) => html`<a class="row" href="#rview-custom:${r.id}"><span class="lead-ic">${icon("list")}</span><span class="body"><span class="t">${r.name}</span><span class="s">${plural((r.parts || []).length, "part")}. ${reportScheduleText(r)}${r.notify?.length ? `, tells ${plural(r.notify.length, "person", "people")}` : ""}.</span></span>${icon("chev")}</a>`) : empty("No custom reports yet.")}</div></section>
    ${runs.length ? html`<section class="sec"><div class="sec-head"><h2>Saved copies</h2></div><div class="rows">${runs.map((x) => html`<a class="row" href="#rview-run:${x.id}"><span class="lead-ic">${icon("bookmark")}</span><span class="body"><span class="t">${x.name}</span><span class="s">${x.auto ? "Ran by itself" : "Saved"} ${fmtWhen(x.at)}</span></span>${icon("chev")}</a>`)}</div></section>` : ""}`;
};
let rbDraft = null;
Screens.rbuild = (id = "new") => {
  if (!canReports()) return { redirect: "reports" };
  const saved = id !== "new" && S.get("customReports", id);
  if (id !== "new" && !saved) return { redirect: "reports-custom" };
  if (!rbDraft || rbDraft.id !== (saved?.id || "new")) rbDraft = saved ? { ...saved } : { id: "new", name: "", note: "", range: reportRange, campus: "all", parts: [], freq: "none", weekday: 1, monthday: 1, notify: [S.me().id] };
  const d = rbDraft, pages = reportPagesFor(), locs = S.visibleLocations();
  const byPage = reportScoped(d.range, d.campus, () => pages.map(([k, l]) => [k, l, reportCollect(k)]));
  const readers = reportReaders();
  return { title: saved ? "Change report" : "New report", back: "reports-custom", body: html`<form data-form="rbuild" class="panel" style="margin-top:14px" novalidate>
    <label class="field" style="margin-top:0"><span>Name</span><input type="text" name="name" value="${d.name}" maxlength="80" required placeholder="Monthly board report"></label>
    <label class="field"><span>Note at the top (optional)</span><textarea name="note" rows="2" maxlength="500">${d.note || ""}</textarea></label>
    <div class="map-two"><label class="field"><span>Range</span><select name="range" data-change="rb-keep">${Object.entries(REPORT_RANGES).map(([k, [l]]) => html`<option value="${k}" ${attr(k === d.range, "selected")}>Last ${l}</option>`)}</select></label>
      <label class="field"><span>Location</span><select name="campus" data-change="rb-keep"><option value="all">All locations</option>${locs.map((l) => html`<option value="${l.id}" ${attr(l.id === d.campus, "selected")}>${l.name}</option>`)}</select></label></div>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:4px">What's in it</legend>
      ${byPage.map(([k, l, items]) => items.length ? html`<div class="rb-page"><div class="rb-page-head"><b>${l}</b><button type="button" class="link-btn" data-act="rb-all" data-page="${k || "overview"}">Select all</button></div>
        ${items.map((it) => html`<label class="check" style="padding:4px 0"><input type="checkbox" name="parts" value="${it.key}" data-page="${k || "overview"}" ${attr(d.parts.includes(it.key), "checked")}><span>${it.title} <span class="faint">${PART_KIND_LABEL[it.kind]}</span></span></label>`)}</div>` : "")}</fieldset>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:4px">Run it by itself</legend>
      <select name="freq" data-change="rb-keep"><option value="none" ${attr(d.freq === "none", "selected")}>No, only when I open it</option><option value="weekly" ${attr(d.freq === "weekly", "selected")}>Every week</option><option value="monthly" ${attr(d.freq === "monthly", "selected")}>Every month</option></select>
      ${d.freq === "weekly" ? html`<label class="field"><span>On</span><select name="weekday">${DAYS.map((x, i) => html`<option value="${i}" ${attr(i === +d.weekday, "selected")}>${x}</option>`)}</select></label>` : ""}
      ${d.freq === "monthly" ? html`<label class="field"><span>On the</span><select name="monthday">${Array.from({ length: 28 }, (_, i) => html`<option value="${i + 1}" ${attr(i + 1 === +d.monthday, "selected")}>${ordinal(i + 1)}</option>`)}</select></label>` : ""}
      ${d.freq !== "none" ? html`<small>It runs the first time someone who can see it opens the app on or after that day, saves a copy under Saved copies, and notifies the people below.</small>
        <p style="margin:12px 0 4px"><b>Let these people know</b></p>${readers.map((m) => html`<label class="check" style="padding:4px 0"><input type="checkbox" name="notify" value="${m.userId}" ${attr(d.notify?.includes(m.userId), "checked")}><span>${S.user(m.userId).name}</span></label>`)}
        <small>Only people whose role can see reports are listed. Giving parts are only shown to people who can see giving.</small>` : ""}</fieldset>
    <div class="btns"><button class="btn">Save report</button>${saved ? html`<button type="button" class="btn danger" data-act="rb-delete" data-id="${saved.id}">Delete</button>` : ""}</div></form>` };
};
/** Keeps what's typed when the form redraws for a new range or schedule. */
const rbRead = (f) => { const fd = new FormData(f), v = (n) => String(fd.get(n) ?? "");
  Object.assign(rbDraft, { name: v("name").trim().slice(0, 80), note: v("note").trim().slice(0, 500), range: REPORT_RANGES[v("range")] ? v("range") : "12w", campus: v("campus") || "all",
    parts: fd.getAll("parts"), freq: ["weekly", "monthly"].includes(v("freq")) ? v("freq") : "none", weekday: fd.has("weekday") ? +v("weekday") : rbDraft.weekday, monthday: fd.has("monthday") ? +v("monthday") : rbDraft.monthday,
    notify: fd.has("notify") || rbDraft.freq !== "none" ? fd.getAll("notify") : rbDraft.notify }); };
Inputs["rb-keep"] = (el) => { rbRead(el.form); const y = window.scrollY; render(); window.scrollTo(0, y); };
Actions["rb-all"] = (el) => { const boxes = $$(`input[name=parts][data-page="${el.dataset.page}"]`), on = !boxes.every((b) => b.checked); boxes.forEach((b) => { b.checked = on; }); };
Forms["rbuild"] = (d, f) => {
  rbRead(f); const r = rbDraft;
  if (!r.name) return formError(f, "Give the report a name.");
  if (!r.parts.length) return formError(f, "Choose at least one part.");
  const items = reportScoped(r.range, r.campus, () => customPages(r).flatMap((p) => reportCollect(p))).filter((i) => r.parts.includes(i.key));
  const rec = { name: r.name, note: r.note, range: r.range, campus: r.campus, parts: r.parts, freq: r.freq, weekday: r.weekday, monthday: r.monthday, notify: r.freq === "none" ? [] : r.notify, giving: items.some((i) => i.giving) };
  const saved = r.id !== "new" ? S.update("customReports", r.id, rec) : S.add("customReports", { ...rec, by: S.me().id, created: new Date().toISOString() });
  rbDraft = null; toast("Report saved"); go(`rview-custom:${saved.id}`);
};
Actions["rb-delete"] = (el) => openSheet("Delete this report?", html`<p>Its saved copies are kept until you delete them.</p><div class="btns"><button class="btn danger" data-act="rb-delete-yes" data-id="${el.dataset.id}">Delete</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>`);
Actions["rb-delete-yes"] = (el) => { S.remove("customReports", el.dataset.id); rbDraft = null; closeSheet(); toast("Report deleted"); go("reports-custom"); };

/** Runs a custom report: saves a copy with its numbers as they are now and tells the people chosen. */
function reportRun(r, period, auto = false) {
  const doc = customDoc(r), at = new Date().toISOString();
  const run = S.add("reportRuns", { reportId: r.id, name: r.name, period, at, by: S.me().id, auto, giving: doc.giving, doc });
  // Keep the last 12 copies of each report.
  S.list("reportRuns").filter((x) => x.reportId === r.id).sort((a, b) => b.at.localeCompare(a.at)).slice(12).forEach((x) => S.remove("reportRuns", x.id));
  const readers = new Set(reportReaders().filter((m) => !doc.giving || S.role(m.churchId, m.userId)?.perms?.["view.giving"] || S.isPrimary(m.churchId, m.userId)).map((m) => m.userId));
  (auto ? r.notify || [] : []).filter((u) => readers.has(u)).forEach((u) => notify(u, { kind: "report", title: `${r.name} is ready`, body: `Your ${r.freq === "weekly" ? "weekly" : "monthly"} report for ${S.church().name}.`, link: `#rview-run:${run.id}` }));
  return run;
}
Actions["rb-run"] = (el) => { const r = S.get("customReports", el.dataset.id); if (!r || !reportCanRun(r)) return; const run = reportRun(r, `manual-${Date.now()}`); toast("Copy saved"); go(`rview-run:${run.id}`); };
/** The day a scheduled report last came due (6 in the morning), or null when it isn't scheduled or hasn't come due yet. */
function reportDue(r, now = new Date()) {
  if (!["weekly", "monthly"].includes(r.freq)) return null;
  const d = new Date(now); d.setHours(6, 0, 0, 0);
  if (r.freq === "weekly") { d.setDate(d.getDate() - ((d.getDay() - (+r.weekday || 0) + 7) % 7)); if (d > now) d.setDate(d.getDate() - 7); }
  else { d.setDate(Math.min(+r.monthday || 1, 28)); if (d > now) d.setMonth(d.getMonth() - 1); }
  return r.created && d < new Date(r.created) ? null : isoDay(d);
}
/** Runs any scheduled report that has come due and hasn't run yet, as the person who has the app open. */
function reportAutorun() {
  try {
    if (!S.church() || !canReports() || (Backend.on && !Backend.ready)) return;
    S.list("customReports").forEach((r) => {
      const period = reportDue(r); if (!period || !reportCanRun(r)) return;
      if (S.list("reportRuns").some((x) => x.reportId === r.id && x.period === period)) return;
      reportRun(r, period, true);
      if (!(r.notify || []).includes(S.me().id)) toast(`${r.name} ran and was saved under Reports, Custom`);
    });
  } catch (e) { console.warn("report autorun", e); }
}
setTimeout(reportAutorun, 5000); setInterval(reportAutorun, 5 * 60e3);
