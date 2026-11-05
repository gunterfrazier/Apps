import { useEffect, useMemo, useRef, useState } from "react";
import { newId } from "../../core/guide";
import { BOOKS, bookName, formatSegment, parseReference } from "../../core/references";
import { timelineForPassage, timelineHash, formatYear, formatSpan } from "../../core/timeline";
import { CATEGORIES, categoryLabel, excerptsByWriter, excerptsForPassage, FLAG_NOTE, getWritingsIndex, searchWritings, sermonsForBook, sermonsForPassage, varied, writerById, writerYearLabel, type Excerpt, type SearchHit, type Writer } from "../../core/writings";
import { readHash, hashForReference } from "../routes";
import { useData } from "../store";
import { Empty, ErrorNote, Loading, Paras, RefLink, Tag, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";

const PREVIEW = 480;
const PAGE = 20;

const clipText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, "")} …`);

export function passageHash(reference: string) {
  const h = hashForReference(reference);
  return h ? `on-${h.slice(5)}` : "writers";
}

function FlagTag({ w }: { w: Writer }) {
  if (w.flag === "condemned") return <Tag tone="warn">Condemned by a council</Tag>;
  if (w.flag === "pseudo") return <Tag>Written under another's name</Tag>;
  if (w.flag === "early-doc") return <Tag>Early document</Tag>;
  return null;
}

export function ExcerptCard({ e, hideWriter, hit }: { e: Excerpt; hideWriter?: boolean; hit?: string }) {
  const { guides, activeGuideId, prefs } = useData();
  const [open, setOpen] = useState(false);
  const long = e.text.length > PREVIEW + 60;
  const at = hit ? e.text.toLowerCase().indexOf(hit.toLowerCase()) : -1;
  const preview = at > PREVIEW - 80 ? `… ${clipText(e.text.slice(Math.max(0, at - 160)).replace(/^\S*\s/, ""), PREVIEW)}` : clipText(e.text, PREVIEW);
  const add = () =>
    addSectionsToGuide(
      [{ id: newId(), kind: "views", heading: `${e.writer.name} on ${e.reference}`, origin: "assembled", items: [{ label: `${e.writer.name}, ${e.title}. ${e.source}`, text: e.text }] }],
      e.reference, guides, activeGuideId, prefs.translation, prefs.lens,
    );
  return (
    <article className="excerpt">
      <header>
        {!hideWriter && <a className="ex-writer" href={`#writer-${e.writer.id}`}>{e.writer.name}</a>}
        {!hideWriter && <span className="fine">{writerYearLabel(e.writer)}</span>}
        <FlagTag w={e.writer} />
        {e.cites && <Tag>Cites this verse</Tag>}
      </header>
      <p className="ex-on">{e.title}, on <RefLink refText={e.reference} /></p>
      <div className="ex-text">
        {open || !long ? <Paras text={e.text} /> : <p>{preview}</p>}
      </div>
      {long && <button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? "Show less" : "Read all of it"}</button>}
      <p className="fine ex-source">{e.source}{e.text.endsWith(" …") ? ". Shortened here because of its length; the source has the rest." : ""}</p>
      <div className="ex-actions">
        <button type="button" className="link-btn" onClick={add}>Add to guide</button>
        {e.url && <a className="link-btn" href={e.url} target="_blank" rel="noreferrer">Check the source</a>}
      </div>
    </article>
  );
}

function ExcerptList({ list, hideWriter, hit, empty }: { list: Excerpt[]; hideWriter?: boolean; hit?: string; empty?: string }) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [list]);
  if (!list.length) return <Empty>{empty ?? "Nothing here."}</Empty>;
  return (
    <>
      {list.slice(0, shown).map((e, i) => <ExcerptCard key={`${e.writer.id}-${e.c1}-${e.v1}-${i}`} e={e} hideWriter={hideWriter} hit={hit} />)}
      {shown < list.length && <button type="button" className="btn small" onClick={() => setShown(shown + PAGE)}>Show more ({list.length - shown} left)</button>}
    </>
  );
}

const SermonList = ({ list }: { list: Awaited<ReturnType<typeof sermonsForBook>> }) => {
  const [shown, setShown] = useState(30);
  return (
    <>
      <ul className="link-list">
        {list.slice(0, shown).map((s) => (
          <li key={s.number}>
            <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
            <span className="fine"> Sermon {s.number}, volume {s.volume}, on <RefLink refText={s.reference} /></span>
          </li>
        ))}
      </ul>
      {shown < list.length && <button type="button" className="btn small" onClick={() => setShown(shown + 30)}>Show more ({list.length - shown} left)</button>}
      <p className="fine">An index only. The modern edition available as open data is under copyright, so these links open the Spurgeon Library, which has his original wording. If a link doesn't find the sermon, search there for its title or number.</p>
    </>
  );
};

