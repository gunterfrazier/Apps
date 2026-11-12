import { useEffect, useMemo, useState } from "react";
import { getChapter, getPassage, getVerse, refOf, translationInfo, verseCount } from "../../core/bible";
import { getInsights } from "../../core/insights";
import { decodeMorph, getVerseWords, normalizeStrongs, type WordTuple } from "../../core/lexicon";
import { load, pad2 } from "../../core/data";
import { BOOKS, bookName, parseReference } from "../../core/references";
import { DC_STATUS, EDITIONS, GOSPELS, getApostolic, getDeuterocanon, getDisputed, getJosephus, getSynopsis, hebrewReadings, lxxChapters, sameStrong, taggedVerse, verseVariants, vulgateChapters, type TaggedWord, type VariantWord } from "../../core/scholar";
import { hashForReference, parseReadParts, readHash } from "../routes";
import { navigate, useData } from "../store";
import { Empty, ErrorNote, Loading, RefLink, Tag, useAsync } from "../ui";
import { Actions, CiteButton, saveQuoteToNotebook } from "./scholar-ui";

export const ExploreNav = ({ active }: { active: string }) => (
  <div className="subnav" role="tablist">
    {[["explore", "Search"], ["lexicon", "Lexicon"], ["morph", "Grammar search"], ["compare", "Compare texts"], ["synopsis", "Gospel synopsis"], ["textual", "Textual notes"], ["dc", "Deuterocanon"], ["originals", "Primary texts"], ["glossary", "Terms"], ["topics", "Topics"], ["books", "Books"]].map(([h, label]) => (
      <a key={h} href={`#${h}`} className={active === h ? "on" : ""}>{label}</a>
    ))}
  </div>
);

// ---------- Word by word ----------
/** The BSB linked to the Hebrew or Greek. Tapping either side marks its partner. */
export function Interlinear({ book, chapter, verse }: { book: number; chapter: number; verse: number }) {
  const { data, loading, error } = useAsync(async () => {
    const [words, tags] = await Promise.all([getVerseWords(book, chapter, verse), taggedVerse(book, chapter, verse)]);
    return { words, tags };
  }, [book, chapter, verse]);
  const [pick, setPick] = useState("");
  useEffect(() => setPick(""), [book, chapter, verse]);
  if (loading) return <Loading label="Loading Hebrew and Greek" />;
  if (error) return <ErrorNote error={error} />;
  const { words, tags } = data!;
  if (!words.length) return <Empty>No original-language words for this verse.</Empty>;
  const hebrew = book <= 39;
  const on = (s: string) => pick !== "" && sameStrong(s, pick);
  return (
    <div>
      {tags.length > 0 && (
        <p className="tagged" aria-label="Berean Standard Bible, tap a word to find it in the original">
          {tags.map((t: TaggedWord, i: number) => t.strong
            ? <button type="button" key={i} className={`tag-word ${on(t.strong) ? "on" : ""}`} onClick={() => setPick(pick && sameStrong(t.strong, pick) ? "" : t.strong)}>{t.text}</button>
            : <span key={i}> {t.text} </span>)}
        </p>
      )}
      <div className={`interlinear ${hebrew ? "rtl" : ""}`} dir={hebrew ? "rtl" : "ltr"}>
        {words.map((w: WordTuple, i: number) => (
          <div key={i} className={`il-word ${on(w[3]) ? "on" : ""}`} dir="ltr">
            <button type="button" className={`il-orig ${hebrew ? "hebrew" : "greek"}`} lang={hebrew ? "he" : "grc"} dir={hebrew ? "rtl" : "ltr"} onClick={() => setPick(pick && sameStrong(w[3], pick) ? "" : w[3])}>{w[0]}</button>
            <span className="il-tr">{w[1]}</span>
            <span className="il-gloss">{w[2].replace(/[<>]/g, "")}</span>
            <a className="il-parse" href={`#word-${(normalizeStrongs(w[3]) ?? "").toLowerCase()}`} title={decodeMorph(w[4])}>{w[3].replace(/[A-Za-z]$/, "")}</a>
            <a className="il-morph" href={`#morph-${(normalizeStrongs(w[3]) ?? "").toLowerCase()}`} title={`Search for ${decodeMorph(w[4])}`}>{decodeMorph(w[4])}</a>
          </div>
        ))}
      </div>
      <p className="fine">Tap an English word to find it in the {hebrew ? "Hebrew" : "Greek"}, or the reverse. Word links are from a Strong's-tagged Berean Standard Bible (CC0), and some wording differs slightly from the BSB in the reader. Hebrew and Greek from STEP Bible (Tyndale House), CC BY 4.0.</p>
    </div>
  );
}

