/**
 * Scripture reference parsing, e.g. "Exodus 2:1–10; 6:20; Numbers 26:59".
 * Self-contained (no imports) so data-checking scripts can load it with plain Node.
 */

export interface BookInfo {
  /** 1 = Genesis … 66 = Revelation */
  number: number;
  name: string;
  /** Lower-case names and abbreviations that refer to this book. */
  aliases: string[];
}

const BOOK_DATA: [string, string[]][] = [
  ["Genesis", ["gen", "gn"]],
  ["Exodus", ["exod", "exo", "ex"]],
  ["Leviticus", ["lev", "lv"]],
  ["Numbers", ["num", "nm"]],
  ["Deuteronomy", ["deut", "dt"]],
  ["Joshua", ["josh"]],
  ["Judges", ["judg", "jdg"]],
  ["Ruth", ["rth"]],
  ["1 Samuel", ["1 sam", "i samuel", "1sam"]],
  ["2 Samuel", ["2 sam", "ii samuel", "2sam"]],
  ["1 Kings", ["1 kgs", "i kings", "1kgs"]],
  ["2 Kings", ["2 kgs", "ii kings", "2kgs"]],
  ["1 Chronicles", ["1 chr", "1 chron", "i chronicles"]],
  ["2 Chronicles", ["2 chr", "2 chron", "ii chronicles"]],
  ["Ezra", ["ezr"]],
  ["Nehemiah", ["neh"]],
  ["Esther", ["esth", "est"]],
  ["Job", []],
  ["Psalms", ["psalm", "ps", "psa", "pss"]],
  ["Proverbs", ["prov", "prv"]],
  ["Ecclesiastes", ["eccl", "eccles", "qoh"]],
  ["Song of Solomon", ["song of songs", "song", "sos"]],
  ["Isaiah", ["isa"]],
  ["Jeremiah", ["jer"]],
  ["Lamentations", ["lam"]],
  ["Ezekiel", ["ezek", "ezk"]],
  ["Daniel", ["dan"]],
  ["Hosea", ["hos"]],
  ["Joel", []],
  ["Amos", []],
  ["Obadiah", ["obad"]],
  ["Jonah", ["jon"]],
  ["Micah", ["mic"]],
  ["Nahum", ["nah"]],
  ["Habakkuk", ["hab"]],
  ["Zephaniah", ["zeph"]],
  ["Haggai", ["hag"]],
  ["Zechariah", ["zech"]],
  ["Malachi", ["mal"]],
  ["Matthew", ["matt", "mt"]],
  ["Mark", ["mk"]],
  ["Luke", ["lk"]],
  ["John", ["jn"]],
  ["Acts", []],
  ["Romans", ["rom"]],
  ["1 Corinthians", ["1 cor", "i corinthians"]],
  ["2 Corinthians", ["2 cor", "ii corinthians"]],
  ["Galatians", ["gal"]],
  ["Ephesians", ["eph"]],
  ["Philippians", ["phil"]],
  ["Colossians", ["col"]],
  ["1 Thessalonians", ["1 thess", "i thessalonians"]],
  ["2 Thessalonians", ["2 thess", "ii thessalonians"]],
  ["1 Timothy", ["1 tim", "i timothy"]],
  ["2 Timothy", ["2 tim", "ii timothy"]],
  ["Titus", ["tit"]],
  ["Philemon", ["phlm", "philem"]],
  ["Hebrews", ["heb"]],
  ["James", ["jas"]],
  ["1 Peter", ["1 pet", "i peter"]],
  ["2 Peter", ["2 pet", "ii peter"]],
  ["1 John", ["1 jn", "i john"]],
  ["2 John", ["2 jn", "ii john"]],
  ["3 John", ["3 jn", "iii john"]],
  ["Jude", []],
  ["Revelation", ["rev", "revelation of john", "revelations"]],
];

export const BOOKS: readonly BookInfo[] = BOOK_DATA.map(([name, aliases], i) => ({
  number: i + 1,
  name,
  aliases: [name.toLowerCase(), ...aliases],
}));

