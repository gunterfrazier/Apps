import { segmentsOverlap } from "./content";
import { load, pad2 } from "./data";
import { bookName, formatSegment, parseReference, type RefSegment } from "./references";

/**
 * Writings of the Church Fathers and later teachers. Lookup only: every excerpt comes from a named public-domain
 * edition, and quotes from the Fathers were matched word for word against that edition when the data was built.
 */
export interface Writer {
  id: string;
  name: string;
  /** The year the source dataset gives for this writer, usually about when they died. */
  year: number | null;
  cat: string;
  wiki: string;
  /** "condemned" (by a church council), "pseudo" (written under another's name) or "early-doc" (an early anonymous document). */
  flag: string;
  dates: string;
  n: number;
  works: [string, number][];
  books: [number, number][];
}

type Parts = Record<string, [number, number, number][]>;
export interface WritingsIndex { authors: Writer[]; sources: string[]; writings: Parts; comm: Parts }
export type WritingKind = "writings" | "comm";

export interface Excerpt {
  writer: Writer;
  title: string;
  url: string;
  source: string;
  book: number;
  c1: number; v1: number; c2: number; v2: number;
  reference: string;
  text: string;
  kind: WritingKind;
  /** True when the writer only cites the verse here, rather than commenting on it. */
  cites: boolean;
  /** The printed page in the named edition, where the source file marks pages. */
  page?: string;
}

interface Shard { t: [string, string, number, number?][]; q: [number, number, number, number, number, number, string, string?][] }

export const getWritingsIndex = () => load<WritingsIndex>("writings/index.json");
export const writerById = async (id: string) => (await getWritingsIndex()).authors.find((a) => a.id === id);

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "Early Fathers (Pre-Nicaea)", label: "Early Fathers, before Nicaea" },
  { id: "Eastern & Byzantine Theology", label: "Eastern and Byzantine" },
  { id: "Western & Medieval Theology", label: "Western and medieval" },
  { id: "Syriac & Oriental Theology", label: "Syriac and Oriental" },
  { id: "Reformation & Modern", label: "Reformation and after" },
  { id: "Apocrypha, Pseudepigrapha & Early Documents", label: "Early documents" },
  { id: "Pseudonymous Works", label: "Written under another's name" },
  { id: "Councils & Canons", label: "Councils" },
];
export const categoryLabel = (cat: string) => CATEGORIES.find((c) => c.id === cat)?.label ?? cat;

export const FLAG_NOTE: Record<string, string> = {
  condemned: "A church council condemned this writer or teaching. It's included because it shows how the passage was read at the time.",
  pseudo: "These works circulated under a more famous name, and scholars don't accept that attribution.",
  "early-doc": "An early document outside the Bible, included as a witness to how Christians read Scripture.",
};

/** Broad tradition, for filtering. It's a simple grouping by period and church. */
const TRADITION_BY_WRITER: Record<string, string> = {
  "martin-luther": "Lutheran", "john-calvin": "Reformed", "charles-hodge": "Reformed", "philip-schaff": "Reformed", "jonathan-edwards": "Reformed", "matthew-henry": "Reformed", "thomas-watson": "Reformed", "thomas-manton": "Reformed", "john-owen": "Reformed", "richard-baxter": "Reformed",
  "john-bunyan": "Baptist", "john-gill": "Baptist", "charles-spurgeon": "Baptist", "london-baptist-confession": "Baptist",
  "john-wesley": "Methodist", "j-c-ryle": "Anglican",
};
export function writerTradition(w: Writer): string {
  if (TRADITION_BY_WRITER[w.id]) return TRADITION_BY_WRITER[w.id];
  if (w.cat.startsWith("Eastern")) return "Eastern";
  if (w.cat.startsWith("Syriac")) return "Syriac";
  if (w.cat.startsWith("Western")) return (w.year ?? 0) >= 1054 ? "Medieval Catholic" : "Latin West";
  if (w.cat.startsWith("Early")) return "Early church";
  return w.cat.startsWith("Councils") ? "Councils" : "Other";
}
export const TRADITION_ORDER = ["Early church", "Eastern", "Latin West", "Syriac", "Medieval Catholic", "Lutheran", "Reformed", "Anglican", "Baptist", "Methodist", "Councils", "Other"];

/** A note on an edition's age, for readers who need to weigh an older translation. */
export function editionNote(source: string): string {
  const y = /(1[0-9]{3})/.exec(source)?.[1];
  if (!y) return "";
  if (/Ante-Nicene|Nicene and Post-Nicene/.test(source)) return `Translation from ${y}–1900. Modern critical editions may read differently.`;
  if (Number(y) < 1950 && /trans\./.test(source)) return `Older translation. Modern critical editions may read differently.`;
  return "";
}

