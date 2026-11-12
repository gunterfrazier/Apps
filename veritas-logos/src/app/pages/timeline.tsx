import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { newId } from "../../core/guide";
import { BANDS, CHURCH_BANDS, CHURCH_ERAS, CHURCH_MIN, ERAS, formatSpan, getTimelineItems, TIME_MAX, TIME_MIN, type Band, type TimeItem } from "../../core/timeline";
import { eventHash, getChronology, getChurchEvents, getCreedIndex, TRADITIONS, type ChronItem, type ChurchEvent } from "../../core/scholar";
import { getGlossary } from "../../core/glossary";
import { getWritingsIndex } from "../../core/writings";
import { navigate } from "../store";
import { CiteButton, Actions } from "./scholar-ui";
import { useData } from "../store";
import { ErrorNote, Loading, RefLink, RefText, Sheet, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";
import { SubNav } from "./people";

const LANE = 26;
/** A row too zoomed out for its names packs its marks closer, keeping their order. */
const LANE_TIGHT = 12;
const BAND_HEAD = 22;
const BAND_GAP = 10;
const DOT = 9;
const MAX_PPY = 40;
const MIN_LABEL = 34;
const SETTLE_MS = 180;
/** The narrowest phone the rows are packed for, so the layout doesn't depend on the screen. */
const PACK_WIDTH = 360;

const labelWidth = (s: string) => s.length * 6.3 + 8;
/** The name on the chart. In the kings and judges row, "Othniel judges" needs only "Othniel". */
const chartLabel = (it: TimeItem) => (it.band === "rule" ? it.label.replace(/ (judges|rules)$/, "") : it.label);

/** An item's lane in its row, and where the next item in that lane starts. */
interface Slot { it: TimeItem; lane: number; next: number }
/** What the chart draws: the Bible's span and rows, or the church's. */
interface ChartConfig { min: number; max: number; bands: { id: Band; label: string; hint: string }[]; eras: { id: string; label: string; from: number; to: number }[] }
const BIBLE_CHART: ChartConfig = { min: TIME_MIN, max: TIME_MAX, bands: BANDS, eras: ERAS };
const CHURCH_CHART: ChartConfig = {
  min: CHURCH_MIN, max: TIME_MAX, eras: CHURCH_ERAS,
  bands: [{ id: "milestone", label: "Landmarks", hint: "A few landmark events, named at every zoom" }, ...CHURCH_BANDS],
};
/** Each chart's last view this session, so coming back to it with Back finds it as you left it. */
const lastView = new Map<ChartConfig, { left: number; ppy: number }>();
/** Where the chart should go: a year and how many years to show. A soft focus leaves the view alone if the year is already on screen. */
export interface Focus { x: number; span: number; n: number; soft?: boolean }

/**
 * Puts every item on a lane in its row once, for the whole span, so nothing moves up or down while you drag or zoom.
 * Each name gets room before the next item in its lane. The room is enough to read it in full from a zoom level
 * chosen per row: the lowest that keeps the row to a few lanes.
 */
function packRows(items: TimeItem[], cfg: ChartConfig): { slots: Slot[]; fit: Map<Band, number> } {
  const slots: Slot[] = [];
  /** The zoom at which every name in the row has room to show in full. */
  const fit = new Map<Band, number>();
  const minP = PACK_WIDTH / (cfg.max - cfg.min);
  for (const band of cfg.bands) {
    const list = items.filter((i) => i.band === band.id).sort((a, b) => a.x1 - b.x1 || b.x2 - a.x2);
    if (!list.length) continue;
    const pack = (P: number) => {
      const ends: number[] = [];
      const lane = list.map((it) => {
        let l = ends.findIndex((e) => e <= it.x1);
        if (l < 0) l = ends.push(0) - 1;
        ends[l] = Math.max(it.x2 + 6 / P, it.x1 + (labelWidth(chartLabel(it)) + 6) / P);
        return l;
      });
      return { lane, count: ends.length, P };
    };
    // A crowded burst, like the New Testament's few years, may take up to 30 lanes so its names read at a period's zoom.
    const limit = Math.max(10, pack(MAX_PPY).count, Math.min(pack(4).count, 30));
    const chosen = [minP, 0.25, 0.5, 1, 2, 4, 8, 16, MAX_PPY].map(pack).find((r) => r.count <= limit)!;
    const last: Slot[] = [];
    list.forEach((it, i) => {
      const s: Slot = { it, lane: chosen.lane[i], next: Infinity };
      const prev = last[s.lane];
      if (prev) prev.next = it.x1;
      last[s.lane] = s;
      slots.push(s);
    });
    fit.set(band.id, chosen.P);
  }
  return { slots, fit };
}

/**
 * Each row's lanes in use around the view, in their fixed order, and their spacing. Unused lanes close up, but
 * an item that sits above another always stays above it. A row with nothing near the view gets no space.
 */
type Rows = Map<Band, { lanes: number[]; pitch: number }>;
function rowsFor(packed: ReturnType<typeof packRows>, left: number, span: number, ppy: number): Rows {
  const used = new Map<Band, Set<number>>();
  const from = left - span * 0.05, to = left + span * 1.05;
  for (const s of packed.slots) {
    if (s.it.x2 < from || s.it.x1 > to) continue;
    const set = used.get(s.it.band) ?? new Set<number>();
    set.add(s.lane);
    used.set(s.it.band, set);
  }
  const out: Rows = new Map();
  // A row of many lanes packs tighter still when zoomed out, so an overview of a crowded few years stays short.
  for (const [b, set] of used) out.set(b, { lanes: [...set].sort((x, y) => x - y), pitch: ppy < packed.fit.get(b)! / 4 ? Math.round(Math.max(6, Math.min(LANE_TIGHT, 140 / set.size))) : LANE });
  return out;
}
const sameRows = (a: Rows, b: Rows) => a.size === b.size && [...a].every(([k, v]) => { const w = b.get(k); return w?.pitch === v.pitch && w.lanes.join() === v.lanes.join(); });

function tickStep(ppy: number) {
  for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000]) if (s * ppy >= 64) return s;
  return 2000;
}

