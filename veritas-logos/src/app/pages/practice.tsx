// Memory verses and reading progress (logic in src/core/practice.ts). Both are saved with the rest of the reader's
// work, so they follow a signed-in reader between devices.
//
// Memorized verses are shown in the reader's own translation when it's one built into the app, and in the BSB when
// it's a licensed one (the ESV, NIV, NLT and NKJV are only shown in the reader itself).
import { useMemo, useState } from "react";
import { getVerseIn, localTranslation, refOf, translationInfo } from "../../core/bible";
import { newId } from "../../core/guide";
import { bookName } from "../../core/references";
import {
  CHAPTERS, chapterKey, dayOf, dueVerses, firstLetters, isLearned, MAX_BOX, newMemoryVerse, nextUnread, readCount, review, streak, TOTAL_CHAPTERS, type MemoryVerse,
} from "../../core/practice";
import { readHash } from "../routes";
import { toast, update, useData } from "../store";
import { Empty, Loading, useAsync } from "../ui";

// ---------- Memory verses ----------

export function useMemorizing(book: number, chapter: number, verse: number, end: number): MemoryVerse | undefined {
  return useData().memory.find((m) => m.book === book && m.chapter === chapter && m.verse === verse && m.end === end);
}
export function toggleMemory(book: number, chapter: number, verse: number, end: number) {
  let added = false;
  update((d) => {
    const have = d.memory.find((m) => m.book === book && m.chapter === chapter && m.verse === verse && m.end === end);
    if (have) return { ...d, memory: d.memory.filter((m) => m.id !== have.id) };
    added = true;
    return { ...d, memory: [...d.memory, newMemoryVerse(newId("m"), refOf(book, chapter, verse, end), book, chapter, verse, end)] };
  });
  toast(added ? "Added to your memory verses" : "Removed from your memory verses");
}

function useVerseText(v: MemoryVerse | undefined) {
  const { prefs } = useData();
  const t = localTranslation(prefs.translation);
  return useAsync(async () => {
    if (!v) return null;
    const parts: string[] = [];
    let from = t;
    for (let n = v.verse; n <= v.end; n++) { const r = await getVerseIn(t, v.book, v.chapter, n); from = r.translation; parts.push(r.text); }
    return { text: parts.join(" ").replace(/\s+/g, " ").trim(), translation: from };
  }, [v?.id, t]);
}

const BOX_NAMES = ["New", "Learning", "Learning", "Getting there", "Almost", "Learned"];

export function MemorizePage() {
  const { memory } = useData();
  const today = dayOf();
  const due = useMemo(() => dueVerses(memory, today), [memory, today]);
  const [practicing, setPracticing] = useState(false);
  const sorted = [...memory].sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);
  if (practicing && due.length) return <Practice verse={due[0]} left={due.length} onStop={() => setPracticing(false)} />;
  return (
    <div className="page prose">
      <h1 className="page-title">Memory verses</h1>
      <p className="sub">Choose <b>Memorize</b> on any verse in the reader to add it here. Practice the verses that are due each day: each one you say right comes back less often, until it's learned.</p>
      {memory.length > 0 && (
        <div className="practice-summary">
          <p><b>{due.length ? `${due.length} due today` : "Nothing due today"}</b> · {memory.filter(isLearned).length} of {memory.length} learned</p>
          {due.length > 0 && <button type="button" className="btn primary" onClick={() => setPracticing(true)}>Practice now</button>}
        </div>
      )}
      {memory.length ? (
        <ul className="link-list memory-list">
          {sorted.map((m) => (
            <li key={m.id}>
              <a href={`#${readHash({ book: m.book, chapter: m.chapter, verse: m.verse, verseEnd: m.end })}`}>{m.ref}</a>
              <span className="fine"> · {BOX_NAMES[m.box]}{m.due <= today ? ", due" : `, next ${m.due}`}</span>
              <button type="button" className="link-btn" aria-label={`Remove ${m.ref}`} onClick={() => toggleMemory(m.book, m.chapter, m.verse, m.end)}>Remove</button>
            </li>
          ))}
        </ul>
      ) : <Empty>No memory verses yet. Open a verse in the reader and choose Memorize.</Empty>}
    </div>
  );
}