/** The short preview at the end of a passage's insights. It loads when scrolled into view. */
export function WritersPreview({ reference }: { reference: string }) {
  const box = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!box.current || typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) setSeen(true); }, { rootMargin: "200px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, []);
  const { data, loading, error } = useAsync(async () => (seen ? excerptsForPassage(reference) : null), [reference, seen]);
  const moments = useAsync(async () => (seen ? timelineForPassage(reference) : []), [reference, seen]);
  return (
    <section ref={box}>
      <div className="sec-head"><h3>Church Fathers and teachers</h3>{data && data.length > 0 && <a className="link-btn" href={`#${passageHash(reference)}`}>See all {data.length}</a>}</div>
      <ErrorNote error={error} />
      {(loading || !seen) && !data && <Loading label="Finding what they wrote" />}
      {data && varied(data, 3).map((e, i) => <ExcerptCard key={i} e={e} />)}
      {data && !data.length && <Empty>No excerpts on this exact passage. <a href={`#${passageHash(reference)}`}>Check the commentaries and sermons</a>.</Empty>}
      {moments.data && moments.data.length > 0 && (
        <>
          <h4>On the timeline</h4>
          <div className="chips">{moments.data.map((m) => <a key={m.key} className="chip" href={`#${timelineHash(m.x1)}`}>{m.label}, {formatSpan(m.x1, m.x2)}</a>)}</div>
        </>
      )}
    </section>
  );
}

