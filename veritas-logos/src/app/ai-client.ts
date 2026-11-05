import type { TranslationId } from "../core/bible";
import type { LensId } from "../core/content";
import { aiTools, AI_RULES, chatPreamble, coerceDraftSections, coerceInsight, guideDraftPrompt, insightPrompt, parseJsonReply, type AiInsight } from "../core/ai";
import type { Guide, GuideSection } from "../core/guide";
import { getData } from "./store";

export type AiMode = "viewer" | "server" | "none";
export interface Turn { role: "user" | "assistant"; content: string }
type AskOpts = { onText?: (text: string) => void; signal?: AbortSignal };

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
    case "not_granted": return "You chose not to let this page use Claude. Reload the page to be asked again.";
    case "sampling_disabled": return "Claude isn't available on this account.";
    case "rate_limited": return "You've reached a usage limit for now. Try again later.";
    case "session_expired": return "Please sign in to Claude again.";
    case "refused": return "The assistant declined that request. Try rewording it.";
    case "prompt_too_large": return "That's too much text at once. Try a shorter passage.";
    default: return typeof e?.userMessage === "string" ? e.userMessage : "The assistant couldn't finish. Try again.";
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

const toolsFor = (translation: TranslationId) =>
  aiTools(translation).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    execute: (input: Record<string, unknown>) => t.execute(input),
  }));

async function viewerHasTools(): Promise<boolean> {
  try {
    return Boolean((await sampleFn.limits())?.tools);
  } catch {
    return false;
  }
}

export async function aiInsight(reference: string, translation: TranslationId, lens: LensId, opts: AskOpts = {}): Promise<AiInsight> {
  const mode = await detectAi();
  let text: string;
  if (mode === "viewer") {
    const prompt = await insightPrompt(reference, translation, lens);
    text = (await sampleFn(prompt, { signal: opts.signal, onText: opts.onText ? ({ text }: { text: string }) => opts.onText!(text) : undefined, cache: { gcTime: 86400000 } })).text;
  } else if (mode === "server") {
    text = await serverAsk({ purpose: "insight", reference, translation, lens }, opts);
  } else throw { code: "none", userMessage: "The AI assistant isn't set up here." };
  const insight = coerceInsight(parseJsonReply(text));
  if (!insight) throw { code: "bad_reply", userMessage: "The assistant's reply couldn't be read. Try again." };
  return insight;
}

export async function aiChat(turns: Turn[], translation: TranslationId, lens: LensId, contextRef: string | undefined, opts: AskOpts = {}): Promise<string> {
  const mode = await detectAi();
  if (mode === "viewer") {
    const preamble = await chatPreamble(translation, lens, contextRef);
    const useTools = await viewerHasTools();
    const options: any = { signal: opts.signal, onText: opts.onText ? ({ text }: { text: string }) => opts.onText!(text) : undefined, cache: false };
    if (useTools) options.tools = toolsFor(translation);
    return (await sampleFn([{ role: "user", content: preamble }, ...turns.slice(-16)], options)).text;
  }
  if (mode === "server") return serverAsk({ purpose: "chat", messages: turns.slice(-16), translation, lens, contextRef }, opts);
  throw { code: "none", userMessage: "The AI assistant isn't set up here." };
}

export async function aiDraft(guide: Guide, request: string, opts: AskOpts = {}): Promise<GuideSection[]> {
  const mode = await detectAi();
  let text: string;
  if (mode === "viewer") text = (await sampleFn(await guideDraftPrompt(guide, request), { signal: opts.signal, cache: false, onText: opts.onText ? ({ text }: { text: string }) => opts.onText!(text) : undefined })).text;
  else if (mode === "server") text = await serverAsk({ purpose: "draft", guide, request }, opts);
  else throw { code: "none", userMessage: "The AI assistant isn't set up here." };
  const sections = coerceDraftSections(parseJsonReply(text));
  if (!sections.length) throw { code: "bad_reply", userMessage: "The assistant's reply couldn't be read. Try again." };
  return sections;
}

export { AI_RULES };