/** Works whose authorship modern scholars doubt, though the source files name a writer. */
const DISPUTED_WORKS: [RegExp, string][] = [
  [/spurious/i, "The source's own editors call this work spurious."],
  [/pseudo-|pseudo /i, "Written under another's name."],
  [/clementine (homilies|recognitions)|recognitions of clement|homilies of clement/i, "Part of the Pseudo-Clementine literature, not by Clement of Rome."],
  [/apostolic constitutions/i, "A fourth-century church order that claims to be from the apostles."],
  [/\b2 clement|second epistle of clement/i, "Clement's authorship isn't accepted. It's an early anonymous homily."],
  [/longer (version|recension)/i, "The longer version of Ignatius's letters is usually taken as a later expansion."],
  [/decretals/i, "A collection of forged papal letters from the ninth century."],
  [/doubtful|dubious/i, "The source's own editors question this attribution."],
];
export const workCaution = (title: string): string => DISPUTED_WORKS.find(([rx]) => rx.test(title))?.[1] ?? "";

export const writerYearLabel = (w: Writer) => w.dates || (w.year === null ? "date unknown" : w.year < 0 ? `about ${-w.year} BC` : `about AD ${w.year}`);

const refLabel = (book: number, c1: number, v1: number, c2: number, v2: number) => {
  if (!v1) return `${bookName(book)} ${c1}`;
  if (c1 !== c2) return `${bookName(book)} ${c1}:${v1}-${c2}:${v2}`;
  return `${bookName(book)} ${c1}:${v1}${v2 !== v1 ? `-${v2}` : ""}`;
};

async function loadPart(kind: WritingKind, book: number, part: number, index: WritingsIndex): Promise<Excerpt[]> {
  const s = await load<Shard>(`${kind}/${pad2(book)}-${part}.json`);
  return s.q.map(([a, t, c1, v1, c2, v2, text, page]) => ({
    writer: index.authors[a],
    title: s.t[t][0],
    url: s.t[t][1],
    source: index.sources[s.t[t][2]],
    book, c1, v1, c2, v2,
    reference: refLabel(book, c1, v1, c2, v2),
    text,
    kind,
    cites: !!s.t[t][3],
    page,
  }));
}

const earliestFirst = (a: Excerpt, b: Excerpt) => (a.writer.year ?? 9999) - (b.writer.year ?? 9999) || a.c1 - b.c1 || a.v1 - b.v1;

function touches(e: Excerpt, segs: RefSegment[]) {
  return segs.some((s) => {
    if (s.book !== e.book) return false;
    // A chapter introduction belongs with the whole chapter, not with each verse in it.
    if (!e.v1) return s.verseStart === undefined && s.chapter <= e.c1 && s.chapterEnd >= e.c1;
    return segmentsOverlap(s, { book: e.book, chapter: e.c1, chapterEnd: e.c2, verseStart: e.v1, verseEnd: e.v2 });
  });
}

/** What writers said about a passage, earliest first. */
export async function excerptsForPassage(reference: string, kind: WritingKind = "writings"): Promise<Excerpt[]> {
  const segs = parseReference(reference) ?? [];
  const index = await getWritingsIndex();
  const parts = new Map<string, [number, number]>();
  for (const s of segs) {
    for (const [from, to, k] of index[kind][s.book] ?? []) {
      if (from <= s.chapterEnd && to >= s.chapter) parts.set(`${s.book}-${k}`, [s.book, k]);
    }
  }
  const loaded = await Promise.all([...parts.values()].map(([b, k]) => loadPart(kind, b, k, index)));
  return loaded.flat().filter((e) => touches(e, segs)).sort(earliestFirst);
}

/** Everything one writer has on one book of the Bible. */
export async function excerptsByWriter(id: string, book: number): Promise<Excerpt[]> {
  const index = await getWritingsIndex();
  const out: Excerpt[] = [];
  for (const kind of ["writings", "comm"] as const) {
    for (const [, , k] of index[kind][book] ?? []) out.push(...(await loadPart(kind, book, k, index)).filter((e) => e.writer.id === id));
  }
  return out.sort((a, b) => a.c1 - b.c1 || a.v1 - b.v1);
}

export interface SearchHit extends Excerpt { at: number }

