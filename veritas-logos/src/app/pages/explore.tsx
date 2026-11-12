import { useEffect, useMemo, useState } from "react";
import { getVerse, refOf, searchText, decodeVerseCode, type SearchHit } from "../../core/bible";
import { getBookMeta, getBooks, getTopic, getTopicIndex, searchTopics, type TopicRow } from "../../core/content";
import { searchFigures } from "../../core/figure-search";
import { gematria, getConcordance, getLexEntry, normalizeStrongs, searchLexicon, type LexIndexRow } from "../../core/lexicon";
import { ensureFigures } from "../../core/people";
import { BOOKS, bookName, parseReference } from "../../core/references";
import { hashForReference, readHash } from "../routes";
import { navigate, useData } from "../store";
import { Empty, ErrorNote, LexText, Loading, RefLink, useAsync } from "../ui";
import { chapterCount } from "../../core/bible";
import { getChronology } from "../../core/scholar";
import { ExploreNav } from "./texts";
import { ScholarshipLinks } from "./scholar-ui";
import { getBookGuide, guideBooks } from "../../core/bookguide";
import { BookGuideView } from "./book-guide";

const TOOLS: [string, { hash: string; title: string; text: string }[]][] = [
  ["Words and languages", [
    { hash: "lexicon", title: "Hebrew and Greek lexicon", text: "19,500 entries with a concordance for every word" },
    { hash: "morph", title: "Search by grammar", text: "Find every aorist passive, every Hiphil, or any form of a word" },
    { hash: "glossary", title: "Theological terms", text: "Your glossary beside named sources, with each term's use through the centuries" },
    { hash: "letters", title: "Letter value calculator", text: "Standard Hebrew and Greek letter values for any word" },
  ]],
  ["The text", [
    { hash: "symbols", title: "Genre and symbols", text: "A passage's style, the passages it echoes in Hebrew and Greek, and what its images may draw on" },
    { hash: "compare", title: "Compare texts", text: "Hebrew, Septuagint, Greek, Vulgate and English, with quotations side by side" },
    { hash: "synopsis", title: "Gospel synopsis", text: "366 sections of Matthew, Mark, Luke and John in parallel" },
    { hash: "textual", title: "Textual notes", text: "Disputed passages, and what each Greek edition prints" },
    { hash: "dc", title: "Deuterocanon and related books", text: "Books in Catholic and Orthodox Bibles, with where each church stands" },
    { hash: "originals", title: "Primary texts", text: "Apostolic Fathers in Greek and English, and Josephus" },
    { hash: "books", title: "Books of the Bible", text: "Book guides, names, chapters and disputed dates" },
    { hash: "topics", title: "Topics", text: "5,319 subjects from Nave's Topical Bible" },
  ]],
  ["Search and history", [
    { hash: "search", title: "Advanced search", text: "The Bible, terms, church history, creeds, writers and your notes together" },
    { hash: "history", title: "History", text: "Timelines, Church Fathers, creeds and biblical people" },
  ]],
];

