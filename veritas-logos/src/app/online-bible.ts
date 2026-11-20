/**
 * Licensed Bibles (ESV, NIV, NLT, NKJV), read a chapter at a time through the owner's "Veritas Bible Texts"
 * connector: a small server in their Supabase project (supabase/functions/bible-texts) that holds their own free
 * API keys for Crossway's ESV API and API.Bible. A page in Claude can't reach other sites, but it can call the
 * viewer's connectors through the `mcp` capability.
 *
 * On the website (Cloudflare Pages) there's no Claude bridge, so the reader asks the same function's /web address,
 * which answers only the website's own pages (VERITAS_CONFIG.bibleTextsUrl, from site.config.json).
 *
 * The publishers' terms shape the rest: text is kept only in memory and only a few chapters at a time
 * (src/core/bible.ts), every chapter carries its notice, and the text is never searched, read aloud or sent to AI.
 */
import { BOOKS } from "../core/references";
import { OnlineTextError, setOnlineSource, type TranslationId } from "../core/bible";

/** The name the connector must have in Claude's settings, and its one tool. */
export const CONNECTOR = "Veritas Bible Texts";
const TOOL = "get_chapter";

let device = "";
const session = Math.random().toString(36).slice(2, 12);
function deviceId(): string {
  if (device) return device;
  try {
    device = localStorage.getItem("veritas.device") ?? "";
    if (!device) { device = crypto.randomUUID(); localStorage.setItem("veritas.device", device); }
  } catch { device = session; }
  return device;
}

interface ChapterPayload { verses?: { verse: number; text: string }[]; copyright?: string }

/** What to tell the reader when a chapter can't be fetched, by the connector's error code. */
function explain(t: TranslationId, e: any): OnlineTextError {
  const code: string = e?.code ?? "upstream_error";
  const add = `In Claude's settings, under Connectors, add the "${CONNECTOR}" connector.`;
  const text: Record<string, string> = {
    server_not_connected: `The ${t} is read through your "${CONNECTOR}" connector, which isn't connected. ${add}`,
    selection_required: `More than one connector is named "${CONNECTOR}". Choose one when Claude asks, or rename the others.`,
    needs_reauth: `Reconnect "${CONNECTOR}" in Claude's settings, under Connectors.`,
    not_in_manifest: `Reading the ${t} needs your permission to use "${CONNECTOR}". Choose it again to be asked.`,
    approval_required: `Reading the ${t} needs your approval to use "${CONNECTOR}". Choose it again to be asked.`,
    blocked_by_policy: `Your organization's settings don't allow "${CONNECTOR}" here.`,
    server_unavailable: `"${CONNECTOR}" didn't answer. Try again in a moment.`,
    not_granted: `This view of the app can't use connectors, so the ${t} can't be shown here.`,
    capability_disabled: `This view of the app can't use connectors, so the ${t} can't be shown here.`,
    tool_error: e?.message ? String(e.message) : `"${CONNECTOR}" couldn't fetch the ${t}.`,
  };
  return new OnlineTextError(text[code] ?? `"${CONNECTOR}" couldn't fetch the ${t}${e?.message ? `: ${e.message}` : "."}`, code);
}

const toVerses = (t: TranslationId, p: ChapterPayload, from: string) => {
  if (!Array.isArray(p.verses) || !p.verses.length) throw new OnlineTextError(`${from} sent no text for this chapter of the ${t}.`, "empty");
  const verses: string[] = [];
  for (const v of p.verses) if (v.verse > 0) verses[v.verse - 1] = String(v.text ?? "");
  return { verses: Array.from(verses, (x) => x ?? ""), notice: p.copyright || undefined };
};

/** The website's way in: a plain request to the Bible function's /web address. */
async function fromWebsite(url: string, t: TranslationId, book: number, chapter: number) {
  const q = new URLSearchParams({ translation: t, number: String(book), chapter: String(chapter), device: deviceId(), session });
  let res: Response;
  try {
    res = await fetch(`${url}?${q}`, { cache: "no-store" });
  } catch {
    throw new OnlineTextError(`The ${t} couldn't be reached. Check your connection and try again.`, "network");
  }
  const body = (await res.json().catch(() => ({}))) as ChapterPayload & { error?: string };
  if (!res.ok) {
    const code = res.status === 429 ? "rate_limited" : res.status === 403 ? "not_allowed" : "upstream_error";
    throw new OnlineTextError(body.error || `The ${t} couldn't be fetched (${res.status}).`, code);
  }
  return toVerses(t, body, "The Bible service");
}

/** Connects the reader's licensed translations to the connector in Claude, or to the Bible function on the website. */
export function initOnlineBible(): void {
  setOnlineSource(async (t, book, chapter) => {
    // Looked up on each read: Claude's bridge may arrive after the app starts.
    const claude = (window as any).claude;
    const webUrl: string | undefined = (window as any).VERITAS_CONFIG?.bibleTextsUrl;
    if (!claude?.use && webUrl) return fromWebsite(webUrl, t, book, chapter);
    if (!claude?.use) throw new OnlineTextError(`The ${t} is read online through a Claude connector, which this copy of the app doesn't have.`, "no_connector");
    const mcp = await claude.use("mcp");
    if (!mcp) throw new OnlineTextError(`This view of the app can't use connectors, so the ${t} can't be shown here.`, "not_granted");
    const input = { translation: t, book: BOOKS[book - 1].name, number: book, chapter, device: deviceId(), session };
    let result: any;
    try {
      result = await mcp.callTool(CONNECTOR, TOOL, input, { cache: false });
    } catch (e: any) {
      if (e?.retryable) {
        await new Promise((r) => setTimeout(r, Math.min(5000, e.retryAfterMs ?? 800) + Math.random() * 400));
        try { result = await mcp.callTool(CONNECTOR, TOOL, input, { cache: false }); } catch (e2) { throw explain(t, e2); }
      } else throw explain(t, e);
    }
    return toVerses(t, (result?.payload ?? {}) as ChapterPayload, `"${CONNECTOR}"`);
  });
}
