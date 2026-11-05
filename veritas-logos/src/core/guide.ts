import { getPassage, isTranslationId, DEFAULT_TRANSLATION, translationInfo, type TranslationId, type VerseLine, getVerse, decodeVerseCode } from "./bible";
import { getBookMeta, getTopic, LENS_IDS, searchTopics, type LensId, type TopicItem } from "./content";
import { getCrossRefs, getLexEntry, getLexIndex, getVerseWords, normalizeStrongs, type LexIndexRow } from "./lexicon";
import { BOOKS, bookName, formatSegment, parseReference, type RefSegment } from "./references";
import { searchText } from "./bible";
import { getInsights, type PassageInsights } from "./insights";
import { excerptsForPassage, varied, writingsCredit } from "./writings";

export type GuideFormat = "inductive" | "exegetical" | "smallgroup" | "teaching";
export const GUIDE_FORMATS: { id: GuideFormat; name: string; blurb: string }[] = [
  { id: "inductive", name: "Inductive study", blurb: "Observe, interpret, apply. Good for personal study." },
  { id: "exegetical", name: "Deep exegesis", blurb: "Original words, structure and context, with more detail." },
  { id: "smallgroup", name: "Small group", blurb: "Discussion questions, different views, leader notes and prayer." },
  { id: "teaching", name: "Teaching outline", blurb: "Main idea, outline, illustrations and a handout." },
];
export const isGuideFormat = (v: unknown): v is GuideFormat => GUIDE_FORMATS.some((f) => f.id === v);

/** Who wrote a section. Shown in the app and in exports so readers can weigh it. */
export type Origin = "assembled" | "ai" | "you";
export const ORIGIN_LABEL: Record<Origin, string> = {
  assembled: "From cited sources",
  ai: "AI draft: check before relying on it",
  you: "Your writing",
};

export type SectionKind = "text" | "passage" | "questions" | "words" | "crossrefs" | "people" | "views" | "structure";

export interface SectionItem {
  /** Short label, such as a Greek word or a tradition's name. */
  label?: string;
  text: string;
  /** A Scripture reference to quote from the reader's chosen translation. */
  ref?: string;
  wordId?: string;
  personId?: string;
  /** Indent level for structure outlines. */
  level?: number;
}
export interface GuideSection {
  id: string;
  kind: SectionKind;
  heading: string;
  origin: Origin;
  body?: string;
  ref?: string;
  items?: SectionItem[];
}
export interface Guide {
  id: string;
  title: string;
  subtitle?: string;
  format: GuideFormat;
  lens: LensId;
  translation: TranslationId;
  /** What the guide was built from, as typed. */
  source?: string;
  createdAt: string;
  updatedAt: string;
  sections: GuideSection[];
}

export interface GenerateOptions {
  input: string;
  format?: GuideFormat;
  lens?: LensId;
  translation?: TranslationId;
  title?: string;
  includeWords?: boolean;
  includeCrossRefs?: boolean;
  includeViews?: boolean;
  /** Optional hook used to list the people named in a passage. */
  peopleFor?: (reference: string) => Promise<{ id: string; name: string; title: string }[]>;
}

export class GuideInputError extends Error {}

let counter = 0;
export const newId = (prefix = "s") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

// ---------- Choosing the passages ----------

export interface ResolvedInput {
  kind: "reference" | "book" | "topic" | "phrase";
  refs: string[];
  label: string;
  topicSlug?: string;
}

const verseSpan = (seg: RefSegment) =>
  seg.verseStart === undefined ? 30 * (seg.chapterEnd - seg.chapter + 1) : seg.chapterEnd !== seg.chapter ? 40 : (seg.verseEnd ?? seg.verseStart) - seg.verseStart + 1;

