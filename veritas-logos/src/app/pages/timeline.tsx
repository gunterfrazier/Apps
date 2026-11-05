import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { newId } from "../../core/guide";
import { BANDS, ERAS, formatSpan, formatYear, getTimelineItems, TIME_MAX, TIME_MIN, type Band, type TimeItem } from "../../core/timeline";
import { useData } from "../store";
import { ErrorNote, Loading, RefLink, RefText, Sheet, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";
import { SubNav } from "./people";

const LANE_LABELLED = 30;
const LANE_BARE = 14;
const LANE_POINT = 24;
const BAND_HEAD = 22;
const BAND_GAP = 8;
const LABEL_LANE_CAP = 20;
const BARE_LANE_CAP = 4;
const MILESTONE_PPY = 0.5;
const STAIR_MAX = 50;
const DOT = 10;
const MAX_PPY = 40;

const labelWidth = (s: string) => s.length * 6.3 + 6;

interface Placed { it: TimeItem; top: number; labelled: boolean }
interface Layout { placed: Placed[]; height: number; heads: { band: Band; top: number; count: number }[] }

/**
 * Puts each band's items on as few lanes as fit, using only what's near the view, so empty rows collapse.
 * Names show when they fit on a sensible number of lanes. Otherwise the row is a compact overview.
 */
function layoutBands(items: TimeItem[], ppy: number, bands: Set<Band>, from: number, to: number): Layout {
  const placed: Placed[] = [];
  const heads: Layout["heads"] = [];
  let y = 6;
  for (const band of BANDS) {
    if (!bands.has(band.id) || (band.id === "milestone" && ppy >= MILESTONE_PPY)) continue;
    const list = items.filter((i) => i.band === band.id && i.x2 >= from && i.x1 <= to).sort((a, b) => a.x1 - b.x1 || b.x2 - a.x2);
    if (!list.length) continue;
    heads.push({ band: band.id, top: y, count: list.length });
    y += BAND_HEAD;
    const px = (it: TimeItem) => (it.x1 - TIME_MIN) * ppy;
    const barW = (it: TimeItem) => (it.x1 === it.x2 ? DOT : Math.max(4, (it.x2 - it.x1) * ppy));
    const fullW = (it: TimeItem) => Math.max(barW(it), labelWidth(it.label) + (it.x1 === it.x2 ? DOT + 4 : 0));
    const pack = (w: (it: TimeItem) => number, cap: number) => {
      const ends: number[] = [];
      const lanes = new Map<TimeItem, number>();
      for (const it of list) {
        let lane = ends.findIndex((e) => e + 4 <= px(it));
        if (lane < 0) {
          if (ends.length < cap) lane = ends.push(-Infinity) - 1;
          else lane = ends.indexOf(Math.min(...ends));
        }
        ends[lane] = Math.max(ends[lane], px(it) + w(it));
        lanes.set(it, lane);
      }
      return { lanes, count: ends.length };
    };
    const withLabels = pack(fullW, Infinity);
    // Zoomed in, a crowded row of events reads best as a staircase of names.
    // Zoomed out, rows stay compact so the whole span fits on a phone.
    const cap = ppy < 0.2 ? (band.id === "milestone" ? 5 : 3) : LABEL_LANE_CAP;
    const labelled = withLabels.count <= cap || (ppy >= 1.5 && list.length <= STAIR_MAX);
    const chosen = labelled ? withLabels : pack(barW, BARE_LANE_CAP);
    const laneH = !labelled ? LANE_BARE : list[0].x1 === list[0].x2 ? LANE_POINT : LANE_LABELLED;
    for (const it of list) placed.push({ it, top: y + chosen.lanes.get(it)! * laneH, labelled });
    y += chosen.count * laneH + BAND_GAP;
  }
  return { placed, height: y + 6, heads };
}

function tickStep(ppy: number) {
  for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000]) if (s * ppy >= 64) return s;
  return 2000;
}

const dateLine = (it: TimeItem) => {
  const span = it.x2 - it.x1;
  return `${formatSpan(it.x1, it.x2)}${span > 0 ? ` (${span} ${span === 1 ? "year" : "years"})` : ""}`;
};

