import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { newId } from "../../core/guide";
import { buildSubgraph, describeRelationshipStep, findShortestPath, formatGenerations, getFigure, getSiblings, lineageFromAdam, parentLink, resolveFigures, stepLink, summarizePath } from "../../core/figure-graph";
import type { Figure, ParentLink } from "../../core/figure-types";
import { load } from "../../core/data";
import { GROUP_FILTERS, searchFigures, type GroupFilter } from "../../core/figure-search";
import { ensureFigures, versesOfPerson } from "../../core/people";
import { layoutTree, type LayoutDims } from "../../core/tree-layout";
import { navigate, update, useData } from "../store";
import { Empty, Loading, Paras, RefLink, RefText, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";

const DEFAULT_ID = "david-1";
const CREDIT = "People and summaries from STEPBible's TIPNR (CC BY 4.0), with BibleData (CC BY 4.0). Family claims from these, Theographic and ACAI (CC BY-SA 4.0) were tested against the tagged Hebrew and Greek, and the Bible decides. The people data is shared under CC BY-SA 4.0.";

const Ready = ({ children }: { children: () => ReactNode }) => {
  const { data, loading, error } = useAsync(async () => { await ensureFigures(); return true; }, []);
  if (loading) return <div className="page"><Loading label="Loading people" /></div>;
  if (error || !data) return <div className="page"><p className="note warn">People data couldn't load.</p></div>;
  return <>{children()}</>;
};

export const SubNav = ({ active }: { active: string }) => (
  <div className="subnav" role="tablist">
    {[["timeline", "Bible timeline"], ["church", "Church history"], ["writers", "Writers"], ["creeds", "Creeds"], ["people", "People"], ["tree", "Family tree"], ["paths", "Pathfinder"]].map(([h, label]) => (
      <a key={h} href={`#${h}`} className={active === h ? "on" : ""}>{label}</a>
    ))}
  </div>
);

/** Search box for choosing a person. There are about 3,000, including many who share a name. */
function PersonPicker({ id, value, onPick, label }: { id: string; value: string; onPick: (personId: string) => void; label: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const current = getFigure(value);
  const results = useMemo(() => (q.trim() ? searchFigures(q).slice(0, 8) : []), [q]);
  return (
    <div className="picker">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" value={open ? q : current?.name ?? ""} placeholder="Type a name" autoComplete="off" onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
      {!open && current && <p className="fine picker-who"><RefText text={current.title} /></p>}
      {open && results.length > 0 && (
        <div className="picker-list">
          {results.map((f) => <button type="button" key={f.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(f.id); setOpen(false); }}><strong>{f.name}</strong><span>{f.title}</span></button>)}
        </div>
      )}
    </div>
  );
}

export const PeoplePage = () => <Ready>{() => <PeopleList />}</Ready>;
function PeopleList() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<GroupFilter>("ANY");
  const list = useMemo(() => searchFigures(q, group), [q, group]);
  return (
    <div className="page">
      <h1 className="page-title">People</h1>
      <SubNav active="people" />
      <input id="people-search" className="input big" type="search" placeholder="Search names" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="filters">
        <select id="group-filter" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value as GroupFilter)}>{GROUP_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
        <span className="fine">{list.length.toLocaleString()} people</span>
      </div>
      <div className="tool-list">
        {list.slice(0, 80).map((f) => <a key={f.id} className="tool-row" href={`#person-${f.id}`}><strong>{f.name}</strong><span>{f.title}</span></a>)}
      </div>
      {list.length > 80 && <p className="fine">Showing the first 80. Search to narrow the list.</p>}
      {!list.length && <Empty>No one matches. Try a shorter search.</Empty>}
      <p className="fine">{CREDIT} <a href="#people-data">How this was checked</a></p>
    </div>
  );
}

