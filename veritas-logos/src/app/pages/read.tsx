import { useEffect, useMemo, useRef, useState } from "react";
import { chapterCount, getChapter, getVerseIn, isOnline, onlineNotice, OnlineTextError, refOf, translationInfo, verseCount, DEFAULT_TRANSLATION, type TranslationId } from "../../core/bible";
import { getCrossRefs, decodeMorph, getVerseWords, normalizeStrongs, type WordTuple } from "../../core/lexicon";
import { newId } from "../../core/guide";
import { peopleInPassage } from "../../core/people";
import { BOOKS, bookName, parseReference } from "../../core/references";
import { copyText } from "../files";
import { BUILT_IN, builtInSaved, canReadAloud, mb, NO_SPEECH, readAloud, usesBuiltIn, type SpeechStatus } from "../speech";
import { readHash, type ReadRoute } from "../routes";
import { getData, navigate, setPref, toast, update, useData, type HighlightColor } from "../store";
import { ErrorNote, Loading, Sheet, Tag, TranslationSelect, RefLink, useAsync, Empty } from "../ui";
import { addSectionsToGuide, InsightsPanel } from "./insights";
import { HistoryOfInterpretation, passageWritersHash } from "./writers";
import { EditionsPanel, Interlinear, VerseColumns } from "./texts";
import { Backlinks, ScholarshipLinks, useMedia } from "./scholar-ui";
import { creedsCiting } from "../../core/scholar";

const vKey = (b: number, c: number, v: number) => `${b}:${c}:${v}`;
const COLORS: HighlightColor[] = ["amber", "green", "blue", "rose"];

// ---------- Book, chapter and verse picker ----------
// Book, then chapter, then either the whole chapter or one verse in it. Typing a reference ("John 3:16", "Ps 23")
// in the filter goes straight there.
function Picker({ book, chapter, verse, onPick, onClose }: { book: number; chapter: number; verse?: number; onPick: (b: number, c: number, v?: number) => void; onClose: () => void }) {
  const [b, setB] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const { data: count } = useAsync(() => (b ? chapterCount(b) : Promise.resolve(0)), [b]);
  const { data: verses } = useAsync(() => (b && c ? verseCount(b, c) : Promise.resolve(0)), [b, c]);
  const list = BOOKS.filter((x) => x.name.toLowerCase().includes(filter.toLowerCase()));
  // Only once a chapter number follows the book's name, so "1 John" still just filters the books.
  const typed = /[a-z]\.?\s*\d/i.test(filter) ? parseReference(filter)?.[0] : undefined;
  const title = b && c ? `${bookName(b)} ${c}` : b ? bookName(b) : "Choose a book";
  return (
    <Sheet title={title} onClose={onClose}>
      {b && c ? (
        <>
          <button type="button" className="link-btn" onClick={() => setC(null)}>Chapters of {bookName(b)}</button>
          <button type="button" className="btn primary whole-chapter" onClick={() => onPick(b, c)}>Read all of {bookName(b)} {c}</button>
          <h4>Or go to a verse</h4>
          <div className="num-grid verse-grid">
            {Array.from({ length: verses ?? 0 }, (_, i) => i + 1).map((v) => (
              <button type="button" key={v} className={b === book && c === chapter && v === verse ? "on" : ""} aria-label={`Verse ${v}`} onClick={() => onPick(b, c, v)}>{v}</button>
            ))}
          </div>
        </>
      ) : b ? (
        <>
          <button type="button" className="link-btn" onClick={() => setB(null)}>All books</button>
          <div className="num-grid">
            {Array.from({ length: count ?? 0 }, (_, i) => i + 1).map((n) => (
              <button type="button" key={n} className={b === book && n === chapter ? "on" : ""} aria-label={`Chapter ${n}`} onClick={() => setC(n)}>{n}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <input id="book-filter" className="input" placeholder="Filter books, or type John 3:16" aria-label="Filter books, or type a reference" value={filter} onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && typed) onPick(typed.book, typed.chapter, typed.verseStart || undefined); }} />
          {typed && (
            <button type="button" className="btn primary whole-chapter" onClick={() => onPick(typed.book, typed.chapter, typed.verseStart || undefined)}>
              Go to {bookName(typed.book)} {typed.chapter}{typed.verseStart ? `:${typed.verseStart}` : ""}
            </button>
          )}
          <h4>Old Testament</h4>
          <div className="book-grid">{list.filter((x) => x.number <= 39).map((x) => <button type="button" key={x.number} className={x.number === book ? "on" : ""} onClick={() => setB(x.number)}>{x.name}</button>)}</div>
          <h4>New Testament</h4>
          <div className="book-grid">{list.filter((x) => x.number >= 40).map((x) => <button type="button" key={x.number} className={x.number === book ? "on" : ""} onClick={() => setB(x.number)}>{x.name}</button>)}</div>
        </>
      )}
    </Sheet>
  );
}

