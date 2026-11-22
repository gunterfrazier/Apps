import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useChapterRead, useMemorizing, toggleChapterRead, toggleMemory } from "./practice";
import { pushHighlights, syncChapter } from "../youversion";
import { chapterCount, getChapter, getVerseIn, isOnline, onlineNotice, OnlineTextError, GROUP_NAMES, OFFERED, refOf, translationInfo, verseCount, DEFAULT_TRANSLATION, type TranslationId } from "../../core/bible";
import { getCrossRefs, decodeMorph, getVerseWords, normalizeStrongs, type WordTuple } from "../../core/lexicon";
import { getSectionHeadings, readingWords, wordDifferences } from "../../core/reader-text";
import { newId } from "../../core/guide";
import { peopleInPassage } from "../../core/people";
import { BOOKS, bookName, parseReference } from "../../core/references";
import { copyText } from "../files";
import { BUILT_IN, builtInSaved, canReadAloud, mb, NO_SPEECH, usesBuiltIn } from "../speech";
import { openPlayer, playChapter, resumeVerse, usePlayer } from "../player";
import { readHash, type ReadRoute } from "../routes";
import { getData, HIGHLIGHT_COLORS, navigate, setPref, toast, update, useData, type HighlightColor } from "../store";
import { ErrorNote, Loading, Sheet, Tag, ThemeSelect, TranslationSelect, RefLink, useAsync, Empty } from "../ui";
import { NotebookPicker } from "./notebook-collection";
import { ReaderLexicon, ReaderWords, type WordSelection } from "./reader-words";
import { addSectionsToGuide, InsightsPanel } from "./insights";
import { HistoryOfInterpretation, passageWritersHash } from "./writers";
import { EditionsPanel, Interlinear, VerseColumns } from "./texts";
import { Backlinks, ScholarshipLinks, useMedia } from "./scholar-ui";
import { creedsCiting } from "../../core/scholar";

const vKey = (b: number, c: number, v: number) => `${b}:${c}:${v}`;
const passageKey = (book: number, chapter: number, verse: number, end = verse) =>
  `${vKey(book, chapter, verse)}${end > verse ? `-${end}` : ""}`;

function toggleBookmark(key: string) {
  update((d) => ({
    ...d,
    bookmarks: d.bookmarks.includes(key) ? d.bookmarks.filter((saved) => saved !== key) : [key, ...d.bookmarks],
  }));
}

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

function ReaderTranslationPicker({ value, onChange }: { value: TranslationId; onChange: (value: TranslationId) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const matches = OFFERED.filter((t) => `${t.id} ${t.name} ${GROUP_NAMES[t.group]} ${t.style}`.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = (id: TranslationId) => {
    setOpen(false);
    trigger.current?.focus();
    if (id !== value) onChange(id);
  };

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const dismiss = (e: PointerEvent) => {
      if (!picker.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div className="reader-translation" ref={picker}
      onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }}>
      <button type="button" className="reader-control" ref={trigger} aria-label={`Bible translation, ${value}`}
        aria-expanded={open} aria-controls={open ? "reader-translation-options" : undefined}
        onClick={() => { setQuery(""); setOpen(!open); }}>
        {value} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id="reader-translation-options" className="translation-popover" role="group" aria-label="Choose a Bible translation">
          <input className="input" ref={search} type="search" placeholder="Search translations" aria-label="Search translations"
            value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches.length === 1) choose(matches[0].id); }} />
          <div className="translation-results">
            {matches.map((t) => (
              <button type="button" key={t.id} aria-pressed={t.id === value} onClick={() => choose(t.id)}>
                <strong>{t.id}</strong><span>{t.name}</span><Tag>{GROUP_NAMES[t.group]}</Tag>
              </button>
            ))}
            {!matches.length && <p className="fine" role="status">No translations match your search.</p>}
          </div>
        </div>
      )}
    </div>
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
      if (value.trim()) next[noteKey] = { ...next[noteKey], key: noteKey, ref: reference, text: value, updatedAt: new Date().toISOString() };
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
const STUDY_TABS = [["context", "Context"], ["words", "Words"], ["sources", "Sources"]] as const;
type StudyTab = (typeof STUDY_TABS)[number][0];

