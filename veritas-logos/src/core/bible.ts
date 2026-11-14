import { load } from "./data";
import { bookName, formatSegment, parseReference, type RefSegment } from "./references";

export type TranslationId =
  | "BSB" | "NHEB" | "KJV" | "ASV" | "YLT"
  | "LEB" | "BBE" | "UKJV" | "AKJV" | "OEB"
  | "GNV" | "DBY" | "WBT" | "EBR" | "NOY"
  | "JPS" | "DRC" | "CPDV"
  | "TCNT" | "ANDERSON" | "HAWEIS" | "TYN" | "WYC"
  | "ESV" | "NIV" | "NLT" | "NKJV";

/** Groups in the translation picker. "online" Bibles are licensed: they're fetched a chapter at a time through the
 * owner's connector (src/app/online-bible.ts) and never stored or used for search, AI or read aloud. */
export type TranslationGroup = "core" | "modern" | "classic" | "tradition" | "historic" | "online";
export const GROUP_NAMES: Record<TranslationGroup, string> = {
  core: "Main translations",
  modern: "More modern English",
  classic: "Classic English",
  tradition: "Jewish and Catholic",
  historic: "Historic and partial",
  online: "Online (licensed)",
};

export interface TranslationInfo {
  id: TranslationId;
  name: string;
  year: string;
  style: string;
  notice: string;
  group: TranslationGroup;
  /** What it covers, when not the whole Bible. */
  covers?: string;
  /** A link its license asks every page that shows it to carry. */
  link?: { label: string; url: string };
  /** Not offered yet, and why: it stays out of every picker until this is removed. */
  waiting?: string;
}