/**
 * Runs once the picker has closed. Closing it steps back past the history entry it added, and the browser then puts
 * the page back where it was, so anything that scrolls has to wait for that.
 */
function afterSheetCloses(fn: () => void) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", run);
    requestAnimationFrame(() => requestAnimationFrame(fn));
  };
  window.addEventListener("popstate", run);
  setTimeout(run, 400);
}

/**
 * Scrolls so a verse sits at the top of the screen, just under the reader's toolbar. Near the end of a short chapter
 * the page isn't tall enough for that, so room is added below the text first.
 */
function bringToTop(v: number) {
  const el = document.getElementById(`v${v}`);
  if (!el) return false;
  const reader = el.closest<HTMLElement>(".reader");
  const bar = reader?.querySelector<HTMLElement>(".toolbar");
  const under = bar ? (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight : 0;
  const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - under - 6);
  for (let i = 0; reader && i < 3; i++) {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    if (y <= room) break;
    reader.style.minHeight = `${reader.offsetHeight + Math.ceil(y - room)}px`;
  }
  window.scrollTo({ top: y });
  return true;
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
  const [mode, setMode] = useState<"inter" | "list">("inter");
  const { data, loading, error } = useAsync(async () => {
    if (mode === "inter") return [];
    const out: { v: number; words: WordTuple[] }[] = [];
    for (let v = verse; v <= verseEnd; v++) out.push({ v, words: await getVerseWords(book, chapter, v) });
    return out;
  }, [book, chapter, verse, verseEnd, mode]);
  const verses = Array.from({ length: verseEnd - verse + 1 }, (_, i) => verse + i).slice(0, 40);
  return (
    <div>
      <div className="segmented" role="group" aria-label="Layout">
        <button type="button" className={mode === "inter" ? "on" : ""} onClick={() => setMode("inter")}>Word by word</button>
        <button type="button" className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}>List</button>
      </div>
      {mode === "inter" && verses.map((v) => <div key={v}>{verseEnd > verse && <h4>Verse {v}</h4>}<Interlinear book={book} chapter={chapter} verse={v} /></div>)}
      {mode === "list" && (loading ? <Loading label="Loading Hebrew and Greek" /> : error ? <ErrorNote error={error} /> : (data ?? []).map(({ v, words }) => (
        <div key={v}>
          {verseEnd > verse && <h4>Verse {v}</h4>}
          {words.length ? words.map((w, i) => <WordRow key={i} w={w} />) : <Empty>No original-language words for this verse.</Empty>}
        </div>
      )))}
      <p className="fine"><a href="#morph">Search by grammar</a>. {book >= 40 && "The Greek follows the Nestle-Aland text, so wording can differ from the KJV's."}</p>
    </div>
  );
}

function TextTab({ book, chapter, verse }: { book: number; chapter: number; verse: number }) {
  const hash = readHash({ book, chapter, verse }).slice(5);
  return (
    <div>
      <VerseColumns book={book} chapter={chapter} verse={verse} compact />
      <p><a className="btn small" href={`#compare-${hash}`}>Open full comparison</a> <a className="btn small" href="#textual">Textual notes</a></p>
      <h4>Printed editions</h4>
      <EditionsPanel book={book} chapter={chapter} verse={verse} />
    </div>
  );
}

