import { getPassage, type TranslationId } from "./bible";
import type { LensId } from "./content";
import { searchGlossary, type GlossaryTerm } from "./glossary";
import { getInsights, type ConfessionCite, type TopicLink } from "./insights";
import { getLexEntry, getVerseWords, normalizeStrongs } from "./lexicon";
import { bookName } from "./references";
import { excerptsForPassage, workCaution, writerTradition, type Excerpt } from "./writings";

/**
 * Searches selected verses for a word or topic, using only the app's data: the text, the tagged
 * Hebrew and Greek, the lexicon, Nave's topics, the glossary, the confessions and the writers.
 * Nothing here is generated, so it works without AI.
 */
export interface VerseHit { ref: string; text: string }
export interface OriginalWordHit {
  strong: string;
  lemma: string;
  translit: string;
  meaning: string;
  /**
   * "asked": the reader searched for this word itself. "here": tagged with this English in these verses.
   * "likely": the lexicon lists this English, and the word sits in a verse where the translation uses it, though the tags can't confirm the match.
   * "lexicon": the lexicon lists this English, but nothing ties it to the word here.
   */
  how: "here" | "likely" | "lexicon" | "asked";
  uses: { ref: string; word: string; rendered: string }[];
}
export interface WriterHit { writer: string; writerId: string; year: number | null; tradition: string; title: string; reference: string; snippet: string; fromLens: boolean }
export interface ConfessionHit extends ConfessionCite { fromLens: boolean }
export interface PassageSearch {
  reference: string;
  query: string;
  translation: TranslationId;
  verseCount: number;
  verses: VerseHit[];
  originals: OriginalWordHit[];
  /** True if the word appears in the text, or stands behind it in the Hebrew or Greek. */
  direct: boolean;
  topics: TopicLink[];
  terms: Pick<GlossaryTerm, "id" | "term">[];
  confessions: ConfessionHit[];
  writers: WriterHit[];
  writerTotal: number;
}

const stripMarks = (s: string) => s.normalize("NFD").replace(/[̀-֑ͯ-ׇʼʽ'’.,;:·]/g, "").toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches the word and its ordinary English endings, but not longer words that merely start the same way. */
export function queryPattern(query: string): RegExp | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (q.length < 2) return null;
  const words = q.split(" ");
  const last = words.pop()!;
  const bases = new Set([last]);
  if (last.endsWith("e")) bases.add(last.slice(0, -1));
  if (last.endsWith("ness")) bases.add(last.slice(0, -4));
  if (last.endsWith("s") && last.length > 3 && !last.endsWith("ss")) bases.add(last.slice(0, -1));
  if (last.endsWith("ies")) bases.add(`${last.slice(0, -3)}y`);
  if (last.endsWith("y")) bases.add(last.slice(0, -1));
  const tail = `(?:${[...bases].map(escape).join("|")})(?:s|es|ies|d|ed|ied|ing|ly|th|eth|est|er|ers|ness|'s|’s)?`;
  const head = words.map((w) => `${escape(w)}\\s+`).join("");
  return new RegExp(`(?<![\\p{L}\\p{M}])${head}${tail}(?![\\p{L}\\p{M}])`, "iu");
}

const LENS_WRITERS: Partial<Record<LensId, RegExp>> = {
  reformed: /Reformed/, covenant: /Reformed/, lutheran: /Lutheran/, anglican: /Anglican/, baptist: /Baptist/, arminian: /Methodist/, catholic: /Medieval Catholic|Latin West/, orthodox: /Eastern/,
};
const LENS_CONFESSIONS: Partial<Record<LensId, RegExp>> = { reformed: /Reformed/, covenant: /Reformed/, baptist: /Baptist/ };

function snippet(text: string, re: RegExp, size = 260): string {
  const at = text.search(re);
  if (at < 0) return text.slice(0, size);
  const from = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - size / 2)));
  const piece = text.slice(from, from + size).trim();
  return `${from > 0 ? "…" : ""}${piece}${from + size < text.length ? "…" : ""}`;
}

