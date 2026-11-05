import { load } from "./data";
import { bookName } from "./references";

/**
 * The scholarly layer: ancient texts, creeds, edition differences, church history and dating. Lookup only.
 * Every file is built from a named source by scripts/build_scholar.py.
 */
const g = <T>(name: string) => load<T>(`scholar/${name}.json`);

// ---------- Ancient texts ----------
type ChapterMap = Record<string, Record<string, Record<string, string>>>;
const lxxGroup = (b: number) => (b <= 5 ? "law" : b <= 17 ? "history" : b <= 22 ? "wisdom" : "prophets");

/** Psalm numbers in the Greek and Latin differ from the Hebrew. */
export function lxxPsalms(c: number): number[] {
  if (c <= 8 || c >= 148) return [c];
  if (c === 9 || c === 10) return [9];
  if (c >= 11 && c <= 113) return [c - 1];
  if (c === 114 || c === 115) return [113];
  if (c === 116) return [114, 115];
  if (c >= 117 && c <= 146) return [c - 1];
  return [146, 147];
}
export interface AncientChapter { chapter: number; verses: [number, string][] }
const sortVerses = (m: Record<string, string> | undefined) =>
  Object.entries(m ?? {}).map(([v, t]) => [Number(v), t] as [number, string]).sort((a, b) => a[0] - b[0]);

export async function lxxChapters(book: number, chapter: number): Promise<AncientChapter[]> {
  if (book > 39) return [];
  const data = await g<ChapterMap>(`lxx-${lxxGroup(book)}`);
  const list = book === 19 ? lxxPsalms(chapter) : [chapter];
  return list.map((c) => ({ chapter: c, verses: sortVerses(data[String(book)]?.[String(c)]) })).filter((c) => c.verses.length);
}
export async function vulgateChapters(book: number, chapter: number): Promise<AncientChapter[]> {
  const data = await g<ChapterMap>(book <= 39 ? "vulgate-ot" : "vulgate-nt");
  const list = book === 19 ? lxxPsalms(chapter) : [chapter];
  return list.map((c) => ({ chapter: c, verses: sortVerses(data[String(book)]?.[String(c)]) })).filter((c) => c.verses.length);
}

// ---------- BSB with Strong's numbers ----------
const tagGroup = (b: number) => (b <= 5 ? "law" : b <= 17 ? "history" : b <= 22 ? "wisdom" : b <= 39 ? "prophets" : b <= 44 ? "gospels" : "letters");
export interface TaggedWord { text: string; strong: string }
export async function taggedVerse(book: number, chapter: number, verse: number): Promise<TaggedWord[]> {
  const data = await g<ChapterMap>(`tags-${tagGroup(book)}`);
  const raw = data[String(book)]?.[String(chapter)]?.[String(verse)];
  if (!raw) return [];
  const letter = book <= 39 ? "H" : "G";
  return raw.split("|").map((t) => {
    const [text, s] = t.split("~");
    return { text, strong: s ? `${letter}${s.replace(/[a-zA-Z]$/, "")}` : "" };
  });
}
/** "G26" and "G0026" and "G26a" are the same word. */
export const sameStrong = (a: string, b: string) => {
  const n = (s: string) => s.replace(/[A-Za-z]$/, "").replace(/^([HG])0*/, "$1");
  return Boolean(a && b) && n(a) === n(b);
};

// ---------- Where the Greek editions differ ----------
export type VariantWord = [word: number, greek: string, english: string, editions: string, meaning: string];
export const EDITIONS: { id: string; name: string; year: string; family: "critical" | "traditional" }[] = [
  { id: "NA28", name: "Nestle-Aland, 28th edition", year: "2012", family: "critical" },
  { id: "NA27", name: "Nestle-Aland, 27th edition", year: "1993", family: "critical" },
  { id: "Tyn", name: "Tyndale House Greek New Testament", year: "2017", family: "critical" },
  { id: "SBL", name: "SBL Greek New Testament", year: "2010", family: "critical" },
  { id: "WH", name: "Westcott and Hort", year: "1881", family: "critical" },
  { id: "Treg", name: "Tregelles", year: "1857–79", family: "critical" },
  { id: "TR", name: "Textus Receptus (Scrivener 1894)", year: "1894", family: "traditional" },
  { id: "Byz", name: "Byzantine text", year: "", family: "traditional" },
];
const varGroup = (b: number) => (b <= 43 ? "gospels" : b <= 57 ? "acts-paul" : "general");
export async function verseVariants(book: number, chapter: number, verse: number): Promise<VariantWord[]> {
  if (book < 40) return [];
  const d = await g<Record<string, VariantWord[]>>(`variants-${varGroup(book)}`);
  return d[`${book}.${chapter}.${verse}`] ?? [];
}
export type HebrewReading = [word: number, hebrew: string, english: string, type: string, note: string];
export async function hebrewReadings(book: number, chapter: number, verse: number): Promise<HebrewReading[]> {
  if (book >= 40) return [];
  const d = await g<Record<string, HebrewReading[]>>("variants-ot");
  return d[`${book}.${chapter}.${verse}`] ?? [];
}
export interface DisputedPassage { ref: string; label: string; note: string }
export const getDisputed = () => g<DisputedPassage[]>("disputed");

