import type { TranslationId } from "../core/bible";
import type { LensId } from "../core/content";
import { aiTools, AI_RULES, chatPreamble, coerceDraftSections, coerceExplore, coerceInsight, coerceTopicReading, topicPrompt, versesOutside, type TopicReading, coerceGenre, coerceSymbols, genrePrompt, gradeSymbols, symbolPrompt, type GenreReading, type SymbolReading, exegesisStagePrompt, explorePrompt, guideDraftPrompt, insightPrompt, parseJsonReply, type AiInsight, type ExegesisStage, type ExploreContext, type ExploreDraft } from "../core/ai";
import type { Guide, GuideSection } from "../core/guide";
import { checkResearch, checkSources, RESEARCH_RULES, type CheckedSource, type ResearchAnswer } from "../core/research";
import { findEchoes } from "../core/echoes";
import { getData } from "./store";

export type AiMode = "viewer" | "server" | "none";
export interface Turn { role: "user" | "assistant"; content: string }
export type AskOpts = { onText?: (text: string) => void; signal?: AbortSignal; onTool?: (label: string) => void };

const CONFIG = (window as any).VERITAS_CONFIG ?? {};
let sampleFn: any = null;
let modePromise: Promise<AiMode> | null = null;

const apiBase = () => (getData().prefs.apiBase || CONFIG.apiBase || "").replace(/\/$/, "");

/** Where the AI runs: the Claude viewer when the app is opened there, otherwise the app's own API server. */
export function detectAi(): Promise<AiMode> {
  modePromise ??= (async (): Promise<AiMode> => {
    const claude = (window as any).claude;
    if (claude?.use) {
      try {
        sampleFn = await claude.use("sample");
        if (sampleFn) return "viewer";
      } catch { /* fall through */ }
    }
    try {
      const res = await fetch(`${apiBase()}/v1/ai/status`, { headers: authHeaders() });
      if (res.ok && (await res.json()).enabled) return "server";
    } catch { /* no server */ }
    return "none";
  })();
  return modePromise;
}
export const resetAiDetection = () => { modePromise = null; };

const authHeaders = (): Record<string, string> => {
  const key = getData().prefs.apiKey;
  return key ? { Authorization: `Bearer ${key}` } : {};
};

export function friendlyAiError(e: any): string {
  switch (e?.code) {
    case "cancelled": return "";
    case "not_granted": return "This page doesn't have permission to use Claude. Reload it and choose Allow when you're asked.";
    case "sampling_disabled": return "Claude isn't available on this account.";
    case "not_declared": case "capability_disabled": case "capability_removed": return "This view can't use Claude. Try opening the app in the Claude website or the latest Claude app.";
    case "rate_limited": return "You've reached a usage limit for now. Try again later.";
    case "session_expired": return "Please sign in to Claude again.";
    case "refused": return "The assistant declined that request. Try rewording it.";
    case "prompt_too_large": return "That's too much text at once. Try a shorter passage.";
    case "empty_completion": return "The assistant didn't write anything. Try asking for less.";
    case "invalid_json": return "The reply couldn't be read, which can happen when it runs long. Try again, or try a shorter passage.";
    case "upstream_error": return "The connection to Claude dropped. Try again.";
    default: return typeof e?.userMessage === "string" ? e.userMessage : `The assistant couldn't finish${e?.code ? ` (${e.code})` : ""}. Try again.`;
  }
}

