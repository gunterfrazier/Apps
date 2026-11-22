// Highlights shared with YouVersion: the pure parts (passage codes, colors), kept apart from the network so they can be
// tested. YouVersion keeps each highlight as a passage ("JHN.3.16", or a range "JHN.3.16-18") in one Bible version, with
// a 6-digit hex color. Veritas Logos keeps one of four colors per verse.

export type HighlightColor = "amber" | "green" | "blue" | "rose";

/** USFM book codes, Genesis to Revelation. */
export const USFM = ["GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
  "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN",
  "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV"];

export const chapterPassage = (book: number, chapter: number) => `${USFM[book - 1]}.${chapter}`;
export const versePassage = (book: number, chapter: number, verse: number) => `${USFM[book - 1]}.${chapter}.${verse}`;

/** "JHN.3.16" or "JHN.3.16-18" -> the verses it covers, within one chapter; null for anything else. */
export function passageVerses(id: string): { book: number; chapter: number; verses: number[] } | null {
  const m = String(id).toUpperCase().match(/^([1-3]?[A-Z]{2,3})\.(\d+)\.(\d+)(?:-(?:[1-3]?[A-Z]{2,3}\.\d+\.)?(\d+))?$/);
  if (!m) return null;
  const book = USFM.indexOf(m[1]) + 1;
  const chapter = Number(m[2]), from = Number(m[3]), to = m[4] ? Number(m[4]) : from;
  if (!book || chapter < 1 || from < 1 || to < from || to - from > 200) return null;
  return { book, chapter, verses: Array.from({ length: to - from + 1 }, (_, i) => from + i) };
}

/** The hex sent to YouVersion for each of the app's colors, close to the Bible App's own highlight colors. */
export const TO_HEX: Record<HighlightColor, string> = { amber: "fff59d", green: "c5e1a5", blue: "90caf9", rose: "f8bbd0" };

/** The app's nearest color for a hex from YouVersion, by hue. */
export function fromHex(hex: string): HighlightColor {
  const m = String(hex).toLowerCase().replace(/^#/, "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (!m) return "amber";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.08) return "amber"; // gray or white: the usual highlight
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 290) return "rose";
  if (h < 75) return "amber";
  if (h < 170) return "green";
  return "blue";
}

/** What YouVersion sent for a chapter -> "book:chapter:verse" -> color. */
export function highlightsByVerse(raw: any, book: number, chapter: number): Record<string, HighlightColor> {
  const out: Record<string, HighlightColor> = {};
  for (const h of Array.isArray(raw?.data) ? raw.data : []) {
    const p = passageVerses(h?.passage_id);
    if (!p || p.book !== book || p.chapter !== chapter) continue;
    for (const v of p.verses) out[`${book}:${chapter}:${v}`] = fromHex(h.color);
  }
  return out;
}
