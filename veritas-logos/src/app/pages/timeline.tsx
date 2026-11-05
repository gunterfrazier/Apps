import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { newId } from "../../core/guide";
import { BANDS, CHURCH_BANDS, CHURCH_ERAS, CHURCH_MIN, ERAS, formatSpan, formatYear, getTimelineItems, TIME_MAX, TIME_MIN, type Band, type TimeItem } from "../../core/timeline";
import { eventHash, getChronology, getChurchEvents, getCreedIndex, TRADITIONS, type ChronItem, type ChurchEvent } from "../../core/scholar";
import { getGlossary } from "../../core/glossary";
import { getWritingsIndex } from "../../core/writings";
import { navigate } from "../store";
import { CiteButton, Actions } from "./scholar-ui";
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
/** What the chart draws: the Bible's span and rows, or the church's. */
interface ChartConfig { min: number; max: number; bands: { id: Band; label: string; hint: string }[]; eras: { id: string; label: string; from: number; to: number }[] }
const BIBLE_CHART: ChartConfig = { min: TIME_MIN, max: TIME_MAX, bands: BANDS, eras: ERAS };
const CHURCH_CHART: ChartConfig = { min: CHURCH_MIN, max: TIME_MAX, bands: CHURCH_BANDS, eras: CHURCH_ERAS };

/**
 * Puts each band's items on as few lanes as fit, using only what's near the view, so empty rows collapse.
 * Names show when they fit on a sensible number of lanes. Otherwise the row is a compact overview.
 */