/** Searches the writings one book at a time, so nothing large loads until it's asked for. */
export async function searchWritings(query: string, opts: { book?: number; writer?: string; limit?: number; onProgress?: (done: number, total: number) => void; cancelled?: () => boolean } = {}): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const index = await getWritingsIndex();
  const books = opts.book ? [opts.book] : Array.from({ length: 66 }, (_, i) => i + 1);
  const limit = opts.limit ?? 100;
  const hits: SearchHit[] = [];
  const wanted = opts.writer ? index.authors.find((a) => a.id === opts.writer) : undefined;
  for (let i = 0; i < books.length && hits.length < limit; i++) {
    const b = books[i];
    if (wanted && !wanted.books.some(([x]) => x === b)) { opts.onProgress?.(i + 1, books.length); continue; }
    for (const kind of ["writings", "comm"] as const) {
      for (const [, , k] of index[kind][b] ?? []) {
        if (opts.cancelled?.()) return hits;
        for (const e of await loadPart(kind, b, k, index)) {
          if (wanted && e.writer.id !== wanted.id) continue;
          const at = e.text.toLowerCase().indexOf(q);
          if (at >= 0 && hits.length < limit) hits.push({ ...e, at });
        }
      }
    }
    opts.onProgress?.(i + 1, books.length);
  }
  return hits;
}

/** Search with century and tradition filters, for the advanced search page. */
export async function excerptsFromSearch(query: string, opts: { from: number; to: number; tradition: string; book?: number; limit: number; onProgress?: (d: number, t: number) => void; cancelled?: () => boolean }): Promise<SearchHit[]> {
  const inRange = (e: Excerpt) => {
    const y = e.writer.year;
    if (!y) return opts.from <= 1 && opts.to >= 21;
    const c = Math.floor((y - 1) / 100) + 1;
    return c >= opts.from && c <= opts.to && (opts.tradition === "all" || writerTradition(e.writer) === opts.tradition);
  };
  const all = await searchWritings(query, { book: opts.book, limit: 3000, onProgress: opts.onProgress, cancelled: opts.cancelled });
  return all.filter(inRange).slice(0, opts.limit);
}

/** Loads particular excerpts by the shard and row the doctrine index names. */
export async function excerptsAt(refs: [string, number][]): Promise<Excerpt[]> {
  const index = await getWritingsIndex();
  const out: Excerpt[] = [];
  for (const [shard, row] of refs) {
    const [b, k] = shard.split("-").map(Number);
    const part = await loadPart("writings", b, k, index);
    if (part[row]) out.push(part[row]);
  }
  return out;
}

/** Spurgeon's sermons, by the text he preached on. An index only: the link goes to the original wording at the Spurgeon Library. */
export interface SermonLink { number: number; title: string; volume: number; reference: string; url: string }
type SermonRow = [number, string, number, number, number, number];

const sermonUrl = (title: string) =>
  `https://www.spurgeon.org/sermons/${title.toLowerCase().replace(/['’".,!?;:()]/g, "").replace(/&/g, "and").trim().replace(/[^a-z0-9]+/g, "-")}`;

export async function sermonsForPassage(reference: string): Promise<SermonLink[]> {
  const segs = parseReference(reference) ?? [];
  const all = await load<SermonRow[][]>("writings/sermons.json");
  const out: SermonLink[] = [];
  for (const s of segs) {
    for (const [number, title, c, v1, v2, volume] of all[s.book - 1] ?? []) {
      if (segmentsOverlap(s, { book: s.book, chapter: c, chapterEnd: c, verseStart: v1, verseEnd: v2 })) {
        out.push({ number, title, volume, reference: refLabel(s.book, c, v1, c, v2), url: sermonUrl(title) });
      }
    }
  }
  return out.sort((a, b) => a.number - b.number);
}

export async function sermonsForBook(book: number): Promise<SermonLink[]> {
  const all = await load<SermonRow[][]>("writings/sermons.json");
  return (all[book - 1] ?? []).map(([number, title, c, v1, v2, volume]) => ({ number, title, volume, reference: refLabel(book, c, v1, c, v2), url: sermonUrl(title) })).sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true }));
}

/** One excerpt per writer, earliest first, for a short preview. Comments on the passage come before bare citations. */
export function varied(list: Excerpt[], n: number): Excerpt[] {
  const seen = new Set<string>();
  const out: Excerpt[] = [];
  for (const e of [...list.filter((x) => !x.cites), ...list.filter((x) => x.cites)]) {
    if (seen.has(e.writer.id)) continue;
    seen.add(e.writer.id);
    out.push(e);
    if (out.length === n) break;
  }
  return out;
}

export const writingsCredit = "Church Fathers: public-domain translations (Ante-Nicene and Nicene and Post-Nicene Fathers, Newman's Catena Aurea and others) via HistoricalChristianFaith's Commentaries-Database and Writings-Database, checked against CCEL's text. Citations and Calvin's commentaries from CCEL. Matthew Henry and Spurgeon's Treasury of David via LyteWord (CC0). Wesley's Notes via History of Methodism (structure CC BY 4.0). Calvin's Institutes, Luther and Edwards via Project Gutenberg.";
export { formatSegment };
