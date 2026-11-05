import { load } from "./data";
import { BOOKS, type RefSegment } from "./references";

export type LensId = "all" | "reformed" | "covenant" | "arminian" | "catholic" | "orthodox" | "lutheran" | "anglican" | "baptist" | "pentecostal" | "messianic" | "dispensational";
export const LENS_IDS: LensId[] = ["all", "reformed", "covenant", "arminian", "catholic", "orthodox", "lutheran", "anglican", "baptist", "pentecostal", "messianic", "dispensational"];

export interface BookMeta { name: string; testament: string; chapters: number; verses: number; hebrew: string; hebrewTranslit: string; hebrewMeaning: string; greek: string; greekTranslit: string; greekMeaning: string }
export const getBooks = () => load<BookMeta[]>("books.json");
export const getBookMeta = async (book: number) => (await getBooks()).find((b) => b.name === BOOKS[book - 1]?.name);

export const segmentsOverlap = (a: RefSegment, b: RefSegment) => {
  if (a.book !== b.book) return false;
  const aStart = a.chapter * 1000 + (a.verseStart ?? 1);
  const aEnd = a.chapterEnd * 1000 + (a.verseStart === undefined ? 999 : a.verseEnd ?? a.verseStart);
  const bStart = b.chapter * 1000 + (b.verseStart ?? 1);
  const bEnd = b.chapterEnd * 1000 + (b.verseStart === undefined ? 999 : b.verseEnd ?? b.verseStart);
  return aStart <= bEnd && bStart <= aEnd;
};

// ---------- Nave's Topical Bible ----------
export type TopicRow = [slug: string, name: string, refs: number];
export interface TopicItem { t: string; d: number; r?: string[] }
export interface Topic { name: string; items: TopicItem[] }
export const getTopicIndex = () => load<TopicRow[]>("topics/index.json");

export async function getTopic(slug: string): Promise<(Topic & { slug: string }) | null> {
  if (!slug) return null;
  try {
    const data = await load<Record<string, Topic>>(`topics/${slug[0]}.json`);
    return data[slug] ? { ...data[slug], slug } : null;
  } catch {
    return null;
  }
}

export async function searchTopics(query: string, limit = 12): Promise<TopicRow[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const index = await getTopicIndex();
  const slug = q.replace(/[^a-z0-9]+/g, "-");
  const stem = (s: string) => s.replace(/(ness|ing|ed|es|s)$/, "");
  const scored: [number, TopicRow][] = [];
  for (const row of index) {
    const n = row[1].toLowerCase();
    let s = 0;
    if (row[0] === slug) s = 5;
    else if (stem(n) === stem(q)) s = 4;
    else if (n.startsWith(q)) s = 3;
    else if (n.split(/[^a-z]+/).includes(q)) s = 2;
    else if (n.includes(q)) s = 1;
    if (s) scored.push([s * 100000 + Math.min(row[2], 99999), row]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}