/** Shows what the people database kept, changed and dropped, and why. */
export function PeopleDataPage() {
  const { data } = useAsync(() => load<PeopleReport>("people-report.json"), []);
  if (!data) return <div className="page"><Loading /></div>;
  const c = data.counts;
  const List = ({ title, intro, rows }: { title: string; intro: string; rows: { key: string; main: string; sub?: string }[] }) => (
    <details className="doctrine">
      <summary>{title} ({rows.length.toLocaleString()})</summary>
      <p className="fine">{intro}</p>
      <ul className="fine-list">{rows.slice(0, 400).map((r) => <li key={r.key}><RefText text={r.main} />{r.sub && <span className="fine"> {r.sub}</span>}</li>)}</ul>
      {rows.length > 400 && <p className="fine">Showing the first 400.</p>}
    </details>
  );
  return (
    <div className="page prose">
      <a className="back" href="#people">‹ People</a>
      <h1 className="page-title">How the people data was checked</h1>
      <p>Every family claim was tested against the Hebrew and Greek text, where each person is tagged word by word. The Bible decides: a claim Scripture states is kept with its verse, one Scripture contradicts is dropped, and one Scripture doesn't address is kept only if open sources support it, and is marked.</p>
      <dl className="facts">
        <dt>People</dt><dd>{c.people_final.toLocaleString()}</dd>
        <dt>Parent links kept</dt><dd>{c.kept.parent.toLocaleString()}, tested from {c.parent_claims.toLocaleString()} claims</dd>
        <dt>Marriages kept</dt><dd>{c.kept.spouse.toLocaleString()}</dd>
      </dl>
      <List title="Where Scripture overrode a source" intro="The source's claim was dropped because the text says otherwise. A few may reflect the sources counting one person as two, so the verse is given to check." rows={data.overridden.map((x, i) => ({ key: String(i), main: x.claim, sub: `${x.scripture}. Source: ${x.sources.join(", ")}.` }))} />
      <List title="Where Scripture itself names two fathers" intro="Both are kept and shown, with no attempt to settle the difference." rows={data.scripture_differs.map((x, i) => ({ key: String(i), main: `${x.person}: ${x.fathers.map((f) => `${f.name} (${f.ref})`).join(" and ")}` }))} />
      <List title="Dates corrected to Scripture" intro="A source's dates disagreed with the years a verse gives." rows={(data.dates_overridden ?? []).map((x, i) => ({ key: String(i), main: x.person, sub: `${x.source}. ${x.scripture}.` }))} />
      <List title="Kept, but not stated word for word" intro="Scripture doesn't contradict these and open sources support them. They're marked wherever they appear." rows={data.secondary.map((x, i) => ({ key: String(i), main: x.claim, sub: `${x.basis}. Source: ${x.sources.join(", ")}.` }))} />
      <List title="Dropped for lack of support" intro="One source alone, or a source's own doubt, with nothing in the text to back it." rows={data.unsupported.map((x, i) => ({ key: String(i), main: x.claim, sub: `${x.why}. Source: ${x.sources.join(", ")}.` }))} />
      <List title="Summary sentences removed" intro="These sentences in a summary gave a person a family that the verses don't show." rows={data.bio_removed.map((x, i) => ({ key: String(i), main: x.sentence, sub: x.person }))} />
      <List title="People left out" intro="A source listed someone the verses don't support: a person a source added to fill out a count, or one inferred from a verse that doesn't refer to them." rows={(data.people_dropped ?? []).map((x, i) => ({ key: String(i), main: x.person, sub: `${x.why}.` }))} />
      <List title="Duplicates joined" intro="One person listed twice under different spellings. Links to either one lead to the same page." rows={(data.merged ?? []).map((x, i) => ({ key: String(i), main: x.person, sub: `Now part of ${x.into}.` }))} />
      <List title="Names changed to the Bible's" intro="The source filed these under a name that none of the bundled translations uses in their verses." rows={(data.renamed ?? []).map((x, i) => ({ key: String(i), main: x.name, sub: `${x.why}.` }))} />
      <p className="fine">{CREDIT}</p>
    </div>
  );
}

