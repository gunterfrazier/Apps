import { getPassage, getVerseCounts, type TranslationId } from "./bible";
import { load } from "./data";
import { getInsights } from "./insights";
import { getConcordance, getCrossRefs, getLexEntry, getVerseWords, normalizeStrongs, type WordTuple } from "./lexicon";
import { bookName, parseReference } from "./references";
import { lxxChapters } from "./scholar";

/**
 * Finds other passages that share a passage's key words, using data the app already holds: the tagged Hebrew and
 * Greek, the Septuagint, the cross-references and the recorded quotations. It reports what matches, not what it means.
 *
 * The link between Hebrew and Greek comes from scripts/build_echo.py, which counts how often each pair shares a
 * verse in the Septuagint and the Hebrew.
 */
export interface EchoBridge { b: Record<string, [string, number, number][]>; s: Record<string, string>; f: Record<string, string[]> }
const getBridge = () => load<EchoBridge>("scholar/echo-bridge.json");

export interface EchoTerm { id: string; group: number; word: string; translit: string; gloss: string; verses: number; uses: number; df: number; codes: number[] }
/** same: the same Hebrew or Greek word. lxx: the Greek word is in the Septuagint here. rendering: a usual translation of the word, in the other Testament or where the Septuagint can't be lined up. possible: a usual translation, but the Septuagint here uses something else. */
export type EchoHow = "same" | "lxx" | "rendering" | "possible";
export interface EchoHit { group: number; term: string; id: string; how: EchoHow }
export interface EchoVerse { ref: string; code: number; hits: EchoHit[] }
export type EchoGrade = "both" | "wording" | "crossref" | "spread";
export interface EchoResult {
  book: number; chapter: number; label: string; score: number; grade: EchoGrade;
  /** The tightest cluster of verses, and how many of the passage's key words it holds. */
  close: { from: number; to: number; groups: number; terms: string[] };
  /** Every key word found anywhere in the chapter, firmly matched. */
  terms: string[];
  possible: string[];
  verses: EchoVerse[];
  xrefs: { from: string; to: string; votes: number }[];
  quotes: { ref: string; kind: string }[];
  sameOrder: boolean;
  /** The most key words from one verse of the passage that appear together here. */
  fromVerse: { ref: string; count: number; terms: string[] } | null;
}
export interface EchoSearch { reference: string; terms: EchoTerm[]; results: EchoResult[]; language: "Hebrew" | "Greek" }

