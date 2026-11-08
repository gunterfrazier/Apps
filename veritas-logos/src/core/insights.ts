import { getBookMeta, segmentsOverlap, type BookMeta } from "./content";
import { getVerseCounts } from "./bible";
import { load, pad2 } from "./data";
import { formatSegment, parseReference, type RefSegment } from "./references";

export interface ConfessionCite { doc: string; docName: string; year: number; tradition: string; label: string; title: string; text: string }
export interface TextLink {
  ref: string;
  /** The words the two passages share. */
  shared?: string;
  votes?: number;
}
export interface TopicLink { slug: string; name: string }

/** What the app's sourced data says about a passage. Lookup only: nothing here is written or generated. */
export interface PassageInsights {
  reference: string;
  book?: BookMeta;
  /** Nave's Topical Bible entries that cite this passage. */
  topics: TopicLink[];
  /** Places historic confessions cite this passage as a proof text. */
  confessions: ConfessionCite[];
  /** Earlier Scripture this passage quotes. */
  quotes: TextLink[];
  /** Later Scripture that quotes this passage. */
  quotedBy: TextLink[];
  /** Passages sharing long runs of wording (Gospel parallels, Kings and Chronicles). */
  parallels: TextLink[];
  /** Strong cross-references between the Testaments with no matching wording. */
  possibleAllusions: TextLink[];
}

async function versesIn(segs: RefSegment[], cap = 80) {
  const counts = await getVerseCounts();
  const out: { b: number; c: number; v: number }[] = [];
  for (const s of segs) {
    for (let c = s.chapter; c <= s.chapterEnd; c++) {
      const total = counts[s.book - 1]?.[c - 1] ?? 0;
      const from = s.verseStart !== undefined && c === s.chapter ? s.verseStart : 1;
      const to = s.verseStart !== undefined && c === s.chapterEnd ? s.verseEnd ?? s.verseStart : total;
      for (let v = from; v <= Math.min(to, total) && out.length < cap; v++) out.push({ b: s.book, c, v });
    }
  }
  return out;
}

type Inter = Record<string, { q?: [string, string][]; by?: [string, string][]; p?: [string, string][]; a?: [string, number][] }>;
interface RefBook { i?: Inter; c?: Record<string, number[]>; t?: Record<string, number[]>; p?: Record<string, string[]> }

export async function getInsights(reference: string): Promise<PassageInsights> {
  const segs = parseReference(reference) ?? [];
  const result: PassageInsights = { reference, topics: [], confessions: [], quotes: [], quotedBy: [], parallels: [], possibleAllusions: [] };
  if (!segs.length) return result;
  result.reference = segs.map((s) => formatSegment(s)).join("; ");
  result.book = await getBookMeta(segs[0].book);
  const touches = (ref: string) => (parseReference(ref) ?? []).some((a) => segs.some((b) => segmentsOverlap(a, b)));

  const verses = await versesIn(segs);
  const seenConf = new Set<number>();
  const topicCount = new Map<number, number>();
  const [{ docs, sections }, topicNames] = await Promise.all([
    load<{ docs: Record<string, { name: string; year: number; tradition: string }>; sections: [string, string, string, string][] }>("confession-sections.json"),
    load<[string, string][]>("topics/names.json"),
  ]);
  const addLinks = (target: TextLink[], list: [string, string][] | undefined) => {
    for (const [ref, shared] of list ?? []) if (!target.some((x) => x.ref === ref) && !touches(ref)) target.push({ ref, shared });
  };
  for (const { b, c, v } of verses) {
    const key = `${c}:${v}`;
    const book = await load<RefBook>(`links/${pad2(b)}.json`);
    const inter = book.i?.[key];
    if (inter) {
      addLinks(result.quotes, inter.q);
      addLinks(result.quotedBy, inter.by);
      addLinks(result.parallels, inter.p);
      for (const [ref, votes] of inter.a ?? []) if (!result.possibleAllusions.some((x) => x.ref === ref) && !touches(ref)) result.possibleAllusions.push({ ref, votes });
    }
    for (const i of book.c?.[key] ?? []) {
      if (seenConf.has(i) || result.confessions.length >= 12) continue;
      seenConf.add(i);
      const [doc, label, title, text] = sections[i];
      const meta = docs[doc];
      result.confessions.push({ doc, docName: meta.name, year: meta.year, tradition: meta.tradition, label, title, text });
    }
    for (const n of book.t?.[key] ?? []) topicCount.set(n, (topicCount.get(n) ?? 0) + 1);
  }
  result.topics = [...topicCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([n]) => ({ slug: topicNames[n][0], name: topicNames[n][1] }));
  result.possibleAllusions.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  return result;
}