async function rankTopicRefs(items: TopicItem[], max: number): Promise<string[]> {
  const scored: { ref: string; score: number; book: number; span: number }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const ref of item.r ?? []) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const segs = parseReference(ref);
      if (!segs?.length) continue;
      const seg = segs[0];
      if (seg.verseStart === undefined) continue; // skip whole chapters when choosing key passages
      const span = segs.reduce((a, s) => a + verseSpan(s), 0);
      if (span > 16) continue;
      const xr = await getCrossRefs(seg.book, seg.chapter, seg.verseStart, bookName);
      const votes = xr.reduce((a, x) => a + x.votes, 0);
      // Well-connected passages rank first, with a small lift for passages of a usable length.
      scored.push({ ref: segs.map((s, i) => formatSegment(s, i === 0)).join(", "), score: votes * (span >= 3 ? 1.5 : 1), book: seg.book, span });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const out: string[] = [];
  const books = new Set<number>();
  for (const s of scored) {
    if (out.length >= max) break;
    if (books.has(s.book)) continue;
    books.add(s.book);
    out.push(s.ref);
  }
  return out;
}

/** Works out what the person typed: a reference, a book, a topic, or words to search for. */
export async function resolveInput(input: string, translation: TranslationId, maxPassages = 4): Promise<ResolvedInput> {
  const text = input.trim();
  if (!text) throw new GuideInputError("Enter a passage or topic, such as Matthew 18:21-35 or forgiveness.");
  const segs = parseReference(text);
  if (segs) {
    const passage = await getPassage(translation, text);
    if (!passage) throw new GuideInputError(`${text} isn't in the Bible text. Check the chapter and verse numbers.`);
    return { kind: "reference", refs: passage.parts.map((p) => p.label), label: passage.reference };
  }
  const lower = text.toLowerCase();
  const book = BOOKS.find((b) => b.name.toLowerCase() === lower || b.aliases.includes(lower));
  if (book) return { kind: "book", refs: [`${book.name} 1`], label: book.name };
  const topics = await searchTopics(text, 1);
  if (topics[0]) {
    const topic = await getTopic(topics[0][0]);
    if (topic) {
      const refs = await rankTopicRefs(topic.items, maxPassages);
      if (refs.length) return { kind: "topic", refs, label: topic.name, topicSlug: topic.slug };
    }
  }
  const { hits } = await searchText(translation, text, { limit: 400 });
  if (hits.length) {
    const scored = await Promise.all(
      hits.slice(0, 200).map(async (h) => ({ h, v: (await getCrossRefs(h.book, h.chapter, h.verse, bookName)).reduce((a, x) => a + x.votes, 0) })),
    );
    scored.sort((a, b) => b.v - a.v);
    const out: string[] = [];
    const books = new Set<number>();
    for (const { h } of scored) {
      if (out.length >= maxPassages) break;
      if (books.has(h.book)) continue;
      books.add(h.book);
      out.push(h.ref);
    }
    return { kind: "phrase", refs: out, label: text };
  }
  throw new GuideInputError(`No topic or verse matches "${text}". Try a passage, or a simpler word.`);
}

// ---------- Key words ----------

const SKIP_GREEK = /^(T-|CONJ|PREP|PRT|COND|P-|R-|D-|F-|S-|X-|I-|K-|Q-|C-|INJ)/;
const isContentWord = (morph: string, id: string, gloss: string) => {
  if (!id || /^H9\d{3}/.test(id)) return false;
  if (gloss.startsWith("<")) return false;
  if (id[0] === "G") return !SKIP_GREEK.test(morph);
  const last = morph.slice(1).split(/[\/\\]/).find((p) => /^[VN]|^A/.test(p));
  return Boolean(last);
};

export interface KeyWord {
  id: string;
  lemma: string;
  translit: string;
  gloss: string;
  occurrences: number;
  inPassage: number;
  definition: string;
  sample: string[];
}