export const TRANSLATIONS: readonly TranslationInfo[] = [
  { id: "BSB", group: "core", name: "Berean Standard Bible", year: "2022", style: "Modern and readable, close to the original wording", notice: "Berean Standard Bible (BSB), dedicated to the public domain (CC0)." },
  { id: "NHEB", group: "core", name: "New Heart English Bible", year: "2010s", style: "Modern English update of the World English Bible", notice: "New Heart English Bible (NHEB), public domain." },
  { id: "KJV", group: "core", name: "King James Version", year: "1769 text of 1611", style: "Traditional English", notice: "King James Version (KJV), public domain outside the United Kingdom, where Crown rights apply." },
  { id: "ASV", group: "core", name: "American Standard Version", year: "1901", style: "Very literal, formal English", notice: "American Standard Version (ASV, 1901), public domain." },
  { id: "YLT", group: "core", name: "Young's Literal Translation", year: "1898", style: "Extremely literal, keeps Hebrew and Greek tenses", notice: "Young's Literal Translation (YLT, 1898), public domain." },
  { id: "LEB", group: "modern", name: "Lexham English Bible", year: "2012", style: "Modern and fairly literal, from the SBL Greek New Testament", notice: "Scripture quotations marked (LEB) are from the Lexham English Bible. Copyright 2012 Logos Bible Software. Lexham is a registered trademark of Logos Bible Software. Its corner brackets ⌞ ⌟ mark words translated as an idiom.", link: { label: "lexhamenglishbible.com", url: "https://lexhamenglishbible.com" } },
  { id: "BBE", group: "modern", name: "Bible in Basic English", year: "1949, 1964", style: "Simple English from an 850-word vocabulary", notice: "Bible in Basic English (BBE, 1949/1964), public domain in the United States." },
  { id: "UKJV", group: "modern", name: "Updated King James Version", year: "2000", style: "The KJV with modern words for archaic ones", notice: "Updated King James Version (UKJV), public domain. I love Jesus (UKJV)." },
  { id: "AKJV", group: "modern", name: "American King James Version", year: "1999", style: "The KJV with modern spelling and words", notice: "American King James Version (AKJV), public domain." },
  { id: "OEB", group: "modern", name: "Open English Bible", year: "in progress", style: "Modern, plain English", covers: "the New Testament and Psalms", notice: "Open English Bible (OEB), public domain (CC0). Unfinished: of the Old Testament it has only the Psalms." },
  { id: "GNV", group: "classic", name: "Geneva Bible", year: "1599", style: "The Reformers' English Bible, original spelling", notice: "Geneva Bible (1599), public domain." },
  { id: "DBY", group: "classic", name: "Darby Translation", year: "1889", style: "Literal, by J. N. Darby", notice: "Darby Translation (1889), public domain." },
  { id: "WBT", group: "classic", name: "Webster Bible", year: "1833", style: "Noah Webster's revision of the KJV", notice: "Webster Bible (1833), public domain." },
  { id: "EBR", group: "classic", name: "Rotherham's Emphasized Bible", year: "1902", style: "Literal, marks the original's emphasis", notice: "The Emphasized Bible by J. B. Rotherham (1902), public domain." },
  { id: "NOY", group: "classic", name: "Noyes Translation", year: "1869", style: "George R. Noyes's literal translation", covers: "the New Testament, Job to Malachi", notice: "Noyes Translation (1869), public domain. Has the New Testament and the books from Job to Malachi." },
  { id: "JPS", group: "tradition", name: "JPS Tanakh", year: "1917", style: "The Jewish Publication Society's English Hebrew Bible", covers: "the Old Testament", notice: "Jewish Publication Society Tanakh (1917), public domain. Old Testament only; its Hebrew verse numbers are shown under the English numbering." },
  { id: "DRC", group: "tradition", name: "Douay-Rheims (Challoner)", year: "1752", style: "Traditional Catholic English, from the Latin Vulgate", notice: "Douay-Rheims Bible, Challoner revision (1752), public domain. Shown with the 66 books' English numbering; the deuterocanonical books and additions aren't included." },
  { id: "CPDV", group: "tradition", name: "Catholic Public Domain Version", year: "2009", style: "Modern Catholic English, from the Latin Vulgate", notice: "Catholic Public Domain Version (CPDV), public domain. Shown with the 66 books' English numbering; the deuterocanonical books and additions aren't included." },
  { id: "TCNT", group: "historic", name: "Twentieth Century New Testament", year: "1904", style: "An early modern-English New Testament", covers: "the New Testament", notice: "Twentieth Century New Testament (1904), public domain." },
  { id: "ANDERSON", group: "historic", name: "Anderson New Testament", year: "1864", style: "Henry T. Anderson's New Testament", covers: "the New Testament", notice: "Henry Tompkins Anderson's New Testament (1864), public domain." },
  { id: "HAWEIS", group: "historic", name: "Haweis New Testament", year: "1795", style: "Thomas Haweis's New Testament", covers: "the New Testament", notice: "Thomas Haweis's New Testament (1795), public domain." },
  { id: "TYN", group: "historic", name: "Tyndale", year: "1525–1530", style: "William Tyndale's English, original spelling", covers: "Genesis, the Gospels, Acts, Romans, 1 Corinthians, Hebrews and Revelation", notice: "William Tyndale's translation (1525–1530), public domain. This digital edition has only some books." },
  { id: "WYC", group: "historic", name: "Wycliffe Bible", year: "c. 1395", style: "Middle English, from the Latin Vulgate", notice: "John Wycliffe's Bible (c. 1395), public domain. Its Psalms are shown under the English numbering." },
  { id: "ESV", group: "online", waiting: "Crossway hasn't approved the ESV API key yet.", name: "English Standard Version", year: "2001, 2016", style: "Modern and fairly literal", notice: "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language. Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.", link: { label: "www.esv.org", url: "https://www.esv.org" } },
  { id: "NIV", group: "online", name: "New International Version", year: "2011", style: "Modern and readable, balances wording and meaning", notice: "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide." },
  { id: "NLT", group: "online", name: "New Living Translation", year: "2015", style: "Modern and very readable, thought for thought", notice: "Scripture quotations are taken from the Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Carol Stream, Illinois 60188. All rights reserved." },
  { id: "NKJV", group: "online", name: "New King James Version", year: "1982", style: "The KJV's wording in modern English", notice: "Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved." },
];
export const DEFAULT_TRANSLATION: TranslationId = "BSB";
export const isTranslationId = (v: unknown): v is TranslationId => TRANSLATIONS.some((t) => t.id === v);
/** The translations readers can choose: all but those still waiting (the ESV, until Crossway approves its key). */
export const OFFERED: readonly TranslationInfo[] = TRANSLATIONS.filter((t) => !t.waiting);
export const isOffered = (v: unknown): v is TranslationId => OFFERED.some((t) => t.id === v);
export const translationInfo = (id: TranslationId) => TRANSLATIONS.find((t) => t.id === id) ?? TRANSLATIONS[0];
export const isOnline = (id: TranslationId) => translationInfo(id).group === "online";
/** The built-in text used for a translation everywhere but the reader: search, AI, study tools and read aloud.
 * Licensed text stays out of those, so they use the BSB instead. */