const dateLine = (it: TimeItem) => {
  const span = it.x2 - it.x1;
  return `${formatSpan(it.x1, it.x2)}${span > 0 ? ` (${span} ${span === 1 ? "year" : "years"})` : ""}`;
};

/** The period the view is mostly in, or the first one ("all of it") when the view is wide. */
function periodOf(cfg: ChartConfig, left: number, span: number) {
  const [all, ...list] = cfg.eras;
  if (!span || span >= (cfg.max - cfg.min) * 0.6) return all;
  const c = left + span / 2;
  const fit = (e: ChartConfig["eras"][number]) => {
    const over = Math.max(0, Math.min(e.to, left + span) - Math.max(e.from, left));
    return over / (Math.max(e.to, left + span) - Math.min(e.from, left));
  };
  const near = list.filter((e) => e.from <= c && c <= e.to);
  return (near.length ? near : list).reduce((a, b) => (fit(b) > fit(a) ? b : a));
}

function Chart({ items, picked, onPick, focus, cfg }: { items: TimeItem[]; picked: string | null; onPick: (it: TimeItem) => void; focus: Focus | null; cfg: ChartConfig }) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [view, setViewState] = useState<{ left: number; ppy: number }>({ left: cfg.min, ppy: 0 });
  const viewRef = useRef(view);
  const widthRef = useRef(0);
  const anim = useRef(0);
  const [tip, setTip] = useState<{ it: TimeItem; x: number; y: number } | null>(null);

  const minPpy = () => (widthRef.current || 320) / (cfg.max - cfg.min);
  const clampView = (left: number, ppy: number) => {
    const p = Math.min(MAX_PPY, Math.max(minPpy(), ppy));
    const span = widthRef.current / p;
    return { left: Math.max(cfg.min, Math.min(cfg.max - span, left)), ppy: p };
  };
  const setView = (left: number, ppy: number) => {
    viewRef.current = clampView(left, ppy);
    lastView.set(cfg, viewRef.current);
    setViewState(viewRef.current);
  };
  const [rows, setRows] = useState<Rows>(new Map());
  const packedRef = useRef<ReturnType<typeof packRows> | null>(null);
  const animating = useRef(false);
  const animateTo = (left: number, ppy: number) => {
    cancelAnimationFrame(anim.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setView(left, ppy);
    const from = viewRef.current;
    const start = performance.now();
    animating.current = true;
    // Rows change once, alongside the move, to fit where it ends.
    const to = clampView(left, ppy);
    if (packedRef.current) { const r = rowsFor(packedRef.current, to.left, widthRef.current / to.ppy, to.ppy); setRows((cur) => (sameRows(cur, r) ? cur : r)); }
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 320);
      const e = k * (2 - k);
      // Scale eases on a log curve so a large zoom feels even.
      const p = Math.exp(Math.log(from.ppy) + (Math.log(ppy) - Math.log(from.ppy)) * e);
      setView(from.left + (left - from.left) * e, p);
      if (k < 1) anim.current = requestAnimationFrame(step);
      else animating.current = false;
    };
    anim.current = requestAnimationFrame(step);
  };
  const showRange = (from: number, to: number, animate = true) => {
    const p = (widthRef.current || 320) / Math.max(to - from, 1);
    (animate ? animateTo : setView)(from, p);
  };

  useLayoutEffect(() => {
    const el = root.current!;
    const measure = () => {
      const w = el.clientWidth;
      if (!w || w === widthRef.current) return;
      const first = !widthRef.current;
      const v = viewRef.current;
      const centre = v.ppy ? v.left + widthRef.current / v.ppy / 2 : 0;
      widthRef.current = w;
      setWidth(w);
      const saved = lastView.get(cfg);
      if (first && saved) setView(saved.left, saved.ppy);
      else if (first) setView(cfg.min, w / (cfg.max - cfg.min));
      else setView(centre - w / v.ppy / 2, v.ppy);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!focus || !widthRef.current) return;
    const v = viewRef.current;
    if (focus.soft && v.ppy && focus.x >= v.left && focus.x <= v.left + widthRef.current / v.ppy) return;
    const half = focus.span / 2;
    showRange(focus.x - half, focus.x + half);
  }, [focus?.n, width > 0]);

  // Pan with one finger or the mouse, pinch with two. Vertical swipes still scroll the page.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef({ startX: 0, left0: 0, moved: false, dist0: 0, ppy0: 0, anchor: 0, ended: 0 });
  const localX = (clientX: number) => clientX - root.current!.getBoundingClientRect().left;
  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".tl-bar")) return;
    cancelAnimationFrame(anim.current);
    animating.current = false;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = viewRef.current;
    if (pts.current.size === 1) {
      g.current = { ...g.current, startX: e.clientX, left0: v.left, moved: false };
    } else if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      g.current.dist0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.current.ppy0 = v.ppy;
      g.current.anchor = v.left + localX((a.x + b.x) / 2) / v.ppy;
      g.current.moved = true;
    }
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = viewRef.current;
    if (pts.current.size === 1) {
      const dx = e.clientX - g.current.startX;
      if (!g.current.moved && Math.abs(dx) > 6) {
        g.current.moved = true;
        setTip(null);
        root.current?.setPointerCapture(e.pointerId);
        root.current?.classList.add("dragging");
      }
      if (g.current.moved) setView(g.current.left0 - dx / v.ppy, v.ppy);
    } else if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const p = g.current.ppy0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.current.dist0);
      const clamped = Math.min(MAX_PPY, Math.max(minPpy(), p));
      setView(g.current.anchor - localX((a.x + b.x) / 2) / clamped, clamped);
    }
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!pts.current.delete(e.pointerId)) return;
    if (g.current.moved) g.current.ended = performance.now();
    root.current?.classList.remove("dragging");
    if (pts.current.size === 1) {
      const [only] = [...pts.current.values()];
      g.current.startX = only.x;
      g.current.left0 = viewRef.current.left;
    }
  };

  const zoomAt = (factor: number, px?: number) => {
    const v = viewRef.current;
    const at = px ?? widthRef.current / 2;
    const p = Math.min(MAX_PPY, Math.max(minPpy(), v.ppy * factor));
    animateTo(v.left + at / v.ppy - at / p, p);
  };

  useEffect(() => {
    const el = root.current!;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const p = Math.min(MAX_PPY, Math.max(minPpy(), v.ppy * Math.exp(-e.deltaY * 0.01)));
        const at = localX(e.clientX);
        setView(v.left + at / v.ppy - at / p, p);
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        setView(v.left + e.deltaX / v.ppy, v.ppy);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const { left, ppy } = view;
  const span = width && ppy ? width / ppy : 0;
  const packed = useMemo(() => packRows(items, cfg), [items, cfg]);

  // Rows show only the lanes in use around the view. They stay still while the view moves, and close up or open
  // out with a short slide once it rests, even with a finger still down. Nothing ever changes order.
  packedRef.current = packed;
  const settle = useRef(0);
  useLayoutEffect(() => { if (span) setRows(rowsFor(packed, left, span, ppy)); }, [packed, span > 0]);
  useLayoutEffect(() => {
    if (!span) return;
    clearTimeout(settle.current);
    const apply = () => {
      if (animating.current) { settle.current = window.setTimeout(apply, 120); return; }
      const v = viewRef.current;
      const now = rowsFor(packed, v.left, widthRef.current / v.ppy, v.ppy);
      setRows((cur) => (sameRows(cur, now) ? cur : now));
    };
    settle.current = window.setTimeout(apply, SETTLE_MS);
  }, [left, ppy, packed]);
  useEffect(() => () => clearTimeout(settle.current), []);

  const tops = new Map<Band, number>();
  const heads: { band: Band; top: number }[] = [];
  let y = 6;
  for (const band of cfg.bands) {
    const r = rows.get(band.id);
    if (!r) continue;
    heads.push({ band: band.id, top: y });
    tops.set(band.id, y + BAND_HEAD);
    y += BAND_HEAD + r.lanes.length * r.pitch + BAND_GAP;
  }
  const height = Math.max(y + 4, 120);

  const xOf = (v: number) => (v - cfg.min) * ppy;
  const viewX = xOf(left);
  const visible = ppy ? packed.slots.filter((s) => tops.has(s.it.band) && rows.get(s.it.band)!.lanes.includes(s.lane) && s.it.x2 >= left - 40 / ppy && s.it.x1 <= left + span + 4 / ppy) : [];

  const step = tickStep(ppy || 0.05);
  // Ticks fall on round calendar years, which don't line up across the BC to AD change because there's no year zero.
  const ticks: number[] = [];
  if (ppy) {
    const right = left + span + step;
    for (let bc = Math.ceil((1 - Math.min(0, right)) / step) * step; 1 - bc >= left - step && bc > 0; bc += step) ticks.push(1 - bc);
    for (let ad = Math.max(step, Math.ceil(left / step) * step); ad <= right; ad += step) ticks.push(ad);
    if (step >= 10 && left <= 1 && right >= 1 && !ticks.includes(1)) ticks.push(1);
    ticks.sort((a, b) => a - b);
  }

  const tipFor = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" || g.current.moved && pts.current.size) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-key]");
    const it = el ? items.find((i) => i.key === el.dataset.key) : null;
    if (!it) return setTip(null);
    const r = root.current!.getBoundingClientRect();
    setTip({ it, x: Math.min(e.clientX - r.left + 12, r.width - 220), y: e.clientY - r.top + 14 });
  };

  const period = periodOf(cfg, left, span);
  const periods = cfg.eras.slice(1);
  const at = periods.findIndex((e) => e.id === period.id);
  const prev = at > 0 ? periods[at - 1] : null;
  const next = at < 0 ? periods[0] : periods[at + 1] ?? null;

  return (
    <div
      ref={root}
      className="tl-chart"
      tabIndex={0}
      role="group"
      aria-label="Interactive timeline. Pick a period or step through them with the arrows. Drag to move, pinch or use the zoom buttons to zoom. Left and right arrow keys move it."
      onPointerDown={onDown}
      onPointerMove={(e) => { onMove(e); tipFor(e); }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => setTip(null)}
      // The click that ends a drag or pinch doesn't open anything. A tap afterwards does.
      onClickCapture={(e) => { if (g.current.moved && !pts.current.size && performance.now() - g.current.ended < 350 && !(e.target as HTMLElement).closest(".tl-bar")) { e.stopPropagation(); e.preventDefault(); } g.current.moved = false; }}
      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("[data-key], .tl-bar")) zoomAt(2, localX(e.clientX)); }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest(".tl-bar")) return;
        const v = viewRef.current;
        if (e.key === "ArrowRight") { e.preventDefault(); setView(v.left + 60 / v.ppy, v.ppy); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); setView(v.left - 60 / v.ppy, v.ppy); }
        else if (e.key === "+" || e.key === "=") zoomAt(1.5);
        else if (e.key === "-") zoomAt(1 / 1.5);
      }}
    >
      <div className="tl-top">
        <div className="tl-bar" role="group" aria-label="Move through the timeline">
          <button type="button" className="icon-btn" aria-label={prev ? `Earlier: ${prev.label}` : "Earlier period"} disabled={!prev} onClick={() => prev && showRange(prev.from, prev.to)}>‹</button>
          <select aria-label="Period" value={period.id} onChange={(e) => { const p = cfg.eras.find((x) => x.id === e.target.value)!; showRange(p.from, p.to); }}>
            {cfg.eras.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <button type="button" className="icon-btn" aria-label={next ? `Later: ${next.label}` : "Later period"} disabled={!next} onClick={() => next && showRange(next.from, next.to)}>›</button>
          <span className="tl-zoom">
            <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.8)}>−</button>
            <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => zoomAt(1.8)}>+</button>
          </span>
        </div>
        <div className="tl-axis" aria-hidden="true">
          {ticks.map((t) => <span key={t} style={{ transform: `translateX(${(t - left) * ppy}px)` }}>{t <= 0 ? `${1 - t} BC` : `AD ${t}`}</span>)}
        </div>
      </div>
      <div className="tl-plot" style={{ height }}>
        <div className="tl-grid" aria-hidden="true">
          {ticks.map((t) => <i key={t} style={{ transform: `translateX(${(t - left) * ppy}px)` }} />)}
        </div>
        {heads.map((h) => {
          const b = cfg.bands.find((x) => x.id === h.band)!;
          return <div key={h.band} className="tl-head" style={{ top: h.top }}><span className={`swatch band-${h.band}`} />{b.label}</div>;
        })}
        <div className="tl-layer" style={{ transform: `translateX(${-viewX}px)` }}>
          {visible.map((s) => {
            const { it } = s;
            const point = it.x1 === it.x2;
            const markL = xOf(it.x1) - (point ? DOT / 2 : 0);
            const markW = point ? DOT : Math.max(3, (it.x2 - it.x1) * ppy);
            // A bar that starts off screen keeps its name at the left edge. A dot off screen takes its name with it.
            const labelX = point ? markL : Math.max(markL, viewX + 4);
            // Room runs to the next item in the lane or the chart's edge, whichever comes first.
            const room = Math.min(s.next === Infinity ? Infinity : xOf(s.next) - 6, viewX + width - 4) - labelX;
            const { pitch, lanes } = rows.get(it.band)!;
            // A name goes with its mark: none for a dot off screen, or for a bar that has all but left the screen.
            const onScreen = point ? markL >= viewX : markL + markW >= viewX + 16;
            const showLabel = pitch === LANE && room >= MIN_LABEL && onScreen;
            const name = chartLabel(it);
            const labelW = showLabel ? Math.min(labelWidth(name), room) : 0;
            return (
              <button
                type="button"
                key={it.key}
                className={`tl-item band-${it.band} ${point ? "point" : "span"} ${pitch === LANE ? "" : pitch < 10 ? "tight tighter" : "tight"} ${it.estimated ? "estimated" : ""} ${picked === it.key ? "on" : ""}`}
                style={{ left: markL, top: tops.get(it.band)! + lanes.indexOf(s.lane) * pitch, width: Math.max(markW, pitch === LANE ? 22 : 12, labelX - markL + labelW), height: pitch === LANE ? undefined : pitch }}
                data-key={it.key}
                aria-label={`${it.label}, ${dateLine(it)}${it.estimated ? ", estimated" : ""}`}
                onClick={() => onPick(it)}
              >
                {showLabel && <span className="tl-label" style={{ left: labelX - markL, maxWidth: room }}>{name}</span>}
                <span className="tl-mark" style={point ? undefined : { width: markW }} />
              </button>
            );
          })}
        </div>
      </div>
      {tip && (
        <div className="tl-tip" style={{ left: Math.max(4, tip.x), top: tip.y }} role="presentation">
          <strong>{tip.it.label}</strong>
          <span>{dateLine(tip.it)}{tip.it.estimated ? ", estimated" : ""}</span>
        </div>
      )}
    </div>
  );
}

