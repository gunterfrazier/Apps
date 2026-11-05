import { load } from "./data";
import { bookName, formatSegment, parseReference, type RefSegment } from "./references";

export type TranslationId = "BSB" | "NHEB" | "KJV" | "ASV" | "YLT";

export interface TranslationInfo {
  id: TranslationId;
  name: string;
  year: string;
  style: string;
  notice: string;
}

export const TRANSLATIONS: readonly TranslationInfo[] = [
  { id: "BSB", name: "Berean Standard Bible", year: "2022", style: "Modern and readable, close to the original wording", notice: "Berean Standard Bible (BSB), dedicated to the public domain (CC0)." },
  { id: "NHEB", name: "New Heart English Bible", year: "2010s", style: "Modern English update of the World English Bible", notice: "New Heart English Bible (NHEB), public domain." },
  { id: "KJV", name: "King James Version", year: "1769 text of 1611", style: "Traditional English", notice: "King James Version (KJV), public domain outside the United Kingdom, where Crown rights apply." },
  { id: "ASV", name: "American Standard Version", year: "1901", style: "Very literal, formal English", notice: "American Standard Version (ASV, 1901), public domain." },
  { id: "YLT", name: "Young's Literal Translation", year: "1898", style: "Extremely literal, keeps Hebrew and Greek tenses", notice: "Young's Literal Translation (YLT, 1898), public domain." },
];
export const DEFAULT_TRANSLATION: TranslationId = "BSB";
export const isTranslationId = (v: unknown): v is TranslationId => TRANSLATIONS.some((t) => t.id === v);
export const translationInfo = (id: TranslationId) => TRANSLATIONS.find((t) => t.id === id) ?? TRANSLATIONS[0];

export interface VerseLine {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export const getVerseCounts = () => load<number[][]>("verse-counts.json");

export async function chapterCount(book: number): Promise<number> {
  return (await getVerseCounts())[book - 1]?.length ?? 0;
}

export async function verseCount(book: number, chapter: number): Promise<number> {
  return (await getVerseCounts())[book - 1]?.[chapter - 1] ?? 0;
}

async function bookText(t: TranslationId, book: number): Promise<string[][]> {
  const part = book <= 39 ? "ot" : "nt";
  const data = await load<string[][][]>(`bible/${t}-${part}.json`);
  return data[book <= 39 ? book - 1 : book - 40] ?? [];
}

export async function getChapter(t: TranslationId, book: number, chapter: number): Promise<VerseLine[]> {
  const verses = (await bookText(t, book))[chapter - 1] ?? [];
  const total = await verseCount(book, chapter);
  const out: VerseLine[] = [];
  for (let i = 0; i < Math.max(total, verses.length); i++) out.push({ book, chapter, verse: i + 1, text: verses[i] ?? "" });
  return out;
}

export async function getVerse(t: TranslationId, book: number, chapter: number, verse: number): Promise<string> {
  return (await bookText(t, book))[chapter - 1]?.[verse - 1] ?? "";
}

/** Every verse a reference segment covers, in order. Empty if the reference points past the text. */
export async function segmentVerses(t: TranslationId, seg: RefSegment): Promise<VerseLine[]> {
  const out: VerseLine[] = [];
  for (let c = seg.chapter; c <= seg.chapterEnd; c++) {
    const all = await getChapter(t, seg.book, c);
    const from = seg.verseStart !== undefined && c === seg.chapter ? seg.verseStart : 1;
    const to = seg.verseStart !== undefined && c === seg.chapterEnd ? seg.verseEnd ?? seg.verseStart : all.length;
    for (const line of all) if (line.verse >= from && line.verse <= to) out.push(line);
  }
  return out;
}

export interface PassagePart {
  label: string;
  verses: VerseLine[];
}
export interface Passage {
  reference: string;
  translation: TranslationId;
  parts: PassagePart[];
  notice: string;
}

/** Looks up a reference such as "John 3:16-18; Romans 8". Returns null if it can't be read or doesn't exist. */
export async function getPassage(t: TranslationId, reference: string): Promise<Passage | null> {
  const segs = parseReference(reference);
  if (!segs) return null;
  const parts: PassagePart[] = [];
  for (const seg of segs) {
    const verses = await segmentVerses(t, seg);
    if (!verses.length) return null;
    parts.push({ label: formatSegment(seg), verses });
  }
  return { reference: parts.map((p) => p.label).join("; "), translation: t, parts, notice: translationInfo(t).notice };
}

export const refOf = (b: number, c: number, v?: number, v2?: number) =>
  `${bookName(b)} ${c}${v ? `:${v}${v2 && v2 !== v ? `–${v2}` : ""}` : ""}`;

export const decodeVerseCode = (code: number) => ({
  book: Math.floor(code / 1000000),
  chapter: Math.floor(code / 1000) % 1000,
  verse: code % 1000,
});
export const encodeVerseCode = (b: number, c: number, v: number) => b * 1000000 + c * 1000 + v;

export interface SearchOptions {
  mode?: "words" | "phrase";
  scope?: "all" | "ot" | "nt";
  limit?: number;
}
export interface SearchHit extends VerseLine {
  ref: string;
}

/** Plain-text search of one translation. Matching ignores case and punctuation. */
export async function searchText(t: TranslationId, query: string, opts: SearchOptions = {}): Promise<{ hits: SearchHit[]; total: number }> {
  const { mode = "words", scope = "all", limit = 100 } = opts;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  const q = norm(query);
  if (!q) return { hits: [], total: 0 };
  const words = q.split(" ").map((w) => new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "u"));
  const hits: SearchHit[] = [];
  let total = 0;
  for (const part of scope === "all" ? (["ot", "nt"] as const) : ([scope] as const)) {
    const data = await load<string[][][]>(`bible/${t}-${part}.json`);
    const first = part === "ot" ? 1 : 40;
    data.forEach((chapters, bi) =>
      chapters.forEach((verses, ci) =>
        verses.forEach((text, vi) => {
          if (!text) return;
          const n = norm(text);
          const ok = mode === "phrase" ? ` ${n} `.includes(` ${q} `) : words.every((re) => re.test(n));
          if (!ok) return;
          total++;
          if (hits.length < limit) hits.push({ book: first + bi, chapter: ci + 1, verse: vi + 1, text, ref: refOf(first + bi, ci + 1, vi + 1) });
        }),
      ),
    );
  }
  return { hits, total };
}