// ---------- Search by grammar ----------
const GK: Record<string, [string, string][]> = {
  pos: [["", "Any part of speech"], ["V", "Verb"], ["N", "Noun"], ["A", "Adjective"], ["P", "Personal pronoun"], ["T", "Article"], ["R", "Relative pronoun"], ["PREP", "Preposition"], ["CONJ", "Conjunction"], ["ADV", "Adverb"]],
  tense: [["", "Any tense"], ["P", "Present"], ["I", "Imperfect"], ["F", "Future"], ["A", "Aorist"], ["R", "Perfect"], ["L", "Pluperfect"]],
  voice: [["", "Any voice"], ["A", "Active"], ["M", "Middle"], ["P", "Passive"], ["E", "Middle or passive"], ["D", "Deponent middle"], ["O", "Deponent passive"]],
  mood: [["", "Any mood"], ["I", "Indicative"], ["S", "Subjunctive"], ["O", "Optative"], ["M", "Imperative"], ["N", "Infinitive"], ["P", "Participle"]],
  kase: [["", "Any case"], ["N", "Nominative"], ["G", "Genitive"], ["D", "Dative"], ["A", "Accusative"], ["V", "Vocative"]],
  num: [["", "Any number"], ["S", "Singular"], ["P", "Plural"]],
};
const HB: Record<string, [string, string][]> = {
  pos: [["", "Any part of speech"], ["V", "Verb"], ["N", "Noun"], ["A", "Adjective"], ["P", "Pronoun"], ["R", "Preposition"], ["C", "Conjunction"], ["D", "Adverb"]],
  stem: [["", "Any stem"], ["q", "Qal"], ["N", "Niphal"], ["p", "Piel"], ["P", "Pual"], ["h", "Hiphil"], ["H", "Hophal"], ["t", "Hithpael"]],
  form: [["", "Any form"], ["p", "Perfect"], ["q", "Sequential perfect"], ["i", "Imperfect"], ["w", "Sequential imperfect"], ["h", "Cohortative"], ["j", "Jussive"], ["v", "Imperative"], ["r", "Participle, active"], ["s", "Participle, passive"], ["a", "Infinitive absolute"], ["c", "Infinitive construct"]],
};
function matchGreek(m: string, f: Record<string, string>) {
  const [head, rest = "", more = ""] = m.split("-");
  if (f.pos && !(f.pos.length > 1 ? head === f.pos : head === f.pos)) return false;
  if (head === "V") {
    const t = rest.replace(/^[23]/, "");
    if (f.tense && t[0] !== f.tense) return false;
    if (f.voice && t[1] !== f.voice) return false;
    if (f.mood && t[2] !== f.mood) return false;
    if (f.kase && more[0] !== f.kase) return false;
    if (f.num && !(t[2] === "P" ? more[1] === f.num : more[1] === f.num)) return false;
    return true;
  }
  if (f.tense || f.voice || f.mood) return false;
  if (f.kase && rest[0] !== f.kase) return false;
  if (f.num && rest[1] !== f.num) return false;
  return true;
}
const matchHebrew = (m: string, f: Record<string, string>) => {
  const parts = m.replace(/^[HA]/, "").split("/");
  return parts.some((p) => {
    if (f.pos && p[0] !== f.pos) return false;
    if (p[0] === "V") {
      if (f.stem && p[1] !== f.stem) return false;
      if (f.form && p[2] !== f.form) return false;
      return true;
    }
    return !f.stem && !f.form;
  });
};
interface MorphHit { ref: string; book: number; c: number; v: number; word: WordTuple }

