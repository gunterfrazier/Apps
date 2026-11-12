/**
 * Confirms the built data against the Bible text. There is no hand-written reference content to check, so this
 * tests the sources against each other: references exist, and family links name both people in the cited chapter.
 */
import fs from "node:fs";
import * as esbuild from "esbuild";

const { outputFiles } = await esbuild.build({ stdin: { contents: 'export * from "./src/core/references.ts";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent" });
const { parseReference } = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
const read = (p) => JSON.parse(fs.readFileSync(`public/data/${p}`, "utf8"));
const counts = read("verse-counts.json");
const bibles = ["BSB", "KJV", "ASV", "NHEB", "YLT"].map((t) => [...read(`bible/${t}-ot.json`), ...read(`bible/${t}-nt.json`)]);
const errors = [];
const exists = (ref) => (parseReference(ref) ?? []).length > 0 && parseReference(ref).every((s) => { const t = counts[s.book - 1]?.[s.chapter - 1]; return t && (s.verseStart === undefined || s.verseStart <= t); });
const textOf = (ref) => parseReference(ref).map((s) => bibles.map((b) => (b[s.book - 1]?.[s.chapter - 1] ?? []).join(" ")).join(" ")).join(" ").toLowerCase();

// Every verse must have text in at least one translation.
for (const [b, chapters] of counts.entries()) for (const [c, n] of chapters.entries()) for (let v = 0; v < n; v++) if (!bibles.some((t) => t[b]?.[c]?.[v])) errors.push(`no text at book ${b + 1} ${c + 1}:${v + 1}`);

const figures = read("figures.json");
const byId = new Map(figures.map((f) => [f.id, f]));
let linkTotal = 0, namedTotal = 0;
const missed = [];
const stems = (f) => [f.name, ...(f.altNames ? f.altNames.split(", ") : [])].map((n) => n.toLowerCase().split(/[\s-]/)[0].replace(/[^a-z]/g, "")).filter((n) => n.length > 1).map((n) => n.slice(0, Math.max(3, n.length - 1)));
for (const f of figures) {
  for (const id of [...f.parents, ...f.children, ...f.spouses, ...f.siblings]) if (!byId.has(id)) errors.push(`${f.id} links to unknown person ${id}`);
  for (const [parent, link] of Object.entries(f.parentLinks)) for (const ref of link.refs) {
    if (!exists(ref)) { errors.push(`${f.id}: bad reference ${ref}`); continue; }
    linkTotal++;
    const text = textOf(ref);
    if (stems(f).some((n) => text.includes(n)) && stems(byId.get(parent)).some((n) => text.includes(n))) namedTotal++;
    else missed.push(`${byId.get(parent).name} > ${f.name} (${ref})`);
  }
}
const rate = namedTotal / linkTotal;
console.log(`citations on parent links naming both people in the cited chapter: ${namedTotal}/${linkTotal} (${(rate * 100).toFixed(1)}%)`);
if (missed.length) console.log(`extra citations not matched: ${missed.slice(0, 10).join("; ")}`);
if (rate < 0.95) errors.push("too many family links fail to name both people in the cited chapter");

const { rows, events, nt } = read("timeline.json");
for (const r of rows) if ((r.kind !== "period" && !byId.has(r.id)) || !exists(r.startRef) || r.to < r.from) errors.push(`timeline row ${r.label}`);
for (const e of events) if (!exists(e.ref)) errors.push(`timeline event ${e.label}`);
for (const e of nt) if (!exists(e.ref) || e.x < -10 || e.x > 80) errors.push(`New Testament date ${e.label}`);

// Writers: every reference must exist, every excerpt must name a source, and modern copyrighted authors must be absent.
const index = read("writings/index.json");
const authorNames = index.authors.map((a) => a.name);
for (const banned of ["CS Lewis", "JRR Tolkien", "Douglas Wilson", "GK Chesterton"]) if (authorNames.includes(banned)) errors.push(`${banned} should not be in the data`);
let excerpts = 0;
for (const [kind, parts] of [["writings", index.writings], ["comm", index.comm]]) {
  for (const [book, list] of Object.entries(parts)) {
    for (const [, , k] of list) {
      const shard = read(`${kind}/${String(book).padStart(2, "0")}-${k}.json`);
      for (const [a, t, c1, v1, c2, v2, text] of shard.q) {
        excerpts++;
        const chapters = counts[book - 1];
        if (!index.authors[a] || !shard.t[t] || !index.sources[shard.t[t][2]] || !text) errors.push(`${kind} ${book}: bad record`);
        if (!chapters?.[c1 - 1] || c2 < c1) errors.push(`${kind} ${book}: no chapter ${c1}`);
      }
    }
  }
}
console.log(`writers ${index.authors.length}, excerpts ${excerpts}`);

// Glossary: every definition names a source, every cited verse exists, and no entry has been written for the app.
const glossary = read("glossary.json").terms;
for (const t of glossary) {
  for (const d of t.defs) if (!d.source || !d.text) errors.push(`glossary ${t.term}: definition with no source`);
  for (const r of t.refs) if (!exists(r)) errors.push(`glossary ${t.term}: bad reference ${r}`);
  for (const c of t.corrections ?? []) if (!c.original || !c.why || !c.kind) errors.push(`glossary ${t.term}: correction with no original or reason`);
  if (!t.defs.length && !t.own && !t.see) errors.push(`glossary ${t.term}: no definition`);
}
const church = read("scholar/church.json").events;
for (const e of church) if (!e.source || !e.summary || !e.y1) errors.push(`church event ${e.id}: missing source, summary or date`);
for (const e of church) for (const r of e.refs ?? []) if (!/^[1-3]? ?[A-Za-z ]+ \d/.test(r)) errors.push(`church event ${e.id}: bad reference ${r}`);
console.log(`church history events ${church.length}, creeds ${read("scholar/creeds-index.json").docs.length}`);
const byTerm = new Set(glossary.map((t) => t.id));
for (const t of glossary) if (t.see && !byTerm.has(t.see)) errors.push(`glossary ${t.term}: points to missing ${t.see}`);
console.log(`glossary terms ${glossary.length}, quoted ${glossary.filter((t) => t.defs.length).length}, your glossary ${glossary.filter((t) => t.own).length}`);

// Book guides: every reference is a verse in the app's Bibles, every person and writer exists, every quote names its edition.
if (fs.existsSync("public/data/scholar/bookguides/index.json")) {
  const groups = new Set(Object.values(read("scholar/bookguides/index.json")));
  const guides = [...groups].flatMap((g) => Object.values(read(`scholar/bookguides/${g}.json`).books));
  const writerIds = new Set(read("writings/index.json").authors.map((a) => a.id));
  const figureIds = new Set(figures.map((f) => f.id));
  for (const g of guides) {
    const refs = [...g.self, ...g.keywords.flatMap((k) => k.refs), ...g.onlyHere.flatMap((k) => k.refs), ...g.textual.readings.map((r) => r.at), ...g.links.quotes.map((q) => q.at)];
    for (const r of refs) if (!exists(`${g.name} ${r}`)) errors.push(`book guide ${g.name}: ${r} isn't a verse`);
    for (const q of [...g.links.quotes, ...g.links.quotedBy, ...g.links.allusions, ...g.links.parallels]) if (!exists(q.ref)) errors.push(`book guide ${g.name}: ${q.ref} isn't a verse`);
    for (const x of [...(g.textual.hebrew?.readings ?? []), ...(g.textual.hebrew?.added ?? [])]) if (!exists(`${g.name} ${x.at}`)) errors.push(`book guide ${g.name}: ${x.at} isn't a verse`);
    for (const p of g.people) if (!figureIds.has(p.id)) errors.push(`book guide ${g.name}: no person ${p.id}`);
    for (const w of g.witnesses) {
      if (w.writer && !writerIds.has(w.writer)) errors.push(`book guide ${g.name}: no writer ${w.writer}`);
      if (!w.text || !w.edition || !w.url || !w.cite) errors.push(`book guide ${g.name}: a quote is missing its text, edition, link or citation`);
    }
    if (g.chapters.reduce((n, c) => n + c.words, 0) !== g.glance.words) errors.push(`book guide ${g.name}: chapter word counts don't add up`);
  }
  console.log(`book guides ${guides.length}: ${guides.map((g) => g.name).join(", ")}`);
}

const topics = read("topics/index.json");
console.log(`people ${figures.length}, topics ${topics.length}, timeline rows ${rows.length}`);
if (errors.length) { console.error(errors.slice(0, 40).join("\n")); console.error(`${errors.length} problems`); process.exit(1); }
console.log("All data checks passed.");