const ItemMark = memo(function ItemMark({ p, ppy, shift, picked, onPick }: { p: Placed; ppy: number; shift: number; picked: boolean; onPick: (it: TimeItem) => void }) {
  const { it, top, labelled } = p;
  const point = it.x1 === it.x2;
  const left = (it.x1 - TIME_MIN) * ppy;
  const width = point ? DOT : Math.max(4, (it.x2 - it.x1) * ppy);
  return (
    <button
      type="button"
      className={`tl-item band-${it.band} ${point ? "point" : "span"} ${labelled ? "labelled" : "bare"} ${it.estimated ? "estimated" : ""} ${picked ? "on" : ""}`}
      style={{ left, top, minWidth: width }}
      data-key={it.key}
      aria-label={`${it.label}, ${dateLine(it)}${it.estimated ? ", estimated" : ""}`}
      onClick={() => onPick(it)}
    >
      {labelled && <span className="tl-label" style={shift ? { transform: `translateX(${shift}px)` } : undefined}>{it.label}</span>}
      <span className="tl-mark" style={point ? undefined : { width }} />
    </button>
  );
});

function Chart({ items, enabled, picked, onPick, focus }: { items: TimeItem[]; enabled: Set<Band>; picked: string | null; onPick: (it: TimeItem) => void; focus: { x: number; span: number; n: number } | null }) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [view, setViewState] = useState<{ left: number; ppy: number }>({ left: TIME_MIN, ppy: 0 });
  const viewRef = useRef(view);
  const widthRef = useRef(0);
  const anim = useRef(0);
  const [tip, setTip] = useState<{ it: TimeItem; x: number; y: number } | null>(null);

  const minPpy = () => (widthRef.current || 320) / (TIME_MAX - TIME_MIN);
  const setView = (left: number, ppy: number) => {
    const p = Math.min(MAX_PPY, Math.max(minPpy(), ppy));
    const span = widthRef.current / p;
    const l = Math.max(TIME_MIN, Math.min(TIME_MAX - span, left));
    viewRef.current = { left: l, ppy: p };
    setViewState(viewRef.current);
  };
  const animateTo = (left: number, ppy: number) => {
    cancelAnimationFrame(anim.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setView(left, ppy);
    const from = viewRef.current;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 320);
      const e = k * (2 - k);
      // Scale eases on a log curve so a large zoom feels even.
      const p = Math.exp(Math.log(from.ppy) + (Math.log(ppy) - Math.log(from.ppy)) * e);
      setView(from.left + (left - from.left) * e, p);
      if (k < 1) anim.current = requestAnimationFrame(step);
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
      widthRef.current = w;
      setWidth(w);
      if (first) setView(TIME_MIN, w / (TIME_MAX - TIME_MIN));
      else setView(viewRef.current.left, viewRef.current.ppy);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!focus || !widthRef.current) return;
    const half = focus.span / 2;
    showRange(focus.x - half, focus.x + half);
  }, [focus?.n, width > 0]);

  // Pan with one finger or the mouse, pinch with two. Vertical swipes still scroll the page.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef({ startX: 0, left0: 0, moved: false, dist0: 0, ppy0: 0, anchor: 0 });
  const localX = (clientX: number) => clientX - root.current!.getBoundingClientRect().left;
  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cancelAnimationFrame(anim.current);
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
    pts.current.delete(e.pointerId);
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
  const margin = span * 0.25;
  // Lanes are worked out on stepped values, so they stay put during a small move and don't reshuffle every frame.
  const ppyStep = ppy ? Math.pow(1.12, Math.ceil(Math.log(ppy) / Math.log(1.12))) : 0;
  const windowStart = span ? Math.floor((left - margin) / margin) * margin : 0;
  const layout = useMemo(
    () => (ppyStep ? layoutBands(items, ppyStep, enabled, windowStart, windowStart + span * 1.75) : { placed: [], height: 200, heads: [] }),
    [items, enabled, ppyStep, windowStart],
  );
  const visible = layout.placed.filter((p) => p.it.x2 >= left - margin - labelWidth(p.it.label) / (ppy || 1) && p.it.x1 <= left + span + margin);
  // A long bar that starts off screen keeps its name in view.
  const shiftFor = (p: Placed) => {
    if (!p.labelled || p.it.x1 === p.it.x2 || p.it.x1 >= left) return 0;
    return Math.max(0, Math.min((left - p.it.x1) * ppy, (p.it.x2 - p.it.x1) * ppy - labelWidth(p.it.label)));
  };
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
  const offset = ppy ? -(left - TIME_MIN) * ppy : 0;

  const tipFor = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" || g.current.moved && pts.current.size) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-key]");
    const it = el ? items.find((i) => i.key === el.dataset.key) : null;
    if (!it) return setTip(null);
    const r = root.current!.getBoundingClientRect();
    setTip({ it, x: Math.min(e.clientX - r.left + 12, r.width - 220), y: e.clientY - r.top + 14 });
  };

  return (
    <>
      <div className="tl-controls" role="group" aria-label="Zoom the timeline">
        <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.8)}>−</button>
        <input
          type="range" min={0} max={1000} aria-label="Zoom level"
          value={ppy ? Math.round((Math.log(ppy / minPpy()) / Math.log(MAX_PPY / minPpy())) * 1000) : 0}
          onChange={(e) => { const p = minPpy() * Math.pow(MAX_PPY / minPpy(), Number(e.target.value) / 1000); const c = left + span / 2; setView(c - widthRef.current / p / 2, p); }}
        />
        <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => zoomAt(1.8)}>+</button>
        <span className="tl-range">{ppy ? `${formatYear(Math.round(left))} to ${formatYear(Math.round(left + span))}` : ""}</span>
      </div>
      <div className="tl-eras" role="group" aria-label="Jump to a period">
        {ERAS.map((e) => <button type="button" key={e.id} className="chip" onClick={() => showRange(e.from, e.to)}>{e.label}</button>)}
      </div>
      <div
        ref={root}
        className="tl-chart"
        tabIndex={0}
        role="group"
        aria-label="Interactive timeline. Drag to move, pinch or use the zoom buttons to zoom. Left and right arrow keys move it."
        onPointerDown={onDown}
        onPointerMove={(e) => { onMove(e); tipFor(e); }}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setTip(null)}
        onClickCapture={(e) => { if (g.current.moved) { e.stopPropagation(); e.preventDefault(); g.current.moved = false; } }}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("[data-key]")) zoomAt(2, localX(e.clientX)); }}
        onKeyDown={(e) => {
          const v = viewRef.current;
          if (e.key === "ArrowRight") { e.preventDefault(); setView(v.left + 60 / v.ppy, v.ppy); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); setView(v.left - 60 / v.ppy, v.ppy); }
          else if (e.key === "+" || e.key === "=") zoomAt(1.5);
          else if (e.key === "-") zoomAt(1 / 1.5);
        }}
      >
        <div className="tl-axis" aria-hidden="true">
          {ticks.map((t) => <span key={t} style={{ transform: `translateX(${(t - left) * ppy}px)` }}>{t <= 0 ? `${1 - t} BC` : `AD ${t}`}</span>)}
        </div>
        <div className="tl-plot" style={{ height: layout.height }}>
          <div className="tl-grid" aria-hidden="true">
            {ticks.map((t) => <i key={t} style={{ transform: `translateX(${(t - left) * ppy}px)` }} />)}
          </div>
          {layout.heads.map((h) => {
            const b = BANDS.find((x) => x.id === h.band)!;
            return <div key={h.band} className="tl-head" style={{ top: h.top }}><span className={`swatch band-${h.band}`} />{b.label}</div>;
          })}
          <div className="tl-layer" style={{ transform: `translateX(${offset}px)` }}>
            {visible.map((p) => <ItemMark key={p.it.key} p={p} ppy={ppy} shift={shiftFor(p)} picked={picked === p.it.key} onPick={onPick} />)}
          </div>
        </div>
        {tip && (
          <div className="tl-tip" style={{ left: Math.max(4, tip.x), top: tip.y }} role="presentation">
            <strong>{tip.it.label}</strong>
            <span>{dateLine(tip.it)}{tip.it.estimated ? ", estimated" : ""}</span>
          </div>
        )}
      </div>
    </>
  );
}