function VerseCompare({ compact = false }: { compact?: boolean }) {
  const { prefs } = useData();
  const [comparing, setComparing] = useState(false);
  const compareButton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" className={compact ? "btn small" : "btn"} ref={compareButton} aria-expanded={comparing}
        aria-controls={comparing ? "verse-comparison" : undefined} onClick={() => setComparing(!comparing)}>Compare</button>
      {comparing && (
        <div id="verse-comparison" className="verse-comparison">
          <label className="label" htmlFor="verse-compare-select">Compare with</label>
          <TranslationSelect id="verse-compare-select" label="Compare with" value={prefs.compare} allowNone onChange={(value) => {
            setPref("compare", value);
            setComparing(false);
            compareButton.current?.focus();
          }} />
        </div>
      )}
    </>
  );
}

function VerseActions({ book, chapter, verse, end, onStudy, onNote, onClose }: {
  book: number; chapter: number; verse: number; end?: number;
  onStudy: () => void; onNote: () => void; onClose: () => void;
}) {
  const { bookmarks } = useData();
  const key = passageKey(book, chapter, verse, end);
  const saved = bookmarks.includes(key);
  const reference = refOf(book, chapter, verse, end);
  return (
    <section className="verse-actions" aria-label="Verse actions">
      <div className="verse-actions-heading">
        <h2>{reference}</h2>
        <button type="button" className="icon-btn" aria-label="Close verse actions" onClick={onClose}>×</button>
      </div>
      <button type="button" className="btn primary verse-study-action" onClick={onStudy}>Study verse</button>
      <div className="verse-quick-actions">
        <button type="button" className="btn" aria-pressed={saved} onClick={() => toggleBookmark(key)}>{saved ? "Saved" : "Save"}</button>
        <button type="button" className="btn" onClick={onNote}>Note</button>
        <MemorizeButton book={book} chapter={chapter} verse={verse} end={end ?? verse} plain />
        <VerseCompare />
      </div>
    </section>
  );
}

