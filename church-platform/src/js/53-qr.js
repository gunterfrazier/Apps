// ---------- QR codes: make them (for people with permission) and scan them (everyone) ----------
// Codes point at a screen in the app, like #event-123 or #register-gathering-456, so scanning one opens it directly.

const appBase = () => IN_PREVIEW ? PLATFORM.appUrl : location.origin + location.pathname;
const appLink = (target) => `${appBase()}#${target}`;

function qrTargetGroups() {
  const c = S.church();
  const events = upcomingEvents(), gs = S.visible("gatherings", { ignoreCampus: true });
  return [
    ["App and pages", [[`church-${c.id}`, `Join ${c.name} in the app`], [`page-${c.id}`, "Our landing page"], [`give-${c.id}`, "Give"], [`live-${c.id}`, "Watch live"], [`events-${c.id}`, "Events calendar"], [`classes-${c.id}`, "Classes and Sunday school"], [`groups-${c.id}`, "Small groups"]]],
    ["Check in and out", [[`checkin-${c.id}`, "Kids check-in"], [`parents-${c.id}`, "Parent portal (check-in and pickup)"], [`serve-${c.id}`, "Volunteer check-in"]]],
    ["Events", events.flatMap((e) => [[`event-${e.id}`, e.title], ...(e.signup ? [[`register-event-${e.id}`, `${e.title}: sign up`]] : [])])],
    ["Classes and groups", gs.flatMap((g) => [[`gathering-${g.id}`, g.name], ...(g.registration !== "none" ? [[`register-gathering-${g.id}`, `${g.name}: register`]] : [])])],
  ].filter(([, list]) => list.length);
}
let qrState = { target: "", label: "", custom: "" };
Screens.qr = () => {
  if (!S.isMember() || !S.can("qr.create")) return { redirect: "ministry" };
  const groups = qrTargetGroups();
  const all = groups.flatMap(([, l]) => l);
  if (!qrState.target) qrState = { target: all[0][0], label: all[0][1], custom: "" };
  const url = qrState.target === "custom" ? qrState.custom : appLink(qrState.target);
  return {
    title: "QR codes", back: "ministry",
    body: html`<form class="panel" style="margin-top:16px" data-form="qr-make" novalidate>
        <label class="field" style="margin-top:0"><span>Where should it go?</span><select name="target" data-change="qr-target">${groups.map(([label, list]) => html`<optgroup label="${label}">${list.map(([k, l]) => html`<option value="${k}" ${attr(k === qrState.target, "selected")}>${l}</option>`)}</optgroup>`)}<option value="custom" ${attr(qrState.target === "custom", "selected")}>A web address</option></select></label>
        ${qrState.target === "custom" ? html`<label class="field"><span>Web address</span><input type="url" name="custom" value="${qrState.custom}" placeholder="https://" data-input="qr-custom"></label>` : ""}
        <label class="field"><span>Label under the code</span><input type="text" name="label" value="${qrState.label}" maxlength="60" data-input="qr-label"></label>
      </form>
      ${qrCard(url, qrState.label)}`,
  };
};
Inputs["qr-target"] = (el) => { qrState.target = el.value; qrState.label = el.value === "custom" ? "" : el.selectedOptions[0].textContent; render(); };
Inputs["qr-label"] = (el) => { qrState.label = el.value; const l = $("#qr-card .qr-label"); if (l) l.textContent = el.value; };
let qrCustomTimer = 0;
Inputs["qr-custom"] = (el) => { clearTimeout(qrCustomTimer); qrCustomTimer = setTimeout(() => { qrState.custom = el.value.trim(); render(); const i = $("input[name=custom]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 500); };
Forms["qr-make"] = () => {};

function qrCard(url, label) {
  if (!isUrl(url)) return html`<div class="panel" style="margin-top:12px"><p class="muted" style="margin:0">Enter a web address that starts with https://</p></div>`;
  return html`<div class="qr-card" id="qr-card"><div class="qr-art">${raw(qrSvg(url, { size: 260 }))}</div><p class="qr-label">${label}</p><p class="faint qr-url">${url}</p>
    <div class="btns" style="justify-content:center">
      <button class="btn" data-act="qr-png" data-url="${url}" data-label="${label}">${icon("download")}Download PNG</button>
      <button class="btn ghost" data-act="qr-svg" data-url="${url}" data-label="${label}">${icon("download")}SVG</button>
      <button class="btn ghost" data-act="copy" data-text="${url}" data-done="Link copied">${icon("copy")}Copy link</button>
      ${!IN_PREVIEW ? html`<button class="btn ghost" data-act="qr-print">Print</button>` : ""}</div></div>`;
}
Actions["qr-for"] = (el) => openSheet("QR code", qrCard(appLink(el.dataset.target), el.dataset.label || ""));
const qrFile = (label, ext) => `${slugify(label || "qr-code") || "qr-code"}.${ext}`;
Actions["qr-png"] = (el) => {
  const qr = qrCanvas(el.dataset.url, 12), label = el.dataset.label || "";
  const c = document.createElement("canvas"); c.width = qr.width; c.height = qr.height + (label ? 90 : 0);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(qr, 0, 0);
  if (label) { g.fillStyle = "#111"; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.fillText(label.slice(0, 40), c.width / 2, qr.height + 50, c.width - 40); }
  c.toBlob((blob) => blob && saveFile(qrFile(label, "png"), blob), "image/png");
};
Actions["qr-svg"] = (el) => saveFile(qrFile(el.dataset.label, "svg"), qrSvg(el.dataset.url, { size: 1024 }));
Actions["qr-print"] = () => { document.body.classList.add("print-qr"); window.print(); setTimeout(() => document.body.classList.remove("print-qr"), 500); };

// ---------- Scanner ----------
let jsqrLoading = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  jsqrLoading ||= new Promise((resolve, reject) => { const s = document.createElement("script"); s.src = "vendor/jsQR.js"; s.onload = () => resolve(window.jsQR); s.onerror = () => { jsqrLoading = null; reject(new Error("load")); }; document.head.appendChild(s); });
  return jsqrLoading;
}
async function decodeSource(source, w, h) {
  if ("BarcodeDetector" in window) {
    try { const det = new window.BarcodeDetector({ formats: ["qr_code"] }); const r = await det.detect(source); if (r[0]) return r[0].rawValue; } catch { /* fall through to jsQR */ }
  }
  const jsQR = await loadJsQR();
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(source, 0, 0, w, h);
  const r = jsQR(g.getImageData(0, 0, w, h).data, w, h);
  return r ? r.data : null;
}
let scanStream = null, scanResult = null;
function stopCamera() { scanStream?.getTracks().forEach((t) => t.stop()); scanStream = null; }
Screens.scan = () => {
  const camera = !IN_PREVIEW && navigator.mediaDevices?.getUserMedia;
  return {
    title: "Scan a QR code", back: "home",
    body: html`<p class="muted" style="margin-top:16px">Scan a code from a bulletin, a screen or a sign to open that event, class, registration or check-in.</p>
      ${camera ? html`<div class="scan-box"><video id="scan-video" playsinline muted></video><div class="scan-frame"></div></div>
        <div class="btns"><button class="btn" data-act="scan-start" id="scan-start">${icon("scan")}Start camera</button></div>` : ""}
      <div class="btns"><label class="btn ${camera ? "ghost" : ""}">${icon("image")}${camera ? "Scan a photo instead" : "Take or choose a photo"}<input type="file" accept="image/*" capture="environment" class="sr" data-change="scan-file"></label></div>
      ${IN_PREVIEW ? html`<p class="faint">The live camera works once the app is on its own website. Here, take a photo of the code.</p>` : ""}
      <div id="scan-result">${scanResult ? scanResultHtml(scanResult) : ""}</div>`,
    after() { if (location.hash !== "#scan") stopCamera(); },
  };
};
window.addEventListener("hashchange", () => { if (location.hash !== "#scan") stopCamera(); });
Actions["scan-start"] = async (el) => {
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const v = $("#scan-video"); v.srcObject = scanStream; await v.play(); el.hidden = true;
    const tick = async () => {
      if (!scanStream || !v.videoWidth) { if (scanStream) setTimeout(tick, 250); return; }
      const w = Math.min(640, v.videoWidth), h = Math.round(v.videoHeight * (w / v.videoWidth));
      let text = null; try { text = await decodeSource(v, w, h); } catch { /* keep trying */ }
      if (text) { stopCamera(); handleScan(text); } else setTimeout(tick, 250);
    };
    tick();
  } catch { toast("The camera couldn't start. Scan a photo instead."); }
};
Inputs["scan-file"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  try {
    const url = URL.createObjectURL(file); const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
    const text = await decodeSource(img, Math.round(img.width * scale), Math.round(img.height * scale));
    URL.revokeObjectURL(url);
    if (text) handleScan(text); else { scanResult = { none: true }; $("#scan-result").innerHTML = flat(scanResultHtml(scanResult)); }
  } catch { toast("That photo couldn't be read."); }
  el.value = "";
};
function handleScan(text) {
  const m = String(text).match(/#([a-z0-9-]+)\s*$/i);
  if (m && Screens[m[1].split("-")[0]]) { scanResult = null; toast("Opening"); go(m[1]); return; }
  scanResult = { text };
  const box = $("#scan-result"); if (box) box.innerHTML = flat(scanResultHtml(scanResult));
}
function scanResultHtml(r) {
  if (r.none) return html`<div class="panel"><p style="margin:0">No QR code found in that photo. Try again closer, with the whole code in view.</p></div>`;
  return html`<div class="panel"><b>Scanned</b><p style="overflow-wrap:anywhere">${r.text}</p><div class="btns">${isUrl(r.text) ? ext(r.text, "Open link", "btn sm", "link") : ""}<button class="btn ghost sm" data-act="copy" data-text="${r.text}">${icon("copy")}Copy</button></div></div>`;
}
