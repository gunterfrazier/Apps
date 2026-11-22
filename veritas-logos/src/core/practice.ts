// Verse memorization and Bible reading progress: the pure parts, kept apart from the screens so they can be tested.
//
// Memorization uses five boxes, the way paper flash cards are often kept (a Leitner system). A new verse starts in
// box 0 and is due today. Saying it right moves it up a box and puts it off for longer (1, 3, 7, 14, then 30 days);
// missing it sends it back to box 0, due again tomorrow. Practice shows the first letter of each word as a hint, then
// the whole verse.
//
// Reading progress is a set of chapters marked read, each with the day it was marked, so reading goes at your own
// pace: no plan, no missed days.

export interface MemoryVerse {
  id: string;
  /** "John 3:16" or "John 3:16-18". */
  ref: string;
  book: number; chapter: number; verse: number; end: number;
  box: number;
  /** The day it's next due, YYYY-MM-DD in the reader's own time. */
  due: string;
  reviews: number;
  addedAt: string;
  updatedAt: string;
}

export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = INTERVALS.length - 1;

/** Today's date (or another day's) as YYYY-MM-DD in local time. */
export function dayOf(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayOf(new Date(y, m - 1, d + n));
}

export function newMemoryVerse(id: string, ref: string, book: number, chapter: number, verse: number, end: number, now = new Date()): MemoryVerse {
  const at = now.toISOString();
  return { id, ref, book, chapter, verse, end, box: 0, due: dayOf(now), reviews: 0, addedAt: at, updatedAt: at };
}

/** The verse after one practice: up a box when it was right, back to the start when it wasn't. */
export function review(v: MemoryVerse, right: boolean, now = new Date()): MemoryVerse {
  const box = right ? Math.min(MAX_BOX, v.box + 1) : 0;
  const today = dayOf(now);
  return { ...v, box, due: addDays(today, right ? INTERVALS[box] : 1), reviews: v.reviews + 1, updatedAt: now.toISOString() };
}

export const isDue = (v: MemoryVerse, today = dayOf()) => v.due <= today;
/** Learned: in the last box. */
export const isLearned = (v: MemoryVerse) => v.box >= MAX_BOX;
export const dueVerses = (list: MemoryVerse[], today = dayOf()) => list.filter((v) => isDue(v, today)).sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box);

/** The first letter of each word, keeping punctuation, as a hint: "For God so loved" -> "F G s l". */
export function firstLetters(text: string): string {
  return text.split(/\s+/).filter(Boolean).map((w) => {
    const m = w.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}])[\p{L}\p{N}'’-]*(.*)$/u);
    return m ? `${m[1]}${m[2]}${m[3]}` : w;
  }).join(" ");
}

/** Keeps only well-formed verses from stored or synced data. */
export function sanitizeMemory(raw: unknown): MemoryVerse[] {
  if (!Array.isArray(raw)) return [];
  const ok = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n > 0;
  return raw.flatMap((v: any) => (
    v && typeof v.id === "string" && typeof v.ref === "string" && ok(v.book) && v.book <= 66 && ok(v.chapter) && ok(v.verse) && ok(v.end) && v.end >= v.verse
      && typeof v.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.due)
      ? [{ id: v.id, ref: v.ref, book: v.book, chapter: v.chapter, verse: v.verse, end: v.end,
          box: Number.isInteger(v.box) ? Math.min(MAX_BOX, Math.max(0, v.box)) : 0, due: v.due,
          reviews: Number.isInteger(v.reviews) && v.reviews >= 0 ? v.reviews : 0,
          addedAt: typeof v.addedAt === "string" ? v.addedAt : "", updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "" }]
      : []
  ));
}

// ---------- Reading progress ----------

/** Chapters in each book, Genesis to Revelation. */
export const CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];
export const TOTAL_CHAPTERS = CHAPTERS.reduce((a, b) => a + b, 0);
/** "book:chapter" -> the day it was marked read. */
export type ReadMap = Record<string, string>;
export const chapterKey = (book: number, chapter: number) => `${book}:${chapter}`;

export function sanitizeRead(raw: unknown): ReadMap {
  if (!raw || typeof raw !== "object") return {};
  const out: ReadMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const m = k.match(/^(\d+):(\d+)$/);
    if (!m || typeof v !== "string") continue;
    const b = Number(m[1]), c = Number(m[2]);
    if (b >= 1 && b <= 66 && c >= 1 && c <= CHAPTERS[b - 1]) out[k] = v;
  }
  return out;
}
/** Two copies of the same reader's progress: every chapter either marked, with the earlier day. */
export function combineRead(a: ReadMap, b: ReadMap): ReadMap {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = out[k] && out[k] <= v ? out[k] : v;
  return out;
}

export function readCount(read: ReadMap, book?: number): number {
  if (book == null) return Object.keys(read).length;
  let n = 0;
  for (let c = 1; c <= CHAPTERS[book - 1]; c++) if (read[chapterKey(book, c)]) n++;
  return n;
}
/** The first unread chapter after the given one, wrapping to Genesis; null once everything is read. */
export function nextUnread(read: ReadMap, from = { book: 1, chapter: 0 }): { book: number; chapter: number } | null {
  let b = from.book, c = from.chapter;
  for (let i = 0; i < TOTAL_CHAPTERS; i++) {
    c++;
    if (c > CHAPTERS[b - 1]) { b = b === 66 ? 1 : b + 1; c = 1; }
    if (!read[chapterKey(b, c)]) return { book: b, chapter: c };
  }
  return null;
}
/** Days in a row, ending today or yesterday, on which at least one chapter was marked read. */
export function streak(read: ReadMap, today = dayOf()): number {
  const days = new Set(Object.values(read));
  let day = days.has(today) ? today : addDays(today, -1), n = 0;
  while (days.has(day)) { n++; day = addDays(day, -1); }
  return n;
}