export function ExplorePage() {
  const { prefs } = useData();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"words" | "phrase">("words");
  const [scope, setScope] = useState<"all" | "ot" | "nt">("all");
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const parsedRef = useMemo(() => (query && parseReference(query) ? query : null), [query]);
  const strongs = useMemo(() => normalizeStrongs(query), [query]);
  const results = useAsync(async () => {
    if (query.length < 2) return null;
    const [text, topics, lex] = await Promise.all([
      parsedRef || strongs ? Promise.resolve({ hits: [] as SearchHit[], total: 0 }) : searchText(prefs.translation, query, { mode, scope, limit: 60 }),
      searchTopics(query, 6),
      searchLexicon(query, 6),
    ]);
    await ensureFigures();
    const people = searchFigures(query).slice(0, 6);
    return { text, topics, lex, people };
  }, [query, mode, scope, prefs.translation, parsedRef, strongs]);

  return (
    <div className="page">
      <h1 className="page-title">Explore</h1>
      <ExploreNav active="explore" />
      <input id="search" className="input big" type="search" placeholder="Search a verse, word, topic, person or G26" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      {query.length >= 2 && !parsedRef && !strongs && (
        <div className="filters">
          <select id="search-mode" aria-label="Match" value={mode} onChange={(e) => setMode(e.target.value as "words" | "phrase")}><option value="words">All these words</option><option value="phrase">Exact phrase</option></select>
          <select id="search-scope" aria-label="Search in" value={scope} onChange={(e) => setScope(e.target.value as "all" | "ot" | "nt")}><option value="all">Whole Bible</option><option value="ot">Old Testament</option><option value="nt">New Testament</option></select>
          <span className="fine">Searching {prefs.translation}</span>
        </div>
      )}

      {query.length < 2 && (
        <>
          {TOOLS.map(([group, list]) => (
            <section key={group}>
              <h3>{group}</h3>
              <div className="tool-list">{list.map((t) => <a key={t.hash} href={`#${t.hash}`} className="tool-row"><strong>{t.title}</strong><span>{t.text}</span></a>)}</div>
            </section>
          ))}
        </>
      )}

      {parsedRef && hashForReference(parsedRef) && <a className="tool-row" href={`#${hashForReference(parsedRef)}`}><strong>Open {parsedRef}</strong><span>Go to this passage in the reader</span></a>}
      {results.loading && query.length >= 2 && <Loading label="Searching" />}
      <ErrorNote error={results.error} />
      {results.data && (
        <div className="results">
          {results.data.lex.length > 0 && <section><h3>Hebrew and Greek words</h3>{results.data.lex.map((r) => <LexRow key={r[0]} r={r} />)}</section>}
          {results.data.topics.length > 0 && <section><h3>Topics</h3><ul className="link-list">{results.data.topics.map((t) => <li key={t[0]}><a href={`#topic-${t[0]}`}>{t[1]}</a><span className="shared">{t[2]} references</span></li>)}</ul></section>}
          {results.data.people.length > 0 && <section><h3>People</h3><ul className="link-list">{results.data.people.map((p) => <li key={p.id}><a href={`#person-${p.id}`}>{p.name}</a><span className="shared">{p.title}</span></li>)}</ul></section>}
          {!parsedRef && !strongs && (
            <section>
              <h3>Verses {results.data.text.total > 0 && <span className="count">{results.data.text.total.toLocaleString()} found{results.data.text.total > 60 ? ", showing 60" : ""}</span>}</h3>
              {results.data.text.hits.length ? results.data.text.hits.map((h) => (
                <a key={h.ref} className="hit" href={`#${readHash({ book: h.book, chapter: h.chapter, verse: h.verse })}`}><strong>{h.ref}</strong><Highlighted text={h.text} query={query} /></a>
              )) : <Empty>No verses in {prefs.translation} match. Try fewer words or another translation.</Empty>}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <span> {text}</span>;
  const re = new RegExp(`\\b(${words.join("|")})\\b`, "gi");
  return <span> {text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</span>;
}

const LexRow = ({ r }: { r: LexIndexRow }) => (
  <a className="word-row" href={`#word-${r[0].toLowerCase()}`}>
    <span className={r[0][0] === "H" ? "orig hebrew" : "orig greek"} lang={r[0][0] === "H" ? "he" : "grc"} dir={r[0][0] === "H" ? "rtl" : "ltr"}>{r[1]}</span>
    <span className="word-mid"><span className="gloss">{r[3]}</span><span className="fine">{r[2]} · {r[4].toLocaleString()} occurrences</span></span>
    <span className="strong">{r[0]}</span>
  </a>
);

export function LexiconPage() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const t = setTimeout(() => setQuery(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, loading } = useAsync(() => (query.trim() ? searchLexicon(query, 60) : Promise.resolve([])), [query]);
  return (
    <div className="page">
      <h1 className="page-title">Lexicon</h1>
      <ExploreNav active="lexicon" />
      <input id="lex-search" className="input big" type="search" placeholder="Try love, agape, H2617 or shalom" aria-label="Search the lexicon" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && query.trim() && <Loading />}
      {data?.map((r) => <LexRow key={r[0]} r={r} />)}
      {query.trim() && !loading && !data?.length && <Empty>No entries match. Try another spelling or an English meaning.</Empty>}
      {!query.trim() && <p className="fine">Search by English meaning, transliteration, original spelling or Strong's number. Definitions come from Strong's dictionaries and STEP Bible's brief lexicons.</p>}
    </div>
  );
}

export function WordPage({ id }: { id: string }) {
  const { prefs } = useData();
  const clean = normalizeStrongs(id);
  const { data: entry, loading, error } = useAsync(() => (clean ? getLexEntry(clean) : Promise.resolve(null)), [clean]);
  const [shown, setShown] = useState(30);
  const conc = useAsync(async () => {
    if (!clean) return null;
    const codes = await getConcordance(clean);
    return { total: codes.length, codes };
  }, [clean]);
  const verses = useAsync(async () => {
    if (!conc.data) return [];
    return Promise.all(conc.data.codes.slice(0, shown).map(async (code) => {
      const d = decodeVerseCode(code);
      return { ref: refOf(d.book, d.chapter, d.verse), text: await getVerse(prefs.translation, d.book, d.chapter, d.verse), ...d };
    }));
  }, [conc.data, shown, prefs.translation]);
  if (loading) return <div className="page"><Loading /></div>;
  if (error || !entry || !clean) return <div className="page"><ErrorNote error={error} />{!error && <Empty>No lexicon entry for {id.toUpperCase()}.</Empty>}</div>;
  const hebrew = clean[0] === "H";
  const g = gematria(entry.l ?? "");
  const senses = entry.m ?? [];
  return (
    <div className="page prose">
      <p className="eyebrow">{clean} · {hebrew ? "Hebrew" : "Greek"}</p>
      <h1 className={`orig-big ${hebrew ? "hebrew" : "greek"}`} lang={hebrew ? "he" : "grc"} dir={hebrew ? "rtl" : "ltr"}>{entry.l}</h1>
      <p className="sub">{entry.x}{entry.p ? ` · ${entry.p}` : ""}</p>
      <div className="stat-row">
        <span><strong>{entry.c.toLocaleString()}</strong> occurrences</span>
        <span><strong>{entry.v.toLocaleString()}</strong> verses</span>
        {g.total > 0 && <span><strong>{g.total}</strong> letter value</span>}
      </div>
      {entry.s && <><h3>Strong's definition</h3><p>{entry.s.trim()}{entry.d ? ` (${entry.d.trim()})` : ""}</p></>}
      {entry.k && <p className="fine">KJV renders it: {entry.k}</p>}
      {senses.length > 0 && (
        <>
          <h3>Lexicon</h3>
          {senses.slice(0, 6).map((s, i) => (
            <div key={i} className="sense">
              <strong>{s.g}</strong>
              {s.t && <div className="lex-text"><LexText text={s.t} /></div>}
            </div>
          ))}
        </>
      )}
      <h3>Every verse with this word</h3>
      {conc.data?.total === 0 && <Empty>This word isn't tagged in the text used here.</Empty>}
      {verses.data?.map((v) => (
        <a key={v.ref} className="hit" href={`#${readHash({ book: v.book, chapter: v.chapter, verse: v.verse })}`}><strong>{v.ref}</strong> <span>{v.text}</span></a>
      ))}
      {conc.data && conc.data.total > shown && <button type="button" className="btn" onClick={() => setShown((s) => s + 50)}>Show more ({(conc.data.total - shown).toLocaleString()} left)</button>}
      <p className="fine">Definitions from Strong's dictionaries (Open Scriptures) and the Translators Brief Lexicons (STEP Bible, CC BY 4.0).</p>
    </div>
  );
}

export function BooksPage() {
  const { data } = useAsync(getBooks, []);
  const guided = useAsync(guideBooks, []);
  if (!data) return <div className="page"><Loading /></div>;
  return (
    <div className="page">
      <h1 className="page-title">Books of the Bible</h1>
      {(guided.data?.length ?? 0) > 0 && <p className="fine">Books marked Guide have a full book guide: counted facts, early witnesses, key words and AI drafts on request.</p>}
      <div className="tool-list">
        {data.map((b, i) => <a key={b.name} href={`#book-${b.name.toLowerCase().replace(/\s+/g, "")}`} className="tool-row"><strong>{b.name}{guided.data?.includes(i + 1) && <span className="tag tag-cited">Guide</span>}</strong><span>{b.testament} · {b.chapters} chapters · {b.verses.toLocaleString()} verses</span></a>)}
      </div>
      <p className="fine">Names and meanings from BibleData (CC BY 4.0).</p>
    </div>
  );
}

export function BookPage({ slug }: { slug: string }) {
  const book = BOOKS.find((b) => b.name.toLowerCase().replace(/\s+/g, "") === slug);
  const dating = useAsync(async () => (await getChronology()).books.find((b) => b.book === book?.name), [slug]);
  const { data } = useAsync(async () => {
    if (!book) return null;
    const [meta, chapters, guide, guided] = await Promise.all([getBookMeta(book.number), chapterCount(book.number), getBookGuide(book.number), guideBooks()]);
    return { meta, chapters, guide, guided };
  }, [slug]);
  if (!book) return <div className="page"><Empty>That book wasn't found.</Empty></div>;
  if (!data) return <div className="page"><Loading /></div>;
  const m = data.meta;
  if (data.guide) {
    // An Old Testament book's own name is its Hebrew one; the Greek is the Septuagint's, which English titles follow.
    const greekName = (
      <>
        {m?.hebrew && <><dt>Hebrew name</dt><dd><span className="hebrew" lang="he" dir="rtl">{m.hebrew}</span> {m.hebrewTranslit}{m.hebrewMeaning ? `, “${m.hebrewMeaning}”` : ""}</dd></>}
        {m?.greek && <><dt>Greek name</dt><dd><span className="greek" lang="grc">{m.greek}</span> {m.greekTranslit}</dd></>}
      </>
    );
    return <><BookGuideView g={data.guide} testament={m?.testament} greekName={greekName} /><div className="page"><ScholarshipLinks query={`${book.name} biblical studies`} /></div></>;
  }
  return (
    <div className="page prose">
      <p className="eyebrow">{m?.testament}</p>
      <h1 className="page-title">{book.name}</h1>
      <dl className="facts">
        <dt>Length</dt><dd>{m?.chapters} chapters, {m?.verses.toLocaleString()} verses</dd>
        {m?.hebrew && <><dt>Hebrew name</dt><dd><span className="hebrew" lang="he" dir="rtl">{m.hebrew}</span> {m.hebrewTranslit}{m.hebrewMeaning ? `, “${m.hebrewMeaning}”` : ""}</dd></>}
        {m?.greek && <><dt>Greek name</dt><dd><span className="greek" lang="grc">{m.greek}</span> {m.greekTranslit}{m.greekMeaning ? `, “${m.greekMeaning}”` : ""}</dd></>}
      </dl>
      {dating.data && (
        <div className="note">
          <strong>When it was written is disputed</strong>
          <ul className="fine-list">{dating.data.views.map((v) => <li key={v.label}><strong>{v.label}.</strong> {v.who}</li>)}</ul>
          <a className="link-btn" href="#dating">See sources</a>
        </div>
      )}
      <h3>Chapters</h3>
      <div className="num-grid">{Array.from({ length: data.chapters }, (_, i) => i + 1).map((c) => <button type="button" key={c} onClick={() => navigate(readHash({ book: book.number, chapter: c }))}>{c}</button>)}</div>
      {data.guided.length > 0 && <p className="note">Full book guides are being built one book at a time. So far: {data.guided.map((n, i) => <span key={n}>{i ? ", " : ""}<a href={`#book-${BOOKS[n - 1].name.toLowerCase().replace(/\s+/g, "")}`}>{BOOKS[n - 1].name}</a></span>)}.</p>}
      <a className="btn primary" href={`#new-${book.name.toLowerCase().replace(/\s+/g, "")}`}>Build a study guide on {book.name}</a>
      <a className="btn" href={`#ask-${slug}-1`}>Ask AI about this book</a>
      <ScholarshipLinks query={`${book.name} biblical studies`} />
    </div>
  );
}

export function TopicsPage() {
  const { data } = useAsync(getTopicIndex, []);
  const [q, setQ] = useState("");
  const list: TopicRow[] = useMemo(() => {
    if (!data) return [];
    const lq = q.toLowerCase();
    return (lq ? data.filter((t) => t[1].toLowerCase().includes(lq)) : [...data].sort((a, b) => b[2] - a[2])).slice(0, 80);
  }, [data, q]);
  return (
    <div className="page">
      <h1 className="page-title">Topics</h1>
      <input id="topic-search" className="input big" type="search" placeholder="Forgiveness, prayer, covenant…" aria-label="Search topics" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q && <p className="fine">Showing the largest topics. Search to find any of the 5,319 subjects.</p>}
      <ul className="link-list spaced">{list.map((t) => <li key={t[0]}><a href={`#topic-${t[0]}`}>{t[1]}</a><span className="shared">{t[2]} references</span></li>)}</ul>
      <p className="fine">From Nave's Topical Bible (public domain), via BibleData (CC BY 4.0).</p>
    </div>
  );
}

export function TopicPage({ slug }: { slug: string }) {
  const { data, loading } = useAsync(() => getTopic(slug), [slug]);
  if (loading) return <div className="page"><Loading /></div>;
  if (!data) return <div className="page"><Empty>That topic wasn't found.</Empty></div>;
  return (
    <div className="page prose">
      <p className="eyebrow">Topic</p>
      <h1 className="page-title">{data.name}</h1>
      <a className="btn primary" href={`#new-${slug}`}>Build a study guide on this topic</a>
      {data.items.map((it, i) => (
        <div key={i} className={it.d ? "topic-item sub-item" : "topic-item"}>
          {it.t && <p className="topic-head">{it.t === it.t.toUpperCase() ? it.t.charAt(0) + it.t.slice(1).toLowerCase() : it.t.charAt(0).toUpperCase() + it.t.slice(1)}</p>}
          {it.r && <p className="ref-row">{it.r.map((r, j) => <span key={j}>{j > 0 && " · "}<RefLink refText={r} /></span>)}</p>}
        </div>
      ))}
    </div>
  );
}

export function LettersPage() {
  const [input, setInput] = useState("");
  const g = gematria(input);
  return (
    <div className="page prose">
      <h1 className="page-title">Letter value calculator</h1>
      <p>Adds the standard numeric values of Hebrew and Greek letters. This is arithmetic only. It doesn't suggest any meaning for the result.</p>
      <label htmlFor="gematria-input" className="label">Enter Hebrew or Greek letters</label>
      <input id="gematria-input" className="input" dir="auto" value={input} onChange={(e) => setInput(e.target.value)} placeholder="אהבה or λόγος" />
      {g.system !== "None" && <p><strong>{g.total}</strong> ({g.letters.map((l) => `${l.ch} ${l.value}`).join(" + ")})</p>}
    </div>
  );
}
export { bookName };