function Practice({ verse, left, onStop }: { verse: MemoryVerse; left: number; onStop: () => void }) {
  const [stage, setStage] = useState<"ref" | "hint" | "full">("ref");
  const { data, loading } = useVerseText(verse);
  const grade = (right: boolean) => {
    update((d) => ({ ...d, memory: d.memory.map((m) => (m.id === verse.id ? review(m, right) : m)) }));
    setStage("ref");
    if (left <= 1) { toast(right ? "That's everything due today. Well done." : "That's everything for today."); onStop(); }
  };
  return (
    <div className="page prose practice">
      <p className="fine">{left} to go · <button type="button" className="link-btn" onClick={onStop}>Stop</button></p>
      <h1 className="page-title">{verse.ref}</h1>
      <p className="fine">Say the verse from memory, then check yourself.</p>
      {loading ? <Loading /> : data && (
        <>
          {stage === "hint" && <p className="verse-quote practice-hint" aria-label="First letters of each word">{firstLetters(data.text)}</p>}
          {stage === "full" && <p className="verse-quote">{data.text}</p>}
          {stage === "full" && <p className="fine">{translationInfo(data.translation).name}</p>}
        </>
      )}
      <div className="action-row">
        {stage === "ref" && <button type="button" className="btn" onClick={() => setStage("hint")}>Show first letters</button>}
        {stage !== "full" && <button type="button" className="btn primary" onClick={() => setStage("full")}>Show the verse</button>}
        {stage === "full" && <>
          <button type="button" className="btn primary" onClick={() => grade(true)}>I got it</button>
          <button type="button" className="btn" onClick={() => grade(false)}>Not yet</button>
        </>}
      </div>
      {verse.box < MAX_BOX && stage === "full" && <p className="fine">Got it: next practice in {[1, 3, 7, 14, 30][verse.box]} day{verse.box ? "s" : ""}. Not yet: tomorrow.</p>}
    </div>
  );
}

// ---------- Reading progress ----------

export function useChapterRead(book: number, chapter: number): boolean {
  return !!useData().chaptersRead[chapterKey(book, chapter)];
}
export function toggleChapterRead(book: number, chapter: number) {
  update((d) => {
    const k = chapterKey(book, chapter), read = { ...d.chaptersRead };
    if (read[k]) delete read[k]; else read[k] = dayOf();
    return { ...d, chaptersRead: read };
  });
}

const TESTAMENTS: [string, number, number][] = [["Old Testament", 1, 39], ["New Testament", 40, 66]];

export function ReadingPage() {
  const { chaptersRead, lastRead } = useData();
  const [open, setOpen] = useState<number | null>(null);
  const total = readCount(chaptersRead);
  const pct = Math.round((total / TOTAL_CHAPTERS) * 1000) / 10;
  const next = nextUnread(chaptersRead, { book: lastRead.book, chapter: lastRead.chapter - 1 });
  const days = streak(chaptersRead);
  return (
    <div className="page prose">
      <h1 className="page-title">Reading progress</h1>
      <p className="sub">Mark chapters read at the end of each chapter in the reader, or here. Read at your own pace, in any order.</p>
      <div className="practice-summary">
        <p><b>{total} of {TOTAL_CHAPTERS} chapters</b> · {pct}% of the Bible{days > 1 ? ` · ${days} days in a row` : ""}</p>
        <div className="meter" role="img" aria-label={`${pct}% read`}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
        {next && <a className="btn primary" href={`#${readHash({ book: next.book, chapter: next.chapter })}`}>Read {bookName(next.book)} {next.chapter}</a>}
      </div>
      {TESTAMENTS.map(([name, from, to]) => {
        const chapters = CHAPTERS.slice(from - 1, to).reduce((a, b) => a + b, 0);
        let done = 0;
        for (let b = from; b <= to; b++) done += readCount(chaptersRead, b);
        return (
          <section key={name}>
            <h2>{name} <span className="fine">{done} of {chapters}</span></h2>
            <ul className="book-progress">
              {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((b) => {
                const n = readCount(chaptersRead, b), all = CHAPTERS[b - 1];
                return (
                  <li key={b}>
                    <button type="button" className={`book-progress-row${n === all ? " done" : ""}`} aria-expanded={open === b} onClick={() => setOpen(open === b ? null : b)}>
                      <span>{bookName(b)}</span><span className="fine">{n}/{all}</span>
                      <span className="meter small" aria-hidden="true"><span style={{ width: `${(n / all) * 100}%` }} /></span>
                    </button>
                    {open === b && (
                      <div className="chapter-grid" role="group" aria-label={`${bookName(b)} chapters`}>
                        {Array.from({ length: all }, (_, c) => c + 1).map((c) => {
                          const on = !!chaptersRead[chapterKey(b, c)];
                          return <button key={c} type="button" className={`chapter-cell${on ? " on" : ""}`} aria-pressed={on}
                            aria-label={`${bookName(b)} ${c}${on ? ", read" : ""}`} onClick={() => toggleChapterRead(b, c)}>{c}</button>;
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
