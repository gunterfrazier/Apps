// ---------- Pinch and twist: two fingers to resize (and turn) things on touch screens ----------
// onPinch(rootSelector, { start, change, end }) lets an area take two-finger gestures. start(target, root) gets the
// element under the first finger and returns a state (or null to ignore); change(state, scale, turnDegrees) runs as
// the fingers move; end(state) when one lifts. While a pinch is on, Pinch.active is true, so one-finger drags in the
// same area can stand still. On a computer, a trackpad pinch (or Ctrl and the mouse wheel) does the same.

const Pinch = { active: false };
const pinchAreas = [];
function onPinch(root, handlers) { pinchAreas.push({ root, ...handlers }); }
(() => {
  const pts = new Map();
  let job = null;
  const geo = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  };
  const stop = () => {
    if (!job) return;
    const { area, state } = job; job = null;
    area.end?.(state);
    setTimeout(() => { Pinch.active = false; }, 0); // after the one-finger drag's own "up"
  };
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target });
    if (pts.size !== 2 || job) return;
    const [a, b] = [...pts.values()];
    for (const area of pinchAreas) {
      const ra = a.target.closest?.(area.root), rb = b.target.closest?.(area.root);
      if (!ra || ra !== rb) continue;
      const state = area.start(a.target, ra);
      if (!state) continue;
      const g = geo();
      job = { area, state, d0: g.d, a0: g.angle };
      Pinch.active = true;
      e.preventDefault();
      break;
    }
  }, true);
  document.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (!job || pts.size < 2) return;
    const g = geo();
    let turn = g.angle - job.a0; if (turn > 180) turn -= 360; if (turn < -180) turn += 360;
    job.area.change(job.state, g.d / job.d0, turn);
  }, true);
  const lift = (e) => { pts.delete(e.pointerId); if (pts.size < 2) stop(); };
  document.addEventListener("pointerup", lift, true);
  document.addEventListener("pointercancel", lift, true);
  // A trackpad pinch arrives as Ctrl and the wheel; so does Ctrl with a mouse wheel.
  let wheelJob = null, wheelTimer;
  document.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    const area = pinchAreas.find((a) => e.target.closest?.(a.root));
    if (!area) return;
    e.preventDefault();
    if (!wheelJob) {
      const state = area.start(e.target, e.target.closest(area.root));
      if (!state) return;
      wheelJob = { area, state, scale: 1 };
    }
    wheelJob.scale *= Math.exp(-e.deltaY / 400);
    wheelJob.area.change(wheelJob.state, wheelJob.scale, 0);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelJob?.area.end?.(wheelJob.state); wheelJob = null; }, 260);
  }, { passive: false });
})();