/** The most distinctive content words in a passage: frequent here, rarer elsewhere. */
export async function pickKeyWords(refs: string[], max = 5): Promise<KeyWord[]> {
  const counts = new Map<string, { n: number; first: string; proper: boolean }>();
  for (const ref of refs) {
    for (const seg of parseReference(ref) ?? []) {
      const from = seg.chapter;
      for (let c = from; c <= seg.chapterEnd; c++) {
        for (let v = c === seg.chapter && seg.verseStart ? seg.verseStart : 1; v <= (c === seg.chapterEnd && seg.verseStart ? seg.verseEnd ?? seg.verseStart : 176); v++) {
          const words = await getVerseWords(seg.book, c, v);
          if (!words.length && !seg.verseStart) break;
          for (const w of words) {
            const id = normalizeStrongs(w[3]);
            if (!id || !isContentWord(w[4], id, w[2])) continue;
            const proper = /N-[A-Z]+-[PTLOG]$/.test(w[4]) || /Np/.test(w[4]);
            const e = counts.get(id) ?? { n: 0, first: `${bookName(seg.book)} ${c}:${v}`, proper };
            e.n++;
            counts.set(id, e);
          }
        }
      }
    }
  }
  const index = await getLexIndex();
  const byId = new Map<string, LexIndexRow>(index.map((r) => [r[0], r]));
  const ranked = [...counts.entries()]
    .map(([id, e]) => {
      const total = Math.max(byId.get(id)?.[4] ?? 1, 1);
      const rarity = Math.log(1 + 8000 / total);
      return { id, e, total, score: e.n * rarity * (e.proper ? 0.35 : 1) };
    })
    .filter((x) => x.total >= 2 && x.total <= 1500)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);

  const out: KeyWord[] = [];
  for (const { id, e, total } of ranked) {
    const lex = await getLexEntry(id);
    const row = byId.get(id);
    out.push({
      id,
      lemma: lex?.l ?? row?.[1] ?? "",
      translit: lex?.x ?? row?.[2] ?? "",
      gloss: row?.[3] ?? "",
      occurrences: total,
      inPassage: e.n,
      definition: (lex?.s ?? "").trim(),
      sample: [e.first],
    });
  }
  return out;
}

// ---------- Generator ----------

const sec = (kind: SectionKind, heading: string, origin: Origin, extra: Partial<GuideSection> = {}): GuideSection => ({ id: newId(), kind, heading, origin, ...extra });

const ORD = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n.toLocaleString("en-US")} times`);

const LENS_NAMES: Record<LensId, string> = {
  all: "All traditions",
  reformed: "Reformed",
  arminian: "Arminian / Wesleyan",
  catholic: "Catholic",
  orthodox: "Eastern Orthodox",
  lutheran: "Lutheran",
  anglican: "Anglican",
  baptist: "Baptist",
  pentecostal: "Pentecostal / Charismatic",
  messianic: "Messianic",
  dispensational: "Dispensational",
};
export const lensName = (l: LensId) => LENS_NAMES[l];

/** Questions only. The app holds no written account of any tradition's position. */
function viewPrompts(label: string, lens: LensId): GuideSection {
  const ids: LensId[] = lens === "all" ? LENS_IDS.filter((l) => l !== "all") : [lens];
  return sec("views", `Reading ${label} across traditions`, "you", {
    body: "Questions to take to each tradition's own teachers and writings, or to the AI assistant. Add what you find here.",
    items: ids.map((l) => ({ label: LENS_NAMES[l], text: `How do ${LENS_NAMES[l]} teachers read ${label}, and which doctrines do they connect it to?` })),
  });
}

function questionsFor(format: GuideFormat, label: string, words: KeyWord[], crossRefs: string[]) {
  const w0 = words[0];
  const w1 = words[1];
  const x0 = crossRefs[0];
  const observe = [
    `Read ${label} twice. Who is speaking or acting, and who is being addressed?`,
    "What words, ideas or commands repeat? Where does the passage turn or change direction?",
    w0 ? `Where does "${w0.gloss}" (${w0.translit}) appear in this passage, and what is happening around it?` : "What is the most surprising detail in the passage?",
    "What comes just before and just after this passage? How does that shape what you see?",
  ];
  const interpret = [
    `What is the main point of ${label} in its setting?`,
    w0 ? `${w0.translit} occurs ${ORD(w0.occurrences)} in Scripture. Open the word study. What does its range of meaning add here?` : "Which word in this passage would be most worth studying further?",
    x0 ? `Read ${x0} alongside this passage. What does it confirm, deepen or complicate?` : "Which other passages does this one bring to mind, and why?",
    "What would the first readers have understood that a modern reader might miss?",
  ];
  const apply = [
    "What does this passage show about God's character and purposes?",
    w1 ? `What would it look like this week to take "${w1.gloss}" seriously in a specific relationship or decision?` : "What is one specific response this passage calls for this week?",
    "Is there a belief to change, a practice to begin, or something to confess or give thanks for?",
  ];
  if (format === "smallgroup")
    return { open: `Before reading: when has someone's words or actions changed how you saw a situation like the one in ${label}?`, observe: observe.slice(0, 2), interpret: interpret.slice(0, 3), apply };
  return { open: "", observe, interpret, apply };
}

