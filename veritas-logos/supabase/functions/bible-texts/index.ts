// Veritas Bible Texts: a small MCP server, run as a Supabase Edge Function, that gives the Veritas Logos reader
// licensed Bibles a chapter at a time. Added to Claude as a custom connector, it is called by the app's page through
// the `mcp` capability (src/app/online-bible.ts), since a page in Claude can't reach other sites itself.
//
// Its secrets (Supabase dashboard, Edge Functions, Secrets):
//   BIBLE_CONNECTOR_TOKEN  the last part of the connector's address; requests without it get a 404
//   ESV_API_KEY            a free key from api.esv.org (Crossway), for the ESV
//   API_BIBLE_KEY          a free Starter key from api.bible, with the NIV, NLT and NKJV chosen
//
// Deployed with JWT checking off, since Claude's connector sends no Supabase token: the token in the address is the
// lock. It speaks MCP's Streamable HTTP transport in its simplest form: one JSON-RPC message per POST, answered
// with JSON, no sessions or streams.
//
// The website (Cloudflare Pages) can't use a Claude connector, so it asks at .../bible-texts/web instead:
//   GET .../bible-texts/web?translation=NIV&number=43&chapter=3&device=...&session=...
// That address has no secret token, since anyone can read a web page's code. It answers only pages served from the
// addresses in BIBLE_WEB_ORIGINS (comma-separated; by default the website, https://apps-c5t.pages.dev, and its
// preview addresses), and only a few chapters a minute to each visitor, so other sites can't spend the free quotas.
//
// The terms it keeps: both services are for non-commercial use; nothing is stored here; each chapter goes back
// with its copyright notice; API.Bible's Fair Use (FUMS) is reported for each chapter shown.

const BOOKS = [
  ["Genesis", "GEN"], ["Exodus", "EXO"], ["Leviticus", "LEV"], ["Numbers", "NUM"], ["Deuteronomy", "DEU"], ["Joshua", "JOS"],
  ["Judges", "JDG"], ["Ruth", "RUT"], ["1 Samuel", "1SA"], ["2 Samuel", "2SA"], ["1 Kings", "1KI"], ["2 Kings", "2KI"],
  ["1 Chronicles", "1CH"], ["2 Chronicles", "2CH"], ["Ezra", "EZR"], ["Nehemiah", "NEH"], ["Esther", "EST"], ["Job", "JOB"],
  ["Psalms", "PSA"], ["Proverbs", "PRO"], ["Ecclesiastes", "ECC"], ["Song of Solomon", "SNG"], ["Isaiah", "ISA"], ["Jeremiah", "JER"],
  ["Lamentations", "LAM"], ["Ezekiel", "EZK"], ["Daniel", "DAN"], ["Hosea", "HOS"], ["Joel", "JOL"], ["Amos", "AMO"],
  ["Obadiah", "OBA"], ["Jonah", "JON"], ["Micah", "MIC"], ["Nahum", "NAM"], ["Habakkuk", "HAB"], ["Zephaniah", "ZEP"],
  ["Haggai", "HAG"], ["Zechariah", "ZEC"], ["Malachi", "MAL"], ["Matthew", "MAT"], ["Mark", "MRK"], ["Luke", "LUK"],
  ["John", "JHN"], ["Acts", "ACT"], ["Romans", "ROM"], ["1 Corinthians", "1CO"], ["2 Corinthians", "2CO"], ["Galatians", "GAL"],
  ["Ephesians", "EPH"], ["Philippians", "PHP"], ["Colossians", "COL"], ["1 Thessalonians", "1TH"], ["2 Thessalonians", "2TH"],
  ["1 Timothy", "1TI"], ["2 Timothy", "2TI"], ["Titus", "TIT"], ["Philemon", "PHM"], ["Hebrews", "HEB"], ["James", "JAS"],
  ["1 Peter", "1PE"], ["2 Peter", "2PE"], ["1 John", "1JN"], ["2 John", "2JN"], ["3 John", "3JN"], ["Jude", "JUD"], ["Revelation", "REV"],
];
const CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];

const ESV_NOTICE = "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language. Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.";
const API_BIBLE = ["NIV", "NLT", "NKJV"];

type Verse = { verse: number; text: string };
class ToolError extends Error {}

/** Splits text with "[n]" verse markers into verses. */
function splitVerses(text: string): Verse[] {
  const out: Verse[] = [];
  const parts = text.split(/\[(?:\d+:)?(\d+)\]/); // "[16]", or "[3:1]" at a chapter start
  for (let i = 1; i < parts.length; i += 2) {
    const t = parts[i + 1].replace(/\s+/g, " ").replace(/\s*\(ESV\)\s*$/, "").trim();
    if (t) out.push({ verse: Number(parts[i]), text: t });
  }
  return out;
}