interface PeopleReport {
  counts: { people_final: number; kept: { parent: number; spouse: number; sibling: number }; parent_claims: number };
  overridden: { claim: string; sources: string[]; scripture: string }[];
  scripture_differs: { person: string; fathers: { name: string; ref: string }[] }[];
  dates_overridden?: { person: string; source: string; scripture: string }[];
  secondary: { claim: string; sources: string[]; basis: string }[];
  unsupported: { claim: string; sources: string[]; why: string }[];
  bio_removed: { person: string; sentence: string }[];
  people_dropped?: { person: string; why: string }[];
  merged?: { person: string; into: string }[];
  renamed?: { person: string; name: string; why: string }[];
}

const Links = ({ title, list, refFor, noteFor }: { title: string; list: Figure[]; refFor?: (f: Figure) => string | undefined; noteFor?: (f: Figure) => string | undefined }) =>
  list.length ? (
    <div className="family">
      <span className="fine">{title}</span>
      <span>{list.map((f, i) => { const r = refFor?.(f); const n = noteFor?.(f); return <span key={f.id}>{i > 0 && ", "}<a href={`#person-${f.id}`}>{f.name}</a>{r && <> (<RefLink refText={r} />)</>}{n && <span className="fine link-note"> {n}</span>}</span>; })}</span>
    </div>
  ) : null;

const linkNote = (l?: ParentLink) => {
  if (!l) return undefined;
  if (l.kind === "descendant") {
    if (l.note) return `${l.generations ? `Ancestor, ${l.generations} generations back.` : "Ancestor."} ${l.note}`;
    return l.generations ? `Ancestor, ${l.generations} generations back${l.via?.length ? ` through ${l.via.join(", ")}` : ""}.` : "Ancestor, with generations skipped.";
  }
  return l.note;
};

const yearText = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);

