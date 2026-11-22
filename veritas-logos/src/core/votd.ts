// Verse of the Day: the reference comes from YouVersion's Verse of the Day (through the owner's Bible service, see
// supabase/functions/bible-texts), and the app shows the words from its own Bible. When YouVersion can't be reached,
// the app picks from its own list below, the same verse for everyone on a given day.

export interface DailyVerse { date: string; book: number; chapter: number; verse: number; end: number; source: "youversion" | "app" }

/** Well-loved verses: book number, chapter, first verse, last verse. */
export const FALLBACK_VERSES: readonly [number, number, number, number][] = [
  [43, 3, 16, 16], [19, 23, 1, 3], [20, 3, 5, 6], [45, 8, 28, 28], [50, 4, 6, 7], [23, 40, 31, 31], [24, 29, 11, 11], [40, 11, 28, 30],
  [6, 1, 9, 9], [45, 12, 2, 2], [49, 2, 8, 9], [58, 11, 1, 1], [19, 46, 1, 1], [62, 4, 19, 19], [43, 14, 6, 6], [45, 5, 8, 8],
  [50, 4, 13, 13], [40, 6, 33, 33], [19, 119, 105, 105], [25, 3, 22, 23], [47, 5, 17, 17], [48, 2, 20, 20], [55, 1, 7, 7], [59, 1, 5, 5],
  [60, 5, 7, 7], [33, 6, 8, 8], [23, 41, 10, 10], [19, 27, 1, 1], [19, 37, 4, 4], [19, 91, 1, 2], [19, 139, 14, 14], [4, 6, 24, 26],
  [5, 31, 6, 6], [1, 1, 1, 1], [43, 1, 1, 1], [43, 11, 25, 26], [43, 15, 5, 5], [43, 16, 33, 33], [45, 15, 13, 13], [46, 13, 4, 7],
  [47, 12, 9, 9], [49, 3, 20, 21], [51, 3, 23, 24], [52, 5, 16, 18], [55, 3, 16, 17], [58, 4, 16, 16], [58, 12, 1, 2], [59, 1, 22, 22],
  [62, 1, 9, 9], [66, 21, 4, 4], [42, 1, 37, 37], [40, 5, 14, 16], [40, 28, 19, 20], [41, 10, 27, 27], [44, 1, 8, 8], [21, 3, 1, 1],
  [18, 19, 25, 25], [14, 7, 14, 14], [26, 36, 26, 26], [27, 9, 19, 19], [32, 2, 9, 9], [35, 3, 17, 18], [36, 3, 17, 17], [38, 4, 6, 6],
];

/** The day of the year, 1 to 366, for YYYY-MM-DD. */
export function dayOfYear(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
}

/** The app's own verse for a date, so the card is never empty. */
export function fallbackVerse(date: string): DailyVerse {
  const [y] = date.split("-").map(Number);
  const [book, chapter, verse, end] = FALLBACK_VERSES[(dayOfYear(date) - 1 + y) % FALLBACK_VERSES.length];
  return { date, book, chapter, verse, end, source: "app" };
}

/** Checks what the Bible service sent back. */
export function fromService(date: string, raw: any): DailyVerse | null {
  const n = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x > 0 ? x : 0);
  const book = n(raw?.book), chapter = n(raw?.chapter), verse = n(raw?.verse), end = n(raw?.end) || verse;
  if (!book || book > 66 || !chapter || !verse || end < verse || end - verse > 20) return null;
  return { date, book, chapter, verse, end, source: "youversion" };
}

/** The words a Psalm's title is made of. Each sentence of a title starts with one of these. */
const TITLE_START = /^(?:For the (?:choirmaster|director)|To the choirmaster|A (?:Psalm|psalm|Song|song|Maskil|Miktam|Shiggaion|prayer|Prayer|Petition|petition)|Of (?:David|Asaph|Solomon|Heman|Ethan|Moses|the sons of Korah)|According to|With stringed|On the |Set to|To the tune|When |Concerning|For the dedication|For remembrance|To bring to remembrance|For the Sabbath|Of thanksgiving)\b/;
/** Verse 1 of a Psalm in the BSB carries the Psalm's title before the verse ("A Psalm of David. The LORD is my
 * shepherd..."): the title is dropped for the card, sentence by sentence, while each sentence reads like one. */
export function withoutPsalmTitle(book: number, chapter: number, verse: number, text: string): string {
  if (book !== 19 || verse !== 1) return text;
  let rest = text.trim();
  for (let i = 0; i < 5; i++) {
    const m = rest.match(/^([^.?!]*[.?!][”"’]?)\s+(\S[\s\S]*)$/);
    if (!m || !TITLE_START.test(m[1])) break;
    rest = m[2];
  }
  return rest;
}