/** Scholars' differing dates for one item. */
function DatingViews({ item }: { item: ChronItem }) {
  return (
    <div className="note">
      <strong>Scholars date this differently</strong>
      <ul className="fine-list">
        {item.views.map((v) => <li key={v.label}><strong>{v.label}.</strong> {v.who} {v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.source}</a> : <span className="fine">{v.source}</span>}</li>)}
      </ul>
      <a className="link-btn" href="#dating">All disputed dates</a>
    </div>
  );
}

function Detail({ it, items, onPick, onClose, chron }: { it: TimeItem; items: TimeItem[]; onPick: (i: TimeItem) => void; onClose: () => void; chron?: ChronItem }) {
  const { guides, activeGuideId, prefs } = useData();
  const alongside = items.filter((o) => o.band !== "milestone" && o.key !== it.key && o.x1 <= it.x2 && o.x2 >= it.x1).sort((a, b) => (a.band === it.band ? 0 : 1) - (b.band === it.band ? 0 : 1) || a.x1 - b.x1).slice(0, 14);
  const add = () => addSectionsToGuide(
    [{ id: newId(), kind: "crossrefs", heading: `${it.label}, ${formatSpan(it.x1, it.x2)}`, origin: "assembled", body: it.note ?? "Date from BibleData's chronology, counted from the ages and reigns Scripture gives.", items: it.refs.map((ref) => ({ ref, text: "" })) }],
    it.label, guides, activeGuideId, prefs.translation, prefs.lens,
  );
  return (
    <Sheet title={it.label} onClose={onClose}>
      <p className="tl-date">{dateLine(it)}{it.estimated && it.ah && it.band !== "nt" && it.band !== "writer" ? ". Estimated in the source." : ""}</p>
      {it.ah && <p className="fine">Year {it.ah[0]}{it.ah[1] !== it.ah[0] ? ` to ${it.ah[1]}` : ""} counted from creation in BibleData.{it.ussherBc ? ` Ussher's Annals (1650) put this at ${it.ussherBc} BC.` : ""}</p>}
      {it.note && <p className="fine">{it.note}</p>}
      {chron && <DatingViews item={chron} />}
      {it.refs.length > 0 && <p>{it.refs.map((r, i) => <span key={r}>{i > 0 && " · "}<RefLink refText={r} /></span>)}</p>}
      {it.calc && <details className="doctrine"><summary>How the source reached this date</summary><p className="fine"><RefText text={it.calc.replace(/[A-Za-z-]+_\d+/g, (m) => m.replace(/_\d+$/, ""))} /></p></details>}
      <div className="action-row">
        {it.personId && <a className="btn small" href={`#person-${it.personId}`}>Person</a>}
        {it.personId && <a className="btn small" href={`#tree-${it.personId}`}>Family tree</a>}
        {it.writerId && <a className="btn small primary" href={`#writer-${it.writerId}`}>Read this writer</a>}
        {it.refs.length > 0 && <button type="button" className="btn small" onClick={add}>Add to guide</button>}
      </div>
      {alongside.length > 0 && (
        <>
          <h4>At the same time</h4>
          <div className="chips">{alongside.map((o) => <button type="button" key={o.key} className="chip" onClick={() => onPick(o)}>{o.label}</button>)}</div>
        </>
      )}
    </Sheet>
  );
}

