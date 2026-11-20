/**
 * Research mode for the AI assistant. The model must tie every claim to something in this app, and each tie is then
 * checked against the data itself. A claim that can't be checked is shown as unsupported instead of being dropped or hidden.
 */
import { getPassage, type TranslationId } from "./bible";
import { getGlossary, termById } from "./glossary";
import { getLexEntry, normalizeStrongs } from "./lexicon";
import { parseReference } from "./references";
import { creedText, getChurchEvents, getCreed, getCreedIndex, getJosephus, lookupDictionary } from "./scholar";
import { excerptByLocator, excerptsForPassage } from "./writings";

export const RESEARCH_RULES = `Answer in research mode. Reply with only one JSON object, in this shape:
{"summary":"one or two plain sentences","claims":[{"text":"one claim","sources":[{"type":"scripture","ref":"John 1:1"},{"type":"writer","excerpt":"locator returned by historic_writers","writer":"Augustine of Hippo","ref":"John 1:1","quote":"exact words"},{"type":"lexicon","id":"G26","quote":"exact lexicon wording"},{"type":"creed","doc":"westminster-confession","quote":"exact words"},{"type":"term","term":"Justification","quote":"exact words"},{"type":"event","event":"nicaea-1"},{"type":"dictionary","name":"Pharisees","quote":"exact words"},{"type":"josephus","quote":"exact words"}]}],"gaps":["what the app's sources don't settle"]}
Rules:
- Every claim needs at least one source from your tools. Don't cite anything you haven't looked up in this session.
- Copy quote wording exactly from a tool result. Use at least six words except for lexicon entries, where an entire brief gloss, lemma, or a definition excerpt may be shorter.
- Use historic_writers and word_study for questions about writers or original-language words. Copy the excerpt locator or Strong's id these tools return.
- "ref" is the passage the excerpt is filed under, as the tool gave it. "doc" and "event" are the ids the tools give.
- Keep the summary to a restatement of the cited claims.
- If the app's sources don't support something you would otherwise say, put it in "gaps" and don't state it as a claim.
- Keep claims short and separate. Report what the sources say, name the tradition, and don't declare a winner.`;

export type ResearchSource =
  | { type: "scripture"; ref: string }
  | { type: "writer"; excerpt?: string; writer: string; ref: string; quote: string }
  | { type: "lexicon"; id: string; quote: string }
  | { type: "creed"; doc: string; quote: string }
  | { type: "term"; term: string; quote: string }
  | { type: "event"; event: string }
  | { type: "dictionary"; name: string; quote: string }
  | { type: "josephus"; quote: string };
export interface CheckedSource { source: ResearchSource; ok: boolean; why: string; label: string; hash?: string; detail?: string }
export interface CheckedClaim { text: string; sources: CheckedSource[]; supported: boolean }
export interface ResearchAnswer { summary: string; claims: CheckedClaim[]; gaps: string[] }

const squash = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9Ͱ-Ͽ֐-׿]+/g, " ").trim();
const holds = (hay: string, quote: string) => {
  const q = squash(quote);
  return q.split(" ").length >= 6 && squash(hay).includes(q);
};