// ---------- Gospel synopsis ----------
export interface Pericope { n: number; title: string; Matt?: [string, number]; Mark?: [string, number]; Luke?: [string, number]; John?: [string, number]; Matt2?: string; Mark2?: string; Luke2?: string; John2?: string }
export interface Synopsis { sections: { n: number; title: string; from: number; to: number }[]; pericopes: Pericope[] }
export const getSynopsis = () => g<Synopsis>("synopsis");
export const GOSPELS = [["Matt", "Matthew"], ["Mark", "Mark"], ["Luke", "Luke"], ["John", "John"]] as const;

// ---------- Creeds ----------
export type CreedBlock = ["pg", string] | ["h", string] | ["p", string] | ["2", string, string];
export interface CreedMeta { id: string; name: string; year: number; tradition: string; group: string; vol: number; url: string; words: number }
export interface CreedDoc extends CreedMeta { blocks: CreedBlock[] }
export const getCreedIndex = () => g<{ docs: CreedMeta[]; refs: Record<string, string[]> }>("creeds-index");
export async function getCreed(id: string): Promise<CreedDoc | undefined> {
  const { docs } = await getCreedIndex();
  const m = docs.find((d) => d.id === id);
  if (!m) return undefined;
  return (await g<Record<string, CreedDoc>>(`creeds-${m.group}`))[id];
}
export async function creedsCiting(book: number, chapter: number, verse: number): Promise<CreedMeta[]> {
  const { docs, refs } = await getCreedIndex();
  return (refs[`${book}.${chapter}.${verse}`] ?? []).map((id) => docs.find((d) => d.id === id)!).filter(Boolean);
}
export const creedText = (d: CreedDoc) => d.blocks.filter((b) => b[0] !== "pg").map((b) => b.slice(1).join(" ")).join("\n");
export const CREED_CREDIT = "Philip Schaff, The Creeds of Christendom, 6th ed., from CCEL's file marked public domain.";

// ---------- Deuterocanon ----------
type BookText = Record<string, Record<string, string>>;
export interface DcBook { id: string; name: string; dra: BookText | null; kjv: BookText | null; lxx: BookText | null }
export const getDeuterocanon = () => g<{ books: DcBook[]; danielOG: BookText }>("deuterocanon");
/** Where each book stands, from the documents themselves. */
export const DC_STATUS: Record<string, { catholic: boolean; orthodox: boolean; anglican: boolean; note?: string }> = {
  tobit: { catholic: true, orthodox: true, anglican: true },
  judith: { catholic: true, orthodox: true, anglican: true },
  wisdom: { catholic: true, orthodox: true, anglican: true },
  sirach: { catholic: true, orthodox: true, anglican: true },
  baruch: { catholic: true, orthodox: true, anglican: true },
  "letter-of-jeremiah": { catholic: true, orthodox: true, anglican: false, note: "Catholic Bibles print it as Baruch 6." },
  "1-maccabees": { catholic: true, orthodox: true, anglican: true },
  "2-maccabees": { catholic: true, orthodox: true, anglican: true },
  "3-maccabees": { catholic: false, orthodox: true, anglican: false },
  "4-maccabees": { catholic: false, orthodox: false, anglican: false, note: "Printed as an appendix in some Greek Bibles." },
  "1-esdras": { catholic: false, orthodox: true, anglican: true, note: "The Thirty-Nine Articles call it the Third Book of Esdras." },
  "2-esdras": { catholic: false, orthodox: false, anglican: true, note: "The Thirty-Nine Articles call it the Fourth Book of Esdras." },
  "additions-esther": { catholic: true, orthodox: true, anglican: true, note: "Catholic Bibles print these within Esther." },
  susanna: { catholic: true, orthodox: true, anglican: true, note: "Catholic Bibles print it as Daniel 13." },
  bel: { catholic: true, orthodox: true, anglican: true, note: "Catholic Bibles print it as Daniel 14." },
  "song-of-three": { catholic: true, orthodox: true, anglican: true, note: "Catholic Bibles print it within Daniel 3." },
  "prayer-of-manasseh": { catholic: false, orthodox: true, anglican: true },
  "psalms-of-solomon": { catholic: false, orthodox: false, anglican: false, note: "A Jewish collection that some Greek manuscripts include. No church treats it as Scripture." },
  odes: { catholic: false, orthodox: false, anglican: false, note: "A collection of biblical songs used in worship, printed after the Psalms in Greek Bibles." },
};

