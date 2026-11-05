import { decodeVerseCode } from "./bible";
import { load, pad2 } from "./data";

/** [text, transliteration, gloss, Strong's id with STEP's sense letter, morphology code] */
export type WordTuple = [string, string, string, string, string];

export interface LexSense {
  /** STEP's sense letter, e.g. G in H430G */
  a: string;
  l: string;
  x: string;
  g: string;
  m: string;
  /** Definition with only <b>, <i> and newlines */
  t: string;
}
export interface LexEntry {
  /** lemma, transliteration, pronunciation, derivation, Strong's definition, KJV renderings */
  l?: string;
  x?: string;
  p?: string;
  d?: string;
  s?: string;
  k?: string;
  m?: LexSense[];
  /** word occurrences, verses */
  c: number;
  v: number;
}
export type LexIndexRow = [id: string, lemma: string, translit: string, gloss: string, count: number];

/** "G0026", "g26", "H430G" -> "G26", "H430" */
export function normalizeStrongs(id: string): string | null {
  const m = id.trim().match(/^([HGhg])0*(\d{1,5})[A-Za-z]?$/);
  return m ? `${m[1].toUpperCase()}${m[2]}` : null;
}
const shardOf = (id: string) => `${id[0]}${Math.floor(Number(id.slice(1)) / 1000)}`;

export async function getLexEntry(rawId: string): Promise<LexEntry | null> {
  const id = normalizeStrongs(rawId);
  if (!id) return null;
  try {
    const shard = await load<Record<string, LexEntry>>(`lex/${shardOf(id)}.json`);
    return shard[id] ?? null;
  } catch {
    return null;
  }
}

export const getLexIndex = () => load<LexIndexRow[]>("lex/index.json");