async function esvChapter(book: number, chapter: number): Promise<{ verses: Verse[]; copyright: string }> {
  const key = Deno.env.get("ESV_API_KEY");
  if (!key) throw new ToolError("The ESV key isn't set up yet. Add ESV_API_KEY in the Supabase project's Edge Function secrets.");
  const q = new URLSearchParams({
    q: `${BOOKS[book - 1][0]} ${chapter}`,
    "include-passage-references": "false", "include-verse-numbers": "true", "include-first-verse-numbers": "true",
    "include-footnotes": "false", "include-footnote-body": "false", "include-headings": "false",
    "include-short-copyright": "false", "include-copyright": "false", "include-passage-horizontal-lines": "false",
    "include-heading-horizontal-lines": "false", "include-selahs": "true", "indent-paragraphs": "0", "indent-poetry": "false",
    "indent-declares": "0", "indent-psalm-doxology": "0", "line-length": "0",
  });
  const res = await fetch(`https://api.esv.org/v3/passage/text/?${q}`, { headers: { Authorization: `Token ${key}` } });
  if (res.status === 401 || res.status === 403) throw new ToolError("Crossway turned down the ESV key. Check ESV_API_KEY in the Supabase secrets.");
  if (res.status === 429) throw new ToolError("The ESV API's limit was reached for now. Try again later.");
  if (!res.ok) throw new ToolError(`The ESV API answered ${res.status}.`);
  const data = await res.json();
  return { verses: splitVerses(String(data.passages?.[0] ?? "")), copyright: ESV_NOTICE };
}

let bibleIds: Record<string, { id: string; copyright?: string }> | null = null;
async function apiBible(path: string): Promise<any> {
  const key = Deno.env.get("API_BIBLE_KEY");
  if (!key) throw new ToolError("The API.Bible key isn't set up yet. Add API_BIBLE_KEY in the Supabase project's Edge Function secrets.");
  const res = await fetch(`https://rest.api.bible/v1${path}`, { headers: { "api-key": key } });
  if (res.status === 401 || res.status === 403) throw new ToolError("API.Bible turned down the key, or this Bible isn't on your plan. Check API_BIBLE_KEY and the Bibles chosen at api.bible.");
  if (res.status === 429) throw new ToolError("API.Bible's monthly limit was reached.");
  if (!res.ok) throw new ToolError(`API.Bible answered ${res.status}.`);
  return res.json();
}

/** The Bibles this key may use, found by abbreviation, so no IDs are written in here. */
async function bibleIdFor(abbr: string): Promise<string> {
  if (!bibleIds) {
    const list = await apiBible("/bibles?language=eng");
    bibleIds = {};
    const names: Record<string, RegExp> = { NIV: /new international version/i, NLT: /new living translation/i, NKJV: /new king james/i };
    for (const b of list.data ?? []) {
      for (const a of [b.abbreviation, b.abbreviationLocal]) {
        const k = String(a ?? "").toUpperCase();
        if (API_BIBLE.includes(k) && !bibleIds[k]) bibleIds[k] = { id: b.id };
      }
    }
    // Abbreviations vary ("NLT15"), so fall back to the name.
    for (const k of API_BIBLE) {
      if (bibleIds[k]) continue;
      const b = (list.data ?? []).find((x: any) => names[k].test(`${x.name ?? ""} ${x.nameLocal ?? ""}`));
      if (b) bibleIds[k] = { id: b.id };
    }
  }
  const found = bibleIds[abbr];
  if (!found) bibleIds = null; // look again next time, in case the Bible has just been added to the plan
  if (!found) throw new ToolError(`The ${abbr} isn't on this API.Bible plan. Choose it at api.bible under your app's Bibles.`);
  return found.id;
}

async function reportFums(token: unknown, device: string, session: string): Promise<void> {
  if (typeof token !== "string" || !token) return;
  const q = new URLSearchParams({ t: token, dId: device || "veritas", sId: session || "veritas" });
  try { await fetch(`https://fums.api.bible/f3?${q}`); } catch { /* reporting is best effort */ }
}

async function apiBibleChapter(abbr: string, book: number, chapter: number, device: string, session: string) {
  const id = await bibleIdFor(abbr);
  const q = new URLSearchParams({ "content-type": "text", "include-notes": "false", "include-titles": "false", "include-chapter-numbers": "false", "include-verse-numbers": "true", "include-verse-spans": "false" });
  const data = await apiBible(`/bibles/${id}/chapters/${BOOKS[book - 1][1]}.${chapter}?${q}`);
  await reportFums(data.meta?.fumsToken ?? data.meta?.fumsId, device, session);
  return { verses: splitVerses(String(data.data?.content ?? "")), copyright: String(data.data?.copyright ?? "").trim() };
}