// ---------- Primary texts ----------
export interface ApostolicChapter { n: string; greek: [string, string][]; eng: string; page: string }
export interface ApostolicWork { id: string; name: string; writer: string; engSource: string; url: string; chapters: ApostolicChapter[] }
export const getApostolic = () => g<{ works: ApostolicWork[] }>("apostolic");
export interface JosephusChapter { n: number; title: string; paras: [number, string][] }
export interface JosephusWork { id: string; name: string; books: { n: number; chapters: JosephusChapter[] }[] }
export const getJosephus = () => g<{ works: JosephusWork[] }>("josephus");

// ---------- Church history ----------
export type EventCat = "council" | "creed" | "schism" | "reform" | "shift" | "turning";
export interface ChurchEvent {
  id: string; title: string; y1: number; y2?: number; approx?: boolean; cat: EventCat; trad: string[]; summary: string;
  source: string; url?: string; page?: string; quote?: string; sourceKind: "local" | "web";
  terms?: string[]; writers?: string[]; creeds?: string[]; refs?: string[]; related?: string[]; more?: string;
}
export const getChurchEvents = () => g<{ events: ChurchEvent[] }>("church").then((d) => d.events);
export const CATS: { id: EventCat; label: string; hint: string }[] = [
  { id: "council", label: "Councils", hint: "Councils and synods" },
  { id: "creed", label: "Creeds and confessions", hint: "Creeds, confessions and declarations" },
  { id: "schism", label: "Schisms and divisions", hint: "Where churches divided" },
  { id: "reform", label: "Reformations and renewal", hint: "Reform and renewal movements, and reconciliation" },
  { id: "shift", label: "Theological shifts", hint: "Changes in how theology was done" },
  { id: "turning", label: "Turning points", hint: "Events that changed the church's setting" },
];
export const TRADITIONS: { id: string; label: string }[] = [
  { id: "all", label: "Shared by all" },
  { id: "orthodox", label: "Eastern Orthodox" },
  { id: "oriental", label: "Oriental Orthodox" },
  { id: "catholic", label: "Roman Catholic" },
  { id: "protestant", label: "Protestant, general" },
  { id: "lutheran", label: "Lutheran" },
  { id: "reformed", label: "Reformed" },
  { id: "anglican", label: "Anglican" },
  { id: "anabaptist", label: "Anabaptist" },
  { id: "methodist", label: "Methodist" },
  { id: "evangelical", label: "Evangelical" },
  { id: "pentecostal", label: "Pentecostal" },
];
export const eventHash = (id: string) => `event-${id}`;
export const eventsForTerm = async (id: string) => (await getChurchEvents()).filter((e) => e.terms?.includes(id));
export const eventsForWriter = async (id: string) => (await getChurchEvents()).filter((e) => e.writers?.includes(id));
export const eventsForCreed = async (id: string) => (await getChurchEvents()).filter((e) => e.creeds?.includes(id));

// ---------- Dating ----------
export interface DateView { label: string; x?: number; who: string; source: string; url?: string }
export interface ChronItem { id: string; title: string; match: string; modernX: number; views: DateView[]; refs?: string[] }
export const getChronology = () => g<{ items: ChronItem[]; books: { book: string; views: DateView[] }[] }>("chronology");

// ---------- Terms through the centuries ----------
export interface DoctrineEntry { n: Record<string, number>; s: Record<string, [string, number][]> }
export const getDoctrine = () => g<Record<string, DoctrineEntry>>("doctrine");

export const readingRef = (book: number, chapter: number, verse?: number) => `${bookName(book)} ${chapter}${verse ? `:${verse}` : ""}`;
export const centuryLabel = (c: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = c % 100;
  return `${c}${s[(v - 20) % 10] ?? s[v] ?? s[0]} century`;
};
export const yearToCentury = (y: number) => Math.floor((y - 1) / 100) + 1;