/** Finds words by Strong's number, English gloss, transliteration or original spelling. */
export async function searchLexicon(query: string, limit = 40): Promise<LexIndexRow[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const id = normalizeStrongs(q);
  const index = await getLexIndex();
  if (id) return index.filter((r) => r[0] === id);
  const strip = (s: string) => s.normalize("NFD").replace(/[̀-֑ͯ-ׇʼʽ.'’]/g, "").toLowerCase();
  const sq = strip(q);
  const scored: [number, LexIndexRow][] = [];
  for (const r of index) {
    const gloss = r[3].toLowerCase();
    const tr = strip(r[2]);
    const lem = strip(r[1]);
    let s = 0;
    if (gloss === q || tr === sq || lem === sq) s = 4;
    else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(gloss)) s = 3;
    else if (tr.startsWith(sq) || lem.startsWith(sq)) s = 2;
    else if (gloss.includes(q)) s = 1;
    if (s) scored.push([s * 100000 + Math.min(r[4], 99999), r]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}

export async function getVerseWords(book: number, chapter: number, verse: number): Promise<WordTuple[]> {
  const data = await load<WordTuple[][][]>(`words/${pad2(book)}.json`);
  return data[chapter - 1]?.[verse - 1] ?? [];
}

/** Verse codes for every verse containing this word, in canonical order. */
export async function getConcordance(rawId: string): Promise<number[]> {
  const id = normalizeStrongs(rawId);
  if (!id) return [];
  try {
    const shard = await load<Record<string, number[]>>(`conc/${shardOf(id)}.json`);
    const deltas = shard[id] ?? [];
    let cur = 0;
    return deltas.map((d) => (cur += d));
  } catch {
    return [];
  }
}

export interface CrossRef {
  code: number;
  endVerse: number;
  votes: number;
  ref: string;
}
export async function getCrossRefs(book: number, chapter: number, verse: number, bookNameOf: (b: number) => string): Promise<CrossRef[]> {
  const data = await load<Record<string, [number, number, number][]>>(`xref/${pad2(book)}.json`);
  return (data[`${chapter}:${verse}`] ?? []).map(([code, endVerse, votes]) => {
    const d = decodeVerseCode(code);
    return { code, endVerse, votes, ref: `${bookNameOf(d.book)} ${d.chapter}:${d.verse}${endVerse ? `–${endVerse}` : ""}` };
  });
}

// ---------- Morphology ----------
const GR_POS: Record<string, string> = { V: "Verb", N: "Noun", A: "Adjective", T: "Article", P: "Pronoun", R: "Relative pronoun", C: "Reciprocal pronoun", D: "Demonstrative pronoun", K: "Correlative pronoun", I: "Interrogative pronoun", X: "Indefinite pronoun", Q: "Correlative pronoun", F: "Reflexive pronoun", S: "Possessive pronoun", ADV: "Adverb", CONJ: "Conjunction", PREP: "Preposition", PRT: "Particle", INJ: "Interjection", COND: "Conditional", HEB: "Hebrew word", ARAM: "Aramaic word" };
const GR_TENSE: Record<string, string> = { P: "present", I: "imperfect", F: "future", A: "aorist", R: "perfect", L: "pluperfect", "2A": "second aorist", "2R": "second perfect", "2F": "second future", "2L": "second pluperfect" };
const GR_VOICE: Record<string, string> = { A: "active", M: "middle", P: "passive", E: "middle or passive", D: "middle deponent", O: "passive deponent", N: "middle or passive deponent" };
const GR_MOOD: Record<string, string> = { I: "indicative", S: "subjunctive", O: "optative", M: "imperative", N: "infinitive", P: "participle" };
const GR_CASE: Record<string, string> = { N: "nominative", G: "genitive", D: "dative", A: "accusative", V: "vocative" };
const GR_NUM: Record<string, string> = { S: "singular", P: "plural" };
const GR_GEN: Record<string, string> = { M: "masculine", F: "feminine", N: "neuter" };

function caseNumGen(s: string): string[] {
  const m = s.match(/^([NGDAV])([SP])([MFN])?/);
  return m ? [GR_CASE[m[1]], GR_NUM[m[2]], GR_GEN[m[3]]].filter(Boolean) : [];
}

function decodeGreek(code: string): string {
  const parts = code.split("-");
  const pos = parts[0];
  if (pos === "V" && parts[1]) {
    const m = parts[1].match(/^(2?[PIFARL])([AMPEDON])([ISOMNP])$/);
    if (!m) return `Verb (${code})`;
    const out = ["Verb", GR_TENSE[m[1]], GR_VOICE[m[2]], GR_MOOD[m[3]]];
    const rest = parts[2];
    if (rest) {
      const pn = rest.match(/^([123])([SP])$/);
      if (pn) out.push(`${pn[1]}${pn[1] === "1" ? "st" : pn[1] === "2" ? "nd" : "rd"} person`, GR_NUM[pn[2]]);
      else out.push(...caseNumGen(rest));
    }
    return out.join(", ").replace(/, /, " · ");
  }
  const name = GR_POS[pos];
  if (!name) return code;
  const detail = parts.slice(1).flatMap((p) => caseNumGen(p));
  const person = parts[1]?.match(/^([123])([NGDAV])([SP])$/);
  if (person) return [name, `${person[1]}${person[1] === "1" ? "st" : person[1] === "2" ? "nd" : "rd"} person`, GR_CASE[person[2]], GR_NUM[person[3]]].join(", ").replace(/, /, " · ");
  const proper = parts.includes("P") && pos === "N" ? " (proper name)" : "";
  return (detail.length ? `${name} · ${detail.join(", ")}` : name) + proper;
}

const HB_POS: Record<string, string> = { A: "Adjective", C: "Conjunction", D: "Adverb", N: "Noun", P: "Pronoun", R: "Preposition", S: "Suffix", T: "Particle", V: "Verb" };
const HB_STEM: Record<string, string> = { q: "qal", N: "niphal", p: "piel", P: "pual", h: "hiphil", H: "hophal", t: "hithpael", o: "polel", O: "polal", r: "hithpolel", m: "poel", M: "poal", k: "palel", K: "pulal", Q: "qal passive", l: "pilpel", L: "polpal", f: "hithpalpel", D: "nithpael", j: "pealal", i: "pilel", u: "hothpaal", c: "tiphil", v: "hishtaphel", w: "nithpalel", y: "nithpoel", z: "hithpoel" };
const HB_ASPECT: Record<string, string> = { p: "perfect", q: "sequential perfect", i: "imperfect", w: "sequential imperfect", h: "cohortative", j: "jussive", v: "imperative", r: "participle", s: "passive participle", a: "infinitive absolute", c: "infinitive construct" };
const HB_GEN: Record<string, string> = { m: "masculine", f: "feminine", b: "common", c: "common" };
const HB_NUM: Record<string, string> = { s: "singular", p: "plural", d: "dual" };

function decodeHebrew(code: string): string {
  // e.g. HVqp3ms, HR/Ncfsa, Hc/Vqw3ms. The language letter comes first (H Hebrew, A Aramaic).
  const lang = code[0] === "A" ? "Aramaic " : "";
  const pieces = code.slice(1).split(/[\/\\]/);
  const main = pieces.find((p) => /^V/.test(p)) ?? pieces.find((p) => /^N/.test(p)) ?? pieces[pieces.length - 1] ?? "";
  const pos = HB_POS[main[0]];
  if (!pos) return code;
  if (main[0] === "V") {
    const [, stem, aspect, person, gen, num] = main.match(/^V(.)(.)([123])?([mfbc])?([spd])?/) ?? [];
    const out = [HB_STEM[stem], HB_ASPECT[aspect]];
    if (person) out.push(`${person}${person === "1" ? "st" : person === "2" ? "nd" : "rd"} person`);
    if (gen) out.push(HB_GEN[gen]);
    if (num) out.push(HB_NUM[num]);
    return `${lang}Verb · ${out.filter(Boolean).join(", ")}`;
  }
  if (main[0] === "N") {
    const proper = main[1] === "p";
    const gen = HB_GEN[main[2]];
    const num = HB_NUM[main[3]];
    const state = main[4] === "c" ? "construct" : main[4] === "a" ? "absolute" : "";
    return `${lang}${proper ? "Proper name" : "Noun"}${[gen, num, state].filter(Boolean).length ? ` · ${[gen, num, state].filter(Boolean).join(", ")}` : ""}`;
  }
  return `${lang}${pos}`;
}

/** Turns a STEP morphology code into words, e.g. V-AAI-3S -> "Verb · aorist, active, indicative, 3rd person, singular". */
export function decodeMorph(code: string): string {
  if (!code) return "";
  if (/^[HA][A-Za-z]/.test(code) && !code.includes("-")) return decodeHebrew(code);
  return decodeGreek(code);
}

// ---------- Gematria ----------
const HEB_VALUES: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
const GRK_VALUES: Record<string, number> = { α: 1, β: 2, γ: 3, δ: 4, ε: 5, ϛ: 6, ζ: 7, η: 8, θ: 9, ι: 10, κ: 20, λ: 30, μ: 40, ν: 50, ξ: 60, ο: 70, π: 80, ϙ: 90, ρ: 100, σ: 200, ς: 200, τ: 300, υ: 400, φ: 500, χ: 600, ψ: 700, ω: 800 };

export interface GematriaResult {
  total: number;
  letters: { ch: string; value: number }[];
  system: "Hebrew" | "Greek" | "Mixed" | "None";
}
/** Standard letter values. Hebrew final forms take the same value as the ordinary letter. */
export function gematria(text: string): GematriaResult {
  const letters: { ch: string; value: number }[] = [];
  let heb = 0, grk = 0;
  for (const raw of text.normalize("NFD").toLowerCase()) {
    if (HEB_VALUES[raw]) { letters.push({ ch: raw, value: HEB_VALUES[raw] }); heb++; }
    else if (GRK_VALUES[raw]) { letters.push({ ch: raw, value: GRK_VALUES[raw] }); grk++; }
  }
  return { total: letters.reduce((a, l) => a + l.value, 0), letters, system: heb && grk ? "Mixed" : heb ? "Hebrew" : grk ? "Greek" : "None" };
}