export function MorphPage({ initial }: { initial?: string }) {
  const { prefs } = useData();
  const [lang, setLang] = useState<"greek" | "hebrew">(initial?.startsWith("h") ? "hebrew" : "greek");
  const [strong, setStrong] = useState((initial ?? "").toUpperCase());
  const [f, setF] = useState<Record<string, string>>({});
  const [scope, setScope] = useState(0);
  const [hits, setHits] = useState<MorphHit[] | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [run, setRun] = useState(0);
  const opts = lang === "greek" ? GK : HB;
  const books = useMemo(() => BOOKS.filter((b) => (lang === "greek" ? b.number >= 40 : b.number <= 39)), [lang]);
  const setOne = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { if (!run) return; let live = true; (async () => {
    const list = scope ? [scope] : books.map((b) => b.number);
    const id = normalizeStrongs(strong);
    const out: MorphHit[] = [];
    for (let i = 0; i < list.length && out.length < 300 && live; i++) {
      setProgress([i + 1, list.length]);
      const data = await load<WordTuple[][][]>(`words/${pad2(list[i])}.json`);
      data.forEach((ch, c) => ch.forEach((vs, v) => (vs ?? []).forEach((w) => {
        if (out.length >= 300) return;
        if (id && !sameStrong(w[3], id)) return;
        if (!(lang === "greek" ? matchGreek(w[4], f) : matchHebrew(w[4], f))) return;
        out.push({ ref: `${bookName(list[i])} ${c + 1}:${v + 1}`, book: list[i], c: c + 1, v: v + 1, word: w });
      })));
      await new Promise((r) => setTimeout(r));
    }
    if (live) { setHits(out); setProgress(null); }
  })().catch(() => { if (live) { setHits([]); setProgress(null); } }); return () => { live = false; }; }, [run]);
  const hebrew = lang === "hebrew";
  return (
    <div className="page">
      <h1 className="page-title">Search by grammar</h1>
      <p className="sub">Find every place a word or form occurs, using the morphology in STEP Bible's Hebrew and Greek.</p>
      <ExploreNav active="morph" />
      <div className="segmented" role="group" aria-label="Language">
        <button type="button" className={!hebrew ? "on" : ""} onClick={() => { setLang("greek"); setF({}); setScope(0); setHits(null); }}>Greek New Testament</button>
        <button type="button" className={hebrew ? "on" : ""} onClick={() => { setLang("hebrew"); setF({}); setScope(0); setHits(null); }}>Hebrew Bible</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setHits(null); setRun(run + 1); }}>
        <label className="label" htmlFor="morph-strong">Strong's number (optional)</label>
        <input id="morph-strong" className="input" placeholder={hebrew ? "H7225" : "G26"} value={strong} onChange={(e) => setStrong(e.target.value)} />
        <div className="filters">
          {Object.entries(opts).map(([k, list]) => (
            <select key={k} aria-label={list[0][1].replace("Any ", "")} value={f[k] ?? ""} onChange={(e) => setOne(k, e.target.value)}>
              {list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <select aria-label="Book" value={scope} onChange={(e) => setScope(Number(e.target.value))}>
            <option value={0}>{hebrew ? "Whole Hebrew Bible" : "Whole New Testament"}</option>
            {books.map((b) => <option key={b.number} value={b.number}>{b.name}</option>)}
          </select>
          <button type="submit" className="btn small primary">Search</button>
        </div>
      </form>
      {progress && <p className="loading" role="status"><span className="dot" />Searching book {progress[0]} of {progress[1]}…</p>}
      {hits && <p className="fine">{hits.length >= 300 ? "Showing the first 300 matches. Narrow by book or form to see more." : `${hits.length} ${hits.length === 1 ? "match" : "matches"}.`}</p>}
      {hits && hits.length > 0 && (
        <ul className="morph-list">
          {hits.slice(0, 300).map((h, i) => (
            <li key={i}>
              <RefLink refText={h.ref} />
              <span className={hebrew ? "orig hebrew" : "orig greek"} dir={hebrew ? "rtl" : "ltr"}>{h.word[0]}</span>
              <span className="fine">{h.word[2].replace(/[<>]/g, "")} · {decodeMorph(h.word[4])}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="fine">Reading in {prefs.translation}. Grammar from STEP Bible (Tyndale House), CC BY 4.0, following the Nestle-Aland text for Greek and ETCBC's analysis for Hebrew.</p>
    </div>
  );
}

// ---------- Editions and readings for one verse ----------
function editionsText(ed: string) {
  const have = ed.split("+").map((s) => s.trim()).filter(Boolean);
  const names = have.map((h) => EDITIONS.find((e) => e.id === h)?.id ?? h);
  return names.join(", ");
}
export function EditionsPanel({ book, chapter, verse }: { book: number; chapter: number; verse: number }) {
  const { data, loading } = useAsync(async () => ({ gk: await verseVariants(book, chapter, verse), hb: await hebrewReadings(book, chapter, verse) }), [book, chapter, verse]);
  if (loading) return <Loading label="Checking the editions" />;
  const { gk, hb } = data ?? { gk: [], hb: [] };
  if (!gk.length && !hb.length) return <p className="fine">The editions compared here agree on the wording of this verse, apart from spelling. {book >= 40 ? "That doesn't mean the manuscripts all agree." : ""}</p>;
  return (
    <div>
      {gk.length > 0 && (
        <>
          <p className="fine">Words the printed Greek editions don't share, with the editions that have each one.</p>
          <ul className="variant-list">
            {gk.map((w: VariantWord, i: number) => (
              <li key={i}>
                <span className="orig greek" lang="grc">{w[1].replace(/[\[\]]/g, "")}</span> <span className="fine">“{w[2].replace(/[<>]/g, "")}”</span>
                <div className="fine">In: {editionsText(w[3])}</div>
                {w[4] && <div className="fine">Other reading: {w[4]}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
      {hb.length > 0 && (
        <>
          <p className="fine">Places where the Hebrew text has a marked reading. Q is the Qere, what scribes read aloud. K is the Ketiv, what is written. R is restored text and X is text reconstructed from the Septuagint.</p>
          <ul className="variant-list">
            {hb.map((w, i) => (
              <li key={i}><span className="orig hebrew" lang="he" dir="rtl">{w[1]}</span> <span className="fine">“{w[2]}” · {w[3]}</span>{w[4] && <div className="fine">{w[4]}</div>}</li>
            ))}
          </ul>
        </>
      )}
      <p className="fine">From STEP Bible's Translators Amalgamated texts (Tyndale House), CC BY 4.0. This compares printed editions, not a full manuscript apparatus. For that, a critical edition such as NA28 or BHS is still the tool to use.</p>
    </div>
  );
}

// ---------- Hebrew, Greek, Latin and English side by side ----------
function AncientLine({ label, lang, text, dir }: { label: string; lang: string; text: string; dir?: string }) {
  return <div className="anc-line"><span className="anc-label">{label}</span><p lang={lang} dir={dir} className={lang === "grc" ? "greek" : lang === "he" ? "hebrew" : ""}>{text}</p></div>;
}
const wordsText = (w: WordTuple[]) => w.map((x) => x[0]).join(" ");

export function VerseColumns({ book, chapter, verse, compact }: { book: number; chapter: number; verse: number; compact?: boolean }) {
  const { prefs } = useData();
  const { data, loading } = useAsync(async () => {
    const [orig, lxx, vul, eng] = await Promise.all([getVerseWords(book, chapter, verse), lxxChapters(book, chapter), vulgateChapters(book, chapter), getVerse(prefs.translation, book, chapter, verse)]);
    const find = (list: { chapter: number; verses: [number, string][] }[]) => list.flatMap((c) => c.verses.filter(([v]) => v === verse).map(([, t]) => t)).join(" ");
    return { orig: wordsText(orig), lxx: find(lxx), vul: find(vul), eng };
  }, [book, chapter, verse, prefs.translation]);
  if (loading || !data) return <Loading />;
  return (
    <div className="anc-grid">
      <AncientLine label={book <= 39 ? "Hebrew" : "Greek"} lang={book <= 39 ? "he" : "grc"} dir={book <= 39 ? "rtl" : "ltr"} text={data.orig || "(none)"} />
      {book <= 39 && <AncientLine label="Septuagint" lang="grc" text={data.lxx || (book === 21 ? "(Ecclesiastes is missing from this digital Swete.)" : "(no verse with this number)")} />}
      <AncientLine label="Vulgate" lang="la" text={data.vul || "(no verse with this number)"} />
      {!compact && <AncientLine label={prefs.translation} lang="en" text={data.eng || "(not in this translation)"} />}
    </div>
  );
}

export function ComparePage({ tail }: { tail?: string }) {
  const route = tail ? parseReadParts(tail) : null;
  const [input, setInput] = useState(route ? refOf(route.book, route.chapter, route.verse ?? 1) : "Psalm 22:1");
  const go = (e: { preventDefault(): void }) => { e.preventDefault(); const h = hashForReference(input); if (h) navigate(`compare-${h.slice(5)}`); };
  const book = route?.book, chapter = route?.chapter, verse = route?.verse ?? 1;
  const links = useAsync(async () => {
    if (!book || !chapter) return null;
    const i = await getInsights(refOf(book, chapter, verse));
    return { quotes: i.quotes, quotedBy: i.quotedBy };
  }, [book, chapter, verse]);
  const others = [...(links.data?.quotes ?? []), ...(links.data?.quotedBy ?? [])].slice(0, 6);
  return (
    <div className="page wide-page">
      <h1 className="page-title">Compare texts</h1>
      <p className="sub">The Hebrew, Septuagint, Greek New Testament, Vulgate and your translation for one verse, with the places it quotes or is quoted.</p>
      <ExploreNav active="compare" />
      <form className="search-row" onSubmit={go}>
        <input className="input" aria-label="Verse" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Isaiah 7:14" />
        <button type="submit" className="btn small primary">Compare</button>
      </form>
      {book && chapter ? (
        <>
          <h3>{refOf(book, chapter, verse)}</h3>
          <VerseColumns book={book} chapter={chapter} verse={verse} />
          <div className="action-row">
            <a className="btn small" href={`#${readHash({ book, chapter, verse })}`}>Open in reader</a>
            <a className="btn small" href={`#compare-${readHash({ book, chapter, verse: Math.max(1, verse - 1) }).slice(5)}`}>Previous verse</a>
            <a className="btn small" href={`#compare-${readHash({ book, chapter, verse: verse + 1 }).slice(5)}`}>Next verse</a>
          </div>
          {others.length > 0 && <h3>Where this is quoted or quotes</h3>}
          {others.map((o) => {
            const s = parseReference(o.ref)?.[0];
            if (!s || !s.verseStart) return null;
            return (
              <div key={o.ref}>
                <h4><RefLink refText={o.ref} /></h4>
                <VerseColumns book={s.book} chapter={s.chapter} verse={s.verseStart} compact />
              </div>
            );
          })}
          <p className="fine">Hebrew and Greek from STEP Bible, CC BY 4.0. Septuagint from Swete's edition (1909–30) as digitized by the First Thousand Years of Greek project, CC BY-SA 4.0, machine-corrected and without Ecclesiastes. Latin from the Clementine Vulgate, public domain. The Septuagint's Psalms and Jeremiah are numbered differently. Psalms are matched by psalm, so check verse numbers there, and in Jeremiah 25 and after, check the chapter too.</p>
        </>
      ) : <p className="empty">Enter a verse to begin.</p>}
    </div>
  );
}

// ---------- Textual notes ----------
export function TextualPage() {
  const { data, error } = useAsync(getDisputed, []);
  return (
    <div className="page">
      <h1 className="page-title">Textual notes</h1>
      <p className="sub">Well-known places where Greek manuscripts and printed editions differ, with what each edition prints.</p>
      <ExploreNav active="textual" />
      <ErrorNote error={error} />
      {data?.map((d) => <Disputed key={d.ref} ref_={d.ref} label={d.label} note={d.note} />)}
      <details className="doctrine">
        <summary>The editions compared</summary>
        <ul className="fine-list">{EDITIONS.map((e) => <li key={e.id}><strong>{e.id}:</strong> {e.name}{e.year ? `, ${e.year}` : ""}. {e.family === "traditional" ? "Traditional text." : "Critical text."}</li>)}</ul>
      </details>
      <p className="fine">The notes on each passage are short summaries by Claude. Which editions print which words comes from STEP Bible's Translators Amalgamated Greek New Testament (Tyndale House), CC BY 4.0. Tap any verse in the reader and open Text for this on every verse.</p>
    </div>
  );
}
function Disputed({ ref_, label, note }: { ref_: string; label: string; note: string }) {
  const [open, setOpen] = useState(false);
  const seg = parseReference(ref_)?.[0];
  const v = seg?.verseStart ?? 1;
  return (
    <article className="excerpt">
      <header><strong>{label}</strong></header>
      <p className="ex-on"><RefLink refText={ref_} /></p>
      <p>{note}</p>
      <Actions>
        <button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? "Hide editions" : "Which editions have it"}</button>
        {seg && <a className="link-btn" href={`#compare-${readHash({ book: seg.book, chapter: seg.chapter, verse: v }).slice(5)}`}>Compare</a>}
      </Actions>
      {open && seg && <EditionsPanel book={seg.book} chapter={seg.chapter} verse={v} />}
    </article>
  );
}

// ---------- Gospel synopsis ----------
export function SynopsisPage({ n }: { n?: number }) {
  const { data, error } = useAsync(getSynopsis, []);
  const [q, setQ] = useState("");
  const { prefs } = useData();
  const p = data?.pericopes.find((x) => x.n === n);
  const s = q.trim().toLowerCase();
  const passages = useAsync(async () => {
    if (!p) return null;
    return Promise.all(GOSPELS.map(async ([k, name]) => {
      const e = p[k as "Matt"];
      if (!e) return { name, ref: "", text: "", primary: false };
      const ref = `${name} ${e[0]}`;
      const got = await getPassage(prefs.translation, ref).catch(() => null);
      const text = got ? got.parts.flatMap((x) => x.verses).map((v) => `${v.verse} ${v.text}`).join(" ") : "";
      return { name, ref, text, primary: Boolean(e[1]) };
    }));
  }, [p?.n, prefs.translation]);
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  if (p) {
    const cols = (passages.data ?? []).filter((x) => x.ref);
    return (
      <div className="page wide-page">
        <p className="eyebrow"><a href="#synopsis">Gospel synopsis</a></p>
        <h1 className="page-title">{p.title}</h1>
        <p className="fine">Section {p.n} in Aland's numbering</p>
        {passages.loading && <Loading label="Opening the Gospels" />}
        <div className="syn-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))` }}>
          {cols.map((c) => (
            <section key={c.name} className="syn-col">
              <h3><RefLink refText={c.ref} /> {!c.primary && <Tag>Secondary</Tag>}</h3>
              <p className="syn-text">{c.text}</p>
            </section>
          ))}
        </div>
        {GOSPELS.some(([k]) => p[`${k}2` as "Matt2"]) && (
          <p className="fine">Other parallels: {GOSPELS.filter(([k]) => p[`${k}2` as "Matt2"]).map(([k, name]) => `${name} ${p[`${k}2` as "Matt2"]}`).join("; ")}</p>
        )}
        <div className="action-row">
          {n! > 1 && <a className="btn small" href={`#synopsis-${n! - 1}`}>Previous</a>}
          <a className="btn small" href={`#synopsis-${n! + 1}`}>Next</a>
        </div>
        <p className="fine">Showing {translationInfo(prefs.translation).name}. Change the translation in the reader. Section order and parallels follow Kurt Aland's Synopsis Quattuor Evangeliorum, from the aland-gospel-synopsis project (MIT). Aland's own Greek synopsis text isn't included.</p>
      </div>
    );
  }
  return (
    <div className="page">
      <h1 className="page-title">Gospel synopsis</h1>
      <p className="sub">The parallel accounts in Matthew, Mark, Luke and John, side by side.</p>
      <ExploreNav active="synopsis" />
      <input className="input" type="search" placeholder="Find a passage, such as sower or Mark 4" aria-label="Find a section" value={q} onChange={(e) => setQ(e.target.value)} />
      {data.sections.map((sec) => {
        const rows = data.pericopes.filter((x) => x.n >= sec.from && x.n <= sec.to && (!s || `${x.title} ${GOSPELS.map(([k, name]) => (x[k as "Matt"] ? `${name} ${x[k as "Matt"]![0]}` : "")).join(" ")}`.toLowerCase().includes(s)));
        if (!rows.length) return null;
        return (
          <details key={sec.n} className="doctrine" open={Boolean(s)}>
            <summary>{sec.title} <span className="fine">({rows.length})</span></summary>
            {rows.map((x) => (
              <a key={x.n} className="tool-row" href={`#synopsis-${x.n}`}>
                <strong>{x.n}. {x.title}</strong>
                <span>{GOSPELS.filter(([k]) => x[k as "Matt"]).map(([k]) => `${k} ${x[k as "Matt"]![0]}`).join(" · ")}</span>
              </a>
            ))}
          </details>
        );
      })}
    </div>
  );
}

// ---------- Deuterocanon ----------
const yes = (b: boolean) => (b ? "Yes" : "No");
export function DcPage({ tail }: { tail?: string }) {
  const { data, error } = useAsync(getDeuterocanon, []);
  const m = /^(.*?)(?:-(\d+))?$/.exec(tail ?? "");
  const id = m?.[1] ?? "";
  const chapter = Number(m?.[2] ?? 1);
  const [ver, setVer] = useState<"dra" | "kjv" | "lxx">("dra");
  const book = data?.books.find((b) => b.id === id);
  const available = book ? (["dra", "kjv", "lxx"] as const).filter((v) => book[v]) : [];
  const shown = book && (book[ver] ? ver : available[0]);
  const text = book && shown ? book[shown] : null;
  const chapters = text ? Object.keys(text).map(Number).sort((a, b) => a - b) : [];
  const verses = text?.[String(chapter)] ? Object.entries(text[String(chapter)]).map(([v, t]) => [Number(v), t] as [number, string]).sort((a, b) => a[0] - b[0]) : [];
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  if (book) {
    const st = DC_STATUS[book.id];
    const NAMES = { dra: "Douay-Rheims (1899)", kjv: "King James (1611)", lxx: "Swete's Greek" };
    return (
      <div className="page">
        <p className="eyebrow"><a href="#dc">Deuterocanon and related books</a></p>
        <h1 className="page-title">{book.name} {chapter}</h1>
        <div className="filters">
          <select aria-label="Version" value={shown} onChange={(e) => setVer(e.target.value as typeof ver)}>{available.map((v) => <option key={v} value={v}>{NAMES[v]}</option>)}</select>
          <select aria-label="Chapter" value={chapter} onChange={(e) => navigate(`dc-${book.id}-${e.target.value}`)}>{chapters.map((c) => <option key={c} value={c}>Chapter {c}</option>)}</select>
        </div>
        <div className="scripture" lang={shown === "lxx" ? "grc" : "en"}>
          {verses.map(([v, t]) => <div key={v} className="verse plain"><sup>{v}</sup><span className={shown === "lxx" ? "greek" : ""}>{t}</span></div>)}
          {!verses.length && <Empty>This chapter isn't in this version.</Empty>}
        </div>
        <div className="action-row">
          {chapters.includes(chapter - 1) && <a className="btn" href={`#dc-${book.id}-${chapter - 1}`}>Previous chapter</a>}
          {chapters.includes(chapter + 1) && <a className="btn" href={`#dc-${book.id}-${chapter + 1}`}>Next chapter</a>}
        </div>
        {st && <p className="fine">In the Catholic canon: {yes(st.catholic)}. In Orthodox Bibles: {yes(st.orthodox)}. Listed for reading in the Thirty-Nine Articles: {yes(st.anglican)}. {st.note ?? ""}</p>}
        <p className="fine">The Douay-Rheims and the 1611 King James are public domain, the second with its original spelling. Greek from Swete's edition, CC BY-SA 4.0.</p>
      </div>
    );
  }
  return (
    <div className="page">
      <h1 className="page-title">Deuterocanon and related books</h1>
      <p className="sub">Books in Catholic and Orthodox Bibles, or printed between the Testaments in older Protestant ones.</p>
      <ExploreNav active="dc" />
      <div className="writer-list">
        {data.books.map((b) => {
          const st = DC_STATUS[b.id];
          const where = [st?.catholic && "Catholic", st?.orthodox && "Orthodox", st?.anglican && "Anglican, for reading"].filter(Boolean).join(" · ") || "Not in any church's canon";
          return <a key={b.id} className="tool-row" href={`#dc-${b.id}-1`}><strong>{b.name}</strong><span>{where}</span></a>;
        })}
      </div>
      <details className="doctrine" open>
        <summary>Where the churches stand</summary>
        <p>Each tradition's position is in its own documents here: <a href="#creed-trent">Council of Trent, Fourth Session</a>, <a href="#creed-dositheus">Confession of Dositheus</a>, <a href="#creed-thirty-nine-articles">Thirty-Nine Articles, Article VI</a> and <a href="#creed-westminster-confession">Westminster Confession, Chapter I</a>.</p>
        <p className="fine">The labels above are short summaries by Claude. Orthodox churches don't all list exactly the same books, so check a particular church's Bible.</p>
      </details>
    </div>
  );
}

// ---------- Primary texts ----------
export function OriginalsPage() {
  const af = useAsync(getApostolic, []);
  const jo = useAsync(getJosephus, []);
  return (
    <div className="page">
      <h1 className="page-title">Primary texts</h1>
      <p className="sub">Sources in their original languages and early translations. Ancient documents and creeds in Greek and Latin are under <a href="#creeds">Creeds</a>.</p>
      <ExploreNav active="originals" />
      <h3>Apostolic Fathers, Greek and English</h3>
      <ErrorNote error={af.error} />
      {af.data && <div className="writer-list">{af.data.works.map((w) => <a key={w.id} className="tool-row" href={`#af-${w.id}-${w.chapters[0]?.n ?? 1}`}><strong>{w.name}</strong><span>{w.chapters.length} chapters{w.chapters.some((c) => c.eng) ? " · with English" : " · Greek only"}</span></a>)}</div>}
      <h3>Josephus, in Whiston's translation</h3>
      <ErrorNote error={jo.error} />
      {jo.data && <div className="writer-list">{jo.data.works.map((w) => <a key={w.id} className="tool-row" href={`#josephus-${w.id}-${w.books[0].n}-${w.books[0].chapters[0].n}`}><strong>{w.name}</strong><span>{w.books.length > 1 ? `${w.books.length} books` : "One work"}</span></a>)}</div>}
      <details className="doctrine">
        <summary>What's here and what isn't</summary>
        <p>The Greek of the Apostolic Fathers follows Lake's text as corrected by the Open Apostolic Fathers project (Tauber and Macdonald, CC BY-SA 4.0). Its numbering lines up with the Ante-Nicene Fathers by chapter, so the two sit together. The Ante-Nicene translation is from the 1880s and sometimes follows a different Greek text.</p>
        <p>The Greek and Latin of the later Fathers aren't included, because open texts of them don't line up with the old translations in a way this app can check. Philo isn't included either, because no open English translation was available to load.</p>
      </details>
    </div>
  );
}

export function ApostolicPage({ tail }: { tail: string }) {
  const { data, error } = useAsync(getApostolic, []);
  const m = /^(.*)-(\w+)$/.exec(tail);
  const w = data?.works.find((x) => x.id === m?.[1]);
  const ch = w?.chapters.find((c) => c.n === m?.[2]) ?? w?.chapters[0];
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  if (!w || !ch) return <div className="page"><p className="empty">That work isn't here. <a href="#originals">See all primary texts</a>.</p></div>;
  const i = w.chapters.indexOf(ch);
  const cite = { id: `af-${w.id}-${ch.n}`, kind: "section" as const, title: w.name, container: w.engSource ? "Ante-Nicene Fathers" : "Open Apostolic Fathers", volume: /vol\. (\d+)/.exec(w.engSource)?.[1], pages: ch.page, url: w.url };
  return (
    <div className="page wide-page">
      <p className="eyebrow"><a href="#originals">Primary texts</a></p>
      <h1 className="page-title">{w.name}, chapter {ch.n}</h1>
      <div className="filters">
        <select aria-label="Chapter" value={ch.n} onChange={(e) => navigate(`af-${w.id}-${e.target.value}`)}>{w.chapters.map((c) => <option key={c.n} value={c.n}>Chapter {c.n}</option>)}</select>
        {w.writer && <a className="btn small" href={`#writer-${w.writer}`}>This writer's excerpts</a>}
      </div>
      <div className="pair-grid">
        <section className="pair-col greek" lang="grc">{ch.greek.map(([v, t]) => <p key={v}><sup>{v}</sup>{t}</p>)}</section>
        <section className="pair-col">{ch.eng ? ch.eng.split(/\n\n/).map((p, n) => <p key={n}>{p}</p>) : <p className="fine">This chapter has no matching English in the Ante-Nicene Fathers' numbering. {w.url && <a href={w.url} target="_blank" rel="noreferrer">Read that translation at CCEL</a>}</p>}</section>
      </div>
      <p className="fine ex-source">Greek: Open Apostolic Fathers, ed. Tauber and Macdonald, from Lake (1912), CC BY-SA 4.0. {w.engSource && `English: ${w.engSource}${ch.page ? `, p. ${ch.page}` : ""}.`}</p>
      <Actions>
        <CiteButton record={cite} />
        <button type="button" className="link-btn" onClick={() => saveQuoteToNotebook(`${w.name} ${ch.n}`, ch.eng || ch.greek.map((x) => x[1]).join(" "), `${w.name} ${ch.n}. ${w.engSource}`, ["apostolic-fathers"])}>Save to notebook</button>
        {w.url && <a className="link-btn" href={w.url} target="_blank" rel="noreferrer">Check the source</a>}
      </Actions>
      <div className="action-row">
        {i > 0 && <a className="btn" href={`#af-${w.id}-${w.chapters[i - 1].n}`}>Previous chapter</a>}
        {i < w.chapters.length - 1 && <a className="btn" href={`#af-${w.id}-${w.chapters[i + 1].n}`}>Next chapter</a>}
      </div>
    </div>
  );
}

export function JosephusPage({ tail }: { tail: string }) {
  const { data, error } = useAsync(getJosephus, []);
  const [, wid, bn, cn] = /^(\w+)-(\d+)-(\d+)$/.exec(tail) ?? [];
  const w = data?.works.find((x) => x.id === wid);
  const book = w?.books.find((b) => b.n === Number(bn)) ?? w?.books[0];
  const ch = book?.chapters.find((c) => c.n === Number(cn)) ?? book?.chapters[0];
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!data) return <div className="page"><Loading /></div>;
  if (!w || !book || !ch) return <div className="page"><p className="empty">That work isn't here. <a href="#originals">See all primary texts</a>.</p></div>;
  const idx = book.chapters.indexOf(ch);
  const prev = idx > 0 ? `${book.n}-${book.chapters[idx - 1].n}` : null;
  const next = idx < book.chapters.length - 1 ? `${book.n}-${book.chapters[idx + 1].n}` : null;
  const label = `${w.name}${w.books.length > 1 ? ` ${book.n}` : ""}${book.chapters.length > 1 ? `.${ch.n}` : ""}`;
  return (
    <div className="page">
      <p className="eyebrow"><a href="#originals">Primary texts</a></p>
      <h1 className="page-title">{label}</h1>
      {ch.title && <p className="sub">{ch.title}</p>}
      <div className="filters">
        {w.books.length > 1 && <select aria-label="Book" value={book.n} onChange={(e) => { const b = w.books.find((x) => x.n === Number(e.target.value))!; navigate(`josephus-${w.id}-${b.n}-${b.chapters[0].n}`); }}>{w.books.map((b) => <option key={b.n} value={b.n}>Book {b.n}</option>)}</select>}
        {book.chapters.length > 1 && <select aria-label="Chapter" value={ch.n} onChange={(e) => navigate(`josephus-${w.id}-${book.n}-${e.target.value}`)}>{book.chapters.map((c) => <option key={c.n} value={c.n}>Chapter {c.n}</option>)}</select>}
      </div>
      <div className="ex-text">{ch.paras.map(([n, t]) => <p key={n}><sup>{n}</sup>{t}</p>)}</div>
      <p className="fine ex-source">Flavius Josephus, trans. William Whiston (1737), from the Project Gutenberg text. Whiston's numbering differs from the Loeb and Niese numbering scholars usually cite.</p>
      <Actions>
        <CiteButton record={{ id: `josephus-${w.id}-${book.n}-${ch.n}`, kind: "section", author: "Flavius Josephus", title: label, container: "The Works of Flavius Josephus", editors: "William Whiston", year: "1737" }} />
        <button type="button" className="link-btn" onClick={() => saveQuoteToNotebook(label, ch.paras.map((p) => p[1]).join(" ").slice(0, 2000), `Josephus, ${label}, trans. Whiston.`, ["josephus"])}>Save to notebook</button>
      </Actions>
      <div className="action-row">
        {prev && <a className="btn" href={`#josephus-${w.id}-${prev}`}>Previous</a>}
        {next && <a className="btn" href={`#josephus-${w.id}-${next}`}>Next</a>}
      </div>
    </div>
  );
}