/** A short sampler of historic writers on the passage: one excerpt each, earliest first, with its edition named. */
async function writersSection(refs: string[]): Promise<GuideSection | null> {
  const lists = await Promise.all(refs.slice(0, 3).map((r) => excerptsForPassage(r)));
  const picks = varied(lists.flat().sort((a, b) => (a.writer.year ?? 9999) - (b.writer.year ?? 9999)), 5).filter((e) => !e.cites);
  if (!picks.length) return null;
  return sec("views", "What historic writers said", "assembled", {
    body: "Excerpts from public-domain editions, earliest first. Open the Writers page for this passage to see more and to choose your own.",
    items: picks.map((e) => ({ label: `${e.writer.name}, ${e.title} (on ${e.reference}). ${e.source}`, text: e.text.length > 700 ? `${e.text.slice(0, 700).replace(/\s+\S*$/, "")} …` : e.text })),
  });
}

function insightSections(all: PassageInsights[]) {
  const uniq = <T extends { ref: string }>(list: T[]) => list.filter((x, i, a) => a.findIndex((y) => y.ref === x.ref) === i);
  const linkItems: SectionItem[] = [
    ...uniq(all.flatMap((i) => i.quotes)).slice(0, 6).map((q) => ({ label: "Quotes", ref: q.ref, text: "" })),
    ...uniq(all.flatMap((i) => i.quotedBy)).slice(0, 8).map((q) => ({ label: "Quoted in", ref: q.ref, text: "" })),
    ...uniq(all.flatMap((i) => i.parallels)).slice(0, 4).map((q) => ({ label: "Parallel wording", ref: q.ref, text: "" })),
  ];
  const linksSec = linkItems.length
    ? sec("crossrefs", "Quoted and referenced", "assembled", { body: "Found by matching the wording of cross-referenced verses across several translations.", items: linkItems })
    : null;
  const confessions = all.flatMap((i) => i.confessions).filter((c, i, arr) => arr.findIndex((x) => x.doc === c.doc && x.label === c.label) === i).slice(0, 6);
  const confessionSec = confessions.length
    ? sec("views", "Cited in historic confessions", "assembled", {
        body: "Proof texts listed by the authors of these Reformed and Baptist documents. Other traditions aren't covered by this data.",
        items: confessions.map((c) => ({ label: `${c.docName} (${c.year}) ${c.label}`, text: c.text })),
      })
    : null;
  const topics = all.flatMap((i) => i.topics).filter((t, i, arr) => arr.findIndex((x) => x.slug === t.slug) === i).slice(0, 10);
  const topicSec = topics.length
    ? sec("text", "Topics citing this passage", "assembled", { body: `From Nave's Topical Bible: ${topics.map((t) => t.name).join(", ")}.` })
    : null;
  return { linksSec, confessionSec, topicSec };
}

