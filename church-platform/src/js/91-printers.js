// ---------- Printing: a printer for each job ----------
// A web page can only print to a device's default printer through the print dialog. With QZ Tray (qz.io), a small
// program on a Windows or Mac computer, the app can list that computer's printers and send each job to the one chosen
// for it: receipts to the receipt printer, tickets to the ticket printer, name tags to the label printer, reports to
// the office printer. Each kiosk or device keeps its choices in its own settings; a staff member's computer keeps them
// in this browser. Without QZ Tray, or if it isn't running, jobs open the print dialog instead.
// QZ Tray asks "Allow?" for each job unless the church adds its signing certificate under Admin, Printing; the matching
// private key stays on the server (the qz-sign function) and signs each request.

const PRINT_JOBS = {
  receipt: ["Receipts", { "80mm": ["80 mm receipt roll", 80, 0, "mm"], "58mm": ["58 mm receipt roll", 58, 0, "mm"], letter: ["Letter paper", 8.5, 11, "in"] }],
  ticket: ["Tickets", { "4x6": ["4 × 6 in label", 4, 6, "in"], "2x5.5": ["2 × 5.5 in ticket stock", 5.5, 2, "in"], letter: ["Letter paper", 8.5, 11, "in"] }],
  badge: ["Name tags and badges", { "4x2": ["4 × 2 in label", 4, 2, "in"], "2.25x1.25": ["2.25 × 1.25 in label", 2.25, 1.25, "in"], "62x29": ["62 × 29 mm label", 62, 29, "mm"] }],
  report: ["Reports", { letter: ["Letter paper", 8.5, 11, "in"], a4: ["A4 paper", 210, 297, "mm"] }],
};
const PRINT_KEY = "our-faithful-printers";
/** This device's choices: { printers: { receipt: "Star TSP100", ... }, sizes: { receipt: "80mm", ... }, seen: [...] }. */
function printPrefs() {
  const d = typeof thisDevice === "function" && thisDevice();
  if (d) return d.settings?.print || {};
  try { return JSON.parse(localStorage.getItem(PRINT_KEY) || "{}"); } catch { return {}; }
}
function printPrefsSave(p) {
  const d = thisDevice();
  if (d) { d.settings = { ...(d.settings || {}), print: p }; S.save(); devicePing(d, { settings: d.settings }); return; }
  try { localStorage.setItem(PRINT_KEY, JSON.stringify(p)); } catch {}
}
const jobSize = (job, key) => { const sizes = PRINT_JOBS[job][1], k = key || printPrefs().sizes?.[job] || Object.keys(sizes)[0]; return sizes[k] || Object.values(sizes)[0]; };