function Detail({ it, items, onPick, onClose }: { it: TimeItem; items: TimeItem[]; onPick: (i: TimeItem) => void; onClose: () => void }) {
  const { guides, activeGuideId, prefs } = useData();
  const alongside = items.filter((o) => o.band !== "milestone" && o.key !== it.key && o.x1 <= it.x2 && o.x2 >= it.x1).sort((a, b) => (a.band === it.band ? 0 : 1) - (b.band === it.band ? 0 : 1) || a.x1 - b.x1).slice(0, 14);
  const add = () => addSectionsToGuide(
    [{ id: newId(), kind: "crossrefs", heading: `${it.label}, ${formatSpan(it.x1, it.x2)}`, origin: "assembled", body: it.note ?? "Date from BibleData's chronology, counted from the ages and reigns Scripture gives.", items: it.refs.map((ref) => ({ ref, text: "" })) }],
    it.label, guides, activeGuideId, prefs.translation, prefs.lens,
  );
  return (
    <Sheet title={it.label} onClose={onClose}>
      <p className="tl-date">{dateLine(it)}{it.estimated && it.band !== "nt" && it.band !== "writer" ? ". Estimated in the source." : ""}</p>
      {it.ah && <p className="fine">Year {it.ah[0]}{it.ah[1] !== it.ah[0] ? ` to ${it.ah[1]}` : ""} counted from creation in BibleData.{it.ussherBc ? ` Ussher's Annals (1650) put this at ${it.ussherBc} BC.` : ""}</p>}
      {it.note && <p className="fine">{it.note}</p>}
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

export function TimelinePage({ at }: { at?: number | null }) {
  const { data, error } = useAsync(getTimelineItems, []);
  const [enabled, setEnabled] = useState<Set<Band>>(() => new Set(BANDS.map((b) => b.id)));
  const [pickedKey, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<{ x: number; span: number; n: number } | null>(at != null ? { x: at, span: 240, n: 1 } : null);
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
          <div className="tl-find">
            <input className="input" type="search" placeholder="Find a person, event or writer" aria-label="Find on the timeline" value={q} onChange={(e) => setQ(e.target.value)} />
            {matches.length > 0 && (
              <ul className="tl-matches">
                {matches.map((m) => <li key={m.key}><button type="button" onClick={() => goTo(m)}><strong>{m.label}</strong><span>{formatSpan(m.x1, m.x2)}</span></button></li>)}
              </ul>
            )}
          </div>
          <Chart items={listed} enabled={enabled} picked={pickedKey} onPick={(i) => setPicked(i.key)} focus={focus} />
          <div className="tl-legend" role="group" aria-label="Show or hide rows">
            {BANDS.filter((b) => b.id !== "milestone").map((b) => (
              <button type="button" key={b.id} className={`tl-toggle ${enabled.has(b.id) ? "on" : ""}`} aria-pressed={enabled.has(b.id)} title={b.hint} onClick={() => toggle(b.id)}>
                <span className={`swatch band-${b.id}`} />{b.label}
              </button>
            ))}
            <span className="tl-key"><span className="tl-mark estimated-key" />Estimated</span>
          </div>
          <p className="fine">Drag to move and pinch to zoom, or use the buttons. Tap anything to see its verses and how the date was reached.</p>
          <p className="fine">Old Testament dates come from BibleData, which adds up the ages and reigns Scripture gives. New Testament dates are Ussher's, from his Annals of 1650. Writers appear at the year their source gives, usually about when they died. These are one reading of the numbers. Many scholars date events differently, especially before the kings.</p>
          {data.excluded.map((e) => <p key={e.name} className="fine">{e.name} is left out because this data counts {e.source} years, while <RefLink refText={e.ref} /> says {e.verse}.</p>)}
          <details className="doctrine">
            <summary>All dates as a list</summary>
            <ul className="tl-list">
              {listed.filter((i) => i.band !== "milestone").map((i) => <li key={i.key}><button type="button" className="ref" onClick={() => goTo(i)}>{i.label}</button> <span className="fine">{dateLine(i)}</span></li>)}
            </ul>
          </details>
          {picked && <Detail it={picked} items={items} onPick={goTo} onClose={() => setPicked(null)} />}
        </>
      )}
    </div>
  );
}