export const PersonPage = ({ id }: { id: string }) => <Ready>{() => <Person id={id} />}</Ready>;
function Person({ id }: { id: string }) {
  const f = getFigure(id);
  const { figures, prefs, guides, activeGuideId } = useData();
  const { data: verses } = useAsync(() => versesOfPerson(id), [id]);
  const [shown, setShown] = useState(30);
  if (!f) return <div className="page"><Empty>That person wasn't found.</Empty></div>;
  const saved = figures.includes(f.id);
  const addToGuide = () =>
    addSectionsToGuide(
      [{ id: newId(), kind: "people", heading: f.name, origin: "assembled", items: [{ label: f.name, personId: f.id, text: f.title }, ...(verses ?? []).slice(0, 8).map((v) => ({ ref: v.ref, text: "" }))] }],
      `Study of ${f.name}`, guides, activeGuideId, prefs.translation, prefs.lens,
    );
  const line = lineageFromAdam(f.id);
  return (
    <div className="page prose">
      <p className="eyebrow">Person{f.tribe ? ` · Tribe or nation: ${f.tribe}` : ""}</p>
      <h1 className="page-title">{f.name}</h1>
      <p className="sub"><RefText text={f.title} /></p>
      <div className="action-row">
        <a className="btn small" href={`#tree-${f.id}`}>Family tree</a>
        <button type="button" className="btn small" onClick={addToGuide}>Add to guide</button>
        <button type="button" className="btn small" onClick={() => update((d) => ({ ...d, figures: saved ? d.figures.filter((x) => x !== f.id) : [f.id, ...d.figures] }))}>{saved ? "Saved" : "Save"}</button>
      </div>
      <dl className="facts">
        {f.altNames && <><dt>Also called</dt><dd>{f.altNames}</dd></>}
        {f.meaning && <><dt>Name means</dt><dd>{f.meaning}</dd></>}
        {f.era && <><dt>Period</dt><dd>{f.era}</dd></>}
        {f.places?.length ? <><dt>Places</dt><dd>{f.places.join(", ")}</dd></> : null}
        {f.dates && <><dt>{f.dates.kind === "active" ? "Active" : "Lived"}</dt><dd>About {yearText(f.dates.from)} to {yearText(f.dates.to)}. <span className="fine">Scripture gives no calendar dates. This is one traditional chronology (Floyd Nolen Jones, via Theographic).</span></dd></>}
      </dl>
      {f.facts && f.facts.length > 0 && <><h3>Stated in Scripture</h3><ul className="fine-list">{f.facts.map((x, i) => <li key={i}><RefText text={x} /></li>)}</ul></>}
      {f.bio && <details className="doctrine" open><summary>Summary</summary><Paras text={f.bio} /><p className="fine">Written by STEPBible (TIPNR), and secondary. The family links and verses on this page take priority over it.</p></details>}
      <h3>Family</h3>
      <Links title="Parents" list={resolveFigures(f.parents)} refFor={(p) => parentLink(f.id, p.id)?.refs?.[0]} noteFor={(p) => linkNote(parentLink(f.id, p.id))} />
      <Links title="Spouses" list={resolveFigures(f.spouses)} refFor={(s) => f.spouseRefs?.[s.id]} />
      <Links title="Children" list={resolveFigures(f.children)} refFor={(c) => parentLink(c.id, f.id)?.refs?.[0]} noteFor={(c) => linkNote(parentLink(c.id, f.id))} />
      <Links title="Siblings" list={resolveFigures(getSiblings(f.id))} />
      {!f.parents.length && !f.spouses.length && !f.children.length && <Empty>No family link is recorded for this person.</Empty>}
      {f.parentLinks && Object.values(f.parentLinks).some((l) => l.kind === "legal") && f.id === "jesus-christ" && <p className="fine">Joseph is shown as a legal parent: Luke 3:23 says Jesus “was the son, so it was thought, of Joseph”.</p>}
      {line && line.length > 1 && <p className="fine">{formatGenerations(summarizePath(line))} from Adam through these links. <a href={`#tree-${f.id}`}>See the tree</a></p>}
      <h3>Verses naming {f.name}{verses ? ` (${verses.length.toLocaleString()})` : ""}</h3>
      {verses && !verses.length && <Empty>No verses are indexed for this person.</Empty>}
      <p className="ref-row">{verses?.slice(0, shown).map((v, i) => <span key={v.ref}>{i > 0 && " · "}<RefLink refText={v.ref} /></span>)}</p>
      {verses && verses.length > shown && <button type="button" className="btn small" onClick={() => setShown((s) => s + 100)}>Show more</button>}
      <p className="fine">{CREDIT}</p>
    </div>
  );
}

// ---------- Family tree ----------
const DIMS: LayoutDims = { nodeW: 150, nodeH: 76, hGap: 14, vGap: 118, padX: 30, padTop: 30, padBottom: 40 };