async function checkOne(s: ResearchSource, translation: TranslationId): Promise<CheckedSource> {
  try {
    if (s.type === "scripture") {
      const p = parseReference(s.ref) ? await getPassage(translation, s.ref) : null;
      const has = Boolean(p?.parts.some((x) => x.verses.some((v) => v.text)));
      return { source: s, ok: has, why: has ? "This passage exists in the text." : "This reference isn't in the Bible text.", label: s.ref, detail: "" };
    }
    if (s.type === "writer") {
      const want = squash(s.writer);
      const matches = (e: Awaited<ReturnType<typeof excerptByLocator>>) =>
        e && want && squash(e.writer.name).includes(want) && holds(e.text, s.quote);
      const locator = typeof s.excerpt === "string" ? await excerptByLocator(s.excerpt) : undefined;
      const hit = s.excerpt
        ? (matches(locator) && locator?.reference === s.ref ? locator : undefined)
        : (await Promise.all([excerptsForPassage(s.ref), excerptsForPassage(s.ref, "comm")])).flat().find(matches);
      return hit
        ? { source: s, ok: true, why: `Found in ${hit.source}.`, label: `${hit.writer.name}, ${hit.title}`, hash: `excerpt-${hit.locator}`, detail: s.quote }
        : { source: s, ok: false, why: "These words weren't found in this writer's excerpt on that passage.", label: `${s.writer} on ${s.ref}`, detail: s.quote };
    }
    if (s.type === "lexicon") {
      const id = normalizeStrongs(s.id);
      const entry = id ? await getLexEntry(id) : null;
      const quote = squash(s.quote);
      const glossary = [entry?.l, ...entry?.m?.map((sense) => sense.g) ?? []];
      const definitions = [entry?.s, ...entry?.m?.map((sense) => sense.t.replace(/<[^>]+>/g, "")) ?? []];
      const ok = Boolean(quote && entry && (
        glossary.some((text) => text && squash(text) === quote) ||
        definitions.some((text) => {
          if (!text) return false;
          const normalized = squash(text);
          return normalized === quote || (quote.split(" ").length >= 3 && ` ${normalized} `.includes(` ${quote} `));
        })
      ));
      return {
        source: s, ok, label: [id ?? s.id, entry?.l].filter(Boolean).join(" · "),
        hash: ok && id ? `word-${id.toLowerCase()}` : undefined, detail: s.quote,
        why: ok ? "Found in the app's lexicon." : "This wording couldn't be confirmed in the named lexicon entry.",
      };
    }
    if (s.type === "creed") {
      const d = await getCreed(s.doc);
      const ok = Boolean(d && holds(creedText(d), s.quote));
      return { source: s, ok, why: ok ? "Found word for word in Schaff's text." : d ? "These words weren't found in this document." : "This document isn't in the app.", label: d?.name ?? s.doc, hash: d ? `creed-${d.id}` : undefined, detail: s.quote };
    }
    if (s.type === "term") {
      const t = await termById(s.term.toLowerCase().replace(/[^a-z0-9]+/g, "-")) ?? (await getGlossary()).find((x) => x.term.toLowerCase() === s.term.toLowerCase());
      const ok = Boolean(t && holds(`${t.defs.map((d) => d.text).join(" ")}`, s.quote));
      return { source: s, ok, why: ok ? "Found word for word in a named source." : t ? "These words weren't found in that term's quoted sources." : "This term isn't in the app.", label: t?.term ?? s.term, hash: t ? `term-${t.id}` : undefined, detail: s.quote };
    }
    if (s.type === "dictionary") {
      const hits = await lookupDictionary(s.name);
      const hit = hits.find((h) => holds(h.text, s.quote));
      return hit
        ? { source: s, ok: true, why: `Found word for word in ${hit.source}.`, label: `${hit.source}, “${s.name}”`, detail: s.quote }
        : { source: s, ok: false, why: hits.length ? "These words weren't found in that entry." : "No entry with that name.", label: s.name, detail: s.quote };
    }
    if (s.type === "josephus") {
      const { works } = await getJosephus();
      for (const w of works) for (const b of w.books) for (const c of b.chapters) for (const [n, t] of c.paras) {
        if (holds(t, s.quote)) return { source: s, ok: true, why: "Found word for word in Whiston's Josephus.", label: `Josephus, ${w.name} ${b.n}.${c.n}.${n}`, hash: `josephus-${w.id}-${b.n}-${c.n}`, detail: s.quote };
      }
      return { source: s, ok: false, why: "These words weren't found in Josephus.", label: "Josephus", detail: s.quote };
    }
    if (s.type !== "event") return { source: s, ok: false, why: "This source type could not be checked.", label: "" };
    const e = (await getChurchEvents()).find((x) => x.id === s.event);
    return { source: s, ok: Boolean(e), why: e ? `On the church history timeline, from ${e.source}.` : "This event isn't in the app.", label: e?.title ?? s.event, hash: e ? `event-${e.id}` : undefined };
  } catch {
    return { source: s, ok: false, why: "This couldn't be checked.", label: "" };
  }
}

export const checkSources = (list: unknown, translation: TranslationId): Promise<CheckedSource[]> =>
  Promise.all((Array.isArray(list) ? list : []).slice(0, 14).filter((x) => x && typeof x === "object").map((x) => checkOne(x as ResearchSource, translation)));

export async function checkResearch(raw: unknown, translation: TranslationId): Promise<ResearchAnswer | null> {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { summary?: unknown; claims?: unknown; gaps?: unknown };
  if (!Array.isArray(r.claims)) return null;
  const claims = await Promise.all(r.claims.slice(0, 30).filter((c) => c && typeof c === "object").map(async (c: any): Promise<CheckedClaim> => {
    const sources = await Promise.all((Array.isArray(c.sources) ? c.sources : []).slice(0, 6).map((s: ResearchSource) => checkOne(s, translation)));
    return { text: String(c.text ?? "").slice(0, 2000), sources, supported: sources.some((s) => s.ok) };
  }));
  return { summary: typeof r.summary === "string" ? r.summary.slice(0, 1500) : "", claims, gaps: Array.isArray(r.gaps) ? r.gaps.map(String).slice(0, 12) : [] };
}

export const researchTitles = async () => (await getCreedIndex()).docs.map((d) => `${d.id}: ${d.name}`);
