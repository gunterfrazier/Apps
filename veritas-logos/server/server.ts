/**
 * Veritas Logos API and static host. No third-party runtime dependencies: Node 22.13+ only.
 *
 * Environment:
 *   PORT                 default 8787
 *   DATA_DIR             folder holding the built data (default ./dist/data)
 *   STATIC_DIR           folder to serve as the website (default ./dist); set to "" to run the API alone
 *   DB_PATH              SQLite file for keys and guides (default ./veritas.db)
 *   ADMIN_TOKEN          required to create API keys
 *   ANTHROPIC_API_KEY    turns on the AI assistant
 *   AI_MODEL             default claude-sonnet-5-5
 *   AI_PUBLIC            "1" lets people without an API key use AI, limited per network address
 *   AI_DAILY_LIMIT       AI requests per key or address per day (default 50)
 *   RATE_LIMIT_PER_MIN   requests per key or address per minute (default 120)
 */
import { CREED_CREDIT, getChurchEvents, getCreed, getCreedIndex } from "../src/core/scholar";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { chatPreamble, checkReferences, exegesisStagePrompt, explorePrompt, guideDraftPrompt, insightPrompt, isLens } from "../src/core/ai";
import { getPassage, isTranslationId, searchText, TRANSLATIONS, DEFAULT_TRANSLATION, translationInfo, decodeVerseCode, refOf, getVerse, type TranslationId } from "../src/core/bible";
import { getTopic, searchTopics } from "../src/core/content";
import { setLoader } from "../src/core/data";
import { allFigures, buildSubgraph, findShortestPath, getFigure, describeRelationshipStep } from "../src/core/figure-graph";
import { generateGuide, GuideInputError, guideToHtml, guideToMarkdown, guideToText, isGuideFormat, resolveGuide, sanitizeGuide, newId, type Guide } from "../src/core/guide";
import { getInsights } from "../src/core/insights";
import { excerptsForPassage, getWritingsIndex, sermonsForPassage } from "../src/core/writings";
import { getGlossary, searchGlossary, termById } from "../src/core/glossary";
import { getConcordance, getCrossRefs, getLexEntry, getVerseWords, normalizeStrongs, searchLexicon, decodeMorph } from "../src/core/lexicon";
import { ensureFigures, peopleInPassage, versesOfPerson } from "../src/core/people";
import { bookName, parseReference } from "../src/core/references";
import { runAi, type AiRequest } from "./ai";
import { OPENAPI } from "./openapi";

export interface ServerOptions {
  port?: number; dataDir?: string; staticDir?: string; dbPath?: string; adminToken?: string; rateLimitPerMin?: number; aiDailyLimit?: number; aiPublic?: boolean; anthropicKey?: string; aiModel?: string; anthropicBase?: string;
}

class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");
const clampInt = (v: string | null, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, Math.floor(n))) : d; };