/** Everything on one passage: excerpts, long commentaries and sermons. */
export function PassageWritersPage({ reference }: { reference: string }) {
  const [tab, setTab] = useState<"writers" | "comm" | "sermons">("writers");
  const [cat, setCat] = useState("all");
  const [who, setWho] = useState("all");
  const [how, setHow] = useState<"all" | "comments" | "cites">("all");
  const short = useAsync(() => excerptsForPassage(reference), [reference]);
  const long = useAsync(async () => (tab === "comm" ? excerptsForPassage(reference, "comm") : null), [reference, tab]);
  const sermons = useAsync(async () => (tab === "sermons" ? sermonsForPassage(reference) : null), [reference, tab]);
  const segs = parseReference(reference);
  const title = segs?.map((s) => formatSegment(s)).join("; ") ?? reference;
  const cats = useMemo(() => CATEGORIES.filter((c) => short.data?.some((e) => e.writer.cat === c.id)), [short.data]);
  const inCat = useMemo(() => (short.data ?? []).filter((e) => cat === "all" || e.writer.cat === cat), [short.data, cat]);
  const writers = useMemo(() => { const m = new Map<string, string>(); inCat.forEach((e) => m.set(e.writer.id, e.writer.name)); return [...m]; }, [inCat]);
  const list = useMemo(() => inCat.filter((e) => (who === "all" || e.writer.id === who) && (how === "all" || (how === "cites") === e.cites)), [inCat, who, how]);
  useEffect(() => setWho("all"), [cat]);
  const h = hashForReference(reference);
  return (
    <div className="page">
      <p className="eyebrow"><a href="#writers">Writers</a></p>
      <h1 className="page-title">What writers said on {title}</h1>
      {h && <p><a href={`#${h}`}>Read {title}</a></p>}
      <div className="tabs" role="tablist">
        {([["writers", `Fathers and teachers${short.data ? ` (${short.data.length})` : ""}`], ["comm", "Commentaries"], ["sermons", "Sermons"]] as const).map(([id, label]) => (
          <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "writers" && (
        <>
          <ErrorNote error={short.error} />
          {short.loading && <Loading label="Finding what they wrote" />}
          {short.data && short.data.length > 0 && (
            <div className="filters">
              <select aria-label="Period or group" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="all">All periods</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select aria-label="Writer" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="all">All {writers.length} writers</option>
                {writers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <select aria-label="Comments or citations" value={how} onChange={(e) => setHow(e.target.value as "all" | "comments" | "cites")}>
                <option value="all">Comments and citations</option>
                <option value="comments">Comments on the passage</option>
                <option value="cites">Places that cite it</option>
              </select>
            </div>
          )}
          {short.data && <ExcerptList list={list} empty="No excerpts on this exact passage." />}
          <p className="fine">Earliest first. Excerpts marked Catena Aurea are as collected by Thomas Aquinas in the 1200s, so they're often condensed and his attributions aren't always certain.</p>
          <p className="fine">“Cites this verse” means the passage was tagged in CCEL's text of the work, or named in a short editor's note. It isn't always a comment on the verse, and a writer may be quoting someone he goes on to answer, so open the source to see the context.</p>
        </>
      )}
      {tab === "comm" && (
        <>
          <ErrorNote error={long.error} />
          {long.loading && <Loading label="Opening the commentaries" />}
          {long.data && <ExcerptList list={long.data} empty="None of the commentaries in this app has a section on this exact passage." />}
          <p className="fine">Matthew Henry covers the whole Bible, Spurgeon's Treasury of David the Psalms, and Luther's Commentary here Galatians, in Graebner's abridged and modernized English. Edwards's sermons appear at their texts.</p>
        </>
      )}
      {tab === "sermons" && (
        <>
          <ErrorNote error={sermons.error} />
          {sermons.loading && <Loading label="Looking through the index" />}
          {sermons.data && (sermons.data.length ? <SermonList list={sermons.data} /> : <Empty>Spurgeon's index has no sermon on this exact passage.</Empty>)}
        </>
      )}
    </div>
  );
}

function SearchWritings({ writer, initial }: { writer?: string; initial?: string }) {
  const [q, setQ] = useState(initial ?? "");
  const [book, setBook] = useState(0);
  const [run, setRun] = useState<{ q: string; book: number; n: number } | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!run) return;
    let live = true;
    setHits(null);
    searchWritings(run.q, { book: run.book || undefined, writer, onProgress: (d, t) => live && setProgress([d, t]), cancelled: () => !live }).then((h) => { if (live) { setHits(h); setProgress(null); } }, () => { if (live) { setHits([]); setProgress(null); } });
    return () => { live = false; };
  }, [run]);
  return (
    <section>
      <h3>{writer ? "Search this writer" : "Search the writings"}</h3>
      <form className="search-row" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 3) setRun({ q: q.trim(), book, n: Date.now() }); }}>
        <input className="input" type="search" placeholder="A word or phrase, such as grace" aria-label="Search the writings" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Limit to one book of the Bible" value={book} onChange={(e) => setBook(Number(e.target.value))}>
          <option value={0}>Whole Bible</option>
          {BOOKS.map((b) => <option key={b.number} value={b.number}>{b.name}</option>)}
        </select>
        <button type="submit" className="btn small primary">Search</button>
      </form>
      {!book && !writer && <p className="fine">Searching the whole Bible downloads all the writings, about 115 MB, one book at a time. Choose a book to search faster.</p>}
      {progress && <p className="loading" role="status"><span className="dot" />Searching book {progress[0]} of {progress[1]}…</p>}
      {hits && <p className="fine">{hits.length >= 100 ? "Showing the first 100 matches." : `${hits.length} ${hits.length === 1 ? "match" : "matches"}.`}</p>}
      {hits && hits.length > 0 && <ExcerptList list={hits} hit={run?.q} hideWriter={!!writer} />}
    </section>
  );
}

export function WritersPage({ initialSearch }: { initialSearch?: string }) {
  const { data, error } = useAsync(getWritingsIndex, []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.authors ?? []).filter((a) => (cat === "all" || a.cat === cat) && (!s || a.name.toLowerCase().includes(s))).sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  }, [data, q, cat]);
  return (
    <div className="page">
      <h1 className="page-title">Church Fathers and teachers</h1>
      <p className="sub">What influential Christian writers said about Scripture, from the first century on. Each excerpt names the published edition it comes from.</p>
      <ErrorNote error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="filters">
            <input className="input" type="search" placeholder="Find a writer" aria-label="Find a writer" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Period or group" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All periods</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div className="writer-list">
            {list.map((w) => (
              <a key={w.id} className="tool-row" href={`#writer-${w.id}`}>
                <strong>{w.name}</strong>
                <span>{writerYearLabel(w)} · {categoryLabel(w.cat)} · {w.n.toLocaleString()} {w.n === 1 ? "excerpt" : "excerpts"}</span>
              </a>
            ))}
          </div>
          {!list.length && <Empty>No writer matches that.</Empty>}
          <SearchWritings initial={initialSearch} />
          <details className="doctrine">
            <summary>How these were chosen</summary>
            <p>Your rule for this app is that everything stored must trace to a source you can check. So a quote from the Fathers is kept only if it comes from a named public-domain edition, and its wording was found word for word in that edition's text. Quotes from the Ante-Nicene and Nicene series were also matched against CCEL's text of those volumes.</p>
            <p>Most other entries come from CCEL's tagged Scripture references, in works its files mark as public domain and in older works whose editions were checked by date. These show where a writer cites a verse.</p>
            <p>That leaves out a lot on purpose: excerpts of copyrighted modern series, recent translations (including AI translations from Latin), and modern authors still under copyright. So some well-known works, such as Augustine's Sermons and Jerome's Commentary on Isaiah, aren't here. Those texts exist, but not in an edition that passes this test.</p>
            <p>Being included doesn't mean a writer is right. These writers disagree with each other, and some were later condemned, which is marked where the source records it.</p>
          </details>
        </>
      )}
    </div>
  );
}