/** Longest aliases first, so "1 John" wins over "John". */
const ALIASES = BOOKS.flatMap((b) => b.aliases.map((alias) => ({ alias, book: b.number }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

export function bookName(book: number): string {
  return BOOKS[book - 1]?.name ?? `Book ${book}`;
}

export interface RefSegment {
  book: number;
  chapter: number;
  /** Undefined = the whole chapter (through chapterEnd). */
  verseStart?: number;
  chapterEnd: number;
  verseEnd?: number;
}

function matchBook(text: string): { book: number; rest: string } | null {
  const lower = text.toLowerCase();
  for (const { alias, book } of ALIASES) {
    if (lower.startsWith(alias)) {
      const rest = text.slice(alias.length).replace(/^\.?\s*/, "");
      if (/^\d/.test(rest)) return { book, rest };
    }
  }
  return null;
}

/**
 * Parses a reference list into verse ranges. Returns null when any part can't be
 * understood, so callers can fall back to showing the raw string.
 */
export function parseReference(ref: string): RefSegment[] | null {
  const segments: RefSegment[] = [];
  const normalized = ref.replace(/[–—‒]/g, "-").replace(/\s+/g, " ").trim();
  let book: number | null = null;

  for (const rawPart of normalized.split(";")) {
    let part = rawPart.trim();
    if (!part) continue;
    const matched = matchBook(part);
    if (matched) {
      book = matched.book;
      part = matched.rest;
    }
    if (book === null) return null;

    let chapter: number | null = null;
    let inVerses = false;
    for (const rawItem of part.split(",")) {
      const item = rawItem.trim().replace(/[a-z]$/i, ""); // "15a" → 15
      let m: RegExpMatchArray | null;
      if ((m = item.match(/^(\d+):(\d+)[a-z]?(?:-(?:(\d+):)?(\d+)[a-z]?)?$/i))) {
        chapter = Number(m[1]);
        inVerses = true;
        const verseStart = Number(m[2]);
        const chapterEnd = m[3] ? Number(m[3]) : chapter;
        const verseEnd = m[4] ? Number(m[4]) : verseStart;
        segments.push({ book, chapter, verseStart, chapterEnd, verseEnd });
        chapter = chapterEnd;
      } else if ((m = item.match(/^(\d+)(?:-(\d+))?$/))) {
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        if (inVerses && chapter !== null) {
          segments.push({ book, chapter, verseStart: a, chapterEnd: chapter, verseEnd: b });
        } else {
          segments.push({ book, chapter: a, chapterEnd: b });
          chapter = b;
        }
      } else {
        return null;
      }
    }
  }
  return segments.length ? segments : null;
}

export function formatSegment(seg: RefSegment, withBook = true): string {
  const head = withBook ? `${bookName(seg.book)} ` : "";
  if (seg.verseStart === undefined) {
    return seg.chapterEnd !== seg.chapter ? `${head}${seg.chapter}–${seg.chapterEnd}` : `${head}${seg.chapter}`;
  }
  if (seg.chapterEnd !== seg.chapter) return `${head}${seg.chapter}:${seg.verseStart}–${seg.chapterEnd}:${seg.verseEnd}`;
  if (seg.verseEnd !== undefined && seg.verseEnd !== seg.verseStart)
    return `${head}${seg.chapter}:${seg.verseStart}–${seg.verseEnd}`;
  return `${head}${seg.chapter}:${seg.verseStart}`;
}

/** Splits free text into plain runs and scripture references (for tappable references). */
let refPattern: RegExp | null = null;
export function findReferences(text: string): { text: string; ref?: string }[] {
  refPattern ??= buildRefPattern();
  const pattern = new RegExp(refPattern.source, refPattern.flags);
  const out: { text: string; ref?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (!parseReference(m[0])) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: m[0], ref: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

function buildRefPattern(): RegExp {
  const names = ALIASES.map((a) => a.alias.replace(/ /g, "\\s"))
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "\\" ? c : `\\${c}`)))
    .join("|");
  return new RegExp(
    `\\b(?:${names})\\.?\\s\\d+:\\d+(?:[-–]\\d+(?::\\d+)?)?(?:,\\s?\\d+(?::\\d+)?(?:[-–]\\d+)?)*(?:;\\s?(?:(?:${names})\\.?\\s)?\\d+:\\d+(?:[-–]\\d+(?::\\d+)?)?(?:,\\s?\\d+(?:[-–]\\d+)?)*)*`,
    "gi",
  );
}
