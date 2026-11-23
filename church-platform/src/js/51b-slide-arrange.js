// ---------- Arranging one slide: move and resize its words, zoom and move its photo ----------
// In a slide's Edit sheet, a live copy of the slide can be adjusted by hand: drag the words to move them and pinch to
// resize them; switch to the photo and drag to choose what part shows, pinch to zoom in. Works with a mouse too
// (drag, and Ctrl with the wheel to resize), and Reset puts things back. Story backgrounds use it to fine-tune where
// the words sit over a scene.

/** The arrange fields for the Edit slide sheet. */
function slideArrangeField(slide, design) {
  if (["black", "logo", "kids", "countdown", "qr"].includes(slide.kind)) return "";
  const w = design.words || {}, f = design.bgFit || {};
  return html`<div class="field sa"><span>Arrange this slide</span>
    <div class="seg sa-mode" role="group" aria-label="What to adjust"><button type="button" data-act="sa-mode" data-mode="words" aria-pressed="true">Words</button><button type="button" data-act="sa-mode" data-mode="photo" aria-pressed="false">Background photo</button></div>
    <div class="stage sa-stage" id="sa-stage" data-mode="words"></div>
    <small class="faint sa-tip">Drag the words to move them. Pinch (or Ctrl and scroll) to make them bigger or smaller.</small>
    <div class="btns"><button type="button" class="btn ghost sm" data-act="sa-reset">${icon("back")}Reset</button></div>
    <input type="hidden" name="wx" value="${+w.x || 0}"><input type="hidden" name="wy" value="${+w.y || 0}"><input type="hidden" name="ws" value="${+w.s || 1}">
    <input type="hidden" name="bx" value="${f.x ?? 50}"><input type="hidden" name="by" value="${f.y ?? 50}"><input type="hidden" name="bz" value="${+f.z || 1}"></div>`;
}
/** What the arrange fields add to a slide's saved design (nothing when left as it was). */
function slideArrangeFromForm(d, slideBg = "") {
  const out = {};
  const w = { x: Math.round(+d.wx * 10) / 10 || 0, y: Math.round(+d.wy * 10) / 10 || 0, s: Math.round(+d.ws * 100) / 100 || 1 };
  if (w.x || w.y || w.s !== 1) out.words = w;
  const f = { x: Math.round(+d.bx), y: Math.round(+d.by), z: Math.round(+d.bz * 100) / 100 || 1 };
  if ((d.bg || slideBg) && (f.x !== 50 || f.y !== 50 || f.z !== 1)) out.bgFit = f;
  return out;
}
let saJob = null;
function slideArrangeStart(form, slide) {
  if (!form?.querySelector("#sa-stage")) return;
  saJob = { form, slide, lastBg: null };
  slideArrangeDraw();
  // The background picker sets its field without an event, so look for a change while the sheet is open.
  clearInterval(slideArrangeStart.timer);
  slideArrangeStart.timer = setInterval(() => {
    if (!document.body.contains(form)) { clearInterval(slideArrangeStart.timer); saJob = null; return; }
    if (form.elements.bg?.value !== saJob.lastBg) slideArrangeDraw();
  }, 350);
}
const saVals = () => { const e = saJob.form.elements; return { wx: +e.wx.value, wy: +e.wy.value, ws: +e.ws.value, bx: +e.bx.value, by: +e.by.value, bz: +e.bz.value, bg: e.bg?.value || "" }; };
function slideArrangeDraw() {
  if (!saJob) return;
  const v = saVals(), stage = $("#sa-stage", saJob.form); saJob.lastBg = v.bg;
  const bg = v.bg || saJob.slide.bg || "", scene = bg && typeof bgSceneFor === "function" && bgSceneFor(bg);
  const s = { ...saJob.slide, bg, words: { x: v.wx, y: v.wy, s: v.ws }, bgFit: bg ? { x: v.bx, y: v.by, z: v.bz } : null, ...(v.bg ? (scene ? { bgZone: scene.zone, bgTone: scene.tone } : { bgZone: "", bgTone: "" }) : {}) };
  stage.innerHTML = flat(slideHtml(s));
  const photo = saJob.form.querySelector('[data-act=sa-mode][data-mode="photo"]');
  photo.disabled = !bg || isVideoUrl(bg);
  if (photo.disabled && stage.dataset.mode === "photo") Actions["sa-mode"]({ dataset: { mode: "words" } });
}
Actions["sa-mode"] = (el) => {
  const form = saJob?.form; if (!form) return;
  const stage = $("#sa-stage", form); stage.dataset.mode = el.dataset.mode;
  $$("[data-act=sa-mode]", form).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === el.dataset.mode)));
  form.querySelector(".sa-tip").textContent = el.dataset.mode === "photo"
    ? "Drag to choose which part of the photo shows. Pinch (or Ctrl and scroll) to zoom in."
    : "Drag the words to move them. Pinch (or Ctrl and scroll) to make them bigger or smaller.";
};
Actions["sa-reset"] = () => {
  const e = saJob?.form.elements; if (!e) return;
  const photo = $("#sa-stage", saJob.form).dataset.mode === "photo";
  if (photo) { e.bx.value = 50; e.by.value = 50; e.bz.value = 1; } else { e.wx.value = 0; e.wy.value = 0; e.ws.value = 1; }
  slideArrangeDraw();
};
document.addEventListener("pointerdown", (e) => {
  const stage = e.target.closest?.("#sa-stage");
  if (!stage || !saJob || Pinch.active || e.button > 0) return;
  e.preventDefault();
  const photo = stage.dataset.mode === "photo", w = stage.clientWidth, h = stage.clientHeight, v0 = saVals(), x0 = e.clientX, y0 = e.clientY, el = saJob.form.elements;
  const move = (ev) => {
    if (Pinch.active) return;
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (photo) {
      // Dragging the photo right shows more of its left side; the more it's zoomed in, the further it can go.
      el.bx.value = Math.max(0, Math.min(100, v0.bx - (dx / w) * 100 / Math.max(0.35, v0.bz - 0.65)));
      el.by.value = Math.max(0, Math.min(100, v0.by - (dy / h) * 100 / Math.max(0.35, v0.bz - 0.65)));
    } else {
      // Words move in slide-width units (cqw), so they land in the same place on any screen.
      el.wx.value = Math.max(-60, Math.min(60, v0.wx + (dx / w) * 100));
      el.wy.value = Math.max(-40, Math.min(40, v0.wy + (dy / w) * 100));
    }
    slideArrangeDraw();
  };
  const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up); };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
});
onPinch("#sa-stage", {
  start(target, stage) { if (!saJob) return null; const v = saVals(); return { photo: stage.dataset.mode === "photo", ws: v.ws, bz: v.bz }; },
  change(st, scale) {
    const el = saJob.form.elements;
    if (st.photo) el.bz.value = Math.max(1, Math.min(3, st.bz * scale));
    else el.ws.value = Math.max(0.5, Math.min(2.2, st.ws * scale));
    slideArrangeDraw();
  },
});
