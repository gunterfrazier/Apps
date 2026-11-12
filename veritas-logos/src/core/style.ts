import { getPassage, type TranslationId } from "./bible";
import { decodeMorph, getLexEntry, getVerseWords, normalizeStrongs } from "./lexicon";
import { bookName } from "./references";

/**
 * Counts the literary features of selected verses. It only counts: judging the genre is left to the reader or
 * to a labeled AI draft. Phrases and formulas are read from the chosen translation, so they vary a little by version.
 */
export interface StyleProfile {
  reference: string;
  translation: TranslationId;
  verseCount: number;
  wordCount: number;
  phrases: { phrase: string; count: number; refs: string[] }[];
  formulas: { label: string; count: number; refs: string[] }[];
  numbers: { word: string; count: number; refs: string[] }[];
  colors: { word: string; count: number; refs: string[] }[];
  sameOpening: { opening: string; refs: string[] }[];
  verbs: { label: string; count: number }[];
  verbTotal: number;
  repeatedWords: { id: string; lemma: string; gloss: string; count: number }[];
}

const FORMULAS: [string, RegExp][] = [
  ["“I looked” or “I saw”", /\bI (?:looked|saw|beheld|watched)\b/i],
  ["“I heard”", /\bI heard\b/i],
  ["“Behold” or “Lo”", /\b(?:behold|lo)\b/i],
  ["“Thus says the LORD”", /\b(?:thus|this is what)\b[^.]{0,20}\b(?:says|saith|said)\b[^.]{0,12}\b(?:lord|god)\b/i],
  ["“Declares the LORD”", /\b(?:declares|saith|says) the lord\b/i],
  ["“The word of the LORD came”", /\bword of the lord (?:came|was|that came)\b/i],
  ["“Woe”", /\bwoe\b/i],
  ["“Blessed”", /\bblessed\b/i],
  ["“Truly” or “Verily”", /\b(?:truly|verily),? (?:truly,? |verily,? )?I (?:say|tell)\b/i],
  ["“It is written”", /\bit is written\b/i],
  ["“Hear” or “Listen”", /\b(?:hear|listen)\b[^.]{0,12}[!,:;]/i],
  ["“Like” or “as” comparisons", /\b(?:like|as) (?:a|an|the)\b/i],
  ["“In that day” or “the day of the LORD”", /\b(?:in that day|on that day|day of the lord)\b/i],
  ["“Come!”", /\bcome[!.]/i],
  ["“Selah”", /\bselah\b/i],
];
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "forty", "seventy", "hundred", "thousand", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "half", "quarter", "tenth"];
const COLOR_WORDS = ["white", "red", "black", "pale", "green", "blue", "purple", "scarlet", "crimson", "yellow", "gray", "sorrel", "dappled"];
const STOP = new Set("the a an and or but of to in on at by for with from as is was were be been are his her its their your my our he she it they them we you i him me us that this these those who which what when then there so not no have has had will shall would should may might can could do did does into upon out up all".split(" "));
const VERB_LABELS: [string, RegExp][] = [["Imperative", /imperative/i], ["Future", /future/i], ["Aorist", /aorist/i], ["Perfect", /(?<!im|plu)perfect/i], ["Imperfect", /imperfect/i], ["Present", /present/i], ["Participle", /participle/i], ["Infinitive", /infinitive/i], ["Sequential", /sequential|consecutive/i]];
const isVerb = (code: string) => (/^[HA][A-Za-z]/.test(code) && !code.includes("-") ? code.slice(1).split(/[/\\]/).some((p) => /^V/.test(p)) : code.split("-")[0] === "V");
const isContent = (code: string) => (/^[HA][A-Za-z]/.test(code) && !code.includes("-") ? code.slice(1).split(/[/\\]/).some((p) => /^[NVA]/.test(p) && !/^Np/.test(p)) : ["N", "V", "A"].includes(code.split("-")[0]));

const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}'’\s-]/gu, " ").split(/\s+/).filter(Boolean);