function CreedsCiting({ book, chapter, verse }: { book: number; chapter: number; verse: number }) {
  const { data } = useAsync(() => creedsCiting(book, chapter, verse), [book, chapter, verse]);
  if (!data?.length) return null;
  return <><h4>Cited in creeds and confessions</h4><div className="chips">{data.map((d) => <a key={d.id} className="chip" href={`#creed-${d.id}`}>{d.name}</a>)}</div></>;
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
      <CreedsCiting book={book} chapter={chapter} verse={verse} />
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
  return <><NoteEditor noteKey={noteKey} reference={reference} /><Backlinks passage={reference} /><ScholarshipLinks query={reference} /></>;
}
function NoteEditor({ noteKey, reference }: { noteKey: string; reference: string }) {
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
      <textarea id="verse-note" className="input" rows={7} value={text} onChange={(e) => save(e.target.value)} placeholder="Write what you notice. Notes save as you type." />
      <p className="fine">This also appears in your <a href="#notebook">notebook</a>.</p>
    </div>
  );
}

// ---------- The sheet for a verse or passage ----------
const STUDY_TABS = [["insights", "Insights"], ["words", "Hebrew & Greek"], ["history", "Through history"], ["text", "Text"], ["links", "Links"], ["notes", "My note"]] as const;
type StudyTab = (typeof STUDY_TABS)[number][0];
let lastTab: StudyTab = "insights";