/** Builds a complete, editable guide from a passage or topic. Only real verses are ever cited. */
export async function generateGuide(opts: GenerateOptions): Promise<Guide> {
  const format = opts.format ?? "inductive";
  const lens = opts.lens ?? "all";
  const translation = opts.translation ?? DEFAULT_TRANSLATION;
  const resolved = await resolveInput(opts.input, translation);
  const { refs, label } = resolved;
  const incWords = opts.includeWords !== false;
  const incX = opts.includeCrossRefs !== false;
  const incViews = opts.includeViews !== false;
  const firstSeg = parseReference(refs[0])![0];
  const meta = await getBookMeta(firstSeg.book);
  const sections: GuideSection[] = [];

  const words = incWords ? await pickKeyWords(refs, format === "exegetical" ? 6 : format === "teaching" ? 4 : 3) : [];

  // Cross-references, strongest first, excluding verses already inside the passage.
  const xScores = new Map<string, number>();
  for (const ref of refs) {
    for (const seg of parseReference(ref) ?? []) {
      const start = seg.verseStart ?? 1;
      const end = seg.verseStart ? (seg.chapterEnd === seg.chapter ? seg.verseEnd ?? start : start + 12) : 12;
      for (let v = start; v <= end; v++) {
        for (const x of await getCrossRefs(seg.book, seg.chapter, v, bookName)) {
          const d = decodeVerseCode(x.code);
          const inside = (parseReference(refs.join("; ")) ?? []).some(
            (s) => s.book === d.book && d.chapter >= s.chapter && d.chapter <= s.chapterEnd && (s.verseStart === undefined || (d.verse >= s.verseStart && d.verse <= (s.verseEnd ?? s.verseStart))),
          );
          if (!inside) xScores.set(x.ref, (xScores.get(x.ref) ?? 0) + x.votes);
        }
      }
    }
  }
  const xList = [...xScores.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const xCount = format === "exegetical" ? 8 : format === "smallgroup" ? 4 : 5;
  const crossRefs = xList.slice(0, xCount);

  const q = questionsFor(format, label, words, crossRefs);
  const passagesSec = refs.map((ref) => sec("passage", ref, "assembled", { ref }));

  const overviewItems: SectionItem[] = [];
  if (resolved.kind === "topic") overviewItems.push({ label: "How these passages were chosen", text: `From the "${label}" entry in Nave's Topical Bible, favoring passages with the most cross-references. Swap in others as you like.` });
  if (resolved.kind === "phrase") overviewItems.push({ label: "How these passages were chosen", text: `Verses containing "${label}" with the most cross-references.` });
  if (resolved.kind === "book") overviewItems.push({ label: "Starting point", text: `This guide starts with ${refs[0]}. Add more chapters of ${label} as you go.` });
  if (meta && resolved.kind !== "topic" && resolved.kind !== "phrase") {
    const names = [meta.hebrew && `Hebrew name ${meta.hebrew} (${meta.hebrewTranslit}${meta.hebrewMeaning ? `, "${meta.hebrewMeaning}"` : ""})`, meta.greek && `Greek name ${meta.greek} (${meta.greekTranslit}${meta.greekMeaning ? `, "${meta.greekMeaning}"` : ""})`].filter(Boolean).join(". ");
    overviewItems.push({ label: "Book", text: `${meta.name}, ${meta.testament}, ${meta.chapters} chapters.${names ? ` ${names}.` : ""}` });
  }
  const overview = overviewItems.length ? sec("text", "Overview", "assembled", { items: overviewItems }) : null;

  const wordsSec = words.length
    ? sec("words", "Key words", "assembled", {
        body: "Chosen automatically because they are frequent in this passage and rarer elsewhere. Definitions are from Strong's dictionary.",
        items: words.map((w) => ({ label: `${w.lemma} (${w.translit})`, wordId: w.id, text: `${w.id}: "${w.gloss}". Occurs ${ORD(w.occurrences)} in Scripture. ${w.definition}`.trim() })),
      })
    : null;
  const xSec = incX && crossRefs.length
    ? sec("crossrefs", "Related passages", "assembled", {
        body: "From the Open Bible cross-reference data, strongest connections first.",
        items: crossRefs.map((ref) => ({ ref, text: "" })),
      })
    : null;
  const people = opts.peopleFor ? (await Promise.all(refs.map((r) => opts.peopleFor!(r)))).flat() : [];
  const uniquePeople = people.filter((p, i) => people.findIndex((x) => x.id === p.id) === i).slice(0, 6);
  const peopleSec = uniquePeople.length
    ? sec("people", "People in this passage", "assembled", {
        body: "From the BibleData index of people named in each verse. Open a person to see their family line.",
        items: uniquePeople.map((p) => ({ label: p.name, personId: p.id, text: p.title })),
      })
    : null;
  const viewsSec = incViews ? viewPrompts(label, lens) : null;
  const add = (...list: (GuideSection | null)[]) => list.forEach((s) => s && sections.push(s));
  const insights: PassageInsights[] = [];
  for (const ref of refs) insights.push(await getInsights(ref));
  const { linksSec, confessionSec, topicSec } = insightSections(insights);
  const askAi = sec("text", "Background to research", "you", { body: "Who wrote this, to whom, and in what situation? How would first hearers have understood it? Which idioms or customs might a modern reader miss? Use a commentary, or the Draft with AI button, and record what you find here." });
  const qs = (heading: string, list: string[], extra: Partial<GuideSection> = {}) => sec("questions", heading, "assembled", { items: list.map((text) => ({ text })), ...extra });
  const blank = (heading: string, body: string) => sec("text", heading, "you", { body });

  if (format === "inductive") {
    add(overview, ...passagesSec, qs("Observe: what does it say?", q.observe), wordsSec, peopleSec, askAi);
    add(qs("Interpret: what does it mean?", q.interpret), linksSec, xSec, topicSec, confessionSec, viewsSec);
    add(qs("Apply: how should I respond?", q.apply), blank("My notes", "Write what stood out to you here."));
  } else if (format === "exegetical") {
    add(overview, ...passagesSec, askAi, wordsSec, linksSec, xSec, peopleSec);
    add(qs("Questions for the text", [...q.observe.slice(1), ...q.interpret]), topicSec, confessionSec, viewsSec);
    add(qs("Application", q.apply), blank("My exegetical notes", "Record your translation decisions and open questions here."));
  } else if (format === "smallgroup") {
    add(qs("Opening question", [q.open]), ...passagesSec, qs("Discuss", [...q.observe, ...q.interpret]));
    add(askAi, confessionSec, viewsSec, qs("Respond", q.apply));
    add(blank("Prayer", "Close by praying through what the group has seen in the passage. Add requests here."));
    add(wordsSec && { ...wordsSec, heading: "Leader notes: key words" }, linksSec, xSec && { ...xSec, heading: "Leader notes: related passages" }, topicSec, peopleSec, overview);
  } else {
    add(blank("Main idea", `In one sentence, what is the point of ${label}? Write it here once you have studied the passage.`), overview, ...passagesSec);
    add(askAi, wordsSec);
    add(blank("Outline", `Divide ${label} into two to four movements and name each one in a full sentence.`), linksSec, xSec, topicSec, peopleSec);
    add(confessionSec, viewsSec);
    add(blank("Illustrations", "Add a story or image for each movement."), qs("Handout questions", [...q.interpret.slice(0, 2), ...q.apply]));
  }

  const now = new Date().toISOString();
  const fmt = GUIDE_FORMATS.find((f) => f.id === format)!;
  return {
    id: newId("g"),
    title: opts.title?.trim() || label,
    subtitle: `${fmt.name} · ${LENS_NAMES[lens]}`,
    format,
    lens,
    translation,
    source: opts.input.trim(),
    createdAt: now,
    updatedAt: now,
    sections,
  };
}

// ---------- Validation (guides arrive from links, files and the API) ----------

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const KINDS: SectionKind[] = ["text", "passage", "questions", "words", "crossrefs", "people", "views", "structure"];

/** Rebuilds a guide field by field so nothing unexpected from outside survives. Returns null if it isn't a guide. */
export function sanitizeGuide(raw: unknown): Guide | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (!Array.isArray(g.sections)) return null;
  const sections: GuideSection[] = [];
  for (const s of g.sections.slice(0, 200)) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    // Sections built from the removed study notes and curated notes aren't kept, even in older saved guides.
    if (o.origin === "veritas" || o.origin === "curated") continue;
    const items = Array.isArray(o.items)
      ? o.items.slice(0, 200).flatMap((it): SectionItem[] => {
          if (!it || typeof it !== "object") return [];
          const i = it as Record<string, unknown>;
          const item: SectionItem = { text: str(i.text, 20000) ?? "" };
          if (str(i.label, 300)) item.label = str(i.label, 300);
          if (str(i.ref, 200)) item.ref = str(i.ref, 200);
          if (str(i.wordId, 12) && normalizeStrongs(String(i.wordId))) item.wordId = normalizeStrongs(String(i.wordId))!;
          if (str(i.personId, 60)) item.personId = str(i.personId, 60);
          if (typeof i.level === "number") item.level = Math.max(0, Math.min(6, Math.floor(i.level)));
          return [item];
        })
      : undefined;
    const section: GuideSection = {
      id: str(o.id, 40) || newId(),
      kind: KINDS.includes(o.kind as SectionKind) ? (o.kind as SectionKind) : "text",
      heading: str(o.heading, 300) ?? "",
      origin: o.origin === "assembled" || o.origin === "ai" ? o.origin : "you",
    };
    if (str(o.body, 50000) !== undefined) section.body = str(o.body, 50000);
    if (str(o.ref, 200)) section.ref = str(o.ref, 200);
    if (items) section.items = items;
    sections.push(section);
  }
  const now = new Date().toISOString();
  return {
    id: str(g.id, 40) || newId("g"),
    title: str(g.title, 300) || "Untitled study",
    subtitle: str(g.subtitle, 300),
    format: isGuideFormat(g.format) ? g.format : "inductive",
    lens: LENS_IDS.includes(g.lens as LensId) ? (g.lens as LensId) : "all",
    translation: isTranslationId(g.translation) ? g.translation : DEFAULT_TRANSLATION,
    source: str(g.source, 300),
    createdAt: str(g.createdAt, 40) || now,
    updatedAt: str(g.updatedAt, 40) || now,
    sections,
  };
}

