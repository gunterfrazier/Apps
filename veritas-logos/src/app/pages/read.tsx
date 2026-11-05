import { useEffect, useMemo, useRef, useState } from "react";
import { chapterCount, getChapter, getVerse, refOf, translationInfo, verseCount, type TranslationId } from "../../core/bible";
import { getCrossRefs, decodeMorph, getVerseWords, normalizeStrongs, type WordTuple } from "../../core/lexicon";
import { newId } from "../../core/guide";
import { peopleInPassage } from "../../core/people";
import { BOOKS, bookName } from "../../core/references";
import { copyText } from "../files";
import { readHash, type ReadRoute } from "../routes";
import { getData, navigate, setPref, toast, update, useData, type HighlightColor } from "../store";
import { ErrorNote, Loading, Sheet, Tag, TranslationSelect, RefLink, useAsync, Empty } from "../ui";
import { addSectionsToGuide, InsightsPanel } from "./insights";

const vKey = (b: number, c: number, v: number) => `${b}:${c}:${v}`;
const COLORS: HighlightColor[] = ["amber", "green", "blue", "rose"];

// ---------- Read aloud ----------
function speakLines(lines: { verse: number; text: string }[], onVerse: (v: number | null) => void) {
  if (!("speechSynthesis" in window)) { toast("Your browser can't read aloud."); return () => {}; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const { voice, rate } = getData().prefs;
  let cancelled = false;
  let i = 0;
  const voices = synth.getVoices();
  const next = () => {
    if (cancelled) return;
    if (i >= lines.length) { onVerse(null); return; }
    const line = lines[i++];
    if (!line.text) { next(); return; }
    const u = new SpeechSynthesisUtterance(line.text);
    u.rate = rate;
    const chosen = voices.find((x) => x.name === voice);
    if (chosen) u.voice = chosen;
    u.onstart = () => onVerse(line.verse);
    u.onend = next;
    u.onerror = () => onVerse(null);
    synth.speak(u);
  };
  next();
  return () => { cancelled = true; synth.cancel(); onVerse(null); };
}

// ---------- Book and chapter picker ----------
function Picker({ book, chapter, onPick, onClose }: { book: number; chapter: number; onPick: (b: number, c: number) => void; onClose: () => void }) {
  const [b, setB] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const { data: count } = useAsync(() => (b ? chapterCount(b) : Promise.resolve(0)), [b]);
  const list = BOOKS.filter((x) => x.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Sheet title={b ? bookName(b) : "Choose a book"} onClose={onClose}>
      {b ? (
        <>
          <button type="button" className="link-btn" onClick={() => setB(null)}>All books</button>
          <div className="num-grid">
            {Array.from({ length: count ?? 0 }, (_, i) => i + 1).map((c) => (
              <button type="button" key={c} className={b === book && c === chapter ? "on" : ""} onClick={() => onPick(b, c)}>{c}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <input id="book-filter" className="input" placeholder="Filter books" aria-label="Filter books" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <h4>Old Testament</h4>
          <div className="book-grid">{list.filter((x) => x.number <= 39).map((x) => <button type="button" key={x.number} className={x.number === book ? "on" : ""} onClick={() => setB(x.number)}>{x.name}</button>)}</div>
          <h4>New Testament</h4>
          <div className="book-grid">{list.filter((x) => x.number >= 40).map((x) => <button type="button" key={x.number} className={x.number === book ? "on" : ""} onClick={() => setB(x.number)}>{x.name}</button>)}</div>
        </>
      )}
    </Sheet>
  );
}

// ---------- Word list for one verse ----------
export function WordRow({ w }: { w: WordTuple }) {
  const hebrew = w[3].startsWith("H");
  return (
    <a className="word-row" href={`#word-${(normalizeStrongs(w[3]) ?? "").toLowerCase()}`}>
      <span className={hebrew ? "orig hebrew" : "orig greek"} lang={hebrew ? "he" : "grc"} dir={hebrew ? "rtl" : "ltr"}>{w[0]}</span>
      <span className="word-mid">
        <span className="gloss">{w[2].startsWith("<") ? <em>{w[2].replace(/[<>]/g, "")}</em> : w[2]}</span>
        <span className="fine">{w[1]} · {decodeMorph(w[4])}</span>
      </span>
      <span className="strong">{w[3].replace(/[A-Za-z]$/, "")}</span>
    </a>
  );
}

function WordsTab({ book, chapter, verse, verseEnd }: { book: number; chapter: number; verse: number; verseEnd: number }) {
  const { data, loading, error } = useAsync(async () => {
    const out: { v: number; words: WordTuple[] }[] = [];
    for (let v = verse; v <= verseEnd; v++) out.push({ v, words: await getVerseWords(book, chapter, v) });
    return out;
  }, [book, chapter, verse, verseEnd]);
  if (loading) return <Loading label="Loading Hebrew and Greek" />;
  if (error) return <ErrorNote error={error} />;
  return (
    <div>
      {data!.map(({ v, words }) => (
        <div key={v}>
          {verseEnd > verse && <h4>Verse {v}</h4>}
          {words.length ? words.map((w, i) => <WordRow key={i} w={w} />) : <Empty>No original-language words for this verse.</Empty>}
        </div>
      ))}
      <p className="fine">Hebrew and Greek from STEP Bible (Tyndale House), CC BY 4.0. {book >= 40 && "The Greek follows the Nestle-Aland text, so wording can differ from the KJV's Textus Receptus."}</p>
    </div>
  );
}

function LinksTab({ book, chapter, verse, translation }: { book: number; chapter: number; verse: number; translation: TranslationId }) {
  const { data, loading, error } = useAsync(async () => {
    const list = await getCrossRefs(book, chapter, verse, bookName);
    const people = await peopleInPassage(refOf(book, chapter, verse));
    return { list, people };
  }, [book, chapter, verse, translation]);
  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  return (
    <div>
      <h4>Cross-references</h4>
      {data!.list.length ? <ul className="link-list">{data!.list.map((x) => <li key={x.ref}><RefLink refText={x.ref} /></li>)}</ul> : <Empty>No cross-references for this verse.</Empty>}
      <p className="fine">From OpenBible.info, strongest first.</p>
      {data!.people.length > 0 && (
        <>
          <h4>People named in this verse</h4>
          <ul className="link-list">{data!.people.map((p) => <li key={p.id}><a href={`#person-${p.id}`}>{p.name}</a><span className="shared">{p.title}</span></li>)}</ul>
        </>
      )}
    </div>
  );
}

function NotesTab({ noteKey, reference }: { noteKey: string; reference: string }) {
  const { notes } = useData();
  const [text, setText] = useState(notes[noteKey]?.text ?? "");
  useEffect(() => { setText(getData().notes[noteKey]?.text ?? ""); }, [noteKey]);
  const save = (value: string) => {
    setText(value);
    update((d) => {
      const next = { ...d.notes };
      if (value.trim()) next[noteKey] = { key: noteKey, ref: reference, text: value, updatedAt: new Date().toISOString() };
      else delete next[noteKey];
      return { ...d, notes: next };
    });
  };
  return (
    <div>
      <label htmlFor="verse-note" className="label">Your note on {reference}</label>
      <textarea id="verse-note" className="input" rows={7} value={text} onChange={(e) => save(e.target.value)} placeholder="Write what you notice. Notes save as you type, on this device." />
    </div>
  );
}

// ---------- The sheet for a verse or passage ----------
export function VerseSheet({ book, chapter, verse, initialEnd, onClose }: { book: number; chapter: number; verse: number; initialEnd?: number; onClose: () => void }) {
  const { prefs, highlights, bookmarks, guides, activeGuideId } = useData();
  const [end, setEnd] = useState(initialEnd ?? verse);
  const [tab, setTab] = useState<"insights" | "words" | "links" | "notes">("insights");
  const { data: total } = useAsync(() => verseCount(book, chapter), [book, chapter]);
  const reference = refOf(book, chapter, verse, end);
  const { data: text } = useAsync(async () => {
    const parts: string[] = [];
    for (let v = verse; v <= end; v++) parts.push((await getVerse(prefs.translation, book, chapter, v)) || "(not in this translation)");
    return parts.join(" ");
  }, [book, chapter, verse, end, prefs.translation]);
  const key = vKey(book, chapter, verse);
  const marked = bookmarks.includes(key);
  const setColor = (c: HighlightColor | null) => {
    update((d) => {
      const h = { ...d.highlights };
      for (let v = verse; v <= end; v++) {
        if (c) h[vKey(book, chapter, v)] = c;
        else delete h[vKey(book, chapter, v)];
      }
      return { ...d, highlights: h };
    });
  };
  const add = () => addSectionsToGuide([{ id: newId(), kind: "passage", heading: reference, origin: "assembled", ref: reference }], reference, guides, activeGuideId, prefs.translation, prefs.lens);
  return (
    <Sheet wide title={reference} onClose={onClose}>
      <p className="verse-quote">{text ?? "…"}</p>
      <div className="range-row">
        <label htmlFor="range-end">Through verse</label>
        <select id="range-end" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
          {Array.from({ length: Math.max(0, (total ?? verse) - verse + 1) }, (_, i) => verse + i).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="swatches" role="group" aria-label="Highlight">
          {COLORS.map((c) => <button type="button" key={c} className={`swatch hl-${c} ${highlights[key] === c ? "on" : ""}`} aria-label={`Highlight ${c}`} onClick={() => setColor(highlights[key] === c ? null : c)} />)}
        </span>
      </div>
      <div className="action-row">
        <button type="button" className="btn small primary" onClick={add}>Add to guide</button>
        <button type="button" className="btn small" onClick={() => copyText(`${text} (${reference}, ${prefs.translation})`, "Verse copied")}>Copy</button>
        <button type="button" className="btn small" onClick={() => update((d) => ({ ...d, bookmarks: marked ? d.bookmarks.filter((x) => x !== key) : [key, ...d.bookmarks] }))}>{marked ? "Bookmarked" : "Bookmark"}</button>
        <a className="btn small" href={`#ask-${readHash({ book, chapter, verse, verseEnd: end }).slice(5)}`} onClick={onClose}>Ask AI</a>
      </div>
      <div className="tabs" role="tablist">
        {(["insights", "words", "links", "notes"] as const).map((t) => (
          <button type="button" key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "insights" ? "Insights" : t === "words" ? "Hebrew & Greek" : t === "links" ? "Links" : "My note"}
          </button>
        ))}
      </div>
      {tab === "insights" && <InsightsPanel reference={reference} translation={prefs.translation} />}
      {tab === "words" && <WordsTab book={book} chapter={chapter} verse={verse} verseEnd={end} />}
      {tab === "links" && <LinksTab book={book} chapter={chapter} verse={verse} translation={prefs.translation} />}
      {tab === "notes" && <NotesTab noteKey={end > verse ? `${key}-${end}` : key} reference={reference} />}
    </Sheet>
  );
}

// ---------- Reader ----------
export function ReadPage({ route }: { route: ReadRoute | null }) {
  const { prefs, highlights, notes, lastRead } = useData();
  const book = route?.book ?? lastRead.book;
  const chapter = route?.chapter ?? lastRead.chapter;
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState<{ verse: number; end?: number } | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const stopSpeak = useRef<(() => void) | null>(null);
  const translation = route?.translation ?? prefs.translation;

  useEffect(() => {
    if (route?.translation && route.translation !== prefs.translation) setPref("translation", route.translation);
  }, [route?.translation]);
  useEffect(() => { update((d) => (d.lastRead.book === book && d.lastRead.chapter === chapter ? d : { ...d, lastRead: { book, chapter } })); }, [book, chapter]);
  useEffect(() => {
    if (route?.verse) {
      setSheet(null);
      const el = document.getElementById(`v${route.verse}`);
      el?.scrollIntoView({ block: "center" });
    }
  }, [route?.verse, book, chapter]);
  useEffect(() => () => stopSpeak.current?.(), []);

  const { data: verses, loading, error } = useAsync(() => getChapter(translation, book, chapter), [translation, book, chapter]);
  const { data: compare } = useAsync(() => (prefs.compare ? getChapter(prefs.compare, book, chapter) : Promise.resolve(null)), [prefs.compare, book, chapter]);
  const { data: chapters } = useAsync(() => chapterCount(book), [book]);

  useEffect(() => {
    if (route?.verse && verses) document.getElementById(`v${route.verse}`)?.scrollIntoView({ block: "center" });
  }, [verses]);

  const go = (b: number, c: number) => { stopSpeak.current?.(); navigate(readHash({ book: b, chapter: c })); };
  const prev = () => {
    if (chapter > 1) go(book, chapter - 1);
    else if (book > 1) chapterCount(book - 1).then((n) => go(book - 1, n));
  };
  const next = () => {
    if (chapter < (chapters ?? 1)) go(book, chapter + 1);
    else if (book < 66) go(book + 1, 1);
  };
  const toggleSpeak = () => {
    if (speaking !== null) { stopSpeak.current?.(); stopSpeak.current = null; return; }
    if (!verses) return;
    stopSpeak.current = speakLines(verses, (v) => {
      setSpeaking(v);
      if (v) document.getElementById(`v${v}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    setSpeaking(1);
  };
  const compareInfo = useMemo(() => (prefs.compare ? translationInfo(prefs.compare) : null), [prefs.compare]);
  const inRange = (v: number) => route?.verse && v >= route.verse && v <= (route.verseEnd ?? route.verse);

  return (
    <div className="page reader">
      <div className="toolbar">
        <button type="button" className="pick-btn" onClick={() => setPicker(true)}>{bookName(book)} {chapter} <span aria-hidden="true">▾</span></button>
        <div className="toolbar-right">
          <TranslationSelect short id="reader-translation" value={translation} onChange={(t) => { setPref("translation", t); if (route?.translation) navigate(readHash({ book, chapter, verse: route.verse, verseEnd: route.verseEnd })); }} />
          <details className="menu">
            <summary aria-label="Reading options">Aa</summary>
            <div className="menu-body">
              <label className="label" htmlFor="compare-select">Compare with</label>
              <TranslationSelect id="compare-select" value={prefs.compare} allowNone onChange={(t) => setPref("compare", t)} />
              <label className="label" htmlFor="text-size">Text size</label>
              <input id="text-size" type="range" min="15" max="28" value={prefs.textSize} onChange={(e) => setPref("textSize", Number(e.target.value))} />
              <button type="button" className="btn small" onClick={toggleSpeak}>{speaking !== null ? "Stop reading" : "Read chapter aloud"}</button>
            </div>
          </details>
        </div>
      </div>

      <div className="study-cta">
        <button type="button" className="btn small" onClick={() => verses && setSheet({ verse: 1, end: verses.length })}>Study this chapter</button>
        <span className="fine">or tap any verse for insights, Hebrew and Greek, and links</span>
      </div>

      {loading && <Loading label="Loading Scripture" />}
      <ErrorNote error={error} />
      {verses && (
        <div className="scripture" style={{ fontSize: `${prefs.textSize}px` }}>
          <h2 className="chapter-title"><span>{bookName(book)}</span> {chapter}</h2>
          {verses.map((v) => {
            const hl = highlights[vKey(book, chapter, v.verse)];
            const hasNote = Boolean(notes[vKey(book, chapter, v.verse)]);
            return (
              <div key={v.verse} id={`v${v.verse}`} className={`verse ${hl ? `hl-${hl}` : ""} ${speaking === v.verse ? "speaking" : ""} ${inRange(v.verse) ? "target" : ""}`} role="button" tabIndex={0}
                onClick={() => setSheet({ verse: v.verse })} onKeyDown={(e) => { if (e.key === "Enter") setSheet({ verse: v.verse }); }}>
                <sup>{v.verse}</sup>
                {v.text ? <span>{v.text}</span> : <em className="missing">This verse isn't in the {translation} text. Some manuscripts include it, so it's kept as a footnote in many Bibles.</em>}
                {hasNote && <Tag tone="note">Note</Tag>}
                {compare && compare[v.verse - 1]?.text && <div className="compare"><strong>{compareInfo?.id}</strong> {compare[v.verse - 1].text}</div>}
              </div>
            );
          })}
          <p className="fine notice">{translationInfo(translation).notice}</p>
        </div>
      )}

      <div className="chapter-nav">
        <button type="button" className="btn" onClick={prev} disabled={book === 1 && chapter === 1}>Previous chapter</button>
        <button type="button" className="btn" onClick={next} disabled={book === 66 && chapter === (chapters ?? 22)}>Next chapter</button>
      </div>

      {picker && <Picker book={book} chapter={chapter} onClose={() => setPicker(false)} onPick={(b, c) => { setPicker(false); go(b, c); }} />}
      {sheet && <VerseSheet book={book} chapter={chapter} verse={sheet.verse} initialEnd={sheet.end} onClose={() => setSheet(null)} />}
    </div>
  );
}