async function serverAsk(body: unknown, opts: AskOpts): Promise<string> {
  const res = await fetch(`${apiBase()}/v1/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders() },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw { code: "server", userMessage: data?.error?.message ?? `The AI server returned an error (${res.status}).` };
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const msg = JSON.parse(line.slice(6));
      if (msg.error) throw { code: "server", userMessage: msg.error };
      if (msg.text) { text += msg.text; opts.onText?.(text); }
    }
  }
  return text;
}

/** Tool results over 32 KB aren't accepted, so longer ones are cut with a note. */
const MAX_TOOL_BYTES = 30000;
const encoder = new TextEncoder();
function fitToolResult(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const bytes = encoder.encode(text);
  if (bytes.length <= MAX_TOOL_BYTES) return text;
  return `${new TextDecoder().decode(bytes.slice(0, MAX_TOOL_BYTES - 200)).replace(/\uFFFD+$/, "")}\n[Cut short here because the result was long. Narrow the lookup for more.]`;
}

const TOOL_LABEL: Record<string, string> = {
  get_passage: "Reading the passage", search_bible: "Searching Scripture", original_words: "Reading the Hebrew or Greek", word_study: "Studying a word", passage_insights: "Checking references", historic_writers: "Reading the historic writers",
  define_term: "Looking up a term", lookup_dictionary: "Checking the Bible dictionaries", search_josephus: "Searching Josephus", book_background: "Checking the book's background", church_history: "Checking church history", search_creeds: "Searching the creeds",
  ancient_text: "Reading an ancient text", find_topic: "Finding a topic", find_person: "Finding a person",
};
/** Fewer tools means fewer rounds, so each kind of work gets only what it needs. */
export const TOOLSETS = {
  chat: ["get_passage", "search_bible", "original_words", "word_study", "passage_insights", "historic_writers", "define_term", "lookup_dictionary", "search_creeds", "church_history", "book_background", "search_josephus", "find_topic", "find_person", "ancient_text"],
  explore: ["lookup_dictionary", "book_background", "historic_writers", "search_josephus", "passage_insights", "define_term", "search_creeds", "church_history", "word_study"],
  overview: ["book_background", "lookup_dictionary", "search_josephus", "historic_writers"],
  verses: ["word_study", "lookup_dictionary", "historic_writers"],
  theology: ["search_creeds", "define_term", "historic_writers"],
  topic: ["word_study", "define_term", "search_creeds", "historic_writers", "lookup_dictionary"],
  genre: ["book_background", "lookup_dictionary", "historic_writers"],
  symbols: ["lookup_dictionary", "historic_writers", "word_study", "search_creeds"],
};

const toolsFor = (translation: TranslationId, names: string[], opts: AskOpts) => {
  const all = new Map(aiTools(translation).map((t) => [t.name, t]));
  return names.flatMap((name) => {
    const t = all.get(name);
    if (!t) return [];
    return [{
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      execute: async (input: Record<string, unknown>) => {
        opts.onTool?.(TOOL_LABEL[t.name] ?? "Looking something up");
        return fitToolResult(await t.execute(input));
      },
    }];
  });
};

/** The tools this view can run, up to its limit. An empty list means answer without them. */
async function viewerTools(translation: TranslationId, names: string[], opts: AskOpts) {
  try {
    const limits = await sampleFn.limits();
    if (!limits?.tools) return [];
    return toolsFor(translation, names, opts).slice(0, limits.tools.maxCount ?? names.length);
  } catch {
    return [];
  }
}

/** Options are only set when there's a value, because the platform checks what it's given. */
function sampleOptions(opts: AskOpts, extra: Record<string, unknown>) {
  const o: any = { ...extra };
  if (opts.signal) o.signal = opts.signal;
  if (opts.onText) o.onText = ({ text }: { text: string }) => opts.onText!(text);
  return o;
}

/** These mean the request was refused before it reached Claude, so it's worth one more try without tools. */
const TOOL_PROBLEM = new Set(["invalid_request", "tools_unavailable", "prompt_too_large", "transform_error"]);

interface JsonCall { tier?: "default" | "complex" | "quick"; toolNames?: string[]; cache?: unknown }

/** Asks for one JSON reply. With tools, the platform reads only the final message, so notes from earlier rounds don't get in the way. */
async function askJson(build: (hasTools: boolean) => string | Promise<string>, serverBody: Record<string, unknown>, translation: TranslationId, opts: AskOpts, cfg: JsonCall): Promise<unknown> {
  const mode = await detectAi();
  if (mode === "server") return parseJsonReply(await serverAsk(serverBody, opts));
  if (mode !== "viewer") throw { code: "none", userMessage: "The AI assistant isn't set up here." };
  const attempt = async (tools: unknown[]): Promise<unknown> => {
    const input = await build(tools.length > 0);
    const o = sampleOptions(opts, { modelTier: cfg.tier ?? "default" });
    if (tools.length) o.tools = tools;
    o.cache = tools.length ? false : cfg.cache ?? false;
    try {
      if (typeof sampleFn.json === "function") return await sampleFn.json(input, o);
      const parsed = parseJsonReply((await sampleFn(input, o)).text);
      if (parsed === null) throw { code: "invalid_json", message: "" };
      return parsed;
    } catch (e: any) {
      if (e?.code === "capability_removed" && typeof sampleFn.json === "function") {
        const parsed = parseJsonReply((await sampleFn(input, o)).text);
        if (parsed !== null) return parsed;
      }
      if (e?.code === "invalid_json" && e.text) {
        const saved = parseJsonReply(e.text);
        if (saved !== null) return saved;
      }
      throw e;
    }
  };
  const tools = cfg.toolNames ? await viewerTools(translation, cfg.toolNames, opts) : [];
  try {
    return await attempt(tools);
  } catch (e: any) {
    if (tools.length && !e?.text && TOOL_PROBLEM.has(e?.code)) return attempt([]);
    throw e;
  }
}

export async function aiInsight(reference: string, translation: TranslationId, lens: LensId, opts: AskOpts = {}): Promise<AiInsight> {
  const raw = await askJson(() => insightPrompt(reference, translation, lens), { purpose: "insight", reference, translation, lens }, translation, opts, { cache: { gcTime: 86400000 } });
  const insight = coerceInsight(raw);
  if (!insight) throw { code: "bad_reply", userMessage: "The assistant's reply couldn't be read. Try again." };
  return insight;
}

export async function aiChat(turns: Turn[], translation: TranslationId, lens: LensId, contextRef: string | undefined, opts: AskOpts = {}): Promise<string> {
  const mode = await detectAi();
  if (mode === "viewer") {
    const preamble = await chatPreamble(translation, lens, contextRef);
    const input = [{ role: "user", content: preamble }, ...turns.slice(-16)];
    const tools = await viewerTools(translation, TOOLSETS.chat, opts);
    try {
      const options = sampleOptions(opts, { cache: false });
      if (tools.length) options.tools = tools;
      return (await sampleFn(input, options)).text;
    } catch (e: any) {
      if (tools.length && !e?.text && TOOL_PROBLEM.has(e?.code)) return (await sampleFn(input, sampleOptions(opts, { cache: false }))).text;
      throw e;
    }
  }
  if (mode === "server") return serverAsk({ purpose: "chat", messages: turns.slice(-16), translation, lens, contextRef }, opts);
  throw { code: "none", userMessage: "The AI assistant isn't set up here." };
}

export async function aiDraft(guide: Guide, request: string, opts: AskOpts = {}): Promise<GuideSection[]> {
  const raw = await askJson(() => guideDraftPrompt(guide, request), { purpose: "draft", guide, request }, guide.translation, opts, {});
  const sections = coerceDraftSections(raw);
  if (!sections.length) throw { code: "bad_reply", userMessage: "The assistant's reply couldn't be read. Try again." };
  return sections;
}

/** Research mode: the question goes out with stricter rules, and every source in the reply is checked against the app's data. */
export async function aiResearch(turns: Turn[], translation: TranslationId, lens: LensId, contextRef: string | undefined, opts: AskOpts = {}): Promise<{ raw: string; answer: ResearchAnswer | null }> {
  const last = turns[turns.length - 1];
  const asked: Turn[] = [...turns.slice(0, -1), { role: "user", content: `${RESEARCH_RULES}\n\nQuestion: ${last.content}` }];
  const raw = await aiChat(asked, translation, lens, contextRef, opts);
  return { raw, answer: await checkResearch(parseJsonReply(raw), translation) };
}

/** Explores or expands one section, then checks what it cites. */
export async function aiExplore(c: ExploreContext, request: string, opts: AskOpts = {}): Promise<{ draft: ExploreDraft; checked: CheckedSource[] }> {
  const raw = await askJson((has) => explorePrompt(c, request, has), { purpose: "explore", request, translation: c.translation, lens: c.lens, section: { heading: c.heading, kind: c.kind, text: c.text, refs: c.refs, guideTitle: c.guideTitle } }, c.translation, opts, { toolNames: TOOLSETS.explore });
  const draft = coerceExplore(raw);
  if (!draft) throw { code: "bad_reply", userMessage: "The assistant's reply couldn't be read. Try again." };
  return { draft, checked: await checkSources(draft.sources, c.translation) };
}

/** Writes one step of an exegesis. */
export async function aiExegesisStage(reference: string, translation: TranslationId, lens: LensId, stage: ExegesisStage, earlier: string, opts: AskOpts = {}): Promise<unknown> {
  return askJson((has) => exegesisStagePrompt(reference, translation, lens, stage, earlier, has), { purpose: "exegesis", reference, translation, lens, stage, earlier: earlier.slice(0, 20000) }, translation, opts, { tier: "complex", toolNames: TOOLSETS[stage.id] });
}

/** How the chosen lens reads a word or topic in selected verses. Its citations and verses are checked afterward. */
export async function aiTopicReading(reference: string, query: string, translation: TranslationId, lens: LensId, opts: AskOpts = {}): Promise<{ reading: TopicReading; checked: CheckedSource[]; outside: string[] }> {
  const raw = await askJson((has) => topicPrompt(reference, query, translation, lens, has), { purpose: "topic", reference, query, translation, lens }, translation, opts, { tier: "complex", toolNames: TOOLSETS.topic });
  const reading = coerceTopicReading(raw);
  if (!reading) throw { code: "bad_reply", userMessage: "The assistant's reply couldn't be read. Try again." };
  return { reading, checked: await checkSources(reading.sources, translation), outside: await versesOutside(reference, translation, reading.occurrences.map((o) => o.ref)) };
}

/** A labeled draft of the passage's genre, built on the app's counts of its features. */
export async function aiGenre(reference: string, translation: TranslationId, opts: AskOpts = {}): Promise<{ reading: GenreReading; checked: CheckedSource[]; outside: string[] }> {
  const raw = await askJson(() => genrePrompt(reference, translation), { purpose: "genre", reference, translation }, translation, opts, { toolNames: TOOLSETS.genre });
  const reading = coerceGenre(raw);
  if (!reading) throw { code: "bad_reply", userMessage: "The assistant's reply couldn't be read. Try again." };
  return { reading, checked: await checkSources(reading.sources, translation), outside: await versesOutside(reference, translation, reading.signals.map((x) => x.ref)) };
}

/** What each symbol may draw on. The app sets the checked grades itself, from its own search. */
export async function aiSymbols(reference: string, translation: TranslationId, lens: LensId, off: string[], opts: AskOpts = {}): Promise<{ reading: SymbolReading; checked: CheckedSource[]; outside: string[] }> {
  const raw = await askJson(() => symbolPrompt(reference, translation, lens, off), { purpose: "symbols", reference, translation, lens, off }, translation, opts, { tier: "complex", toolNames: TOOLSETS.symbols });
  const reading = coerceSymbols(raw);
  if (!reading) throw { code: "bad_reply", userMessage: "The assistant's reply couldn't be read. Try again." };
  return { reading: gradeSymbols(reading, await findEchoes(reference, off)), checked: await checkSources(reading.sources, translation), outside: await versesOutside(reference, translation, reading.symbols.map((x) => x.ref)) };
}

/** What the viewer can do, without spending anything. */
export async function aiStatus(): Promise<{ mode: AiMode; tools: number | null; models: string[] | null }> {
  const mode = await detectAi();
  if (mode !== "viewer") return { mode, tools: null, models: null };
  const limits = await sampleFn.limits().catch(() => null);
  return { mode, tools: limits?.tools ? (limits.tools.maxCount ?? 0) : null, models: limits?.modelTiers ?? null };
}

/** A small real request, sent only when the reader asks for it. */
export async function aiSelfTest(withTool: boolean, signal?: AbortSignal): Promise<string> {
  const mode = await detectAi();
  if (mode === "server") return serverAsk({ purpose: "chat", messages: [{ role: "user", content: "Reply with the single word: ready" }] }, { signal });
  if (mode !== "viewer") throw { code: "none", userMessage: "The AI assistant isn't set up here." };
  const o: any = sampleOptions({ signal }, { modelTier: "quick", cache: false });
  if (withTool) o.tools = [{ name: "app_check", description: "Returns a word to repeat back to the reader. Call it once.", inputSchema: { type: "object", properties: {} }, execute: () => "ready" }];
  return (await sampleFn(withTool ? "Call app_check, then reply with only the word it returns." : "Reply with the single word: ready", o)).text;
}

export { AI_RULES };