// ---------- Exports ----------

export interface ResolvedSection extends Omit<GuideSection, "items"> {
  verses?: VerseLine[];
  items?: (SectionItem & { quote?: string })[];
}
export interface ResolvedGuide extends Omit<Guide, "sections"> {
  sections: ResolvedSection[];
  notice: string;
}

const DATA_CREDIT =
  `Hebrew and Greek data from STEP Bible (Tyndale House, CC BY 4.0). Strong's dictionaries via Open Scriptures (CC BY-SA). Cross-references from OpenBible.info (CC BY). Topics from Nave's Topical Bible. People from BibleData (CC BY 4.0). ${writingsCredit}`;

/** Fills in the verse text from the guide's translation. */
export async function resolveGuide(guide: Guide): Promise<ResolvedGuide> {
  const sections: ResolvedSection[] = [];
  for (const s of guide.sections) {
    const r: ResolvedSection = { ...s, items: undefined };
    if (s.ref) {
      const p = await getPassage(guide.translation, s.ref);
      r.verses = p ? p.parts.flatMap((part) => part.verses) : [];
    }
    if (s.items) {
      r.items = await Promise.all(
        s.items.map(async (it) => {
          if (!it.ref) return it;
          const p = await getPassage(guide.translation, it.ref);
          return { ...it, quote: p ? p.parts.flatMap((part) => part.verses.map((v) => v.text)).join(" ") : "" };
        }),
      );
    }
    sections.push(r);
  }
  return { ...guide, sections, notice: translationInfo(guide.translation).notice };
}