async function getChapter(args: Record<string, unknown>) {
  const translation = String(args.translation ?? "").toUpperCase();
  const book = Number(args.number ?? args.book);
  const chapter = Number(args.chapter);
  if (!Number.isInteger(book) || book < 1 || book > 66) throw new ToolError("number must be a book number from 1 (Genesis) to 66 (Revelation).");
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > CHAPTERS[book - 1]) throw new ToolError(`${BOOKS[book - 1][0]} has ${CHAPTERS[book - 1]} chapters.`);
  const device = String(args.device ?? "").slice(0, 64), session = String(args.session ?? "").slice(0, 64);
  let got: { verses: Verse[]; copyright: string };
  if (translation === "ESV") got = await esvChapter(book, chapter);
  else if (API_BIBLE.includes(translation)) got = await apiBibleChapter(translation, book, chapter, device, session);
  else throw new ToolError("translation must be ESV, NIV, NLT or NKJV.");
  if (!got.verses.length) throw new ToolError(`No text came back for ${BOOKS[book - 1][0]} ${chapter} in the ${translation}.`);
  return { translation, reference: `${BOOKS[book - 1][0]} ${chapter}`, verses: got.verses, copyright: got.copyright };
}

const TOOLS = [{
  name: "get_chapter",
  title: "Get a Bible chapter",
  description: "One chapter of the ESV, NIV, NLT or NKJV, for reading in Veritas Logos, with its copyright notice.",
  inputSchema: {
    type: "object",
    properties: {
      translation: { type: "string", enum: ["ESV", "NIV", "NLT", "NKJV"] },
      number: { type: "integer", minimum: 1, maximum: 66, description: "Book number, 1 (Genesis) to 66 (Revelation)" },
      book: { type: "string", description: "Book name, for reading the log" },
      chapter: { type: "integer", minimum: 1 },
      device: { type: "string", description: "Anonymous device ID for API.Bible's fair-use reporting" },
      session: { type: "string", description: "Anonymous session ID for API.Bible's fair-use reporting" },
    },
    required: ["translation", "number", "chapter"],
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function handle(msg: any): Promise<unknown | null> {
  const { id, method, params } = msg ?? {};
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined || id === null) return null; // a notification, such as notifications/initialized
  if (method === "initialize") {
    return reply({ protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "veritas-bible-texts", version: "1.0.0" } });
  }
  if (method === "ping") return reply({});
  if (method === "tools/list") return reply({ tools: TOOLS });
  if (method === "tools/call") {
    if (params?.name !== "get_chapter") return fail(-32602, `Unknown tool: ${params?.name}`);
    try {
      const out = await getChapter(params?.arguments ?? {});
      return reply({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: false });
    } catch (e) {
      const text = e instanceof ToolError ? e.message : `Couldn't fetch the chapter: ${e instanceof Error ? e.message : e}`;
      return reply({ content: [{ type: "text", text }], isError: true });
    }
  }
  return fail(-32601, `Method not found: ${method}`);
}

// ----- The website's address: /web -----

const DEFAULT_ORIGINS = "https://apps-c5t.pages.dev";

/** Whether a page at origin may read chapters: one of the listed addresses, or a preview address under one. */
function allowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  let o: URL;
  try { o = new URL(origin); } catch { return false; }
  if (o.protocol !== "https:") return false;
  for (const entry of (Deno.env.get("BIBLE_WEB_ORIGINS") ?? DEFAULT_ORIGINS).split(",")) {
    let a: URL;
    try { a = new URL(entry.trim()); } catch { continue; }
    if (o.host === a.host || o.host.endsWith(`.${a.host}`)) return true;
  }
  return false;
}

// A few chapters a minute for each visitor. Kept in this instance's memory only, so it's a brake, not a wall.
const PER_MINUTE = 12;
const recent = new Map<string, number[]>();
function tooMany(visitor: string): boolean {
  const now = Date.now();
  const times = (recent.get(visitor) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= PER_MINUTE) { recent.set(visitor, times); return true; }
  times.push(now);
  recent.set(visitor, times);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((t) => now - t < 60_000)) recent.delete(k);
  return false;
}

async function web(req: Request, url: URL): Promise<Response> {
  const origin = req.headers.get("Origin");
  const ok = allowedOrigin(origin);
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" };
  if (ok) Object.assign(headers, { "Access-Control-Allow-Origin": origin!, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers });
  if (!ok) return reply({ error: "This address only answers the Veritas Logos website." }, 403);
  if (req.method !== "GET") return reply({ error: "Use GET." }, 405);
  const visitor = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (tooMany(visitor)) return reply({ error: "That's a lot of chapters at once. Wait a minute and try again." }, 429);
  const q = url.searchParams;
  try {
    return reply(await getChapter({ translation: q.get("translation"), number: q.get("number"), chapter: q.get("chapter"), device: q.get("device") ?? "", session: q.get("session") ?? "" }));
  } catch (e) {
    const text = e instanceof ToolError ? e.message : "Couldn't fetch the chapter.";
    return reply({ error: text }, e instanceof ToolError ? 400 : 502);
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[parts.length - 1] === "web") return web(req, url);
  const token = Deno.env.get("BIBLE_CONNECTOR_TOKEN");
  if (!token || parts[parts.length - 1] !== token) return new Response("Not found", { status: 404 });
  if (req.method === "GET") return new Response("This MCP server answers POST requests only.", { status: 405, headers: { Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter((x) => x !== null);
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const out = await handle(body);
  return out === null ? new Response(null, { status: 202 }) : json(out);
});