export function WriterPage({ id }: { id: string }) {
  const { data: w, loading, error } = useAsync(() => writerById(id), [id]);
  const [book, setBook] = useState<number | null>(null);
  const [view, setView] = useState<"excerpts" | "sermons">("excerpts");
  const current = book ?? (w?.books.length ? [...w.books].sort((a, b) => b[1] - a[1])[0][0] : null);
  const excerpts = useAsync(async () => (w && current ? excerptsByWriter(w.id, current) : []), [w?.id, current]);
  const isSpurgeon = id === "charles-spurgeon";
  const sermons = useAsync(async () => (isSpurgeon && current && view === "sermons" ? sermonsForBook(current) : []), [isSpurgeon, current, view]);
  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!w) return <div className="page"><p className="empty">No writer here. <a href="#writers">See all writers</a>.</p></div>;
  return (
    <div className="page">
      <p className="eyebrow"><a href="#writers">Writers</a></p>
      <h1 className="page-title">{w.name}</h1>
      <p className="sub">{writerYearLabel(w)} · {categoryLabel(w.cat)}</p>
      {w.flag && <p className="note">{FLAG_NOTE[w.flag]}</p>}
      <div className="action-row">
        {w.year !== null && w.year > 0 && <a className="btn small" href={`#${timelineHash(w.year)}`}>On the timeline ({formatYear(w.year)})</a>}
        {w.wiki && <a className="btn small" href={w.wiki} target="_blank" rel="noreferrer">Biography on Wikipedia</a>}
      </div>
      <details className="doctrine" open={w.works.length <= 4}>
        <summary>Works in this app</summary>
        <ul className="fine-list">{w.works.map(([t, n]) => <li key={t}>{t} <span className="fine">({n.toLocaleString()})</span></li>)}</ul>
      </details>
      <h3>By book of the Bible</h3>
      <div className="filters">
        <select aria-label="Book of the Bible" value={current ?? ""} onChange={(e) => setBook(Number(e.target.value))}>
          {[...w.books].sort((a, b) => a[0] - b[0]).map(([b, n]) => <option key={b} value={b}>{bookName(b)} ({n.toLocaleString()})</option>)}
        </select>
        {isSpurgeon && (
          <select aria-label="Excerpts or sermons" value={view} onChange={(e) => setView(e.target.value as "excerpts" | "sermons")}>
            <option value="excerpts">Treasury of David</option>
            <option value="sermons">Sermon index</option>
          </select>
        )}
      </div>
      {view === "excerpts" && (
        <>
          <ErrorNote error={excerpts.error} />
          {excerpts.loading && <Loading label="Opening the writings" />}
          {excerpts.data && !excerpts.loading && <ExcerptList list={excerpts.data} hideWriter empty={isSpurgeon ? "The Treasury of David covers the Psalms. Choose the sermon index for this book." : "Nothing on this book."} />}
        </>
      )}
      {view === "sermons" && (sermons.loading ? <Loading /> : sermons.data && <SermonList list={sermons.data} />)}
      <SearchWritings writer={w.id} />
      <p className="fine">Want a summary of this writer's thought? <a href={`#ask`}>Ask the AI assistant</a>. Its answers are drafts, so check them against these excerpts.</p>
    </div>
  );
}

export const passageWritersHash = (book: number, chapter: number, verse?: number, verseEnd?: number) => `on-${readHash({ book, chapter, verse, verseEnd }).slice(5)}`;
