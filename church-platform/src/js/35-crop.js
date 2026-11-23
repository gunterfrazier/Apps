// ---------- Crop a picture in the app ----------
// Every image field has a Crop button. Drag the box to move it, drag its corners to resize, pick a shape, turn the
// picture a quarter turn, and apply. Transparent pictures (logos) stay transparent.

const CROP_SHAPES = [["free", "Free", 0], ["1:1", "Square", 1], ["16:9", "Wide", 16 / 9], ["4:3", "4:3", 4 / 3], ["3:1", "Banner", 3], ["4:5", "Tall", 4 / 5]];
let cropJob = null;

/** Opens the cropper on a picture; done(url) gets the cropped picture. */
async function openCropper(src, done) {
  const img = new Image();
  if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
  try { img.src = src; await img.decode(); } catch { toast("This picture couldn't be opened for cropping."); return; }
  cropJob = { img, done, rotate: 0, ratio: 0, box: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 } };
  openSheet("Crop picture", html`<div class="cropper">
    <div class="crop-shapes" role="group" aria-label="Shape">${CROP_SHAPES.map(([k, l], i) => html`<button type="button" class="chip" data-act="crop-shape" data-k="${k}" aria-pressed="${i === 0}">${l}</button>`)}</div>
    <div class="crop-stage" id="crop-stage"><canvas id="crop-canvas"></canvas><div class="crop-box" id="crop-box" tabindex="0" aria-label="Crop area. Use the arrow keys to move it, and Shift with the arrow keys to resize it.">
      ${["nw", "ne", "sw", "se"].map((h) => html`<span class="crop-h ${h}" data-h="${h}" aria-hidden="true"></span>`)}</div></div>
    <div class="btns"><button type="button" class="btn ghost sm" data-act="crop-rotate" data-by="-90">${icon("back")}Turn left</button><button type="button" class="btn ghost sm" data-act="crop-rotate" data-by="90">Turn right${icon("next")}</button><button type="button" class="btn ghost sm" data-act="crop-reset">Reset</button></div>
    <div class="btns"><button type="button" class="btn" data-act="crop-apply">${icon("check")}Apply crop</button><button type="button" class="btn ghost" data-act="close-sheet">Cancel</button></div>
  </div>`);
  requestAnimationFrame(cropDraw);
}
/** The picture as it stands after turning: a canvas at its own size. */
function cropSource() {
  const { img, rotate } = cropJob, turned = rotate % 180 !== 0;
  const cv = document.createElement("canvas");
  cv.width = turned ? img.naturalHeight : img.naturalWidth; cv.height = turned ? img.naturalWidth : img.naturalHeight;
  const ctx = cv.getContext("2d");
  ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(rotate * Math.PI / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return cv;
}
function cropDraw() {
  const stage = $("#crop-stage"), cv = $("#crop-canvas");
  if (!stage || !cropJob) return;
  const src = cropSource(), maxW = stage.clientWidth || 320, maxH = Math.min(420, innerHeight * 0.5);
  const scale = Math.min(maxW / src.width, maxH / src.height, 1);
  cv.width = Math.round(src.width * scale); cv.height = Math.round(src.height * scale);
  cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
  cropJob.view = { w: cv.width, h: cv.height };
  cropPlace();
}
/** Keeps the box inside the picture, at the chosen shape, and puts it on screen. */
function cropPlace() {
  const { box, ratio, view } = cropJob, el = $("#crop-box");
  if (!el || !view) return;
  if (ratio) {
    // Width over height in the picture's own pixels must equal the ratio.
    const want = ratio * view.h / view.w;
    if (box.w / box.h > want) box.w = box.h * want; else box.h = box.w / want;
    if (box.w > 1) { box.w = 1; box.h = 1 / want; } if (box.h > 1) { box.h = 1; box.w = want; }
  }
  box.w = Math.max(0.05, Math.min(1, box.w)); box.h = Math.max(0.05, Math.min(1, box.h));
  box.x = Math.max(0, Math.min(1 - box.w, box.x)); box.y = Math.max(0, Math.min(1 - box.h, box.y));
  const cv = $("#crop-canvas"), off = cv.offsetLeft;
  Object.assign(el.style, { left: `${off + box.x * view.w}px`, top: `${cv.offsetTop + box.y * view.h}px`, width: `${box.w * view.w}px`, height: `${box.h * view.h}px` });
}
Actions["crop-shape"] = (el) => {
  const [, , ratio] = CROP_SHAPES.find(([k]) => k === el.dataset.k);
  cropJob.ratio = ratio;
  $$("[data-act=crop-shape]").forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
  if (ratio) { cropJob.box = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }; }
  cropPlace();
};
Actions["crop-rotate"] = (el) => { cropJob.rotate = (cropJob.rotate + +el.dataset.by + 360) % 360; cropJob.box = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }; cropDraw(); };
Actions["crop-reset"] = () => { cropJob.rotate = 0; cropJob.box = { x: 0, y: 0, w: 1, h: 1 }; cropDraw(); };
Actions["crop-apply"] = () => {
  const job = cropJob; if (!job) return;
  const src = cropSource(), { box } = job;
  const sx = Math.round(box.x * src.width), sy = Math.round(box.y * src.height), sw = Math.round(box.w * src.width), sh = Math.round(box.h * src.height);
  const scale = Math.min(1, 1800 / Math.max(sw, sh));
  const out = document.createElement("canvas"); out.width = Math.max(1, Math.round(sw * scale)); out.height = Math.max(1, Math.round(sh * scale));
  out.getContext("2d").drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  let url;
  try { url = out.toDataURL("image/webp", 0.9); } catch { toast("This picture's site doesn't allow editing it here. Save it to your device and upload it instead."); return; }
  cropJob = null; closeSheet(true); job.done(url); toast("Cropped");
};
// Move the box by dragging it; resize by its corners.
document.addEventListener("pointerdown", (e) => {
  const boxEl = e.target.closest?.("#crop-box");
  if (!boxEl || !cropJob || Pinch.active) return;
  e.preventDefault();
  const handle = e.target.dataset.h || "", { view } = cropJob, start = { ...cropJob.box }, x0 = e.clientX, y0 = e.clientY;
  boxEl.setPointerCapture?.(e.pointerId);
  const move = (ev) => {
    if (Pinch.active) return; // two fingers resize the box instead
    const dx = (ev.clientX - x0) / view.w, dy = (ev.clientY - y0) / view.h, b = cropJob.box;
    if (!handle) { b.x = start.x + dx; b.y = start.y + dy; }
    else {
      if (handle.includes("e")) b.w = start.w + dx; if (handle.includes("s")) b.h = start.h + dy;
      if (handle.includes("w")) { b.w = start.w - dx; b.x = start.x + dx; } if (handle.includes("n")) { b.h = start.h - dy; b.y = start.y + dy; }
      if (cropJob.ratio) { const want = cropJob.ratio * view.h / view.w; b.h = b.w / want; if (handle.includes("n")) b.y = start.y + start.h - b.h; }
    }
    cropPlace();
  };
  const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
});
document.addEventListener("keydown", (e) => {
  if (e.target.id !== "crop-box" || !cropJob || !/^Arrow/.test(e.key)) return;
  e.preventDefault();
  const step = 0.02, b = cropJob.box, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (e.shiftKey) { b.w += d[0]; b.h += d[1] || (cropJob.ratio ? d[0] : 0); } else { b.x += d[0]; b.y += d[1]; }
  cropPlace();
});
addEventListener("resize", () => { if (cropJob && $("#crop-stage")) cropDraw(); });
/** The Crop button on an image field. */
Actions["crop-image"] = (el) => {
  const form = el.closest("form"), name = el.dataset.field, field = $(`input[name="${name}"]`, form);
  if (!field?.value) return;
  openCropper(field.value, (url) => {
    field.value = url; field.dispatchEvent(new Event("input", { bubbles: true }));
    const prev = $(`[data-preview="${name}"]`, form); if (prev) prev.innerHTML = `<img src="${url}" alt="">`;
    imageFieldChanged(form, name, url);
  });
};

// Two fingers on the picture resize the crop box around its middle (and Ctrl with the wheel on a computer).
onPinch("#crop-stage", {
  start() { return cropJob ? { box: { ...cropJob.box } } : null; },
  change(st, scale) {
    const b = cropJob.box, cx = st.box.x + st.box.w / 2, cy = st.box.y + st.box.h / 2;
    b.w = Math.max(0.05, Math.min(1, st.box.w * scale)); b.h = Math.max(0.05, Math.min(1, st.box.h * scale));
    b.x = cx - b.w / 2; b.y = cy - b.h / 2;
    cropPlace();
  },
});