export async function searchPassage(reference: string, query: string, translation: TranslationId, lens: LensId = "all"): Promise<PassageSearch | null> {
  const q = query.trim().slice(0, 80);
  const re = queryPattern(q);
  const passage = await getPassage(translation, reference);
  if (!re || !passage) return null;
  const all = passage.parts.flatMap((p) => p.verses);
  const asked = normalizeStrongs(q);
  const plainQ = stripMarks(q);
  const verses: VerseHit[] = [];
  const found = new Map<string, OriginalWordHit>();
  const lexMatch = new Map<string, boolean>();
  const refOf = (v: { book: number; chapter: number; verse: number }) => `${bookName(v.book)} ${v.chapter}:${v.verse}`;

  for (const v of all) {
    const inText = Boolean(v.text && re.test(v.text));
    if (inText) verses.push({ ref: refOf(v), text: v.text });
    const tagged = await getVerseWords(v.book, v.chapter, v.verse);
    const accounted = tagged.some((t) => re.test(t[2].replace(/[[\]]/g, "")));
    for (const t of tagged) {
      const id = normalizeStrongs(t[3]);
      if (!id) continue;
      const gloss = t[2].replace(/[[\]]/g, "");
      const isAsked = asked === id || stripMarks(t[0]) === plainQ || stripMarks(t[1]) === plainQ;
      const inGloss = re.test(gloss);
      if (!lexMatch.has(id)) {
        const e = await getLexEntry(id);
        lexMatch.set(id, Boolean(e && (stripMarks(e.l ?? "") === plainQ || stripMarks(e.x ?? "") === plainQ || (e.k && re.test(e.k)) || e.m?.some((m) => m.g && re.test(m.g)))));
      }
      if (!isAsked && !inGloss && !lexMatch.get(id) && !found.has(id)) continue;
      let hit = found.get(id);
      if (!hit) {
        const e = await getLexEntry(id);
        hit = { strong: id, lemma: e?.l ?? t[0], translit: e?.x ?? t[1], meaning: (e?.m?.[0]?.g || e?.k || "").trim(), how: "lexicon", uses: [] };
        found.set(id, hit);
      }
      if (isAsked) hit.how = "asked";
      else if (inGloss && hit.how !== "asked") hit.how = "here";
      else if (inText && !accounted && lexMatch.get(id) && hit.how === "lexicon") hit.how = "likely";
      hit.uses.push({ ref: refOf(v), word: t[0].replace(/[,.;:·]+$/, ""), rendered: gloss });
    }
  }
  const order = { asked: 0, here: 1, likely: 2, lexicon: 3 };
  const originals = [...found.values()].sort((a, b) => order[a.how] - order[b.how] || b.uses.length - a.uses.length);

  const insights = await getInsights(reference);
  const topics = insights.topics.filter((t) => re.test(t.name)).slice(0, 8);
  const terms = (await searchGlossary(q, 12)).filter((t) => re.test(t.term) || t.aliases.some((a) => re.test(a))).slice(0, 5).map((t) => ({ id: t.id, term: t.term }));
  const cLens = LENS_CONFESSIONS[lens];
  const confessions = insights.confessions
    .filter((c) => re.test(`${c.title} ${c.text}`))
    .map((c) => ({ ...c, fromLens: Boolean(cLens?.test(c.tradition)) }))
    .sort((a, b) => Number(b.fromLens) - Number(a.fromLens))
    .slice(0, 8);
  const wLens = LENS_WRITERS[lens];
  const [a, b] = await Promise.all([excerptsForPassage(reference), excerptsForPassage(reference, "comm")]);
  const seen = new Set<string>();
  const matched = [...b, ...a].filter((e: Excerpt) => {
    const key = `${e.writer.id}|${e.title}|${e.reference}`;
    if (seen.has(key) || e.writer.flag || workCaution(e.title) || !re.test(e.text)) return false;
    seen.add(key);
    return true;
  });
  const writers = matched
    .map((e): WriterHit => {
      const tradition = writerTradition(e.writer);
      return { writer: e.writer.name, writerId: e.writer.id, year: e.writer.year, tradition, title: e.title, reference: e.reference, snippet: snippet(e.text, re), fromLens: Boolean(wLens?.test(tradition)) };
    })
    .sort((x, y) => Number(y.fromLens) - Number(x.fromLens) || (x.year ?? 0) - (y.year ?? 0));
  const onePerWriter = new Set<string>();
  const shown = writers.filter((w) => (onePerWriter.has(w.writerId) ? false : (onePerWriter.add(w.writerId), true))).slice(0, 8);

  return { reference: passage.reference, query: q, translation, verseCount: all.length, verses, originals, direct: verses.length > 0 || originals.some((o) => o.how !== "lexicon"), topics, terms, confessions, writers: shown, writerTotal: matched.length };
}

/** A plain summary of the findings, for the AI to start from. */
export function searchSummary(s: PassageSearch): string {
  return JSON.stringify({
    versesWithTheEnglishWord: s.verses.map((v) => `${v.ref}: ${v.text}`).slice(0, 30),
    originalWords: s.originals.slice(0, 12).map((o) => ({ strong: o.strong, lemma: o.lemma, translit: o.translit, meaning: o.meaning, link: o.how, uses: o.uses.slice(0, 12).map((u) => `${u.ref} ${u.word} (“${u.rendered}”)`) })),
    topics: s.topics.map((t) => t.name),
    glossaryTerms: s.terms.map((t) => t.term),
    confessions: s.confessions.slice(0, 5).map((c) => ({ doc: c.docName, section: c.label, text: c.text.slice(0, 400) })),
    writers: s.writers.slice(0, 6).map((w) => ({ writer: w.writer, tradition: w.tradition, filedUnder: w.reference, text: w.snippet })),
  });
}