// ----- QZ Tray -----
let qzLoading = null;
function qzLoad() {
  if (window.qz) return Promise.resolve(window.qz);
  qzLoading ||= new Promise((resolve, reject) => { const s = document.createElement("script"); s.src = "vendor/qz-tray.js"; s.onload = () => resolve(window.qz); s.onerror = () => { qzLoading = null; reject(new Error("QZ Tray's script didn't load")); }; document.head.appendChild(s); });
  return qzLoading;
}
async function qzConnect() {
  const qz = await qzLoad();
  if (qz.websocket.isActive()) return qz;
  const c = S.church();
  if (c?.qzCert) {
    qz.security.setCertificatePromise((resolve) => resolve(c.qzCert));
    qz.security.setSignatureAlgorithm("SHA512");
    qz.security.setSignaturePromise((toSign) => (resolve, reject) => (Backend.on ? Backend.call("qz-sign", { action: "sign", churchId: c.id, request: toSign }).then((r) => resolve(r.signature)) : Promise.resolve(resolve())).catch(reject));
  } else {
    qz.security.setCertificatePromise((resolve) => resolve());
    qz.security.setSignaturePromise(() => (resolve) => resolve());
  }
  try { await qz.websocket.connect({ retries: 1, delay: 1 }); }
  catch { throw new Error("QZ Tray isn't running on this computer. Start it, or install it from qz.io/download"); }
  return qz;
}
const docFor = (inner, [, w, h, u], title = "") => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${svgEsc(title)}</title><style>@page{size:${w}${u} ${h ? `${h}${u}` : "auto"};margin:0}html,body{margin:0;padding:0;background:#fff}body{width:${w}${u}}svg{width:100%;height:auto;display:block}${PRINT_CSS}</style></head><body>${inner}</body></html>`;
// Name tags reuse the kiosk's label look; keep this in step with the .label rules in styles.css.
const PRINT_CSS = `.label{box-sizing:border-box;padding:6px 10px;font-family:system-ui,Arial,sans-serif;break-after:page;page-break-after:always;overflow:hidden}.lb-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.lb-name{font-weight:800;font-size:26px;line-height:1.05}.lb-name span{display:block;font-size:14px;font-weight:600}.lb-code{font:800 22px ui-monospace,monospace;border:2px solid #000;padding:2px 6px}.lb-alert{background:#000;color:#fff;font-weight:800;padding:2px 6px;margin-top:4px}.lb-note,.lb-kids{font-size:13px;margin-top:3px}.lb-foot{display:flex;justify-content:space-between;font-size:12px;margin-top:4px}`;

/**
 * Prints one job. job: receipt | ticket | badge | report. inner: the HTML to print. Uses the printer chosen for this job
 * on this device through QZ Tray, or the print dialog. o.size overrides the paper size key (a kiosk's label size).
 */
async function printJob(job, inner, o = {}) {
  const prefs = printPrefs(), printer = prefs.printers?.[job], size = jobSize(job, o.size);
  if (printer) {
    try {
      const qz = await qzConnect(), [, w, h, u] = size;
      const cfg = qz.configs.create(printer, { size: h ? { width: w, height: h } : { width: w }, units: u, scaleContent: true, margins: 0, rasterize: true });
      await qz.print(cfg, [{ type: "pixel", format: "html", flavor: "plain", data: docFor(inner, size, o.title) }]);
      toast(`Sent to ${printer}`); return true;
    } catch (e) { toast(`${e.message || "That printer didn't answer"}. Opening the print dialog instead.`); }
  }
  return printDialog(inner, size);
}
function printDialog(inner, [, w, h, u]) {
  if (IN_PREVIEW) { toast("Printing works once the app is on your own website. Save it to the device instead."); return false; }
  $("#print-job")?.remove(); $("#print-job-page")?.remove();
  const page = document.createElement("style"); page.id = "print-job-page";
  page.textContent = `@page { size: ${w}${u}${h ? ` ${h}${u}` : ""}; margin: ${h ? 0 : "4mm"}; } @media print { #print-job { width: ${w}${u}; } }`;
  const box = document.createElement("div"); box.id = "print-job"; box.innerHTML = inner;
  document.head.appendChild(page); document.body.appendChild(box); document.body.classList.add("print-job");
  const done = () => { box.remove(); page.remove(); document.body.classList.remove("print-job"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => { try { window.print(); } catch { done(); toast("Printing isn't available on this device"); } }, 60);
  return true;
}

// ----- Choosing printers on this device or computer -----
let printersFound = null;
Actions["printers-setup"] = () => printersSheet();
function printersSheet(note = "") {
  const prefs = printPrefs(), d = thisDevice(), list = printersFound || prefs.seen || [];
  openSheet(`Printers on this ${d ? "device" : "computer"}`, html`<form data-form="printers-save" novalidate>
    <p class="muted" style="margin-top:0">${d ? `${d.name}: ` : ""}choose where each kind of printing goes. Choosing a printer needs <a href="https://qz.io/download" target="_blank" rel="noopener">QZ Tray</a> running on this computer; without it, jobs open the print dialog.</p>
    ${note ? html`<p class="room-msg warn" role="alert">${icon("info")}<span>${note}</span></p>` : ""}
    <div class="btns"><button type="button" class="btn ghost sm" data-act="printers-find">${icon("search")}${list.length ? "Look for printers again" : "Find printers"}</button></div>
    ${Object.entries(PRINT_JOBS).map(([job, [label, sizes]]) => html`<fieldset class="field pj-row" style="border:0;padding:0"><legend class="flabel">${label}</legend><div class="pj-grid">
      <select name="p_${job}" aria-label="${label}: printer"><option value="">The print dialog</option>${[...new Set([...list, prefs.printers?.[job]].filter(Boolean))].map((p) => html`<option value="${p}" ${attr(prefs.printers?.[job] === p, "selected")}>${p}</option>`)}</select>
      <select name="s_${job}" aria-label="${label}: paper">${Object.entries(sizes).map(([k, [l]]) => html`<option value="${k}" ${attr((prefs.sizes?.[job] || Object.keys(sizes)[0]) === k, "selected")}>${l}</option>`)}</select></div></fieldset>`)}
    <div class="btns"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="printers-test">${icon("printer")}Print a test receipt</button></div></form>`, { wide: true });
}
Actions["printers-find"] = async () => {
  try { const qz = await qzConnect(); printersFound = (await qz.printers.find()).sort(); printPrefsSave({ ...printPrefs(), seen: printersFound }); printersSheet(printersFound.length ? "" : "QZ Tray is running but found no printers."); }
  catch (e) { printersSheet(e.message); }
};
Forms["printers-save"] = (d) => {
  const printers = {}, sizes = {};
  for (const job of Object.keys(PRINT_JOBS)) { printers[job] = d[`p_${job}`] || ""; sizes[job] = d[`s_${job}`] || ""; }
  printPrefsSave({ ...printPrefs(), printers, sizes }); closeSheet(true); toast("Printers saved");
};
Actions["printers-test"] = () => {
  const c = S.church() || { name: PLATFORM.name };
  printJob("receipt", `<div class="pj-receipt">${receiptSvg({ church: { name: c.name, color: c.color }, title: "Test receipt", lines: [["A test print", 0]], amount: 0, method: "Test", at: new Date().toISOString(), number: "TEST000001", qr: appLink("home"), test: true })}</div>`, { title: "Test" });
};

// ----- Admin, Printing: QZ Tray and the church's signing certificate -----
AdminScreens.printing = () => {
  const stop = guard("manage.devices"); if (stop) return stop;
  const c = S.church(), kiosks = S.list("devices").filter((d) => ["kiosk", "gate"].includes(d.type));
  return { title: "Printing", back: "admin", body: html`
    <p class="muted" style="margin-top:14px">Kiosks and computers can send receipts, tickets, name tags and reports each to their own printer. That needs <a href="https://qz.io/download" target="_blank" rel="noopener">QZ Tray</a> (free) on the Windows or Mac computer the printers are connected to. iPads and phones print with the print dialog.</p>
    <ol class="steps-list"><li>Install QZ Tray on the kiosk computer and leave it running (it starts with the computer).</li><li>Connect the printers to that computer, as you would for any program.</li>
      <li>On the kiosk, tap the lock in the corner, then <b>Printers</b>, and choose a printer for each job. On your own computer use the button below.</li></ol>
    <div class="btns"><button class="btn" data-act="printers-setup">${icon("printer")}Printers on this computer</button></div>
    <section class="sec"><h2 class="sec-head">Stop the "Allow" pop-ups</h2><form data-form="qz-cert" class="panel" novalidate>
      <p style="margin-top:0">QZ Tray asks before each job unless your church signs its requests. Make a certificate in QZ Tray (Advanced, Site Manager, +, Create New), then paste both files here. ${c.qzCert ? html`<span class="tag ok">Certificate saved</span>` : ""}</p>
      <label class="field"><span>Certificate (digital-certificate.txt)</span><textarea name="cert" rows="4" placeholder="-----BEGIN CERTIFICATE-----" spellcheck="false">${c.qzCert || ""}</textarea></label>
      <label class="field"><span>Private key (private-key.pem)</span><textarea name="key" rows="4" placeholder="-----BEGIN PRIVATE KEY-----" spellcheck="false" autocomplete="off"></textarea><small>Saved encrypted on the server and never shown again. Leave it empty to keep the one saved.</small></label>
      <div class="btns"><button class="btn">Save</button>${c.qzCert ? html`<button type="button" class="btn ghost" data-act="qz-cert-remove">Remove</button>` : ""}</div></form></section>
    ${kiosks.length ? html`<section class="sec"><h2 class="sec-head">Kiosks</h2><div class="rows">${kiosks.map((d) => { const p = d.settings?.print?.printers || {}, set = Object.entries(p).filter(([, v]) => v);
      return html`<button class="row" data-act="device-open" data-id="${d.id}"><span class="lead-ic">${icon("printer")}</span><span class="body"><span class="t">${d.name}</span><span class="s">${set.length ? set.map(([k, v]) => `${PRINT_JOBS[k][0]}: ${v}`).join(". ") : "The print dialog for everything"}</span></span>${icon("chev")}</button>`; })}</div></section>` : ""}` };
};
Forms["qz-cert"] = async (d, f) => {
  const cert = String(d.cert || "").trim(), key = String(d.key || "").trim(), c = S.church();
  if (cert && !/BEGIN CERTIFICATE/.test(cert)) return formError(f, "Paste the whole certificate, including the BEGIN CERTIFICATE line.");
  if (key && !/BEGIN (RSA )?PRIVATE KEY/.test(key)) return formError(f, "Paste the whole private key, including the BEGIN PRIVATE KEY line.");
  if (key && /BEGIN RSA PRIVATE KEY/.test(key)) return formError(f, "This key is in the older RSA format. Use the private-key.pem QZ Tray makes, which starts BEGIN PRIVATE KEY.");
  try { if (key && Backend.on && !practiceMode(c)) await Backend.call("qz-sign", { action: "set-key", churchId: c.id, key }); }
  catch (e) { return formError(f, e.message || "The key couldn't be saved."); }
  S.updateChurch({ qzCert: cert || null }); toast(key && !Backend.on ? "Saved. (The key is only kept on a live site.)" : "Saved"); render();
};
Actions["qz-cert-remove"] = async () => { const c = S.church(); try { if (Backend.on && !practiceMode(c)) await Backend.call("qz-sign", { action: "remove-key", churchId: c.id }); } catch {} S.updateChurch({ qzCert: null }); toast("Removed"); render(); };

// ----- Name tags and reports go through here too -----
printLabels = (records) => {
  if (!records.length) return;
  return printJob("badge", flat(labelsHtml(records)), { size: kiosk.size || thisDevice()?.settings?.labelSize, title: "Name tags" });
};