export function VerseSheet({ book, chapter, verse, initialEnd, onClose, docked }: { book: number; chapter: number; verse: number; initialEnd?: number; onClose: () => void; docked?: boolean }) {
  const { prefs, highlights, bookmarks, guides, activeGuideId } = useData();
  const [end, setEnd] = useState(initialEnd ?? verse);
  const [tab, setTabState] = useState<StudyTab>(lastTab);
  const setTab = (t: StudyTab) => { lastTab = t; setTabState(t); };
  useEffect(() => setEnd(initialEnd ?? verse), [book, chapter, verse, initialEnd]);
  const { data: total } = useAsync(() => verseCount(book, chapter), [book, chapter]);
  const reference = refOf(book, chapter, verse, end);
  const { data: got } = useAsync(async () => {
    const parts: string[] = [];
    let from: TranslationId = prefs.translation;
    for (let v = verse; v <= end; v++) {
      const r = await getVerseIn(prefs.translation, book, chapter, v);
      from = r.translation;
      parts.push(r.text || "(not in this translation)");
    }
    return { text: parts.join(" "), from };
  }, [book, chapter, verse, end, prefs.translation]);
  const text = got?.text;
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
  const body = (
    <>
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
        <button type="button" className="btn small" onClick={() => copyText(`${text} (${reference}, ${got?.from ?? prefs.translation})`, "Verse copied")}>Copy</button>
        <button type="button" className="btn small" onClick={() => update((d) => ({ ...d, bookmarks: marked ? d.bookmarks.filter((x) => x !== key) : [key, ...d.bookmarks] }))}>{marked ? "Bookmarked" : "Bookmark"}</button>
        <a className="btn small" href={`#ask-${readHash({ book, chapter, verse, verseEnd: end }).slice(5)}`} onClick={onClose}>Ask AI</a>
      </div>
      <div className="tabs" role="tablist">
        {STUDY_TABS.map(([t, label]) => (
          <button type="button" key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === "insights" && <InsightsPanel reference={reference} translation={prefs.translation} />}
      {tab === "words" && <WordsTab book={book} chapter={chapter} verse={verse} verseEnd={end} />}
      {tab === "links" && <LinksTab book={book} chapter={chapter} verse={verse} translation={prefs.translation} />}
      {tab === "history" && <HistoryOfInterpretation reference={reference} compact />}
      {tab === "text" && <TextTab book={book} chapter={chapter} verse={verse} />}
      {tab === "notes" && <NotesTab noteKey={end > verse ? `${key}-${end}` : key} reference={reference} />}
    </>
  );
  if (docked) {
    return (
      <aside className="study-dock" aria-label={`Study ${reference}`}>
        <div className="dock-head"><strong>{reference}</strong><button type="button" className="icon-btn" aria-label="Close study panel" onClick={onClose}>×</button></div>
        <div className="dock-body">{body}</div>
      </aside>
    );
  }
  return <Sheet wide title={reference} onClose={onClose}>{body}</Sheet>;
}

// ---------- Reader ----------
export function ReadPage({ route }: { route: ReadRoute | null }) {
  const { prefs, highlights, notes, lastRead } = useData();
  const book = route?.book ?? lastRead.book;
  const chapter = route?.chapter ?? lastRead.chapter;
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState<{ verse: number; end?: number } | null>(null);
  const [speech, setSpeech] = useState<SpeechStatus>({ state: "idle" });
  const speaking = speech.state === "reading" ? speech.verse : null;
  const stopSpeak = useRef<(() => void) | null>(null);
  const translation = route?.translation ?? prefs.translation;
  const info = translationInfo(translation);
  const wide = useMedia("(min-width: 1100px)");
  // On a wide screen the study panel sits beside the text and follows the verse you pick.
  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "k") {
        setSheet((s) => {
          const v = (s?.verse ?? 0) + (e.key === "j" ? 1 : -1);
          if (v < 1 || (verses && v > verses.length)) return s;
          document.getElementById(`v${v}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
          return { verse: v };
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (route?.translation && route.translation !== prefs.translation) setPref("translation", route.translation);
  }, [route?.translation]);
  useEffect(() => { update((d) => (d.lastRead.book === book && d.lastRead.chapter === chapter ? d : { ...d, lastRead: { book, chapter } })); }, [book, chapter]);
  useEffect(() => {
    if (route?.verse) setSheet(wide ? { verse: route.verse, end: route.verseEnd } : null);
  }, [route?.verse, book, chapter]);
  useEffect(() => () => stopSpeak.current?.(), []);

  // Each text remembers which chapter it is, since the last chapter stays on screen while the next one loads.
  const chapterKey = `${translation}:${book}:${chapter}`;
  const { data: loaded, loading, error } = useAsync(() => getChapter(translation, book, chapter).then((v) => ({ key: chapterKey, v })), [translation, book, chapter]);
  const { data: compare } = useAsync(() => (prefs.compare ? getChapter(prefs.compare, book, chapter) : Promise.resolve(null)), [prefs.compare, book, chapter]);
  const verses = loaded?.v;
  const { data: chapters } = useAsync(() => chapterCount(book), [book]);

  // A link or the picker can name a verse: the whole chapter loads, and that verse is marked and brought to the top.
  // For a moment after that, anything that changes the text's layout (the comparison text arriving, the study panel
  // opening beside it on a wide screen, the font loading) brings it back up, unless you've started scrolling.
  const [arrived, setArrived] = useState<number | null>(null);
  const target = useRef({ key: "", done: true, moved: false });
  useEffect(() => {
    const v = route?.verse;
    const key = v ? `${book}:${chapter}:${v}` : "";
    if (key !== target.current.key) {
      target.current = { key, done: !v, moved: false };
      document.querySelector<HTMLElement>(".page.reader")?.style.removeProperty("min-height");
    }
    if (!v || target.current.done || loaded?.key !== chapterKey) return;
    target.current.done = true;
    const mine = target.current;
    let ro: ResizeObserver | null = null;
    requestAnimationFrame(() => {
      if (target.current !== mine || !bringToTop(v)) return;
      setArrived(v);
      const text = document.querySelector(".reader .scripture");
      if (!text || typeof ResizeObserver === "undefined") return;
      ro = new ResizeObserver(() => { if (target.current === mine && !mine.moved) bringToTop(v); });
      ro.observe(text);
      setTimeout(() => ro?.disconnect(), 2500);
    });
  }, [route?.verse, chapterKey, loaded]);
  useEffect(() => {
    const stop = () => { target.current.moved = true; };
    const opts = { passive: true } as const;
    for (const ev of ["wheel", "touchmove", "keydown"]) window.addEventListener(ev, stop, opts);
    return () => { for (const ev of ["wheel", "touchmove", "keydown"]) window.removeEventListener(ev, stop); };
  }, []);
  useEffect(() => {
    if (arrived === null) return;
    const t = setTimeout(() => setArrived(null), 1800);
    return () => clearTimeout(t);
  }, [arrived]);

  const go = (b: number, c: number, v?: number) => {
    stopSpeak.current?.();
    const hash = readHash({ book: b, chapter: c, verse: v });
    // Choosing the verse you're already on (after scrolling away from it) brings it back up.
    if (v && b === book && c === chapter && v === route?.verse && !route.verseEnd) { afterSheetCloses(() => { if (bringToTop(v)) setArrived(v); }); return; }
    navigate(hash);
    // A whole chapter, or the next or previous one, starts at the top.
    if (!v) window.scrollTo(0, 0);
  };
  const prev = () => {
    if (chapter > 1) go(book, chapter - 1);
    else if (book > 1) chapterCount(book - 1).then((n) => go(book - 1, n));
  };
  const next = () => {
    if (chapter < (chapters ?? 1)) go(book, chapter + 1);
    else if (book < 66) go(book + 1, 1);
  };
  const toggleSpeak = () => {
    if (speech.state !== "idle") { stopSpeak.current?.(); stopSpeak.current = null; return; }
    if (!verses) return;
    let last = 0;
    stopSpeak.current = readAloud(verses, (s) => {
      setSpeech(s);
      if (s.state === "reading" && s.verse !== last) {
        last = s.verse;
        document.getElementById(`v${s.verse}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      if (s.state === "idle") stopSpeak.current = null;
    });
  };
  // Whether the built-in voice will read here, and whether it still has to download.
  const builtIn = usesBuiltIn();
  const { data: saved } = useAsync(() => (builtIn ? builtInSaved() : Promise.resolve(true)), [builtIn, speech.state === "idle"]);
  const speechNote = speech.state === "downloading" ? `Downloading the voice: ${Math.round(speech.loaded / 1e6)} of ${mb(speech.total)}`
    : speech.state === "preparing" ? "Getting the voice ready…"
    : speech.state === "reading" ? `Reading verse ${speech.verse}`
    : null;
  const compareInfo = useMemo(() => (prefs.compare ? translationInfo(prefs.compare) : null), [prefs.compare]);
  const inRange = (v: number) => route?.verse && v >= route.verse && v <= (route.verseEnd ?? route.verse);

  return (
    <div className={`reader-wrap ${wide && sheet ? "with-dock" : ""}`}>
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
              {isOnline(translation)
                ? <p className="fine read-aloud-off">Read aloud isn't offered for licensed translations like the {translation}, whose terms don't allow turning the text into speech. Choose a built-in translation, such as the BSB, to listen.</p>
                : canReadAloud()
                ? <button type="button" className="btn small" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); toggleSpeak(); }}>{speech.state !== "idle" ? "Stop reading" : "Read chapter aloud"}</button>
                : <p className="fine read-aloud-off">{NO_SPEECH}</p>}
              {!isOnline(translation) && canReadAloud() && builtIn && BUILT_IN && speech.state === "idle" && (
                <p className="fine read-aloud-off">{saved === false
                  ? `${BUILT_IN.name}, the voice built into Veritas Logos, reads here. The first time, it downloads ${mb(BUILT_IN.downloadBytes)}, which this browser keeps.`
                  : `${BUILT_IN.name}, the voice built into Veritas Logos, reads here.`}</p>
              )}
            </div>
          </details>
        </div>
        {speech.state !== "idle" && (
          <div className="read-aloud-bar" role="status">
            <span>{speechNote}</span>
            <button type="button" className="btn small" onClick={toggleSpeak}>Stop</button>
          </div>
        )}
      </div>

      <div className="study-cta">
        <button type="button" className="btn small" onClick={() => verses && setSheet({ verse: 1, end: verses.length })}>Study this chapter</button>
        <span className="fine">or tap any verse for insights, Hebrew and Greek, its history and links</span>
      </div>

      {loading && <Loading label="Loading Scripture" />}
      {error instanceof OnlineTextError
        ? <div className="note warn" role="alert"><p>{error.message}</p><button type="button" className="btn small" onClick={() => setPref("translation", DEFAULT_TRANSLATION)}>Read in the BSB instead</button></div>
        : <ErrorNote error={error} />}
      {verses && verses.every((v) => !v.text) && (
        <div className="note" role="status">
          <p>{info.covers ? `The ${info.name} has only ${info.covers}, so it doesn't include ${bookName(book)}.` : `The ${info.name} doesn't include ${bookName(book)} ${chapter}.`}</p>
          <button type="button" className="btn small" onClick={() => setPref("translation", DEFAULT_TRANSLATION)}>Read in the BSB</button>
        </div>
      )}
      {verses && verses.some((v) => v.text) && (
        <div className="scripture" style={{ fontSize: `${prefs.textSize}px` }}>
          <h2 className="chapter-title"><span>{bookName(book)}</span> {chapter}</h2>
          {verses.map((v) => {
            const hl = highlights[vKey(book, chapter, v.verse)];
            const hasNote = Boolean(notes[vKey(book, chapter, v.verse)]);
            return (
              <div key={v.verse} id={`v${v.verse}`} className={`verse ${hl ? `hl-${hl}` : ""} ${speaking === v.verse ? "speaking" : ""} ${inRange(v.verse) ? "target" : ""} ${arrived === v.verse ? "arrive" : ""} ${wide && sheet && v.verse >= sheet.verse && v.verse <= (sheet.end ?? sheet.verse) ? "picked" : ""}`} role="button" tabIndex={0}
                onClick={() => setSheet({ verse: v.verse })} onKeyDown={(e) => { if (e.key === "Enter") setSheet({ verse: v.verse }); }}>
                <sup>{v.verse}</sup>
                {v.text ? <span>{v.text}</span> : <em className="missing">This verse isn't in the {translation} text. Some manuscripts include it, so many Bibles keep it as a footnote, and some number their verses differently.</em>}
                {hasNote && <Tag tone="note">Note</Tag>}
                {compare && compare[v.verse - 1]?.text && <div className="compare"><strong>{compareInfo?.id}</strong> {compare[v.verse - 1].text}</div>}
              </div>
            );
          })}
          <p className="fine notice">
            {isOnline(translation) ? onlineNotice(translation, book, chapter) : info.notice}
            {info.link && <> <a href={info.link.url} target="_blank" rel="noopener noreferrer">{info.link.label}</a></>}
          </p>
        </div>
      )}

      <p className="chapter-links"><a href={`#${passageWritersHash(book, chapter)}`}>What the Fathers and teachers said on this chapter</a> · <a href={`#book-${bookName(book).toLowerCase().replace(/\s+/g, "")}`}>About {bookName(book)}</a></p>
      <div className="chapter-nav">
        <button type="button" className="btn" onClick={prev} disabled={book === 1 && chapter === 1}>Previous chapter</button>
        <button type="button" className="btn" onClick={next} disabled={book === 66 && chapter === (chapters ?? 22)}>Next chapter</button>
      </div>

      {picker && <Picker book={book} chapter={chapter} verse={route?.verse} onClose={() => setPicker(false)} onPick={(b, c, v) => { setPicker(false); go(b, c, v); }} />}
      {sheet && !wide && <VerseSheet book={book} chapter={chapter} verse={sheet.verse} initialEnd={sheet.end} onClose={() => setSheet(null)} />}
    </div>
    {sheet && wide && <VerseSheet docked book={book} chapter={chapter} verse={sheet.verse} initialEnd={sheet.end} onClose={() => setSheet(null)} />}
    </div>
  );
}
