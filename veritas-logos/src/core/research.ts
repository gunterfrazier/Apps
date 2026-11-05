/**
 * Research mode for the AI assistant. The model must tie every claim to something in this app, and each tie is then
 * checked against the data itself. A claim that can't be checked is shown as unsupported instead of being dropped or hidden.
 */
import { getPassage, type TranslationId } from "./bible";
import { getGlossary, termById } from "./glossary";
import { parseReference } from "./references";
import { creedText, getChurchEvents, getCreed, getCreedIndex } from "./scholar";
import { excerptsForPassage } from "./writings";

export const RESEARCH_RULES = `Answer in research mode. Reply with only one JSON object, in this shape:
{"summary":"one or two plain sentences","claims":[{"text":"one claim","sources":[{"type":"scripture","ref":"John 1:1"},{"type":"writer","writer":"Augustine of Hippo","ref":"John 1:1","quote":"exact words"},{"type":"creed","doc":"westminster-confession","quote":"exact words"},{"type":"term","term":"Justification","quote":"exact words"},{"type":"event","event":"nicaea-1"}]}],"gaps":["what the app's sources don't settle"]}
Rules:
- Every claim needs at least one source from your tools. Don't cite anything you haven't looked up in this session.
- A quote must be copied exactly from a tool result, and be at least six words long. Don't correct or shorten it.
- "ref" is the passage the excerpt is filed under, as the tool gave it. "doc" and "event" are the ids the tools give.
- If the app's sources don't support something you would otherwise say, put it in "gaps" and don't state it as a claim.
- Keep claims short and separate. Report what the sources say, name the tradition, and don't declare a winner.`;

export type ResearchSource =
  | { type: "scripture"; ref: string }
  | { type: "writer"; writer: string; ref: string; quote: string }
  | { type: "creed"; doc: string; quote: string }
  | { type: "term"; term: string; quote: string }
  | { type: "event"; event: string };
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
      const [a, b] = await Promise.all([excerptsForPassage(s.ref), excerptsForPassage(s.ref, "comm")]);
      const want = squash(s.writer);
      const hit = [...a, ...b].find((e) => squash(e.writer.name).includes(want) && holds(e.text, s.quote));
      return hit
        ? { source: s, ok: true, why: `Found word for word in ${hit.source}.`, label: `${hit.writer.name}, ${hit.title}`, hash: `writer-${hit.writer.id}`, detail: s.quote }
        : { source: s, ok: false, why: "These words weren't found in this writer's excerpts on that passage.", label: `${s.writer} on ${s.ref}`, detail: s.quote };
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
    const e = (await getChurchEvents()).find((x) => x.id === s.event);
    return { source: s, ok: Boolean(e), why: e ? `On the church history timeline, from ${e.source}.` : "This event isn't in the app.", label: e?.title ?? s.event, hash: e ? `event-${e.id}` : undefined };
  } catch {
    return { source: s, ok: false, why: "This couldn't be checked.", label: "" };
  }
}

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