export async function styleProfile(reference: string, translation: TranslationId): Promise<StyleProfile | null> {
  const passage = await getPassage(translation, reference);
  if (!passage) return null;
  const verses = passage.parts.flatMap((p) => p.verses).filter((v) => v.text);
  if (!verses.length) return null;
  const refOf = (v: { book: number; chapter: number; verse: number }) => `${bookName(v.book)} ${v.chapter}:${v.verse}`;
  const rows = verses.map((v) => ({ ref: refOf(v), text: v.text, toks: tokens(v.text), clauses: v.text.split(/[.,;:!?“”"—]+/).map(tokens).filter((c) => c.length) }));

  // Repeated phrases, longest first, leaving out shorter pieces of longer ones.
  const grams = new Map<string, Set<string> & { n?: number }>();
  const counts = new Map<string, number>();
  for (const r of rows) for (const clause of r.clauses) for (let n = 2; n <= 8; n++) for (let i = 0; i + n <= clause.length; i++) {
    const g = clause.slice(i, i + n);
    if (g.filter((w) => !STOP.has(w)).length < (n === 2 ? 2 : 1)) continue;
    const key = g.join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!grams.has(key)) grams.set(key, new Set());
    grams.get(key)!.add(r.ref);
  }
  const phrases: StyleProfile["phrases"] = [];
  for (const key of [...counts.keys()].filter((k) => counts.get(k)! >= 2).sort((a, b) => b.split(" ").length - a.split(" ").length || counts.get(b)! - counts.get(a)!)) {
    if (phrases.some((p) => p.phrase.includes(key) && p.count >= counts.get(key)!)) continue;
    phrases.push({ phrase: key, count: counts.get(key)!, refs: [...grams.get(key)!] });
    if (phrases.length >= 10) break;
  }
  phrases.sort((a, b) => b.count * b.phrase.split(" ").length - a.count * a.phrase.split(" ").length);

  const formulas = FORMULAS.flatMap(([label, re]) => {
    const refs = rows.filter((r) => re.test(r.text)).map((r) => r.ref);
    return refs.length ? [{ label, count: refs.length, refs }] : [];
  });
  const listed = (words: string[]) => words.flatMap((word) => {
    const refs = rows.filter((r) => r.toks.includes(word)).map((r) => r.ref);
    const count = rows.reduce((a, r) => a + r.toks.filter((t) => t === word).length, 0);
    return count ? [{ word, count, refs }] : [];
  });

  const openings = new Map<string, string[]>();
  for (const r of rows) {
    const open = r.toks.filter((w, i) => !(i === 0 && ["and", "then", "but", "for", "now", "so"].includes(w))).slice(0, 3).join(" ");
    if (open.split(" ").length === 3) openings.set(open, [...(openings.get(open) ?? []), r.ref]);
  }
  const sameOpening = [...openings.entries()].filter(([, refs]) => refs.length >= 2).map(([opening, refs]) => ({ opening, refs })).slice(0, 6);

  const verbs = new Map<string, number>();
  let verbTotal = 0;
  const words = new Map<string, { count: number; first: string }>();
  for (const v of verses) for (const t of await getVerseWords(v.book, v.chapter, v.verse)) {
    if (isVerb(t[4])) {
      verbTotal++;
      const text = decodeMorph(t[4]);
      for (const [label, re] of VERB_LABELS) if (re.test(text)) verbs.set(label, (verbs.get(label) ?? 0) + 1);
    }
    const id = normalizeStrongs(t[3]);
    if (id && isContent(t[4])) words.set(id, { count: (words.get(id)?.count ?? 0) + 1, first: words.get(id)?.first ?? t[2] });
  }
  const repeated = [...words.entries()].filter(([, w]) => w.count >= 2).sort((a, b) => b[1].count - a[1].count).slice(0, 12);
  const repeatedWords: StyleProfile["repeatedWords"] = [];
  for (const [id, w] of repeated) {
    const e = await getLexEntry(id);
    repeatedWords.push({ id, lemma: e?.l ?? "", gloss: e?.m?.[0]?.g || w.first, count: w.count });
  }
  return {
    reference: passage.reference, translation, verseCount: verses.length, wordCount: rows.reduce((a, r) => a + r.toks.length, 0), phrases, formulas,
    numbers: listed(NUMBER_WORDS), colors: listed(COLOR_WORDS), sameOpening,
    verbs: [...verbs.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count), verbTotal, repeatedWords,
  };
}

export const styleSummary = (s: StyleProfile) => JSON.stringify({
  verses: s.verseCount, repeatedPhrases: s.phrases.map((p) => `"${p.phrase}" x${p.count}`), formulas: s.formulas.map((f) => `${f.label} x${f.count}`),
  numbers: s.numbers.map((n) => `${n.word} x${n.count}`), colors: s.colors.map((n) => `${n.word} x${n.count}`), versesOpeningAlike: s.sameOpening.map((o) => `"${o.opening}" in ${o.refs.join(", ")}`),
  verbs: s.verbs, verbTotal: s.verbTotal, repeatedWords: s.repeatedWords.map((w) => `${w.lemma} (${w.gloss}) x${w.count}`),
});
