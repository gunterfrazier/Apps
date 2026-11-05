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

const topics = read("topics/index.json");
console.log(`people ${figures.length}, topics ${topics.length}, timeline rows ${rows.length}`);
if (errors.length) { console.error(errors.slice(0, 40).join("\n")); console.error(`${errors.length} problems`); process.exit(1); }
console.log("All data checks passed.");