const versesPlain = (verses: VerseLine[]) => verses.map((v) => `${v.verse} ${v.text || "(not in this translation)"}`).join(" ");
const originNote = (o: Origin) => (o === "you" ? "" : ORIGIN_LABEL[o]);

export function guideToMarkdown(g: ResolvedGuide): string {
  const out: string[] = [`# ${g.title}`];
  if (g.subtitle) out.push(`*${g.subtitle}*`);
  for (const s of g.sections) {
    out.push(`\n## ${s.heading}`);
    if (originNote(s.origin)) out.push(`*${originNote(s.origin)}*`);
    if (s.body) out.push(s.body);
    if (s.verses) out.push(`> ${versesPlain(s.verses)}\n>\n> ${s.ref} (${g.translation})`);
    if (s.items) {
      out.push(
        s.items
          .map((it, i) => {
            const lead = s.kind === "questions" ? `${i + 1}. ` : `${"  ".repeat(it.level ?? 0)}- `;
            const label = it.label ? `**${it.label}:** ` : "";
            const ref = it.ref ? `**${it.ref}**${it.quote ? `: ${it.quote}` : ""}` : "";
            return `${lead}${label}${ref}${it.text}`;
          })
          .join("\n"),
      );
    }
  }
  out.push(`\n---\n${g.notice}\n\n${DATA_CREDIT}`);
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export function guideToText(g: ResolvedGuide): string {
  const out: string[] = [g.title.toUpperCase()];
  if (g.subtitle) out.push(g.subtitle);
  for (const s of g.sections) {
    out.push(`\n${s.heading.toUpperCase()}`);
    if (originNote(s.origin)) out.push(`[${originNote(s.origin)}]`);
    if (s.body) out.push(s.body);
    if (s.verses) out.push(`${versesPlain(s.verses)}\n(${s.ref}, ${g.translation})`);
    for (const [i, it] of (s.items ?? []).entries()) {
      const lead = s.kind === "questions" ? `${i + 1}. ` : `${"  ".repeat(it.level ?? 0)}- `;
      out.push(`${lead}${it.label ? `${it.label}: ` : ""}${it.ref ? `${it.ref}${it.quote ? `: ${it.quote}` : ""}` : ""}${it.text}`);
    }
  }
  out.push(`\n${g.notice}\n${DATA_CREDIT}`);
  return out.join("\n") + "\n";
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function guideBodyHtml(g: ResolvedGuide): string {
  const e = escapeHtml;
  const parts: string[] = [`<h1>${e(g.title)}</h1>`];
  if (g.subtitle) parts.push(`<p class="sub">${e(g.subtitle)}</p>`);
  for (const s of g.sections) {
    parts.push(`<section><h2>${e(s.heading)}</h2>`);
    if (originNote(s.origin)) parts.push(`<p class="origin">${e(originNote(s.origin))}</p>`);
    if (s.body) parts.push(...s.body.split(/\n{2,}/).map((p) => `<p>${e(p).replace(/\n/g, "<br>")}</p>`));
    if (s.verses) parts.push(`<blockquote>${s.verses.map((v) => `<sup>${v.verse}</sup> ${e(v.text || "(not in this translation)")}`).join(" ")}<cite>${e(s.ref ?? "")} (${g.translation})</cite></blockquote>`);
    if (s.items?.length) {
      const tag = s.kind === "questions" ? "ol" : "ul";
      parts.push(
        `<${tag}>${s.items
          .map((it) => {
            const label = it.label ? `<strong>${e(it.label)}:</strong> ` : "";
            const ref = it.ref ? `<strong>${e(it.ref)}</strong>${it.quote ? `: ${e(it.quote)}` : ""}` : "";
            return `<li style="margin-left:${(it.level ?? 0) * 18}px">${label}${ref}${e(it.text)}</li>`;
          })
          .join("")}</${tag}>`,
      );
    }
    parts.push("</section>");
  }
  parts.push(`<footer><p>${e(g.notice)}</p><p>${e(DATA_CREDIT)}</p></footer>`);
  return parts.join("\n");
}

const DOC_CSS = `body{font-family:Georgia,'Times New Roman',serif;max-width:44rem;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1c1917}h1{font-size:1.9rem;margin:0 0 .25rem}h2{font-size:1.2rem;margin:1.8rem 0 .4rem}.sub{color:#57534e;margin:0 0 1rem}.origin{font-size:.8rem;color:#78716c;margin:0 0 .5rem}blockquote{margin:.75rem 0;padding:.25rem 0 .25rem 1rem;border-left:3px solid #b45309}cite{display:block;font-style:normal;font-size:.85rem;color:#57534e;margin-top:.4rem}sup{color:#b45309;font-size:.7em}footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid #d6d3d1;font-size:.8rem;color:#57534e}`;

export const guideToHtml = (g: ResolvedGuide) =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(g.title)}</title><style>${DOC_CSS}</style></head><body>${guideBodyHtml(g)}</body></html>`;

/** Word opens this HTML flavor as a normal editable document. */
export const guideToWord = (g: ResolvedGuide) =>
  `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHtml(g.title)}</title><style>${DOC_CSS}</style></head><body>${guideBodyHtml(g)}</body></html>`;

export const quickVerse = async (t: TranslationId, code: number) => {
  const d = decodeVerseCode(code);
  return getVerse(t, d.book, d.chapter, d.verse);
};

/** A new empty guide for building by hand. */
export function blankGuide(title: string, format: GuideFormat, lens: LensId, translation: TranslationId): Guide {
  const now = new Date().toISOString();
  return { id: newId("g"), title: title.trim() || "Untitled study", format, lens, translation, createdAt: now, updatedAt: now, sections: [], subtitle: `${GUIDE_FORMATS.find((f) => f.id === format)?.name} · ${LENS_NAMES[lens]}` };
}