const eventSpan = (e: ChurchEvent) => `${e.approx ? "About " : ""}${formatSpan(e.y1, e.y2 ?? e.y1)}`;

/** A church history event in full: the source first, then everything it connects to. */
export function EventDetail({ e, all, onPick }: { e: ChurchEvent; all: ChurchEvent[]; onPick: (e: ChurchEvent) => void }) {
  const { guides, activeGuideId, prefs } = useData();
  const writers = useAsync(async () => {
    const ix = await getWritingsIndex();
    return (e.writers ?? []).map((id) => ix.authors.find((a) => a.id === id)).filter(Boolean) as { id: string; name: string }[];
  }, [e.id]);
  const names = useAsync(async () => {
    const [terms, creeds] = await Promise.all([getGlossary(), getCreedIndex()]);
    return { terms: new Map(terms.map((t) => [t.id, t.term])), creeds: new Map(creeds.docs.map((d) => [d.id, d.name])) };
  }, []);
  const near = all.filter((o) => o.id !== e.id && Math.abs(o.y1 - e.y1) <= 25 && o.cat !== "turning").slice(0, 8);
  const related = all.filter((o) => e.related?.includes(o.id) || o.related?.includes(e.id));
  const add = () => addSectionsToGuide(
    [{ id: newId(), kind: "views", heading: `${e.title}, ${eventSpan(e)}`, origin: "assembled", items: [{ label: e.source, text: e.quote ?? e.summary }], body: e.summary }],
    e.title, guides, activeGuideId, prefs.translation, prefs.lens,
  );
  const trad = e.trad.includes("all") ? "Shared by all churches of the period" : e.trad.map((t) => TRADITIONS.find((x) => x.id === t)?.label ?? t).join(", ");
  return (
    <div className="event-detail">
      <p className="tl-date">{eventSpan(e)} · {CHURCH_BANDS.find((b) => b.id === e.cat)?.label}</p>
      <p>{e.summary}</p>
      {e.quote && <blockquote className="quote">“{e.quote}”</blockquote>}
      <p className="fine ex-source">{e.source}{e.page ? `, p. ${e.page}` : ""}. Summary written by Claude and checked against this source. {e.url && <a href={e.url} target="_blank" rel="noreferrer">Check the source</a>}</p>
      <p className="fine">{trad}.</p>
      <Actions>
        <button type="button" className="link-btn" onClick={add}>Add to guide</button>
        <CiteButton record={{ id: `event-${e.id}`, kind: e.sourceKind === "web" ? "web" : "section", title: e.source.replace(/^.*?“|”.*$/g, ""), container: e.source.split(", “")[0], pages: e.page, url: e.url }} />
      </Actions>
      {(e.refs?.length ?? 0) > 0 && <><h4>Scripture</h4><div className="chips">{e.refs!.map((r) => <RefLink key={r} refText={r} />)}</div></>}
      {(writers.data?.length ?? 0) > 0 && <><h4>Writers</h4><div className="chips">{writers.data!.map((w) => <a key={w.id} className="chip" href={`#writer-${w.id}`}>{w.name}</a>)}</div></>}
      {(e.creeds?.length ?? 0) > 0 && <><h4>Read the document</h4><div className="chips">{e.creeds!.map((c) => <a key={c} className="chip" href={`#creed-${c}`}>{names.data?.creeds.get(c) ?? c.replace(/-/g, " ")}</a>)}</div></>}
      {(e.terms?.length ?? 0) > 0 && <><h4>Terms</h4><div className="chips">{e.terms!.map((t) => <a key={t} className="chip" href={`#term-${t}`}>{names.data?.terms.get(t) ?? t.replace(/-/g, " ")}</a>)}</div></>}
      {related.length > 0 && <><h4>Connected events</h4><div className="chips">{related.map((o) => <button type="button" key={o.id} className="chip" onClick={() => onPick(o)}>{o.title}</button>)}</div></>}
      {near.length > 0 && <><h4>Around the same time</h4><div className="chips">{near.map((o) => <button type="button" key={o.id} className="chip" onClick={() => onPick(o)}>{o.title}</button>)}</div></>}
      {e.more === "josephus" && <p><a href="#josephus-war-6-4">Read Josephus's account</a></p>}
    </div>
  );
}

export function DatingPage() {
  const { data, error } = useAsync(getChronology, []);
  return (
    <div className="page">
      <h1 className="page-title">Disputed dates</h1>
      <p className="sub">Where scholars date events and books differently, with the reasoning and a source for each view. This app doesn't choose among them.</p>
      <SubNav active="timeline" />
      <ErrorNote error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <h3>Events</h3>
          {data.items.map((c) => (
            <article key={c.id} className="excerpt">
              <header><strong>{c.title}</strong></header>
              <ul className="fine-list">{c.views.map((v) => <li key={v.label}><strong>{v.label}.</strong> {v.who} {v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.source}</a> : v.source}</li>)}</ul>
              {c.refs && <div className="chips">{c.refs.map((r) => <RefLink key={r} refText={r} />)}</div>}
            </article>
          ))}
          <h3>When books were written</h3>
          {data.books.map((b) => (
            <article key={b.book} className="excerpt">
              <header><a className="ex-writer" href={`#book-${b.book.toLowerCase().replace(/\s+/g, "")}`}>{b.book}</a></header>
              <ul className="fine-list">{b.views.map((v) => <li key={v.label}><strong>{v.label}.</strong> {v.who} {v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.source}</a> : <RefText text={v.source} />}</li>)}</ul>
            </article>
          ))}
          <p className="fine">This list is a starting point, not a survey. The Wikipedia pages cited summarize mainstream scholarship, and traditional views are named from the texts they rely on.</p>
        </>
      )}
    </div>
  );
}