const GREEK_POS = new Set(["N", "V", "A"]);
const isContent = (code: string) => {
  if (/^[HA][A-Za-z]/.test(code) && !code.includes("-")) return code.slice(1).split(/[/\\]/).some((p) => /^[NVA]/.test(p));
  return GREEK_POS.has(code.split("-")[0]);
};
/** Very common words say little about a link, and verbs are less distinctive than nouns. */
const maxDf = (id: string, code: string) => {
  const verb = /^[HA][A-Za-z]/.test(code) && !code.includes("-") ? code.slice(1).split(/[/\\]/).some((p) => /^V/.test(p)) : code.split("-")[0] === "V";
  return id[0] === "G" ? (verb ? 75 : 125) : verb ? 200 : 450;
};
const MAX_TERMS = 60;
const isName = (code: string) => (/^[HA][A-Za-z]/.test(code) && !code.includes("-") ? code.slice(1).split(/[/\\]/).some((p) => /^Np/.test(p)) : /^N-PRI|-[PLT]$/.test(code));
const TOTAL_VERSES = 31102;
const decode = (c: number) => ({ book: Math.floor(c / 1e6), chapter: Math.floor(c / 1e3) % 1e3, verse: c % 1e3 });
const encode = (b: number, c: number, v: number) => b * 1e6 + c * 1e3 + v;
const cleanGloss = (g: string) => g.replace(/\[[^\]]*\]/g, "").replace(/[.,;:!?“”"'’]+/g, "").replace(/^(the|a|an|of|to|in|and|his|her|their|your|my|our|from|with|by|for)\s+/gi, "").trim().toLowerCase();

export const normGreek = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[^Ͱ-Ͽ]/g, "");
function greekMatcher(bridge: EchoBridge, id: string): ((tok: string) => boolean) | null {
  const stem = bridge.s[id];
  if (stem) return (t) => t.startsWith(stem) && t.length - stem.length <= 6;
  const forms = bridge.f[id];
  if (forms) { const set = new Set(forms); return (t) => set.has(t); }
  return null;
}

const SKIP_LXX = new Set([19, 24]); // Psalms and Jeremiah are numbered differently in the Greek.
const LXX_GROUPS = ["law", "history", "wisdom", "prophets"];
let lxxTokens: Promise<Map<number, string[]>> | null = null;
function lxxIndex(): Promise<Map<number, string[]>> {
  lxxTokens ??= (async () => {
    const out = new Map<number, string[]>();
    for (const g of LXX_GROUPS) {
      const data = await load<Record<string, Record<string, Record<string, string>>>>(`scholar/lxx-${g}.json`);
      for (const [b, chapters] of Object.entries(data)) {
        if (SKIP_LXX.has(Number(b))) continue;
        for (const [c, verses] of Object.entries(chapters)) {
          if (!/^\d+$/.test(c)) continue;
          for (const [v, text] of Object.entries(verses)) if (/^\d+$/.test(v)) out.set(encode(Number(b), Number(c), Number(v)), text.split(/\s+/).map(normGreek));
        }
      }
    }
    return out;
  })();
  return lxxTokens;
}

/** The passage's key words, with the rarest first, grouped where they translate the same word. */
export async function echoTerms(reference: string): Promise<{ terms: EchoTerm[]; language: "Hebrew" | "Greek"; codes: Set<number> } | null> {
  const passage = await getPassage("BSB", reference);
  if (!passage) return null;
  const verses = passage.parts.flatMap((p) => p.verses);
  if (!verses.length) return null;
  const found = new Map<string, { word: string; translit: string; code: string; glosses: Map<string, number>; verses: Set<number>; uses: number }>();
  const codes = new Set<number>();
  const names: Record<string, boolean> = {};
  for (const v of verses) {
    const code = encode(v.book, v.chapter, v.verse);
    codes.add(code);
    for (const t of await getVerseWords(v.book, v.chapter, v.verse)) {
      const id = normalizeStrongs(t[3]);
      if (!id || !isContent(t[4])) continue;
      names[id] = isName(t[4]);
      let f = found.get(id);
      if (!f) { f = { word: t[0].replace(/[,.;:·׃־]+$/, ""), translit: t[1], code: t[4], glosses: new Map(), verses: new Set(), uses: 0 }; found.set(id, f); }
      const g = cleanGloss(t[2]);
      if (g) f.glosses.set(g, (f.glosses.get(g) ?? 0) + 1);
      f.verses.add(code);
      f.uses++;
    }
  }
  const bridge = await getBridge();
  const rows: EchoTerm[] = [];
  for (const [id, f] of found) {
    const df = (await getConcordance(id)).length;
    if (!df || df > maxDf(id, f.code)) continue;
    if (names[id] && df > 12) continue; // Common names like Israel link passages that share nothing else.
    const e = await getLexEntry(id);
    const gloss = (e?.m?.[0]?.g || [...f.glosses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "").replace(/[<>]/g, "").trim();
    rows.push({ id, group: rows.length, word: e?.l ?? f.word, translit: e?.x ?? f.translit, gloss, verses: f.verses.size, uses: f.uses, df, codes: [...f.verses] });
  }
  rows.sort((a, b) => a.df - b.df);
  const terms = rows.slice(0, MAX_TERMS);
  // μάχαιρα and ῥομφαία both render the Hebrew word for sword, so they count as one key word.
  terms.forEach((t, i) => { t.group = i; });
  for (let i = 0; i < terms.length; i++) {
    for (let j = i + 1; j < terms.length; j++) {
      const a = (bridge.b[terms[i].id] ?? []).filter((x) => x[1] >= 40).map((x) => x[0]);
      const b = new Set((bridge.b[terms[j].id] ?? []).filter((x) => x[1] >= 40).map((x) => x[0]));
      if (a.some((x) => b.has(x)) && terms[j].group !== terms[i].group) terms[j].group = terms[i].group;
    }
  }
  return { terms, language: verses[0].book <= 39 ? "Hebrew" : "Greek", codes };
}

const HOW_RANK: Record<EchoHow, number> = { same: 0, lxx: 1, rendering: 2, possible: 3 };
const HOW_WEIGHT: Record<EchoHow, number> = { same: 1, lxx: 1, rendering: 0.75, possible: 0.15 };
const FIRM = (h: EchoHow) => h !== "possible";

export async function findEchoes(reference: string, off: string[] = [], limit = 2000): Promise<EchoSearch | null> {
  const base = await echoTerms(reference);
  if (!base) return null;
  const { terms: allTerms, language, codes } = base;
  const terms = allTerms.filter((t) => !off.includes(t.id));
  const bridge = await getBridge();
  const hits = new Map<number, Map<number, EchoHit>>();
  const groupDf = new Map<number, number>();
  const lxx = await lxxIndex();
  const counts = await getVerseCounts();
  const exists = (code: number) => { const d = decode(code); return d.verse <= (counts[d.book - 1]?.[d.chapter - 1] ?? 0); };
  const add = (code: number, t: EchoTerm, how: EchoHow, id: string) => {
    if (codes.has(code) || !exists(code)) return;
    let v = hits.get(code);
    if (!v) { v = new Map(); hits.set(code, v); }
    const cur = v.get(t.group);
    if (!cur || HOW_RANK[how] < HOW_RANK[cur.how]) v.set(t.group, { group: t.group, term: t.gloss || t.translit, id, how });
  };

  const lxxHits = new Map<string, Set<number>>();
  const lxxFor = (id: string): Set<number> => {
    const known = lxxHits.get(id);
    if (known) return known;
    const set = new Set<number>();
    const match = greekMatcher(bridge, id);
    if (match) for (const [code, toks] of lxx) if (toks.some(match)) set.add(code);
    lxxHits.set(id, set);
    return set;
  };

  for (const t of terms) {
    const links = (bridge.b[t.id] ?? []).filter((x, i) => x[1] >= 15 || (i === 0 && x[1] >= 10));
    for (const code of await getConcordance(t.id)) add(code, t, "same", t.id);
    if (language === "Greek") {
      const inLxx = lxxFor(t.id);
      for (const code of inLxx) add(code, t, "lxx", t.id);
      for (const [h] of links) {
        for (const code of await getConcordance(h)) {
          const { book } = decode(code);
          if (SKIP_LXX.has(book)) add(code, t, "rendering", h);
          else if (!inLxx.has(code) && !inLxx.has(code + 1) && !inLxx.has(code - 1)) add(code, t, "possible", h);
          else add(code, t, inLxx.has(code) ? "lxx" : "rendering", h);
        }
      }
    } else {
      for (const [g, score] of links) {
        for (const code of await getConcordance(g)) add(code, t, "rendering", g);
        if (score >= 40) for (const code of lxxFor(g)) add(code, t, "rendering", g);
      }
    }
    const df = groupDf.get(t.group) ?? 0;
    groupDf.set(t.group, Math.max(df, t.df));
  }
  const weightOf = (g: number) => Math.log(1 + TOTAL_VERSES / Math.max(1, groupDf.get(g) ?? 1));
  const groupCodes = new Map<number, Set<number>>();
  for (const t of terms) {
    if (!groupCodes.has(t.group)) groupCodes.set(t.group, new Set());
    for (const c of t.codes) groupCodes.get(t.group)!.add(c);
  }

  // Cross-references and recorded quotations.
  const passage = await getPassage("BSB", reference);
  const allVerses = passage?.parts.flatMap((p) => p.verses) ?? [];
  const xrefs = new Map<number, { from: string; to: string; votes: number }[]>();
  for (const v of allVerses) {
    for (const x of await getCrossRefs(v.book, v.chapter, v.verse, bookName)) {
      if (codes.has(x.code) || x.votes < 2) continue;
      const d = decode(x.code);
      const key = d.book * 1000 + d.chapter;
      if (!xrefs.has(key)) xrefs.set(key, []);
      xrefs.get(key)!.push({ from: `${bookName(v.book)} ${v.chapter}:${v.verse}`, to: x.ref, votes: x.votes });
    }
  }
  const quotes = new Map<number, { ref: string; kind: string }[]>();
  const insights = await getInsights(reference);
  const addQuote = (ref: string, kind: string) => {
    const s = parseReference(ref)?.[0];
    if (!s) return;
    const key = s.book * 1000 + s.chapter;
    if (!quotes.has(key)) quotes.set(key, []);
    quotes.get(key)!.push({ ref, kind });
  };
  insights.quotes.forEach((q) => addQuote(q.ref, "Quotes it"));
  insights.quotedBy.forEach((q) => addQuote(q.ref, "Quoted here"));
  insights.parallels.forEach((q) => addQuote(q.ref, "Parallel wording"));
  insights.possibleAllusions.forEach((q) => addQuote(q.ref, "Possible allusion"));

  // Gather by chapter.
  const chapters = new Map<number, Map<number, Map<number, EchoHit>>>();
  for (const [code, v] of hits) {
    const d = decode(code);
    const key = d.book * 1000 + d.chapter;
    if (!chapters.has(key)) chapters.set(key, new Map());
    chapters.get(key)!.set(d.verse, v);
  }
  for (const key of [...xrefs.keys(), ...quotes.keys()]) if (!chapters.has(key)) chapters.set(key, new Map());
  const ownChapters = new Set([...codes].map((c) => { const d = decode(c); return d.book * 1000 + d.chapter; }));
  const WINDOW = 5;
  const scored: EchoResult[] = [];
  for (const [key, verses] of chapters) {
    if (ownChapters.has(key)) continue;
    const book = Math.floor(key / 1000), chapter = key % 1000;
    const order = [...verses.keys()].sort((a, b) => a - b);
    const firmGroupsIn = (from: number, to: number) => {
      const set = new Map<number, EchoHit>();
      for (const v of order) if (v >= from && v <= to) for (const [g, h] of verses.get(v)!) if (FIRM(h.how)) { const c = set.get(g); if (!c || HOW_RANK[h.how] < HOW_RANK[c.how]) set.set(g, h); }
      return set;
    };
    const sumOf = (set: Map<number, EchoHit>) => [...set.values()].reduce((a, h) => a + weightOf(h.group) * HOW_WEIGHT[h.how], 0);
    /** How many of these key words come from a single verse of the passage. */
    const fromOneVerse = (set: Map<number, EchoHit>) => {
      let top: { code: number; groups: number[] } | null = null;
      const counts = new Map<number, Set<number>>();
      for (const g of set.keys()) for (const c of groupCodes.get(g) ?? []) {
        if (!counts.has(c)) counts.set(c, new Set());
        counts.get(c)!.add(g);
      }
      for (const [c, gs] of counts) if (!top || gs.size > top.groups.length) top = { code: c, groups: [...gs] };
      return top;
    };
    let best = { from: order[0] ?? 0, to: order[0] ?? 0, set: new Map<number, EchoHit>(), sum: 0, rank: 0, one: null as ReturnType<typeof fromOneVerse> };
    for (const v of order) {
      const set = firmGroupsIn(v, v + WINDOW - 1);
      const sum = sumOf(set);
      const one = fromOneVerse(set);
      const oneSum = (one?.groups ?? []).reduce((a, g) => a + weightOf(g) * HOW_WEIGHT[set.get(g)!.how], 0);
      const rank = sum + ((one?.groups.length ?? 0) >= 2 ? (oneSum * oneSum) / 12 : 0);
      if (rank > best.rank) best = { from: v, to: Math.max(...order.filter((x) => x >= v && x <= v + WINDOW - 1 && [...verses.get(x)!.values()].some((h) => FIRM(h.how)))), set, sum, rank, one };
    }
    const whole = firmGroupsIn(0, 999);
    const spread = [...whole.values()].reduce((a, h) => a + weightOf(h.group) * HOW_WEIGHT[h.how], 0);
    const possibles = new Map<number, EchoHit>();
    for (const v of order) for (const [g, h] of verses.get(v)!) if (!FIRM(h.how) && !whole.has(g)) possibles.set(g, h);
    const xr = xrefs.get(key) ?? [];
    const qt = quotes.get(key) ?? [];
    const votes = xr.reduce((a, x) => a + x.votes, 0);
    const closeEnough = best.set.size >= 2;
    const wideEnough = whole.size >= 3;
    if (!closeEnough && !wideEnough && !xr.length && !qt.length) continue;
    const wording = best.set.size >= 3 || (best.set.size >= 2 && best.sum >= 9);
    const grade: EchoGrade = (xr.length || qt.length) && (wording || wideEnough) ? "both" : wording ? "wording" : xr.length || qt.length ? "crossref" : "spread";
    const wide = fromOneVerse(whole)?.groups.length ?? 0;
    const sameBook = book === allVerses[0]?.book ? 0.75 : 1;
    const score = (best.rank + spread * 0.25 + (wide >= 3 ? wide * 1.5 : 0) + Math.min(votes, 30) * 0.3 + Math.min(qt.length * 10, 60)) * sameBook;
    const oneVerse = best.one && best.one.groups.length >= 2 ? best.one : null;
    const oneRef = oneVerse ? decode(oneVerse.code) : null;
    scored.push({
      book, chapter, label: `${bookName(book)} ${chapter}`, score, grade,
      close: { from: best.from, to: best.to, groups: best.set.size, terms: [...best.set.values()].map((h) => h.term) },
      terms: [...whole.values()].map((h) => h.term),
      possible: [...possibles.values()].map((h) => h.term),
      verses: order.filter((v) => [...verses.get(v)!.values()].some((h) => FIRM(h.how))).map((v) => ({ ref: `${bookName(book)} ${chapter}:${v}`, code: encode(book, chapter, v), hits: [...verses.get(v)!.values()].filter((h) => FIRM(h.how)) })),
      xrefs: xr.sort((a, b) => b.votes - a.votes).slice(0, 6),
      quotes: qt,
      sameOrder: false,
      fromVerse: oneVerse && oneRef ? { ref: `${bookName(oneRef.book)} ${oneRef.chapter}:${oneRef.verse}`, count: oneVerse.groups.length, terms: oneVerse.groups.map((g) => best.set.get(g)?.term ?? "") } : null,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit);
  // A full match in the same order is striking, so it gets a mention. This checks the verse where the cluster sits.
  const srcOrder = await sourceOrder(allVerses, allTerms);
  for (const r of results.slice(0, 12)) r.sameOrder = await keepsOrder(r, srcOrder, lxx, bridge, allTerms);
  return { reference: passage?.reference ?? reference, terms: allTerms, results, language };
}

async function sourceOrder(verses: { book: number; chapter: number; verse: number }[], terms: EchoTerm[]): Promise<number[]> {
  const byId = new Map(terms.map((t) => [t.id, t.group]));
  const seen: number[] = [];
  for (const v of verses) for (const t of await getVerseWords(v.book, v.chapter, v.verse)) {
    const g = byId.get(normalizeStrongs(t[3]) ?? "");
    if (g !== undefined && !seen.includes(g)) seen.push(g);
  }
  return seen;
}

async function keepsOrder(r: EchoResult, src: number[], lxx: Map<number, string[]>, bridge: EchoBridge, terms: EchoTerm[]): Promise<boolean> {
  if (r.close.groups < 3) return false;
  const inWindow = r.verses.filter((v) => { const n = v.code % 1000; return n >= r.close.from && n <= r.close.to; });
  const seen: number[] = [];
  for (const v of inWindow) {
    const positions: [number, number][] = [];
    const toks = lxx.get(v.code);
    const tagged = await getVerseWords(r.book, r.chapter, v.code % 1000);
    for (const h of v.hits) {
      let at = tagged.findIndex((t: WordTuple) => normalizeStrongs(t[3]) === h.id);
      if (at < 0 && toks) {
        const ids = terms.filter((t) => t.group === h.group).map((t) => t.id);
        for (const id of ids) {
          const m = greekMatcher(bridge, id);
          const i = m ? toks.findIndex(m) : -1;
          if (i >= 0) { at = i; break; }
        }
      }
      if (at >= 0) positions.push([at, h.group]);
    }
    for (const [, g] of positions.sort((a, b) => a[0] - b[0])) if (!seen.includes(g)) seen.push(g);
  }
  if (seen.length < 3) return false;
  const idx = seen.map((g) => src.indexOf(g));
  return idx.every((x) => x >= 0) && idx.every((x, i) => i === 0 || idx[i - 1] < x);
}

// ---------- Side by side ----------
export interface CompareWord { text: string; on: boolean; gloss: string; id: string }
export interface CompareVerse { ref: string; english: string; words: CompareWord[]; greek: { text: string; on: boolean }[] | null; highlight: string[] }
/** Where the Greek Old Testament uses one word and the Hebrew another, as with "death" for "plague". */
export interface RenderingNote { ref: string; term: string; greek: string; hebrew: string; hebrewGloss: string; id: string }

/** The verses of a passage and an echo, with the shared words picked out. */
export async function echoCompare(reference: string, result: EchoResult, translation: TranslationId, off: string[] = []): Promise<{ source: CompareVerse[]; target: CompareVerse[]; shared: { term: string; source: string; target: string }[]; renderings: RenderingNote[] }> {
  const base = await echoTerms(reference);
  const bridge = await getBridge();
  const terms = (base?.terms ?? []).filter((t) => !off.includes(t.id));
  const matched = new Set(result.verses.flatMap((v) => v.hits.map((h) => h.group)));
  const live = terms.filter((t) => matched.has(t.group));
  const srcIds = new Set(live.map((t) => t.id));
  const tgtIds = new Set(result.verses.flatMap((v) => v.hits.map((h) => h.id)));
  // A Hebrew word lights up too if it's a usual match for one of the shared Greek words.
  const hebrewOf = new Map<string, EchoTerm>();
  for (const t of live) for (const [other, score] of bridge.b[t.id] ?? []) if (score >= 15) { tgtIds.add(other); if (other[0] === "H") hebrewOf.set(other, t); }
  const greekMatchers = [...new Set([...srcIds, ...tgtIds])].filter((i) => i[0] === "G").map((i) => greekMatcher(bridge, i)).filter(Boolean) as ((t: string) => boolean)[];
  const lxx = await lxxIndex();
  const build = async (book: number, chapter: number, verse: number, english: string, ids: Set<string>, withGreek: boolean): Promise<CompareVerse> => {
    const tagged = await getVerseWords(book, chapter, verse);
    const words: CompareWord[] = tagged.map((t) => { const id = normalizeStrongs(t[3]) ?? ""; return { text: t[0], gloss: cleanGloss(t[2]), id, on: ids.has(id) }; });
    const code = encode(book, chapter, verse);
    let greek: CompareVerse["greek"] = null;
    if (withGreek && lxx.has(code)) {
      const chapters = await lxxChapters(book, chapter);
      const text = chapters[0]?.verses.find(([n]) => n === verse)?.[1] ?? "";
      greek = text.replace(/¶/g, "").split(/\s+/).filter(Boolean).map((raw) => ({ text: raw, on: greekMatchers.some((m) => m(normGreek(raw))) }));
    }
    return { ref: `${bookName(book)} ${chapter}:${verse}`, english, words, greek, highlight: [...new Set(words.filter((w) => w.on && w.gloss).map((w) => w.gloss))] };
  };
  const srcPassage = await getPassage(translation, reference);
  const source: CompareVerse[] = [];
  for (const v of srcPassage?.parts.flatMap((p) => p.verses) ?? []) {
    const c = await build(v.book, v.chapter, v.verse, v.text, srcIds, false);
    if (c.words.some((w) => w.on)) source.push(c);
  }
  const target: CompareVerse[] = [];
  const within = result.verses.filter((v) => { const n = v.code % 1000; return n >= result.close.from && n <= result.close.to; });
  const list = (result.close.groups >= 2 ? within : result.verses).slice(0, 10);
  for (const v of list) {
    const d = decode(v.code);
    const text = (await getPassage(translation, v.ref))?.parts.flatMap((p) => p.verses)[0]?.text ?? "";
    target.push(await build(d.book, d.chapter, d.verse, text, tgtIds, d.book <= 39));
  }
  const renderings: RenderingNote[] = [];
  for (const c of target) {
    if (!c.greek) continue;
    for (const w of c.words) {
      const t = hebrewOf.get(w.id);
      if (!t || !w.on) continue;
      const m = greekMatcher(bridge, t.id);
      const g = m ? c.greek.find((x) => m(normGreek(x.text))) : undefined;
      if (!g) continue;
      // Only a real difference is worth a note: the two words' dictionary renderings share nothing.
      const e = await getLexEntry(w.id);
      const ge = await getLexEntry(t.id);
      const senses = (x: typeof e) => new Set(`${x?.k ?? ""} ${(x?.m ?? []).map((m) => m.g ?? "").join(" ")}`.toLowerCase().match(/[a-z]{4,}/g) ?? []);
      const he = senses(e), gr = senses(ge);
      if ([...he].some((x) => gr.has(x))) continue;
      const hebrewGloss = (e?.m?.[0]?.g || w.gloss).replace(/[<>]/g, "");
      renderings.push({ ref: c.ref, term: t.gloss, greek: g.text.replace(/[,.;:·]+$/, ""), hebrew: w.text.replace(/[,.;:׃־]+$/, ""), hebrewGloss, id: w.id });
    }
  }
  const shared = live.flatMap((t) => {
    const hit = result.verses.flatMap((v) => v.hits).find((h) => h.group === t.group);
    return hit ? [{ term: t.gloss || t.translit, source: `${t.word} (${t.id})`, target: hit.how === "lxx" ? "in the Septuagint" : hit.id }] : [];
  });
  return { source, target, shared, renderings };
}

/** A short summary of what was found, for the AI to start from. */
export function echoSummary(s: EchoSearch, n = 14): string {
  return JSON.stringify(s.results.slice(0, n).map((r) => ({
    chapter: r.label, grade: r.grade, closest: r.close.groups ? `vv. ${r.close.from}-${r.close.to}: ${r.close.terms.join(", ")}` : "", allShared: r.terms,
    crossReferences: r.xrefs.slice(0, 3).map((x) => `${x.from} to ${x.to}`), quotations: r.quotes.map((q) => `${q.kind}: ${q.ref}`),
  })));
}
