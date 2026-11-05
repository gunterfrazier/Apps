import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createServer } from "../server/server";

let base = "";
let srv: http.Server;
let upstream: http.Server;
let db: any;
let key = "";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vl-"));
const upstreamBodies: any[] = [];
const ADMIN = "admin-secret-token";
const j = (url: string, init: RequestInit = {}) => fetch(base + url, init);
const auth = (k: string) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" });
const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as any).port)));

before(async () => {
  // Stands in for the Claude API: first asks for a tool, then answers.
  upstream = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    upstreamBodies.push({ headers: req.headers, body });
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const ev = (o: any) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const asked = body.messages.some((m: any) => Array.isArray(m.content) && m.content.some((c: any) => c.type === "tool_result"));
    if (body.tools?.length && !asked) {
      ev({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "get_passage" } });
      ev({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"reference":"John 11:35"}' } });
      ev({ type: "message_delta", delta: { stop_reason: "tool_use" } });
    } else {
      ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "See John 11:35 and Jude 1:99." } });
      ev({ type: "message_delta", delta: { stop_reason: "end_turn" } });
    }
    res.end();
  });
  const up = await listen(upstream);
  const made = createServer({ dataDir: "public/data", staticDir: "", dbPath: path.join(dir, "t.db"), adminToken: ADMIN, rateLimitPerMin: 100000, aiDailyLimit: 3, anthropicKey: "test-key", anthropicBase: `http://127.0.0.1:${up}`, aiModel: "test-model" });
  srv = made.server; db = made.db;
  base = `http://127.0.0.1:${await listen(srv)}`;
});
after(() => { srv.close(); upstream.close(); srv.closeAllConnections?.(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test("reads are open, with CORS and clear errors", async () => {
  const r = await j("/v1/passages?ref=John%2011:35&translation=KJV");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  const d = await r.json();
  assert.equal(d.parts[0].verses[0].text, "Jesus wept.");
  assert.match(d.notice, /King James/);
  assert.equal((await j("/v1/passages?ref=John%2099:1")).status, 404);
  assert.equal((await j("/v1/passages?ref=John%203:16&translation=NIV")).status, 400);
  assert.equal((await j("/v1/passages")).status, 400);
  assert.equal((await j("/v1/nope")).status, 404);
  assert.equal((await (await j("/v1/openapi.json")).json()).openapi, "3.1.0");
});

test("reference endpoints", async () => {
  const term = await (await j("/v1/glossary/justification")).json();
  assert.ok(term.definitions.length >= 2 && term.owners_glossary);
  assert.match(term.corrections[0].original, /legal declaration/);
  assert.equal((await j("/v1/glossary/nope")).status, 404);
  const hist = await (await j("/v1/church-history?kind=council&q=chalcedon")).json();
  assert.ok(hist.results.some((e: any) => e.id === "chalcedon"));
  const creed = await (await j("/v1/creeds/nicene-creed")).json();
  assert.ok(creed.blocks.length > 3);
  assert.equal((await j("/v1/creeds/nope")).status, 404);
  const writers = await (await j("/v1/writers")).json();
  assert.ok(writers.results.some((w: any) => w.id === "augustine-of-hippo" && w.year === 430));
  const on = await (await j("/v1/writings?ref=John%203:16&limit=3")).json();
  assert.equal(on.results.length, 3);
  assert.ok(on.results.every((r: any) => r.edition && r.text));
  assert.equal((await j("/v1/writings?ref=Nonsense%2099")).status, 400);
  const ins = await (await j("/v1/insights?ref=Romans%201:17")).json();
  assert.ok(ins.quotes.some((q: any) => q.ref.startsWith("Habakkuk 2:4")));
  assert.ok((await (await j("/v1/verses/words?ref=Genesis%201:1")).json()).words.length > 3);
  assert.equal((await (await j("/v1/lexicon/G26")).json()).lemma, "ἀγάπη");
  assert.ok((await (await j("/v1/lexicon/G26/verses?limit=2")).json()).results.length === 2);
  assert.ok((await (await j("/v1/topics?q=forgiveness")).json()).results.length);
  assert.ok((await (await j("/v1/figures?q=david")).json()).results.length);
  assert.ok((await (await j("/v1/figures/david-1/tree")).json()).people.length > 3);
  assert.ok((await (await j("/v1/path?from=abram-1&to=david-1")).json()).path.length > 3);
  assert.ok((await (await j("/v1/crossrefs?ref=John%203:16")).json()).results.length);
});

test("keys: only the admin can create them", async () => {
  assert.equal((await j("/v1/keys", { method: "POST", body: "{}" })).status, 403);
  const made = await j("/v1/keys", { method: "POST", headers: auth(ADMIN), body: JSON.stringify({ label: "test" }) });
  assert.equal(made.status, 201);
  key = (await made.json()).key;
  assert.equal((await j("/v1/guides", { headers: auth("wrong") })).status, 401);
});

test("guides: generate, save, privacy, export, delete", async () => {
  const gen = await j("/v1/guides/generate", { method: "POST", body: JSON.stringify({ input: "Psalm 23", format: "teaching", lens: "orthodox", translation: "ASV" }) });
  assert.equal(gen.status, 200);
  const guide = await gen.json();
  assert.equal((await j("/v1/guides/generate", { method: "POST", body: JSON.stringify({ input: "qqqzzz xyzzy" }) })).status, 422);
  assert.equal((await j("/v1/guides", { method: "POST", body: JSON.stringify({ guide }) })).status, 401);
  const saved = await (await j("/v1/guides", { method: "POST", headers: auth(key), body: JSON.stringify({ guide }) })).json();
  const id = saved.id;
  assert.equal((await j(`/v1/guides/${id}`)).status, 404, "private guides are hidden");
  assert.equal((await j(`/v1/guides/${id}`, { headers: auth(key) })).status, 200);
  const other = (await (await j("/v1/keys", { method: "POST", headers: auth(ADMIN), body: "{}" })).json()).key;
  assert.equal((await j(`/v1/guides/${id}`, { method: "DELETE", headers: auth(other) })).status, 404, "other keys can't touch it");
  await j(`/v1/guides/${id}`, { method: "PUT", headers: auth(key), body: JSON.stringify({ guide: saved.guide, visibility: "public" }) });
  const md = await j(`/v1/guides/${id}?format=md`);
  assert.equal(md.status, 200);
  assert.match(await md.text(), /Jehovah is my shepherd/);
  assert.equal((await (await j("/v1/guides", { headers: auth(key) })).json()).results.length, 1);
  assert.equal((await j(`/v1/guides/${id}`, { method: "DELETE", headers: auth(key) })).status, 200);
  assert.equal((await j(`/v1/guides/${id}`)).status, 404);
});

test("AI: needs a key, runs tools, flags bad references, enforces the daily limit", async () => {
  const body = JSON.stringify({ purpose: "chat", messages: [{ role: "user", content: "Why did Jesus weep?" }], translation: "KJV" });
  assert.equal((await j("/v1/ai/ask", { method: "POST", body })).status, 401);
  assert.equal((await (await j("/v1/ai/status")).json()).enabled, false);
  assert.equal((await (await j("/v1/ai/status", { headers: auth(key) })).json()).enabled, true);
  const res = await j("/v1/ai/ask", { method: "POST", headers: auth(key), body });
  assert.equal(res.status, 200);
  const stream = await res.text();
  assert.match(stream, /See John 11:35/);
  assert.match(stream, /"ok":false/, "Jude 1:99 is flagged");
  const second = upstreamBodies[upstreamBodies.length - 1];
  assert.equal(second.headers["x-api-key"], "test-key");
  assert.equal(second.headers["anthropic-version"], "2023-06-01");
  assert.equal(second.body.model, "test-model");
  const toolResult = second.body.messages[second.body.messages.length - 1].content[0];
  assert.equal(toolResult.type, "tool_result");
  assert.match(toolResult.content, /Jesus wept/, "tools answer from the real text");
  const insight = await j("/v1/ai/ask", { method: "POST", headers: auth(key), body: JSON.stringify({ purpose: "insight", reference: "John 11:35", lens: "catholic" }) });
  assert.equal(insight.status, 200);
  await insight.text();
  assert.match(upstreamBodies[upstreamBodies.length - 1].body.messages[0].content, /Catholic lens/);
  assert.equal((await j("/v1/ai/ask", { method: "POST", headers: auth(key), body: JSON.stringify({ purpose: "other" }) })).status, 400);
  assert.equal((await j("/v1/ai/ask", { method: "POST", headers: auth(key), body })).status, 429, "daily limit applies");
});