export const localTranslation = (id: TranslationId): TranslationId => (isOnline(id) ? DEFAULT_TRANSLATION : id);

// ---------- Licensed translations, fetched a chapter at a time ----------
export interface OnlineChapter { verses: string[]; notice?: string }
export class OnlineTextError extends Error {
  constructor(message: string, public code: string) { super(message); }
}
let onlineSource: ((t: TranslationId, book: number, chapter: number) => Promise<OnlineChapter>) | null = null;
/** The app sets how licensed chapters are fetched; without one, they can't be shown. */
export const setOnlineSource = (f: typeof onlineSource) => { onlineSource = f; };
// Publishers allow a few hundred verses to be kept at a time (the ESV 500), so only the latest chapters stay in
// memory, and nothing is written to storage.
const MAX_KEPT_VERSES = 450;
const onlineKept = new Map<string, OnlineChapter>();
const keyOf = (t: TranslationId, b: number, c: number) => `${t}.${b}.${c}`;
async function onlineChapter(t: TranslationId, book: number, chapter: number): Promise<OnlineChapter> {
  const k = keyOf(t, book, chapter);
  const kept = onlineKept.get(k);
  if (kept) { onlineKept.delete(k); onlineKept.set(k, kept); return kept; }
  if (!onlineSource) throw new OnlineTextError(`The ${t} is read online through a Claude connector, which this copy of the app doesn't have.`, "no_source");
  const got = await onlineSource(t, book, chapter);
  onlineKept.set(k, got);
  let n = [...onlineKept.values()].reduce((a, c) => a + c.verses.length, 0);
  for (const [key, ch] of onlineKept) {
    if (n <= MAX_KEPT_VERSES || key === k) continue;
    onlineKept.delete(key);
    n -= ch.verses.length;
  }
  return got;
}
/** The notice a publisher sent with its text, or the standard one. */
export const onlineNotice = (t: TranslationId, book: number, chapter: number) => onlineKept.get(keyOf(t, book, chapter))?.notice ?? translationInfo(t).notice;

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
  const verses = isOnline(t) ? (await onlineChapter(t, book, chapter)).verses : (await bookText(t, book))[chapter - 1] ?? [];
  const total = await verseCount(book, chapter);
  const out: VerseLine[] = [];
  for (let i = 0; i < Math.max(total, verses.length); i++) out.push({ book, chapter, verse: i + 1, text: verses[i] ?? "" });
  return out;
}

/** One verse. For a licensed translation, only from a chapter the reader has just fetched; otherwise the BSB's. */
export async function getVerse(t: TranslationId, book: number, chapter: number, verse: number): Promise<string> {
  return (await getVerseIn(t, book, chapter, verse)).text;
}
export async function getVerseIn(t: TranslationId, book: number, chapter: number, verse: number): Promise<{ text: string; translation: TranslationId }> {
  if (isOnline(t)) {
    const kept = onlineKept.get(keyOf(t, book, chapter));
    if (kept) return { text: kept.verses[verse - 1] ?? "", translation: t };
    t = localTranslation(t);
  }
  return { text: (await bookText(t, book))[chapter - 1]?.[verse - 1] ?? "", translation: t };
}

/** Every verse a reference segment covers, in order. Empty if the reference points past the text. */
export async function segmentVerses(t: TranslationId, seg: RefSegment): Promise<VerseLine[]> {
  t = localTranslation(t);
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
  t = localTranslation(t);
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
  t = localTranslation(t);
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