export const TreePage = ({ id }: { id?: string }) => <Ready>{() => <Tree id={id && getFigure(id) ? id : DEFAULT_ID} />}</Ready>;
function Tree({ id }: { id: string }) {
  const [depth, setDepth] = useState(2);
  const [spouses, setSpouses] = useState(true);
  const [siblings, setSiblings] = useState(false);
  const [selected, setSelected] = useState<string | null>(id);
  const [trace, setTrace] = useState(false);
  useEffect(() => { setSelected(id); setTrace(false); }, [id]);
  const path = useMemo(() => (trace ? lineageFromAdam(id) ?? [] : []), [trace, id]);
  const layout = useMemo(() => layoutTree(buildSubgraph(id, { maxDepth: depth, includeSpouses: spouses, includeSiblings: siblings, highlightedPath: path }), id, DIMS), [id, depth, spouses, siblings, path]);
  const onPath = useMemo(() => new Set(path), [path]);
  const box = useRef<HTMLDivElement | null>(null);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const stage = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const lastPinch = useRef(0);

  const apply = () => { if (stage.current) stage.current.style.transform = `translate(${view.current.x}px, ${view.current.y}px) scale(${view.current.k})`; };
  useEffect(() => {
    const focus = layout.positions.get(id);
    const w = box.current?.clientWidth ?? 360;
    const h = box.current?.clientHeight ?? 400;
    const k = Math.min(1, Math.max(0.45, w / 420));
    if (focus) view.current = { k, x: w / 2 - focus.cx * k, y: h / 2.4 - focus.cy * k };
    apply();
  }, [layout, id]);

  const zoom = (factor: number, cx?: number, cy?: number) => {
    const v = view.current;
    const w = box.current?.clientWidth ?? 0, h = box.current?.clientHeight ?? 0;
    const px = cx ?? w / 2, py = cy ?? h / 2;
    const k = Math.min(2.2, Math.max(0.2, v.k * factor));
    v.x = px - ((px - v.x) * k) / v.k;
    v.y = py - ((py - v.y) * k) / v.k;
    v.k = k;
    apply();
  };
  const onDown = (e: any) => { pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved.current = false; if (pointers.current.size === 2) lastPinch.current = 0; };
  const onMove = (e: any) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { moved.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) { view.current.x += dx; view.current.y += dy; apply(); }
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = box.current!.getBoundingClientRect();
      if (lastPinch.current) zoom(dist / lastPinch.current, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      lastPinch.current = dist;
    }
  };
  const onUp = (e: any) => { pointers.current.delete(e.pointerId); lastPinch.current = 0; };

  const { edges, spouseLinks } = useMemo(() => {
    const edges: { key: string; d: string; dash?: string; hot: boolean; label?: { x: number; y: number; text: string } }[] = [];
    for (const [cid, pos] of layout.positions) {
      for (const pid of getFigure(cid)?.parents ?? []) {
        const pp = layout.positions.get(pid);
        if (!pp) continue;
        const link = parentLink(cid, pid);
        const y1 = pp.y + DIMS.nodeH, y2 = pos.y, mid = (y1 + y2) / 2;
        edges.push({
          key: `${pid}-${cid}`,
          d: `M ${pp.cx} ${y1} C ${pp.cx} ${mid}, ${pos.cx} ${mid}, ${pos.cx} ${y2}`,
          dash: link?.kind === "legal" ? "2 4" : undefined,
          hot: onPath.has(pid) && onPath.has(cid),
          label: link?.kind === "legal" ? { x: (pp.cx + pos.cx) / 2, y: mid, text: "legal" } : undefined,
        });
      }
    }
    const spouseLinks: { key: string; x1: number; x2: number; y: number }[] = [];
    const seen = new Set<string>();
    for (const [cid, pos] of layout.positions) {
      for (const sid of getFigure(cid)?.spouses ?? []) {
        const sp = layout.positions.get(sid);
        const key = [cid, sid].sort().join("~");
        if (!sp || seen.has(key) || sp.y !== pos.y) continue;
        seen.add(key);
        const [l, r] = pos.x < sp.x ? [pos, sp] : [sp, pos];
        spouseLinks.push({ key, x1: l.x + DIMS.nodeW, x2: r.x, y: l.cy });
      }
    }
    return { edges, spouseLinks };
  }, [layout, onPath]);

  const sel = selected ? getFigure(selected) : null;
  return (
    <div className="page tree-page">
      <h1 className="page-title">Family tree</h1>
      <SubNav active="tree" />
      <PersonPicker id="tree-person" label="Center on" value={id} onPick={(p) => navigate(`tree-${p}`)} />
      <div className="filters">
        <select id="tree-depth" aria-label="Generations" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>{[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>±{n} generations</option>)}</select>
        <label className="check"><input id="tree-spouses" type="checkbox" checked={spouses} onChange={(e) => setSpouses(e.target.checked)} /> Spouses</label>
        <label className="check"><input id="tree-siblings" type="checkbox" checked={siblings} onChange={(e) => setSiblings(e.target.checked)} /> Siblings</label>
        <button type="button" className="btn small" onClick={() => setTrace((t) => !t)}>{trace ? "Hide line from Adam" : "Trace from Adam"}</button>
      </div>
      <div className="tree-box" ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={(e: any) => { e.preventDefault?.(); const r = box.current!.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - r.left, e.clientY - r.top); }}>
        <div className="tree-stage" ref={stage} style={{ width: layout.width, height: layout.height }}>
          <svg width={layout.width} height={layout.height} aria-hidden="true">
            {edges.map((e) => (
              <g key={e.key}>
                <path d={e.d} fill="none" className={e.hot ? "edge hot" : "edge"} strokeDasharray={e.dash} />
                {e.label && <text x={e.label.x} y={e.label.y} className="edge-label" textAnchor="middle">{e.label.text}</text>}
              </g>
            ))}
            {spouseLinks.map((s) => <line key={s.key} x1={s.x1} x2={s.x2} y1={s.y} y2={s.y} className="edge spouse" />)}
          </svg>
          {[...layout.positions.values()].map((p) => {
            const f = getFigure(p.id)!;
            return (
              <button type="button" key={p.id} className={`tree-card ${p.id === id ? "focus" : ""} ${selected === p.id ? "selected" : ""} ${onPath.has(p.id) ? "on-path" : ""}`}
                style={{ left: p.x, top: p.y, width: DIMS.nodeW, height: DIMS.nodeH }}
                onClick={() => { if (!moved.current) setSelected(p.id); }}>
                <strong>{f.name}</strong>
                <span>{f.title}</span>
              </button>
            );
          })}
        </div>
        <div className="tree-zoom">
          <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
        </div>
      </div>
      {sel && (
        <div className="tree-detail">
          <div><strong>{sel.name}</strong><span className="fine"> {sel.title}</span></div>
          <div className="action-row">
            <a className="btn small" href={`#person-${sel.id}`}>Open</a>
            {sel.id !== id && <a className="btn small" href={`#tree-${sel.id}`}>Center tree here</a>}
          </div>
        </div>
      )}
      {trace && path.length > 1 && <p className="note">{getFigure(id)?.name} is {formatGenerations(summarizePath(path))} from Adam through these links.</p>}
      {trace && path.length === 0 && <p className="note">These links don't connect {getFigure(id)?.name} to Adam.</p>}
      <p className="fine">Pinch or scroll to zoom and drag to move. Dotted lines are legal rather than biological links. {CREDIT}</p>
    </div>
  );
}

