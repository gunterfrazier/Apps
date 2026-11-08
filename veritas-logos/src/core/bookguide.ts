import { load } from "./data";
import { bookName } from "./references";

/**
 * Book guides. Lookup only: every figure is counted from the app's own data when the data is built, and every
 * quotation is copied word for word from the named edition (scripts/build_bookguides.py). AI drafts are made
 * separately, on request, and stay labeled.
 */
export interface GuideWord {
  id: string;
  lemma: string;
  translit: string;
  gloss: string;
  /** The book's most common English rendering, from STEPBible's tagged text, where it differs from the gloss. */
  here?: string;
  /** The headword Strong's files this word under, when the book spells it differently (εὐθύς under εὐθέως). */
  tagged?: string;
  n: number;
  refs: string[];
}
export interface KeyWord extends GuideWord { nt: number; times: number; byChapter: number[] }
export interface OnlyHereWord extends GuideWord { name: boolean }
export interface Witness {
  topic: "author" | "reception" | "background";
  writer: string;
  name: string;
  via?: string;
  viaName?: string;
  work: string;
  cite: string;
  edition: string;
  translator: string;
  page: string;
  url: string;
  text: string;
}
export interface Reading { at: string; greek: string; english: string; editions: string; other: { greek: string; translit: string; english: string; editions: string } }
export interface ChapterFacts { c: number; verses: number; words: number; keywords: [string, number][]; people: string[]; quotes: string[] }
export interface BookGuide {
  book: number;
  name: string;
  /** words counts the Nestle-Aland wording as STEPBible tags it; ntWords is the same count for the whole NT. */
  /** verses follows the app's (KJV) numbering; greekVerses the Greek editions'. */
  glance: { chapters: number; verses: number; greekVerses: number; versesCounted: number; words: number; distinct: number; ntWords: number; wordsInBrackets?: number };
  /** Greek verse numbers the app's Bibles join to the verse before: [Greek, app]. */
  renumbered: [string, string][];
  keywords: KeyWord[];
  onlyHere: OnlyHereWord[];
  self: string[];
  /** How self was found: the opening only, a letter's "I write" verses, or passages listed in book_guides.json. */
  selfKind: "opening" | "writing" | "listed";
  /** Headings for a topic's group of witnesses, such as "Cerinthus, in Irenaeus". */
  titles: Partial<Record<Witness["topic"], string>>;
  /** title is given only where two people share a name. */
  people: { id: string; name: string; verses: number; first: string; title?: string }[];
  links: {
    quotes: { at: string; ref: string; shared: string }[];
    /** Matches left out: under five words, or wording matched to three or more different passages (a stock phrase). */
    shortQuotes: number;
    quotedBy: { at: string; ref: string; shared: string }[];
    allusions: { at: string; ref: string; votes: number }[];
    allusionCount: number;
    parallels: { at: string; ref: string; shared: string }[];
    parallelCount: number;
  };
  textual: {
    disputed: { ref: string; label: string; note: string }[];
    outsideCritical: string[];
    versesDiffer: number;
    byChapter: number[];
    criticalOnly: number;
    traditionalOnly: number;
    readings: Reading[];
    doubleBrackets: [string, string][];
  };
  witnesses: Witness[];
  notes: Partial<Record<Witness["topic"], string>>;
  henry?: { text: string; source: string; completedBy?: string };
  dictionaries: ["easton" | "smith", string][];
  dating: boolean;
  chapters: ChapterFacts[];
}
interface GuideFile { about: string; books: Record<string, BookGuide> }

/** Which group file holds each book's guide: { "41": "gospels", ... } */
const index = () => load<Record<string, string>>("scholar/bookguides/index.json");
export async function getBookGuide(book: number): Promise<BookGuide | null> {
  try {
    const group = (await index())[String(book)];
    return group ? (await load<GuideFile>(`scholar/bookguides/${group}.json`)).books[String(book)] ?? null : null;
  } catch {
    return null;
  }
}
export async function guideBooks(): Promise<number[]> {
  try {
    return Object.keys(await index()).map(Number).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** "3:16" in a book -> "1 John 3:16" */
export const at = (book: number, cv: string) => `${bookName(book)} ${cv}`;

/** A short plain-text digest of the counted and quoted facts, for an AI request to work from. */
export function guideDigest(g: BookGuide): string {
  const lines = [
    `${g.name}: ${g.glance.chapters} chapter${g.glance.chapters === 1 ? "" : "s"}, ${g.glance.verses} verses, ${g.glance.words.toLocaleString()} Greek words.`,
    `Words this book uses far more than the rest of the NT: ${g.keywords.map((k) => `${k.lemma} (${k.translit}, "${k.gloss}") ${k.n} times`).join("; ")}.`,
    g.people.length ? `People named: ${g.people.map((p) => p.name).join(", ")}.` : "",
    g.self.length ? `Verses where the writer opens or speaks of writing: ${g.self.join(", ")}.` : "",
    g.links.quotes.length ? `Earlier Scripture quoted: ${g.links.quotes.map((q) => `${q.at} quotes ${q.ref}`).join("; ")}.` : "",
    g.textual.disputed.length ? `Disputed passages: ${g.textual.disputed.map((d) => `${d.ref} (${d.label})`).join("; ")}.` : "",
    g.witnesses.length ? `Early witnesses quoted in the guide: ${g.witnesses.map((w) => `${w.name}${w.viaName ? ` (quoted by ${w.viaName})` : ""}, ${w.cite}`).join("; ")}.` : "",
    `Verses per chapter: ${g.chapters.map((c) => `${c.c}: ${c.verses}`).join(", ")}.`,
  ];
  return lines.filter(Boolean).join("\n");
}