function VerseSheet({ book, chapter, verse, end, onEndChange, onClose, docked, initialNotes }: {
  book: number; chapter: number; verse: number; end: number;
  onEndChange: (end: number) => void; onClose: () => void; docked: boolean; initialNotes: boolean;
}) {
  const { prefs, highlights, bookmarks, guides, activeGuideId } = useData();
  const [tab, setTab] = useState<StudyTab>("context");
  const [showNote, setShowNote] = useState(initialNotes);
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
  const rangeKey = passageKey(book, chapter, verse, end);
  const marked = bookmarks.includes(rangeKey);
  const rangeKeys = Array.from({ length: end - verse + 1 }, (_, i) => vKey(book, chapter, verse + i));
  const selectedColor = HIGHLIGHT_COLORS.find((color) => rangeKeys.length > 0 && rangeKeys.every((k) => highlights[k] === color));
  const setColor = (c: HighlightColor | null) => {
    update((d) => {
      const h = { ...d.highlights };
      for (const k of rangeKeys) {
        if (c) h[k] = c;
        else delete h[k];
      }
      return { ...d, highlights: h };
    });
    pushHighlights(book, chapter, Array.from({ length: end - verse + 1 }, (_, i) => verse + i), c);
  };
  const add = () => addSectionsToGuide([{ id: newId(), kind: "passage", heading: reference, origin: "assembled", ref: reference }], reference, guides, activeGuideId, prefs.translation, prefs.lens);
  const passage = readHash({ book, chapter, verse, verseEnd: end }).slice(5);
  const body = showNote ? (
    <>
      <button type="button" className="link-btn study-back" onClick={() => setShowNote(false)}>Back to passage study</button>
      <NotesTab key={rangeKey} noteKey={rangeKey} reference={reference} />
    </>
  ) : (
    <>
      <h2 className="study-heading">Study the passage</h2>
      <p className="verse-quote">{text ?? "…"}</p>
      <div className="study-toolbar">
        <div className="range-row">
          <label htmlFor="range-end">Through verse</label>
          <select id="range-end" value={end} onChange={(e) => onEndChange(Number(e.target.value))}>
            {Array.from({ length: Math.max(0, (total ?? end) - verse + 1) }, (_, i) => verse + i).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <button type="button" className="btn small" aria-pressed={marked} onClick={() => toggleBookmark(rangeKey)}>{marked ? "Saved" : "Save"}</button>
        <button type="button" className="btn small" onClick={() => setShowNote(true)}>Note</button>
        <MemorizeButton book={book} chapter={chapter} verse={verse} end={end} />
        {docked && <VerseCompare compact />}
      </div>
      <div className="tabs study-tabs" role="tablist" aria-label="Verse study" onKeyDown={(event) => {
        const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (!direction) return;
        event.preventDefault();
        const index = STUDY_TABS.findIndex(([id]) => id === tab);
        const next = STUDY_TABS[(index + direction + STUDY_TABS.length) % STUDY_TABS.length][0];
        setTab(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`#study-tab-${next}`)?.focus();
      }}>
        {STUDY_TABS.map(([id, label]) => (
          <button type="button" key={id} id={`study-tab-${id}`} role="tab" aria-controls="study-tab-content"
            aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div id="study-tab-content" role="tabpanel" aria-labelledby={`study-tab-${tab}`}>
        {tab === "context" && (
          <>
            <InsightsPanel reference={reference} translation={prefs.translation} />
            <details className="study-detail"><summary>Cross-references and people</summary><LinksTab book={book} chapter={chapter} verse={verse} translation={prefs.translation} /></details>
            <a className="btn small" href={`#places-${passage}`}>Places</a>
          </>
        )}
        {tab === "words" && (
          <>
            <WordsTab book={book} chapter={chapter} verse={verse} verseEnd={end} />
            <details className="study-detail"><summary>Text comparison and editions</summary><TextTab book={book} chapter={chapter} verse={verse} /></details>
          </>
        )}
        {tab === "sources" && <HistoryOfInterpretation reference={reference} compact />}
      </div>
      <details className="study-detail">
        <summary>More verse actions</summary>
        <div className="range-row swatches" role="group" aria-label="Highlight">
          {HIGHLIGHT_COLORS.map((color) => <button type="button" key={color} className={`swatch hl-${color} ${selectedColor === color ? "on" : ""}`}
            aria-label={`Highlight ${color}`} aria-pressed={selectedColor === color} onClick={() => setColor(selectedColor === color ? null : color)} />)}
        </div>
        <div className="action-row">
          <button type="button" className="btn small" onClick={add}>Add to guide</button>
          <button type="button" className="btn small" disabled={!text} onClick={() => copyText(`${text} (${reference}, ${got?.from ?? prefs.translation})`, "Verse copied")}>Copy</button>
          <NotebookPicker entry={`passage:${rangeKey}`} title={reference} onSave={(d) =>
            d.bookmarks.includes(rangeKey) || d.notes[rangeKey] || d.highlights[rangeKey]
              ? d : { ...d, bookmarks: [rangeKey, ...d.bookmarks] }} />
          <a className="btn small" href={`#ask-${passage}`} onClick={onClose}>Ask AI</a>
        </div>
      </details>
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
  return <Sheet wide title={reference} onClose={onClose} manageFocus>{body}</Sheet>;
}

// ---------- Reader ----------
export function ReadPage({ route }: { route: ReadRoute | null }) {
  const { prefs, highlights, notes, lastRead } = useData();
  const book = route?.book ?? lastRead.book;
  const chapter = route?.chapter ?? lastRead.chapter;
  const [picker, setPicker] = useState(false);
  const readerWrap = useRef<HTMLDivElement>(null);
  const [readingOptions, setReadingOptions] = useState(false);
  const optionsPanel = useRef<HTMLElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const optionsScroll = useRef<{ before: number; revealed: number } | null>(null);
  const restoreScroll = useRef<number | null>(null);
  const closeOptions = (focus = false) => {
    const position = optionsScroll.current;
    if (readingOptions && position && Math.abs(window.scrollY - position.revealed) < 2) {
      restoreScroll.current = position.before;
    }
    setReadingOptions(false);
    if (focus) toolbar.current?.querySelector<HTMLButtonElement>(".reading-options-toggle")?.focus({ preventScroll: true });
  };
  const toggleOptions = () => readingOptions ? closeOptions() : setReadingOptions(true);
  useLayoutEffect(() => {
    optionsScroll.current = null;
    if (!readingOptions) {
      const position = restoreScroll.current;
      restoreScroll.current = null;
      if (position === null) return;
      const frame = requestAnimationFrame(() => window.scrollTo(0, position));
      return () => cancelAnimationFrame(frame);
    }
    if (!optionsPanel.current || !toolbar.current) return;
    const offset = optionsPanel.current.getBoundingClientRect().top - toolbar.current.getBoundingClientRect().bottom;
    if (offset < 0) {
      const before = window.scrollY;
      window.scrollBy(0, offset - 8);
      optionsScroll.current = { before, revealed: window.scrollY };
    }
  }, [readingOptions]);
  useEffect(() => {
    if (!readingOptions) return;
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !optionsPanel.current?.contains(event.target) && !toolbar.current?.contains(event.target)) closeOptions();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOptions(true);
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [readingOptions]);
  const [sheet, setSheet] = useState<{ verse: number; end?: number; panel?: "study" | "note" } | null>(null);
  const verseTrigger = useRef<HTMLElement>(null);
  const [wordSelection, setWordSelection] = useState<WordSelection | null>(null);
  const closeWord = (restoreFocus = true) => {
    setWordSelection(null);
    if (restoreFocus) wordSelection?.trigger.focus({ preventScroll: true });
  };
  const translation = route?.translation ?? prefs.translation;
  // Listening: the player reads on while you move around the app. On this chapter, the verse being read is marked.
  const player = usePlayer();
  const listeningHere = player.kind === "chapter" && player.book === book && player.chapter === chapter && player.translation === translation;
  const speaking = listeningHere && player.status === "playing" ? player.verse : null;
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
  useEffect(() => { update((d) => (d.lastRead.book === book && d.lastRead.chapter === chapter ? d : { ...d, lastRead: { book, chapter } })); }, [book, chapter])
  useEffect(() => { syncChapter(book, chapter); }, [book, chapter]);;
  useEffect(() => {
    const verse = route?.verse;
    setSheet(verse && wide ? { verse, end: route.verseEnd } : null);
  }, [route?.verse, route?.verseEnd, book, chapter]);
  // Follow the voice down the page, unless the full player is open.
  useEffect(() => { if (speaking && !player.open) document.getElementById(`v${speaking}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [speaking]);
  useEffect(() => setWordSelection(null), [book, chapter, route?.verse, route?.verseEnd, translation, prefs.compare, prefs.wordStudy]);

  const { data: passage, loading, error } = useAsync(async () => ({
    book, chapter, translation, lines: await getChapter(translation, book, chapter),
  }), [translation, book, chapter]);
  const verses = passage?.book === book && passage.chapter === chapter && passage.translation === translation ? passage.lines : undefined;
  const compareTranslation = prefs.compare;
  const { data: parallel, error: compareError } = useAsync(async () => (compareTranslation
    ? { book, chapter, translation: compareTranslation, lines: await getChapter(compareTranslation, book, chapter) }
    : null), [compareTranslation, book, chapter]);
  const compare = parallel?.book === book && parallel.chapter === chapter && parallel.translation === compareTranslation ? parallel.lines : undefined;
  const showHeadings = translation === "BSB" && !prefs.hideSectionHeadings;
  const { data: chapterHeadings } = useAsync(async () => (
    showHeadings ? { book, chapter, byVerse: await getSectionHeadings(book, chapter) } : null
  ), [showHeadings, book, chapter]);
  const headings = showHeadings && chapterHeadings?.book === book && chapterHeadings.chapter === chapter ? chapterHeadings.byVerse : undefined;
  const continuous = prefs.hideVerseNumbers && !compareTranslation;
  const chapterKey = `${translation}:${book}:${chapter}`;
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
    if (!v || target.current.done || !verses) return;
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
  }, [route?.verse, chapterKey, verses]);
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
    const hash = readHash({ book: b, chapter: c, verse: v });
    // Choosing the verse you're already on (after scrolling away from it) brings it back up.
    if (v && b === book && c === chapter && v === route?.verse && !route.verseEnd) { afterSheetCloses(() => { if (bringToTop(v)) setArrived(v); }); return; }
    navigate(hash);
    // A whole chapter, or the next or previous one, starts at the top.
    if (!v) window.scrollTo(0, 0);
  };
  const readInBsb = () => {
    setPref("translation", DEFAULT_TRANSLATION);
    if (route?.translation) navigate(readHash({ book, chapter, verse: route.verse, verseEnd: route.verseEnd }));
  };
  const prev = () => {
    if (chapter > 1) go(book, chapter - 1);
    else if (book > 1) chapterCount(book - 1).then((n) => go(book - 1, n));
  };
  const next = () => {
    if (chapter < (chapters ?? 1)) go(book, chapter + 1);
    else if (book < 66) go(book + 1, 1);
  };
  /** Listen to this chapter: from where you left off, or open the player if it's already playing. */
  const toggleSpeak = () => {
    if (listeningHere) { openPlayer(); return; }
    if (!verses || isOnline(translation)) return;
    void playChapter(translation, book, chapter);
    openPlayer();
  };
  const resumeAt = resumeVerse(book, chapter);
  // Whether the built-in voice will read here, and whether it still has to download.
  const builtIn = usesBuiltIn();
  const { data: saved } = useAsync(() => (builtIn ? builtInSaved() : Promise.resolve(true)), [builtIn, player.status]);
  const selection = sheet ?? (route?.verse ? { verse: route.verse, end: route.verseEnd } : null);
  const inRange = (v: number) => Boolean(selection && v >= selection.verse && v <= (selection.end ?? selection.verse));
  const showTray = Boolean(sheet && !wide && !sheet.panel && !picker);
  useLayoutEffect(() => {
    const wrap = readerWrap.current;
    const tray = wrap?.querySelector<HTMLElement>(".verse-actions");
    if (!wrap || !tray) return;
    const measure = () => wrap.style.setProperty("--verse-tray-height", `${tray.offsetHeight}px`);
    measure();
    const selectedVerse = document.getElementById(`v${sheet?.verse}`);
    const overlap = selectedVerse ? selectedVerse.getBoundingClientRect().bottom - tray.getBoundingClientRect().top + 12 : 0;
    if (overlap > 0) window.scrollBy(0, overlap);
    const observer = new ResizeObserver(measure);
    observer.observe(tray);
    return () => observer.disconnect();
  }, [showTray, sheet?.verse]);
  const closeTray = () => {
    setSheet(null);
    verseTrigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!showTray || wordSelection || readingOptions) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeTray(); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [showTray, sheet?.verse, wordSelection, readingOptions]);
  const verseSheet = sheet && (wide || sheet.panel) && (
    <VerseSheet key={sheet.panel} book={book} chapter={chapter} verse={sheet.verse} end={sheet.end ?? sheet.verse} docked={wide}
      initialNotes={sheet.panel === "note"} onEndChange={(end) => setSheet({ ...sheet, end })}
      onClose={() => {
        setSheet(wide ? null : { ...sheet, panel: undefined });
        requestAnimationFrame(() => {
          if (wide) verseTrigger.current?.focus({ preventScroll: true });
          else readerWrap.current?.querySelector<HTMLButtonElement>(".verse-study-action")?.focus({ preventScroll: true });
        });
      }} />
  );

  return (
    <div ref={readerWrap} className={`reader-wrap ${wide && sheet ? "with-dock" : showTray ? "with-verse-actions" : ""}`}>
    <div className="page reader">
      <div className="toolbar" ref={toolbar}>
        <button type="button" className="reader-control pick-btn" onClick={() => setPicker(true)}>{bookName(book)} {chapter} <span aria-hidden="true">▾</span></button>
        <div className="toolbar-right">
          <ReaderTranslationPicker value={translation} onChange={(t) => {
            setPref("translation", t);
            if (route?.translation) navigate(readHash({ book, chapter, verse: route.verse, verseEnd: route.verseEnd }));
          }} />
          {canReadAloud() && !isOnline(translation) && (
            <button type="button" className={`reader-control listen-btn ${listeningHere ? "on" : ""}`} onClick={toggleSpeak}
              aria-label={listeningHere ? "Open the player" : "Listen to this chapter"} title={listeningHere ? "Open the player" : "Listen to this chapter"}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /></svg>
            </button>
          )}
          <button type="button" className="reader-control reading-options-toggle" aria-label="Reading options"
            aria-expanded={readingOptions} aria-controls="reading-options" onClick={toggleOptions}>Aa</button>
        </div>
      </div>

      <section id="reading-options" className="reading-options" aria-label="Reading options" ref={optionsPanel} hidden={!readingOptions}>
        <button type="button" className="icon-btn" aria-label="Close options" onClick={() => closeOptions(true)}>×</button>
        <div>
          <label className="label" htmlFor="compare-select">Compare with</label>
          <TranslationSelect id="compare-select" value={prefs.compare} allowNone onChange={(t) => setPref("compare", t)} />
          <label className="reader-check">
            <input type="checkbox" checked={prefs.highlightDifferences} disabled={!compareTranslation}
              onChange={(e) => setPref("highlightDifferences", e.target.checked)} />
            Highlight differences
          </label>
        </div>
        <div>
          <label className="label" htmlFor="reader-theme">Appearance</label>
          <ThemeSelect id="reader-theme" />
        </div>
        <div>
          <label className="label" htmlFor="text-size">Text size</label>
          <input id="text-size" type="range" min="15" max="28" value={prefs.textSize} onChange={(e) => setPref("textSize", Number(e.target.value))} />
        </div>
        <fieldset className="reader-mode">
          <legend className="label">Reader Mode</legend>
          <label className="reader-check"><input type="checkbox" checked={prefs.hideVerseNumbers}
            onChange={(e) => setPref("hideVerseNumbers", e.target.checked)} /> Hide verse numbers</label>
          <label className="reader-check"><input type="checkbox" checked={prefs.hideSectionHeadings}
            onChange={(e) => setPref("hideSectionHeadings", e.target.checked)} /> Hide section headings</label>
          <label className="reader-check"><input type="checkbox" checked={prefs.hideStudyPrompt}
            onChange={(e) => setPref("hideStudyPrompt", e.target.checked)} /> Hide study prompt</label>
        </fieldset>
        <div>
          <label className="reader-check">
            <input type="checkbox" checked={prefs.wordStudy} onChange={(e) => setPref("wordStudy", e.target.checked)} />
            Tap words for the lexicon
          </label>
        </div>
        <div>
          {isOnline(translation)
            ? <p className="fine read-aloud-off">Read aloud is available for built-in translations such as the BSB.</p>
            : canReadAloud()
            ? <button type="button" className="btn small" onClick={() => { setReadingOptions(false); toggleSpeak(); }}>{listeningHere ? "Open the player" : resumeAt ? `Listen from verse ${resumeAt}` : "Listen to this chapter"}</button>
            : <p className="fine read-aloud-off">{NO_SPEECH}</p>}
          {!isOnline(translation) && canReadAloud() && builtIn && BUILT_IN && !listeningHere && (
            <p className="fine read-aloud-off">{saved === false
              ? `${BUILT_IN.name}, the voice built into Veritas Logos, reads here. The first time, it downloads ${mb(BUILT_IN.downloadBytes)}, which this browser keeps.`
              : `${BUILT_IN.name}, the voice built into Veritas Logos, reads here.`}</p>
          )}
        </div>
      </section>

      {!prefs.hideStudyPrompt && (
        <div className="study-cta">
          <button type="button" className="btn small" onClick={() => verses && setSheet({ verse: 1, end: verses.length, panel: "study" })}>Study this chapter</button>
          <span className="fine">{prefs.wordStudy ? "Tap any word to look it up." : "or tap any verse for insights, Hebrew and Greek, its history and links"}</span>
        </div>
      )}

      {loading && <Loading label="Loading Scripture" />}
      {error instanceof OnlineTextError
        ? <div className="note warn" role="alert"><p>{error.message}</p><button type="button" className="btn small" onClick={readInBsb}>Read in the BSB instead</button></div>
        : <ErrorNote error={error} />}
      <ErrorNote error={compareTranslation ? compareError : undefined} />
      {verses && verses.every((v) => !v.text) && (
        <div className="note" role="status">
          <p>{info.covers ? `The ${info.name} has only ${info.covers}, so it doesn't include ${bookName(book)}.` : `The ${info.name} doesn't include ${bookName(book)} ${chapter}.`}</p>
          <button type="button" className="btn small" onClick={readInBsb}>Read in the BSB</button>
        </div>
      )}
      {verses && verses.some((v) => v.text) && (
        <div className={`scripture${continuous ? " continuous" : ""}`} style={{ fontSize: `${prefs.textSize}px` }}>
          <h2 className="chapter-title"><span>{bookName(book)}</span> {chapter}</h2>
          {verses.map((v) => {
            const hl = highlights[vKey(book, chapter, v.verse)];
            const hasNote = Boolean(notes[vKey(book, chapter, v.verse)]);
            const comparedText = compare?.[v.verse - 1]?.text;
            const diff = prefs.highlightDifferences && comparedText !== undefined;
            const primaryWords = prefs.wordStudy || diff ? readingWords(v.text) : [];
            const parallelWords = comparedText && (prefs.wordStudy || diff) ? readingWords(comparedText) : [];
            const [primaryDiff, parallelDiff] = diff ? wordDifferences(primaryWords, parallelWords) : [];
            const onWord = (source: TranslationId, words: typeof primaryWords) => prefs.wordStudy
              ? (index: number, trigger: HTMLButtonElement) => setWordSelection((current) =>
                current?.trigger === trigger ? null : { verse: v.verse, translation: source, words, index, trigger })
              : undefined;
            const studyVerse = (trigger: HTMLElement) => {
              verseTrigger.current = trigger;
              setSheet({ verse: v.verse });
            };
            const focusVerseActions = (trigger: HTMLElement) => {
              studyVerse(trigger);
              if (!wide) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".verse-study-action")?.focus({ preventScroll: true }));
            };
            const selected = inRange(v.verse);
            const number = !prefs.hideVerseNumbers && (prefs.wordStudy
              ? <button type="button" className="verse-number" aria-label={`Study verse ${v.verse}`} aria-pressed={selected} onClick={(event) => focusVerseActions(event.currentTarget)}><sup>{v.verse}</sup></button>
              : <sup>{v.verse}</sup>);
            return (
              <Fragment key={v.verse}>
                {headings?.[v.verse]?.map((heading, i) => <h3 className="section-heading" key={i}>{heading}</h3>)}
                <div id={`v${v.verse}`} className={`verse ${hl ? `hl-${hl}` : ""} ${speaking === v.verse ? "speaking" : ""} ${selected ? "picked" : ""} ${route?.verse === v.verse && selected ? "target" : ""} ${arrived === v.verse ? "arrive" : ""} ${prefs.wordStudy ? "word-study" : ""}`}
                  role={prefs.wordStudy ? undefined : "button"} tabIndex={prefs.wordStudy ? undefined : 0} aria-pressed={prefs.wordStudy ? undefined : selected}
                  onClick={prefs.wordStudy ? undefined : (event) => studyVerse(event.currentTarget)} onKeyDown={prefs.wordStudy ? undefined : (e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    focusVerseActions(e.currentTarget);
                  }}>
                  {number}
                  {v.text
                    ? <span className="verse-text"><ReaderWords text={v.text} words={primaryWords} differences={primaryDiff} onWord={onWord(translation, primaryWords)} /></span>
                    : <em className="missing">This verse isn't in the {translation} text. Some manuscripts include it, so it's kept as a footnote in many Bibles.</em>}
                  {hasNote && <Tag tone="note">Note</Tag>}
                  {comparedText !== undefined && compareTranslation && (
                    <div className="compare"><strong>{compareTranslation}</strong>{" "}
                      {comparedText
                        ? <ReaderWords text={comparedText} words={parallelWords} differences={parallelDiff} onWord={onWord(compareTranslation, parallelWords)} />
                        : <em className="missing">Verse absent in this translation.</em>}
                    </div>
                  )}
                </div>
                {continuous && " "}
              </Fragment>
            );
          })}
          <p className="fine notice">
            {isOnline(translation) ? onlineNotice(translation, book, chapter) : info.notice}
            {info.link && <> <a href={info.link.url} target="_blank" rel="noopener noreferrer">{info.link.label}</a></>}
          </p>
        </div>
      )}

      <p className="chapter-links"><a href={`#${passageWritersHash(book, chapter)}`}>What the Fathers and teachers said on this chapter</a> · <a href={`#book-${bookName(book).toLowerCase().replace(/\s+/g, "")}`}>About {bookName(book)}</a></p>
      <ChapterReadButton book={book} chapter={chapter} />
      <div className="chapter-nav">
        <button type="button" className="btn" onClick={prev} disabled={book === 1 && chapter === 1}>Previous chapter</button>
        <button type="button" className="btn" onClick={next} disabled={book === 66 && chapter === (chapters ?? 22)}>Next chapter</button>
      </div>

      {picker && <Picker book={book} chapter={chapter} verse={route?.verse} onClose={() => setPicker(false)} onPick={(b, c, v) => { setPicker(false); go(b, c, v); }} />}
      {wordSelection && prefs.wordStudy && (
        <ReaderLexicon key={`${book}:${chapter}:${wordSelection.verse}:${wordSelection.translation}:${wordSelection.index}`} book={book} chapter={chapter}
          selection={wordSelection} onClose={closeWord} onStudy={() => { setSheet({ verse: wordSelection.verse, panel: "study" }); closeWord(false); }} />
      )}
      {showTray && sheet && <VerseActions key={sheet.verse} book={book} chapter={chapter} verse={sheet.verse} end={sheet.end}
        onStudy={() => setSheet({ ...sheet, panel: "study" })} onNote={() => setSheet({ ...sheet, panel: "note" })} onClose={closeTray} />}
      {!wide && verseSheet}
    </div>
    {wide && verseSheet}
    </div>
  );
}

function MemorizeButton({ book, chapter, verse, end, plain }: { book: number; chapter: number; verse: number; end: number; plain?: boolean }) {
  const on = !!useMemorizing(book, chapter, verse, end);
  return <button type="button" className={plain ? "btn" : "btn small"} aria-pressed={on} onClick={() => toggleMemory(book, chapter, verse, end)}>{on ? "Memorizing" : "Memorize"}</button>;
}
function ChapterReadButton({ book, chapter }: { book: number; chapter: number }) {
  const on = useChapterRead(book, chapter);
  return (
    <p className="chapter-read-btn">
      <button type="button" className={`btn${on ? "" : " primary"}`} aria-pressed={on} onClick={() => toggleChapterRead(book, chapter)}>{on ? "✓ Chapter read" : "Mark chapter read"}</button>
      {" "}<a className="fine" href="#reading">Reading progress</a>
    </p>
  );
}