// ---------- Pathfinder ----------
export const PathsPage = () => <Ready>{() => <Paths />}</Ready>;
function Paths() {
  const [a, setA] = useState("abram-1");
  const [b, setB] = useState(DEFAULT_ID);
  const path = useMemo(() => findShortestPath(a, b), [a, b]);
  const summary = path ? summarizePath(path) : null;
  return (
    <div className="page prose">
      <h1 className="page-title">Pathfinder</h1>
      <SubNav active="paths" />
      <p>Find how any two people are connected.</p>
      <div className="two-col">
        <PersonPicker id="path-a" label="From" value={a} onPick={setA} />
        <PersonPicker id="path-b" label="To" value={b} onPick={setB} />
      </div>
      {!path && <Empty>No family connection between these two is recorded in this data.</Empty>}
      {path && summary && (
        <>
          <p className="note">{summary.links} {summary.links === 1 ? "step" : "steps"}{summary.direct ? `, ${formatGenerations(summary)}` : ""}.</p>
          <ol className="path">
            {path.map((id, i) => {
              const f = getFigure(id)!;
              const next = path[i + 1];
              const link = next ? stepLink(id, next) : undefined;
              return (
                <li key={id}>
                  <a href={`#person-${id}`}><strong>{f.name}</strong></a> <span className="fine">{f.title}</span>
                  {next && <p className="step">{describeRelationshipStep(id, next)} {link?.refs?.[0] && <RefLink refText={link.refs[0]} />}</p>}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <p className="fine">{CREDIT}</p>
    </div>
  );
}