export function createServer(opts: ServerOptions = {}) {
  const dataDir = path.resolve(opts.dataDir ?? process.env.DATA_DIR ?? "dist/data");
  const staticEnv = opts.staticDir ?? process.env.STATIC_DIR ?? "dist";
  const staticDir = staticEnv ? path.resolve(staticEnv) : "";
  const adminToken = opts.adminToken ?? process.env.ADMIN_TOKEN ?? "";
  const ratePerMin = opts.rateLimitPerMin ?? Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
  const aiDaily = opts.aiDailyLimit ?? Number(process.env.AI_DAILY_LIMIT ?? 50);
  const aiPublic = opts.aiPublic ?? process.env.AI_PUBLIC === "1";
  const anthropicKey = opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  const aiModel = opts.aiModel ?? process.env.AI_MODEL ?? "claude-sonnet-5-5";
  const anthropicBase = opts.anthropicBase ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";

  setLoader(async (p) => {
    const file = path.join(dataDir, p);
    if (!file.startsWith(dataDir + path.sep)) throw new Error("bad path");
    return JSON.parse(await fs.promises.readFile(file, "utf8"));
  });

  const db = new DatabaseSync(opts.dbPath ?? process.env.DB_PATH ?? "veritas.db");
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, label TEXT, created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS guides (id TEXT PRIMARY KEY, owner TEXT NOT NULL, visibility TEXT NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS guides_owner ON guides(owner, updated_at);
    CREATE TABLE IF NOT EXISTS ai_usage (who TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (who, day));
  `);
  const keyByHash = db.prepare("SELECT id FROM api_keys WHERE hash = ? AND revoked = 0");
  const insertKey = db.prepare("INSERT INTO api_keys (id, hash, label, created_at) VALUES (?, ?, ?, ?)");
  const revokeKey = db.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ?");
  const putGuide = db.prepare("INSERT INTO guides (id, owner, visibility, json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET visibility = excluded.visibility, json = excluded.json, updated_at = excluded.updated_at");
  const getGuideRow = db.prepare("SELECT id, owner, visibility, json FROM guides WHERE id = ?");
  const listGuides = db.prepare("SELECT id, visibility, json, updated_at FROM guides WHERE owner = ? ORDER BY updated_at DESC LIMIT ?");
  const delGuide = db.prepare("DELETE FROM guides WHERE id = ?");
  const bumpAi = db.prepare("INSERT INTO ai_usage (who, day, n) VALUES (?, ?, 1) ON CONFLICT(who, day) DO UPDATE SET n = n + 1 RETURNING n");

  const buckets = new Map<string, { n: number; at: number }>();
  const limit = (who: string) => {
    const now = Date.now();
    const b = buckets.get(who);
    if (!b || now - b.at > 60000) { buckets.set(who, { n: 1, at: now }); return; }
    if (++b.n > ratePerMin) throw new HttpError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
  };
  setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.at > 120000) buckets.delete(k); }, 60000).unref();

  const send = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
    res.end(text);
  };
  const readJson = async (req: http.IncomingMessage, max = 1_000_000): Promise<any> => {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > max) throw new HttpError(413, "too_large", "That request is too large.");
      chunks.push(c as Buffer);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
    catch { throw new HttpError(400, "bad_json", "The request body isn't valid JSON."); }
  };

  const translationOf = (u: URL): TranslationId => {
    const t = (u.searchParams.get("translation") ?? DEFAULT_TRANSLATION).toUpperCase();
    if (!isTranslationId(t)) throw new HttpError(400, "bad_translation", `Unknown translation. Use one of: ${TRANSLATIONS.map((x) => x.id).join(", ")}.`);
    return t;
  };
  const required = (u: URL, name: string) => {
    const v = u.searchParams.get(name)?.trim();
    if (!v) throw new HttpError(400, "missing_parameter", `The ${name} parameter is required.`);
    return v.slice(0, 300);
  };
  const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

  async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, u: URL) {
    const method = req.method ?? "GET";
    const auth = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const owner = auth ? (keyByHash.get(hashKey(auth)) as { id: string } | undefined)?.id : undefined;
    if (auth && !owner && !(adminToken && safeEq(auth, adminToken))) throw new HttpError(401, "bad_key", "That API key isn't valid.");
    const who = owner ?? `ip:${(req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "?"}`;
    limit(who);
    const needKey = () => { if (!owner) throw new HttpError(401, "key_required", "This action needs an API key. Send it as: Authorization: Bearer <key>."); return owner; };
    const p = u.pathname.replace(/\/+$/, "");
    const seg = p.split("/").slice(2).map(decodeURIComponent);

    if (method === "GET" && p === "/v1") return send(res, 200, { name: "Veritas Logos API", version: "1", docs: "/v1/openapi.json" });
    if (method === "GET" && p === "/v1/openapi.json") return send(res, 200, OPENAPI);
    if (method === "GET" && p === "/v1/health") return send(res, 200, { ok: true });
    if (method === "GET" && p === "/v1/translations") return send(res, 200, { translations: TRANSLATIONS });

    if (method === "GET" && p === "/v1/passages") {
      const t = translationOf(u);
      const ref = required(u, "ref");
      const pass = await getPassage(t, ref);
      if (!pass) throw new HttpError(404, "bad_reference", `"${ref}" isn't a reference in the Bible text.`);
      return send(res, 200, { reference: pass.reference, translation: t, notice: pass.notice, parts: pass.parts.map((x) => ({ label: x.label, verses: x.verses.map((v) => ({ reference: refOf(v.book, v.chapter, v.verse), chapter: v.chapter, verse: v.verse, text: v.text })) })) });
    }
    if (method === "GET" && p === "/v1/search") {
      const t = translationOf(u);
      const mode = u.searchParams.get("mode") === "phrase" ? "phrase" : "words";
      const { hits, total } = await searchText(t, required(u, "q"), { mode, limit: clampInt(u.searchParams.get("limit"), 25, 1, 100) });
      return send(res, 200, { total, translation: t, notice: translationInfo(t).notice, results: hits.map((h) => ({ reference: h.ref, text: h.text })) });
    }
    if (method === "GET" && p === "/v1/verses/words") {
      const s = parseReference(required(u, "ref"))?.[0];
      if (!s?.verseStart) throw new HttpError(400, "bad_reference", "Give one verse, such as Genesis 1:1.");
      const words = await getVerseWords(s.book, s.chapter, s.verseStart);
      return send(res, 200, { reference: refOf(s.book, s.chapter, s.verseStart), attribution: "STEP Bible (Tyndale House), CC BY 4.0", words: words.map((w) => ({ text: w[0], transliteration: w[1], gloss: w[2], strongs: normalizeStrongs(w[3]), sense: w[3], morphology: w[4], grammar: decodeMorph(w[4]) })) });
    }
    if (method === "GET" && p === "/v1/crossrefs") {
      const s = parseReference(required(u, "ref"))?.[0];
      if (!s) throw new HttpError(400, "bad_reference", "That reference can't be read.");
      return send(res, 200, { attribution: "OpenBible.info, CC BY", results: (await getCrossRefs(s.book, s.chapter, s.verseStart ?? 1, bookName)).map((x) => ({ reference: x.ref, votes: x.votes })) });
    }
    if (method === "GET" && p === "/v1/insights") {
      const ref = required(u, "ref");
      if (!parseReference(ref)) throw new HttpError(400, "bad_reference", "That reference can't be read.");
      const i = await getInsights(ref);
      return send(res, 200, { reference: i.reference, book: i.book, topics: i.topics, confessions: i.confessions, quotes: i.quotes, quoted_by: i.quotedBy, parallels: i.parallels, possible_allusions: i.possibleAllusions });
    }
    if (method === "GET" && p === "/v1/glossary") {
      const query = u.searchParams.get("q");
      const terms = query ? await searchGlossary(query, clampInt(u.searchParams.get("limit"), 20, 1, 100)) : await getGlossary();
      return send(res, 200, { results: terms.map((t) => ({ id: t.id, term: t.term, definitions: t.defs.length, also_called: t.aliases })) });
    }
    if (method === "GET" && seg[0] === "glossary" && seg[1] && !seg[2]) {
      const t = await termById(seg[1]);
      if (!t) throw new HttpError(404, "not_found", "No term with that id.");
      return send(res, 200, { id: t.id, term: t.term, also_called: t.aliases, owners_glossary: t.own || undefined, corrections: t.corrections?.length ? t.corrections : undefined, note: t.note, see: t.see || undefined, definitions: t.defs.map((d) => ({ source: d.source, heading: d.head, text: d.text, source_url: d.url || undefined })), verses: t.refs, topic: t.topic || undefined });
    }
    if (method === "GET" && p === "/v1/church-history") {
      const query = u.searchParams.get("q")?.toLowerCase();
      const cat = u.searchParams.get("kind");
      const events = (await getChurchEvents()).filter((e) => (!cat || e.cat === cat) && (!query || `${e.title} ${e.summary}`.toLowerCase().includes(query)));
      return send(res, 200, { results: events.map((e) => ({ id: e.id, title: e.title, year: e.y1, until: e.y2, about: e.approx || undefined, kind: e.cat, traditions: e.trad, summary: e.summary, source: e.source, source_url: e.url, page: e.page || undefined, quote: e.quote, verses: e.refs, terms: e.terms, writers: e.writers, creeds: e.creeds })) });
    }
    if (method === "GET" && p === "/v1/creeds") {
      const { docs } = await getCreedIndex();
      return send(res, 200, { results: docs.map((d) => ({ id: d.id, name: d.name, year: d.year, tradition: d.tradition, volume: d.vol, source_url: d.url })) });
    }
    if (method === "GET" && seg[0] === "creeds" && seg[1] && !seg[2]) {
      const d = await getCreed(seg[1]);
      if (!d) throw new HttpError(404, "not_found", "No document with that id.");
      return send(res, 200, { id: d.id, name: d.name, year: d.year, tradition: d.tradition, volume: d.vol, source_url: d.url, source: CREED_CREDIT, blocks: d.blocks });
    }
    if (method === "GET" && p === "/v1/writers") {
      const { authors } = await getWritingsIndex();
      return send(res, 200, { results: authors.map((a) => ({ id: a.id, name: a.name, year: a.year, category: a.cat, flag: a.flag || undefined, excerpts: a.n, works: a.works.map(([title, count]) => ({ title, count })), wiki: a.wiki || undefined })) });
    }
    if (method === "GET" && p === "/v1/writings") {
      const ref = required(u, "ref");
      if (!parseReference(ref)) throw new HttpError(400, "bad_reference", "That reference can't be read.");
      const lim = clampInt(u.searchParams.get("limit"), 20, 1, 100), off = clampInt(u.searchParams.get("offset"), 0, 0, 1e6);
      const writer = u.searchParams.get("writer");
      const [short, long, sermons] = await Promise.all([excerptsForPassage(ref), excerptsForPassage(ref, "comm"), sermonsForPassage(ref)]);
      const all = [...short, ...long].filter((e) => !writer || e.writer.id === writer);
      return send(res, 200, { reference: ref, total: all.length, results: all.slice(off, off + lim).map((e) => ({ writer: e.writer.name, writer_id: e.writer.id, year: e.writer.year, work: e.title, on: e.reference, edition: e.source, source_url: e.url || undefined, cites_only: e.cites || undefined, text: e.text })), spurgeon_sermons: sermons });
    }
    if (method === "GET" && p === "/v1/lexicon") return send(res, 200, { results: (await searchLexicon(required(u, "q"), clampInt(u.searchParams.get("limit"), 20, 1, 100))).map((r) => ({ id: r[0], lemma: r[1], transliteration: r[2], gloss: r[3], occurrences: r[4] })) });
    if (method === "GET" && seg[0] === "lexicon" && seg[1] && !seg[2]) {
      const e = await getLexEntry(seg[1]);
      if (!e) throw new HttpError(404, "not_found", "No entry for that number.");
      return send(res, 200, { id: normalizeStrongs(seg[1]), lemma: e.l, transliteration: e.x, pronunciation: e.p, derivation: e.d, strongs_definition: e.s, kjv_renderings: e.k, occurrences: e.c, verses: e.v, senses: (e.m ?? []).map((m) => ({ sense: m.a, gloss: m.g, definition: m.t })) });
    }
    if (method === "GET" && seg[0] === "lexicon" && seg[1] && seg[2] === "verses") {
      const codes = await getConcordance(seg[1]);
      const lim = clampInt(u.searchParams.get("limit"), 50, 1, 500), off = clampInt(u.searchParams.get("offset"), 0, 0, 1e7);
      const t = translationOf(u);
      const results = await Promise.all(codes.slice(off, off + lim).map(async (c) => { const d = decodeVerseCode(c); return { reference: refOf(d.book, d.chapter, d.verse), text: await getVerse(t, d.book, d.chapter, d.verse) }; }));
      return send(res, 200, { total: codes.length, translation: t, results });
    }
    if (method === "GET" && p === "/v1/topics") return send(res, 200, { results: (await searchTopics(required(u, "q"), 20)).map((t) => ({ slug: t[0], name: t[1], references: t[2] })) });
    if (method === "GET" && seg[0] === "topics" && seg[1]) {
      const t = await getTopic(seg[1]);
      if (!t) throw new HttpError(404, "not_found", "No such topic.");
      return send(res, 200, { slug: t.slug, name: t.name, items: t.items.map((i) => ({ heading: i.t, references: i.r ?? [] })) });
    }
    if (method === "GET" && seg[0] === "figures") {
      await ensureFigures();
      if (!seg[1]) {
        const q = u.searchParams.get("q")?.toLowerCase() ?? "";
        const list = allFigures.filter((f) => !q || f.name.toLowerCase().includes(q) || f.altNames?.toLowerCase().includes(q)).slice(0, clampInt(u.searchParams.get("limit"), 50, 1, 500));
        return send(res, 200, { results: list.map((f) => ({ id: f.id, name: f.name, title: f.title })) });
      }
      const f = getFigure(seg[1]);
      if (!f) throw new HttpError(404, "not_found", "No such person.");
      if (seg[2] === "tree") {
        const map = buildSubgraph(f.id, { maxDepth: clampInt(u.searchParams.get("depth"), 2, 1, 10), includeSpouses: true, includeSiblings: true });
        return send(res, 200, { focus: f.id, people: [...map].map(([id, generation]) => ({ id, name: getFigure(id)?.name, generation, parents: getFigure(id)?.parents, spouses: getFigure(id)?.spouses })) });
      }
      return send(res, 200, { ...f, verses: (await versesOfPerson(f.id)).slice(0, 200).map((v) => v.ref), attribution: "BibleData by Brady Stephenson and contributors, CC BY 4.0" });
    }
    if (method === "GET" && p === "/v1/path") {
      await ensureFigures();
      const a = required(u, "from"), b = required(u, "to");
      const route = findShortestPath(a, b);
      if (!route) throw new HttpError(404, "not_found", "No connection between those people is recorded.");
      return send(res, 200, { path: route.map((id, i) => ({ id, name: getFigure(id)?.name, next_relationship: route[i + 1] ? describeRelationshipStep(id, route[i + 1]) : null })) });
    }

    // ---------- Guides ----------
    if (method === "POST" && p === "/v1/guides/generate") {
      const body = await readJson(req);
      if (typeof body.input !== "string" || !body.input.trim()) throw new HttpError(400, "missing_parameter", "Send an input: a passage or topic.");
      try {
        const guide = await generateGuide({
          input: body.input.slice(0, 200),
          format: isGuideFormat(body.format) ? body.format : "inductive",
          lens: isLens(body.lens) ? body.lens : "all",
          translation: isTranslationId(body.translation) ? body.translation : DEFAULT_TRANSLATION,
          title: typeof body.title === "string" ? body.title.slice(0, 200) : undefined,
          peopleFor: peopleInPassage,
        });
        return send(res, 200, guide);
      } catch (e) {
        if (e instanceof GuideInputError) throw new HttpError(422, "no_match", e.message);
        throw e;
      }
    }
    if (seg[0] === "guides") {
      if (method === "GET" && !seg[1]) {
        const rows = listGuides.all(needKey(), clampInt(u.searchParams.get("limit"), 50, 1, 200)) as { id: string; visibility: string; json: string; updated_at: string }[];
        return send(res, 200, { results: rows.map((r) => ({ id: r.id, visibility: r.visibility, title: (JSON.parse(r.json) as Guide).title, updated_at: r.updated_at })) });
      }
      if (method === "POST" && !seg[1]) {
        const me = needKey();
        const body = await readJson(req);
        const guide = sanitizeGuide(body.guide ?? body);
        if (!guide) throw new HttpError(400, "bad_guide", "That isn't a valid guide. It needs a sections array.");
        const id = `g_${randomBytes(9).toString("base64url")}`;
        const visibility = body.visibility === "public" ? "public" : "private";
        const saved = { ...guide, id, updatedAt: new Date().toISOString() };
        putGuide.run(id, me, visibility, JSON.stringify(saved), saved.updatedAt);
        return send(res, 201, { id, visibility, guide: saved, embed: `/embed.html?api=1#apiguide-${id}` });
      }
      if (seg[1]) {
        const row = getGuideRow.get(seg[1]) as { id: string; owner: string; visibility: string; json: string } | undefined;
        if (!row) throw new HttpError(404, "not_found", "No such guide.");
        const mine = row.owner === owner;
        if (method === "GET") {
          if (!mine && row.visibility !== "public") throw new HttpError(404, "not_found", "No such guide.");
          const guide = JSON.parse(row.json) as Guide;
          const format = u.searchParams.get("format");
          if (!format || format === "json") return send(res, 200, { id: row.id, visibility: row.visibility, guide });
          const resolved = await resolveGuide(guide);
          if (format === "md") return send(res, 200, guideToMarkdown(resolved), { "Content-Type": "text/markdown; charset=utf-8" });
          if (format === "txt") return send(res, 200, guideToText(resolved), { "Content-Type": "text/plain; charset=utf-8" });
          if (format === "html") return send(res, 200, guideToHtml(resolved), { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" });
          throw new HttpError(400, "bad_format", "Use format=json, md, txt or html.");
        }
        if (!mine) { needKey(); throw new HttpError(404, "not_found", "No such guide."); }
        if (method === "PUT") {
          const body = await readJson(req);
          const guide = sanitizeGuide(body.guide ?? body);
          if (!guide) throw new HttpError(400, "bad_guide", "That isn't a valid guide.");
          const visibility = body.visibility === "public" || body.visibility === "private" ? body.visibility : row.visibility;
          const saved = { ...guide, id: row.id, updatedAt: new Date().toISOString() };
          putGuide.run(row.id, owner!, visibility, JSON.stringify(saved), saved.updatedAt);
          return send(res, 200, { id: row.id, visibility, guide: saved });
        }
        if (method === "DELETE") { delGuide.run(row.id); return send(res, 200, { deleted: true }); }
      }
    }

    // ---------- API keys ----------
    if (seg[0] === "keys") {
      if (!adminToken || !auth || !safeEq(auth, adminToken)) throw new HttpError(403, "admin_only", "Only the server's administrator can manage keys.");
      if (method === "POST" && !seg[1]) {
        const body = await readJson(req);
        const key = `vl_${randomBytes(24).toString("base64url")}`;
        const id = newId("k");
        insertKey.run(id, hashKey(key), typeof body.label === "string" ? body.label.slice(0, 100) : "", new Date().toISOString());
        return send(res, 201, { id, key, note: "Store this key now. It can't be shown again." });
      }
      if (method === "DELETE" && seg[1]) { revokeKey.run(seg[1]); return send(res, 200, { revoked: true }); }
    }

    // ---------- AI ----------
    if (method === "GET" && p === "/v1/ai/status") return send(res, 200, { enabled: Boolean(anthropicKey) && (aiPublic || Boolean(owner)), needs_key: !aiPublic });
    if (method === "POST" && p === "/v1/ai/ask") {
      if (!anthropicKey) throw new HttpError(503, "ai_off", "The AI assistant isn't set up on this server.");
      if (!aiPublic) needKey();
      const body = (await readJson(req, 400_000)) as AiRequest;
      const n = (bumpAi.get(who, new Date().toISOString().slice(0, 10)) as { n: number }).n;
      if (n > aiDaily) throw new HttpError(429, "ai_limit", "You've reached today's AI limit. Try again tomorrow.");
      const translation = isTranslationId(body.translation) ? body.translation : DEFAULT_TRANSLATION;
      const lens = isLens(body.lens) ? body.lens : "all";
      let system: string, messages: { role: "user" | "assistant"; content: string }[], useTools = false;
      if (body.purpose === "insight") {
        if (typeof body.reference !== "string" || !parseReference(body.reference)) throw new HttpError(400, "bad_reference", "That reference can't be read.");
        system = "You are the study assistant in Veritas Logos.";
        messages = [{ role: "user", content: await insightPrompt(body.reference, translation, lens) }];
      } else if (body.purpose === "chat") {
        if (!Array.isArray(body.messages) || !body.messages.length) throw new HttpError(400, "missing_parameter", "Send at least one message.");
        system = await chatPreamble(translation, lens, typeof body.contextRef === "string" && parseReference(body.contextRef) ? body.contextRef : undefined);
        messages = body.messages.slice(-16).filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim()).map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
        if (messages[messages.length - 1]?.role !== "user") throw new HttpError(400, "bad_messages", "The last message must come from the user.");
        useTools = true;
      } else if (body.purpose === "draft") {
        const guide = sanitizeGuide(body.guide);
        if (!guide || typeof body.request !== "string" || !body.request.trim()) throw new HttpError(400, "bad_guide", "Send a guide and a request.");
        system = "You are the study assistant in Veritas Logos.";
        messages = [{ role: "user", content: await guideDraftPrompt(guide, body.request.slice(0, 2000)) }];
      } else if (body.purpose === "explore") {
        // The server writes the prompt, so this route can't be used as a general-purpose proxy to the model.
        const c = (body.section ?? {}) as Record<string, unknown>;
        if (typeof body.request !== "string" || !body.request.trim() || typeof c.heading !== "string") throw new HttpError(400, "bad_section", "Send a section and a request.");
        system = "You are the study assistant in Veritas Logos.";
        const refs = Array.isArray(c.refs) ? c.refs.filter((r): r is string => typeof r === "string" && Boolean(parseReference(r))).slice(0, 12) : [];
        messages = [{ role: "user", content: await explorePrompt({ heading: c.heading.slice(0, 200), kind: String(c.kind ?? "text").slice(0, 20), text: String(c.text ?? "").slice(0, 6000), refs, lens, translation, guideTitle: typeof c.guideTitle === "string" ? c.guideTitle.slice(0, 200) : undefined }, body.request.slice(0, 2000)) }];
        useTools = true;
      } else if (body.purpose === "exegesis") {
        if (typeof body.reference !== "string" || !parseReference(body.reference)) throw new HttpError(400, "bad_reference", "That reference can't be read.");
        system = "You are the study assistant in Veritas Logos.";
        const st = (body.stage ?? {}) as Record<string, unknown>;
        const stage = { id: st.id === "verses" || st.id === "theology" ? st.id : "overview", label: "", from: Number(st.from) || 0, to: Number(st.to) || 12 } as const;
        messages = [{ role: "user", content: await exegesisStagePrompt(body.reference, translation, lens, stage, typeof body.earlier === "string" ? body.earlier.slice(0, 20000) : "") }];
        useTools = true;
      } else throw new HttpError(400, "bad_purpose", "Use purpose insight, chat, draft, explore or exegesis.");

      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
      const ctl = new AbortController();
      res.on("close", () => ctl.abort());
      const emit = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      try {
        const text = await runAi({ apiKey: anthropicKey, model: aiModel, base: anthropicBase, system, messages, translation, useTools, signal: ctl.signal, onText: (t) => emit({ text: t }) });
        emit({ done: true, references: await checkReferences(text) });
      } catch (e) {
        if (!ctl.signal.aborted) { console.error("AI error:", (e as Error).message); emit({ error: "The assistant couldn't finish. Try again." }); }
      }
      return res.end();
    }
    throw new HttpError(404, "not_found", "No such endpoint. See /v1/openapi.json.");
  }

  async function serveStatic(u: URL, res: http.ServerResponse) {
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(staticDir, rel));
    if (!file.startsWith(staticDir + path.sep)) { res.writeHead(403); return res.end(); }
    try {
      const data = await fs.promises.readFile(file);
      const isData = rel.startsWith("/data/");
      const frameable = rel === "/embed.html";
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": isData ? "public, max-age=86400" : "no-cache",
        "X-Content-Type-Options": "nosniff",
        ...(frameable ? {} : { "X-Frame-Options": "SAMEORIGIN" }),
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://localhost");
    if (u.pathname.startsWith("/v1")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
      try {
        await handleApi(req, res, u);
      } catch (e) {
        if (res.headersSent) return res.end();
        if (e instanceof HttpError) return send(res, e.status, { error: { code: e.code, message: e.message } });
        console.error(e);
        send(res, 500, { error: { code: "server_error", message: "Something went wrong on the server." } });
      }
      return;
    }
    if (staticDir && (req.method === "GET" || req.method === "HEAD")) return serveStatic(u, res);
    res.writeHead(404);
    res.end();
  });
  return { server, db };
}

if (process.argv[1] && /server\.(js|mjs)$/.test(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8787);
  createServer().server.listen(port, () => console.log(`Veritas Logos listening on http://localhost:${port}`));
}