function layoutBands(items: TimeItem[], ppy: number, bands: Set<Band>, from: number, to: number, cfg: ChartConfig): Layout {
  const placed: Placed[] = [];
  const heads: Layout["heads"] = [];
  let y = 6;
  for (const band of cfg.bands) {
    if (!bands.has(band.id) || (band.id === "milestone" && ppy >= MILESTONE_PPY)) continue;
    const list = items.filter((i) => i.band === band.id && i.x2 >= from && i.x1 <= to).sort((a, b) => a.x1 - b.x1 || b.x2 - a.x2);
    if (!list.length) continue;
    heads.push({ band: band.id, top: y, count: list.length });
    y += BAND_HEAD;
    const px = (it: TimeItem) => (it.x1 - cfg.min) * ppy;
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

const ItemMark = memo(function ItemMark({ p, ppy, shift, picked, onPick, min }: { p: Placed; ppy: number; shift: number; picked: boolean; onPick: (it: TimeItem) => void; min: number }) {
  const { it, top, labelled } = p;
  const point = it.x1 === it.x2;
  const left = (it.x1 - min) * ppy;
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

function Chart({ items, enabled, picked, onPick, focus, cfg }: { items: TimeItem[]; enabled: Set<Band>; picked: string | null; onPick: (it: TimeItem) => void; focus: { x: number; span: number; n: number } | null; cfg: ChartConfig }) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [view, setViewState] = useState<{ left: number; ppy: number }>({ left: cfg.min, ppy: 0 });
  const viewRef = useRef(view);
  const widthRef = useRef(0);
  const anim = useRef(0);
  const [tip, setTip] = useState<{ it: TimeItem; x: number; y: number } | null>(null);

  const minPpy = () => (widthRef.current || 320) / (cfg.max - cfg.min);
  const setView = (left: number, ppy: number) => {
    const p = Math.min(MAX_PPY, Math.max(minPpy(), ppy));
    const span = widthRef.current / p;
    const l = Math.max(cfg.min, Math.min(cfg.max - span, left));
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
      if (first) setView(cfg.min, w / (cfg.max - cfg.min));
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
    () => (ppyStep ? layoutBands(items, ppyStep, enabled, windowStart, windowStart + span * 1.75, cfg) : { placed: [], height: 200, heads: [] }),
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
  const offset = ppy ? -(left - cfg.min) * ppy : 0;

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
        {cfg.eras.map((e) => <button type="button" key={e.id} className="chip" onClick={() => showRange(e.from, e.to)}>{e.label}</button>)}
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
            const b = cfg.bands.find((x) => x.id === h.band)!;
            return <div key={h.band} className="tl-head" style={{ top: h.top }}><span className={`swatch band-${h.band}`} />{b.label}</div>;
          })}
          <div className="tl-layer" style={{ transform: `translateX(${offset}px)` }}>
            {visible.map((p) => <ItemMark key={p.it.key} p={p} ppy={ppy} shift={shiftFor(p)} picked={picked === p.it.key} onPick={onPick} min={cfg.min} />)}
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
export function ChurchHistoryPage({ eventId }: { eventId?: string }) {
  const { data, error } = useAsync(async () => {
    const [events, ix] = await Promise.all([getChurchEvents(), getWritingsIndex()]);
    return { events, ix };
  }, []);
  const [enabled, setEnabled] = useState<Set<Band>>(() => new Set(CHURCH_BANDS.filter((b) => b.id !== "writer").map((b) => b.id)));
  const [trad, setTrad] = useState("any");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"chart" | "list">("chart");
  const [focus, setFocus] = useState<{ x: number; span: number; n: number } | null>(null);
  const events = data?.events ?? [];
  const pick = events.find((e) => e.id === eventId) ?? null;
  const items = useMemo<TimeItem[]>(() => {
    const ev: TimeItem[] = events
      .filter((e) => trad === "any" || e.trad.includes(trad) || e.trad.includes("all"))
      .map((e) => ({ key: `ev-${e.id}`, band: e.cat as Band, label: e.title, x1: e.y1, x2: e.y2 ?? e.y1, estimated: Boolean(e.approx), refs: e.refs ?? [], eventId: e.id }));
    const writers: TimeItem[] = (data?.ix.authors ?? []).filter((w) => w.year && w.year > 0 && w.flag !== "pseudo" && w.n > 20).map((w) => ({ key: `w-${w.id}`, band: "writer", label: w.name, x1: w.year!, x2: w.year!, estimated: !w.dates, refs: [], writerId: w.id }));
    return [...ev, ...writers];
  }, [events, data, trad]);
  const shown = useMemo(() => items.filter((i) => enabled.has(i.band)), [items, enabled]);
  const s = q.trim().toLowerCase();
  const listed = useMemo(() => events.filter((e) => enabled.has(e.cat as Band) && (trad === "any" || e.trad.includes(trad) || e.trad.includes("all")) && (!s || `${e.title} ${e.summary} ${e.source}`.toLowerCase().includes(s))), [events, enabled, trad, s]);
  const matches = s.length >= 2 ? listed.slice(0, 8) : [];
  useEffect(() => { if (pick) setFocus((f) => ({ x: (pick.y1 + (pick.y2 ?? pick.y1)) / 2, span: 240, n: (f?.n ?? 0) + 1 })); }, [pick?.id]);
  const toggle = (b: Band) => setEnabled((x) => { const n = new Set(x); if (n.has(b)) n.delete(b); else n.add(b); return n; });
  const open = (e: ChurchEvent) => navigate(eventHash(e.id));
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
          {view === "chart" && <Chart items={shown} enabled={enabled} picked={pick ? `ev-${pick.id}` : null} cfg={CHURCH_CHART} focus={focus} onPick={(i) => { if (i.eventId) navigate(eventHash(i.eventId)); else if (i.writerId) navigate(`writer-${i.writerId}`); }} />}
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
                    <a key={e.id} href={`#${eventHash(e.id)}`} className="tool-row event-row">
                      <span className="event-line"><span className={`swatch band-${e.cat}`} /><strong>{e.title}</strong></span>
                      <span>{eventSpan(e)}. {e.summary}</span>
                    </a>
                  ))}
                </section>
              ))}
              {!listed.length && <p className="empty">No event matches that.</p>}
            </div>
          )}
          <p className="fine">{events.length} events. Older events are checked against Schaff's History of the Christian Church or The Creeds of Christendom, and later ones against the web page each names. The list is a selection, and Schaff wrote from a Protestant point of view, so compare other histories for contested events.</p>
          {pick && <Sheet title={pick.title} onClose={() => navigate("church")}><EventDetail e={pick} all={events} onPick={open} /></Sheet>}
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
          <Chart items={listed} enabled={enabled} picked={pickedKey} onPick={(i) => setPicked(i.key)} focus={focus} cfg={BIBLE_CHART} />
          <div className="tl-legend" role="group" aria-label="Show or hide rows">
            {BANDS.filter((b) => b.id !== "milestone").map((b) => (
              <button type="button" key={b.id} className={`tl-toggle ${enabled.has(b.id) ? "on" : ""}`} aria-pressed={enabled.has(b.id)} title={b.hint} onClick={() => toggle(b.id)}>
                <span className={`swatch band-${b.id}`} />{b.label}
              </button>
            ))}
            <span className="tl-key"><span className="tl-mark estimated-key" />Estimated</span>
          </div>
          <p className="fine">Drag to move and pinch to zoom, or use the buttons. Tap anything to see its verses and how the date was reached.</p>
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
