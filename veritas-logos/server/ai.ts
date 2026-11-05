/** Runs a conversation against the Claude Messages API, streaming text and running read-only tools. */
import { aiTools } from "../src/core/ai";
import type { TranslationId } from "../src/core/bible";

export interface AiRequest {
  purpose?: string;
  reference?: unknown;
  messages?: { role: "user" | "assistant"; content: string }[];
  translation?: unknown;
  lens?: unknown;
  contextRef?: unknown;
  guide?: unknown;
  request?: unknown;
  section?: unknown;
}
interface RunOptions {
  apiKey: string;
  model: string;
  base: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  translation: TranslationId;
  useTools: boolean;
  signal: AbortSignal;
  onText: (text: string) => void;
}
type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown; json?: string };

const MAX_ROUNDS = 6;
const MAX_RESULT = 32000;

export async function runAi(o: RunOptions): Promise<string> {
  const tools = o.useTools ? aiTools(o.translation) : [];
  const apiTools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const convo: { role: string; content: unknown }[] = o.messages.map((m) => ({ role: m.role, content: m.content }));
  let all = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    const res = await fetch(`${o.base}/v1/messages`, {
      method: "POST",
      signal: o.signal,
      headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: o.model, max_tokens: 8000, stream: true, system: o.system, messages: convo, ...(apiTools.length && !lastRound ? { tools: apiTools } : {}) }),
    });
    if (!res.ok || !res.body) throw new Error(`Claude API returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const blocks: Block[] = [];
    let stop = "";
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "content_block_start") {
          const b = ev.content_block;
          blocks[ev.index] = b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: {}, json: "" } : { type: "text", text: "" };
        } else if (ev.type === "content_block_delta") {
          const b = blocks[ev.index];
          if (ev.delta.type === "text_delta" && b?.type === "text") {
            b.text += ev.delta.text;
            all += ev.delta.text;
            o.onText(ev.delta.text);
          } else if (ev.delta.type === "input_json_delta" && b?.type === "tool_use") b.json += ev.delta.partial_json;
        } else if (ev.type === "message_delta") stop = ev.delta?.stop_reason ?? stop;
        else if (ev.type === "error") throw new Error(ev.error?.message ?? "stream error");
      }
    }
    const uses = blocks.filter((b): b is Extract<Block, { type: "tool_use" }> => b?.type === "tool_use");
    if (stop !== "tool_use" || !uses.length) return all;
    for (const u of uses) {
      try { u.input = JSON.parse(u.json || "{}"); } catch { u.input = {}; }
      delete u.json;
    }
    if (all && !all.endsWith("\n")) { all += "\n\n"; o.onText("\n\n"); }
    convo.push({ role: "assistant", content: blocks.filter((b) => b && (b.type !== "text" || b.text)) });
    const results = await Promise.all(uses.map(async (u) => {
      const tool = tools.find((t) => t.name === u.name);
      try {
        if (!tool) throw new Error(`Unknown tool ${u.name}`);
        const out = JSON.stringify(await tool.execute(u.input as Record<string, unknown>));
        return { type: "tool_result", tool_use_id: u.id, content: out.length > MAX_RESULT ? `${out.slice(0, MAX_RESULT)}…` : out };
      } catch (e) {
        return { type: "tool_result", tool_use_id: u.id, is_error: true, content: (e as Error).message };
      }
    }));
    convo.push({ role: "user", content: results });
  }
  return all;
}