/** Councils, schisms, reformations, creeds and shifts, with the writers of each age alongside. */
/** Church history's landmark row: an event's title, and the shorter name it goes by on the row. */
const LANDMARKS: [string, string][] = [
  ["Destruction of Jerusalem", "Fall of Jerusalem"], ["Constantine and the Edict of Milan", "Edict of Milan"], ["First Council of Nicaea", "Nicaea"],
  ["Council of Chalcedon", "Chalcedon"], ["East-West Schism", "East-West Schism"], ["Fall of Constantinople", "Fall of Constantinople"],
  ["Luther's Ninety-five Theses", "Luther's theses"], ["Council of Trent", "Trent"], ["Second Vatican Council", "Vatican II"],
];

export function ChurchHistoryPage({ eventId }: { eventId?: string }) {
  const { data, error } = useAsync(async () => {
    const [events, ix] = await Promise.all([getChurchEvents(), getWritingsIndex()]);
    return { events, ix };
  }, []);
  const [enabled, setEnabled] = useState<Set<Band>>(() => new Set(["milestone", ...CHURCH_BANDS.filter((b) => b.id !== "writer").map((b) => b.id)]));
  const [trad, setTrad] = useState("any");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"chart" | "list">("chart");
  const [focus, setFocus] = useState<Focus | null>(null);
  const events = data?.events ?? [];
  const pick = events.find((e) => e.id === eventId) ?? null;
  const items = useMemo<TimeItem[]>(() => {
    const ev: TimeItem[] = events
      .filter((e) => trad === "any" || e.trad.includes(trad) || e.trad.includes("all"))
      .map((e) => ({ key: `ev-${e.id}`, band: e.cat as Band, label: e.title, x1: e.y1, x2: e.y2 ?? e.y1, estimated: Boolean(e.approx), refs: e.refs ?? [], eventId: e.id }));
    const writers: TimeItem[] = (data?.ix.authors ?? []).filter((w) => w.year && w.year > 0 && w.flag !== "pseudo" && w.n > 20).map((w) => ({ key: `w-${w.id}`, band: "writer", label: w.name, x1: w.year!, x2: w.year!, estimated: !w.dates, refs: [], writerId: w.id }));
    // A few events repeated on their own row, so the zoomed-out chart has names on it.
    const marks = LANDMARKS.map(([title, label]) => ev.find((i) => i.label === title)).filter(Boolean).map((i) => ({ ...i!, key: `m-${i!.key}`, band: "milestone" as Band, label: LANDMARKS.find(([t]) => t === i!.label)![1] }));
    return [...marks, ...ev, ...writers];
  }, [events, data, trad]);
  const shown = useMemo(() => items.filter((i) => enabled.has(i.band)), [items, enabled]);
  const s = q.trim().toLowerCase();
  const listed = useMemo(() => events.filter((e) => enabled.has(e.cat as Band) && (trad === "any" || e.trad.includes(trad) || e.trad.includes("all")) && (!s || `${e.title} ${e.summary} ${e.source}`.toLowerCase().includes(s))), [events, enabled, trad, s]);
  const matches = s.length >= 2 ? listed.slice(0, 8) : [];
  // An event opened from elsewhere brings the chart to it. One tapped on the chart leaves the view where it is.
  useEffect(() => { if (pick) setFocus((f) => ({ x: (pick.y1 + (pick.y2 ?? pick.y1)) / 2, span: 240, n: (f?.n ?? 0) + 1, soft: true })); }, [pick?.id]);
  const toggle = (b: Band) => setEnabled((x) => { const n = new Set(x); if (n.has(b)) n.delete(b); else n.add(b); return n; });
  const fromHere = useRef(false);
  const open = (e: ChurchEvent) => { fromHere.current = true; navigate(eventHash(e.id)); };
  // Closing an event opened here goes back to the page as it was, scrolled and zoomed where you left it.
  const close = () => {
    if (!fromHere.current) return navigate("church");
    fromHere.current = false;
    history.go(history.state?.sheet ? -2 : -1);
  };
  const byCentury = useMemo(() => {
    const m = new Map<number, ChurchEvent[]>();
    for (const e of listed) { const c = Math.floor((e.y1 - 1) / 100) + 1; m.set(c, [...(m.get(c) ?? []), e]); }
    return [...m];
  }, [listed]);
  return (
    <div className="page wide-page">
      <h1 className="page-title">Church history</h1>
      <p className="sub">Councils, schisms, reformations, creeds and theological shifts from the apostles to today. Tap any event to see its source, documents and the writers of that time.</p>
      <SubNav active="church" />
      <ErrorNote error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="filters">
            <div className="tl-find">
              <input className="input" type="search" placeholder="Find an event" aria-label="Find an event" value={q} onChange={(e) => setQ(e.target.value)} />
              {view === "chart" && matches.length > 0 && (
                <ul className="tl-matches">{matches.map((m) => <li key={m.id}><button type="button" onClick={() => { setQ(""); open(m); }}><strong>{m.title}</strong><span>{eventSpan(m)}</span></button></li>)}</ul>
              )}
            </div>
            <select aria-label="Tradition" value={trad} onChange={(e) => setTrad(e.target.value)}>
              <option value="any">Every tradition</option>
              {TRADITIONS.filter((t) => t.id !== "all").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <div className="segmented" role="group" aria-label="View">
              <button type="button" className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>Chart</button>
              <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
            </div>
          </div>
          {view === "chart" && <Chart items={shown} picked={pick ? `ev-${pick.id}` : null} cfg={CHURCH_CHART} focus={focus} onPick={(i) => { if (i.eventId) { fromHere.current = true; navigate(eventHash(i.eventId)); } else if (i.writerId) navigate(`writer-${i.writerId}`); }} />}
          <div className="tl-legend" role="group" aria-label="Show or hide rows">
            {CHURCH_BANDS.map((b) => (
              <button type="button" key={b.id} className={`tl-toggle ${enabled.has(b.id) ? "on" : ""}`} aria-pressed={enabled.has(b.id)} title={b.hint} onClick={() => toggle(b.id)}>
                <span className={`swatch band-${b.id}`} />{b.label}
              </button>
            ))}
          </div>
          {view === "list" && (
            <div className="event-list">
              {byCentury.map(([c, list]) => (
                <section key={c}>
                  <h3>{c === 1 ? "1st" : c === 2 ? "2nd" : c === 3 ? "3rd" : c === 21 ? "21st" : `${c}th`} century</h3>
                  {list.map((e) => (
                    <a key={e.id} href={`#${eventHash(e.id)}`} className="tool-row event-row" onClick={() => { fromHere.current = true; }}>
                      <span className="event-line"><span className={`swatch band-${e.cat}`} /><strong>{e.title}</strong></span>
                      <span>{eventSpan(e)}. {e.summary}</span>
                    </a>
                  ))}
                </section>
              ))}
              {!listed.length && <p className="empty">No event matches that.</p>}
            </div>
          )}
          {view === "chart" && <p className="fine">Pick a period or step through them with the arrows. Drag to move and pinch to zoom. Names appear as you zoom in. Landmarks repeat a few major events so the zoomed-out chart has names on it.</p>}
          <p className="fine">{events.length} events. Older events are checked against Schaff's History of the Christian Church or The Creeds of Christendom, and later ones against the web page each names. The list is a selection, and Schaff wrote from a Protestant point of view, so compare other histories for contested events.</p>
          {pick && <Sheet title={pick.title} onClose={close}><EventDetail e={pick} all={events} onPick={(e) => navigate(eventHash(e.id))} /></Sheet>}
        </>
      )}
    </div>
  );
}

export function TimelinePage({ at }: { at?: number | null }) {
  const { data: raw, error } = useAsync(getTimelineItems, []);
  const { data: chron } = useAsync(getChronology, []);
  const [dating, setDating] = useState<"source" | "modern">("source");
  // A few disputed dates can move to the date most scholars now use. Each one names its source.
  const matchChron = (label: string) => chron?.items.find((c) => new RegExp(c.match, "i").test(label));
  const data = useMemo(() => {
    if (!raw || dating === "source" || !chron) return raw;
    return { ...raw, items: raw.items.map((i) => { const c = matchChron(i.label); return c ? { ...i, x1: c.modernX, x2: c.modernX, estimated: true, ah: undefined, ussherBc: undefined, calc: undefined, note: "Shown at a common modern date. Switch Dating to see the date in the source." } : i; }) };
  }, [raw, dating, chron]);
  const [enabled, setEnabled] = useState<Set<Band>>(() => new Set(BANDS.map((b) => b.id)));
  const [pickedKey, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<Focus | null>(at != null ? { x: at, span: 240, n: 1 } : null);
  const items = data?.items ?? [];
  const picked = items.find((i) => i.key === pickedKey) ?? null;
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s.length < 2 ? [] : items.filter((i) => i.band !== "milestone" && i.label.toLowerCase().includes(s)).sort((a, b) => a.label.toLowerCase().indexOf(s) - b.label.toLowerCase().indexOf(s)).slice(0, 8);
  }, [items, q]);
  useEffect(() => { if (at != null) setFocus((f) => ({ x: at, span: 240, n: (f?.n ?? 0) + 1 })); }, [at]);

  const goTo = (it: TimeItem) => {
    setEnabled((s) => (s.has(it.band) ? s : new Set([...s, it.band])));
    setFocus((f) => ({ x: (it.x1 + it.x2) / 2, span: Math.max(120, (it.x2 - it.x1) * 1.6), n: (f?.n ?? 0) + 1 }));
    setPicked(it.key);
    setQ("");
  };
  const toggle = (b: Band) => setEnabled((s) => { const n = new Set(s); if (n.has(b)) n.delete(b); else n.add(b); return n; });
  const listed = useMemo(() => items.filter((i) => enabled.has(i.band)).sort((a, b) => a.x1 - b.x1), [items, enabled]);

  return (
    <div className="page wide-page">
      <h1 className="page-title">Timeline</h1>
      <SubNav active="timeline" />
      <ErrorNote error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="filters">
            <label className="field-inline">Dating
              <select aria-label="Dating" value={dating} onChange={(e) => setDating(e.target.value as "source" | "modern")}>
                <option value="source">As in the source (BibleData, Ussher)</option>
                <option value="modern">Common modern dates, where disputed</option>
              </select>
            </label>
            <a className="btn small" href="#dating">Disputed dates</a>
          </div>
          <div className="tl-find">
            <input className="input" type="search" placeholder="Find a person, event or writer" aria-label="Find on the timeline" value={q} onChange={(e) => setQ(e.target.value)} />
            {matches.length > 0 && (
              <ul className="tl-matches">
                {matches.map((m) => <li key={m.key}><button type="button" onClick={() => goTo(m)}><strong>{m.label}</strong><span>{formatSpan(m.x1, m.x2)}</span></button></li>)}
              </ul>
            )}
          </div>
          <Chart items={listed} picked={pickedKey} onPick={(i) => setPicked(i.key)} focus={focus} cfg={BIBLE_CHART} />
          <div className="tl-legend" role="group" aria-label="Show or hide rows">
            {BANDS.filter((b) => b.id !== "milestone").map((b) => (
              <button type="button" key={b.id} className={`tl-toggle ${enabled.has(b.id) ? "on" : ""}`} aria-pressed={enabled.has(b.id)} title={b.hint} onClick={() => toggle(b.id)}>
                <span className={`swatch band-${b.id}`} />{b.label}
              </button>
            ))}
            <span className="tl-key"><span className="tl-mark estimated-key" />Estimated</span>
          </div>
          <p className="fine">Pick a period or step through them with the arrows. Drag to move and pinch to zoom. Names appear as you zoom in. Tap anything to see its verses and how the date was reached.</p>
          <p className="fine">By default, Old Testament dates come from BibleData, which adds up the ages and reigns Scripture gives. New Testament dates are Ussher's, from his Annals of 1650. Scholars date many of these differently, so use Dating above or open Disputed dates. Writers appear at the year their source gives, usually about when they died. These are one reading of the numbers. Many scholars date events differently, especially before the kings.</p>
          {data.excluded.map((e) => <p key={e.name} className="fine">{e.name} is left out because this data counts {e.source} years, while <RefLink refText={e.ref} /> says {e.verse}.</p>)}
          <details className="doctrine">
            <summary>All dates as a list</summary>
            <ul className="tl-list">
              {listed.filter((i) => i.band !== "milestone").map((i) => <li key={i.key}><button type="button" className="ref" onClick={() => goTo(i)}>{i.label}</button> <span className="fine">{dateLine(i)}</span></li>)}
            </ul>
          </details>
          {picked && <Detail it={picked} items={items} onPick={goTo} onClose={() => setPicked(null)} chron={matchChron(picked.label)} />}
        </>
      )}
    </div>
  );
}
