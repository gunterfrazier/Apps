// Builds public/bible/xref/<book>.json from OpenBible.info's cross-reference data (CC-BY, openbible.info/labs/cross-references).
//   node tools/xrefs.mjs path/to/cross_references.txt
// Keeps the references people voted most useful (at least MIN_VOTES, up to PER_VERSE per verse), one small file per book
// so the app only loads the book being read. Each file: { "chapter.verse": "book.chapter.verse[-end] ..." }, where book is
// 0 (Genesis) to 65 (Revelation) and end is a verse in the same chapter or chapter.verse.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_VOTES = 3, PER_VERSE = 6;
const OSIS = ["Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
  "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev"];
const book = Object.fromEntries(OSIS.map((b, i) => [b, i]));
const verse = (s) => { const [b, c, v] = String(s).split("."); return b in book && +c > 0 && +v > 0 ? { b: book[b], c: +c, v: +v } : null; };

const file = process.argv[2];
if (!file) { console.error("Usage: node tools/xrefs.mjs cross_references.txt"); process.exit(1); }
const lines = readFileSync(file, "utf8").split("\n");
if (!/openbible\.info/i.test(lines[0])) console.warn("The first line doesn't mention openbible.info; check this is their file.");
const by = new Map();
for (const line of lines.slice(1)) {
  const [from, to, votes] = line.trim().split("\t");
  if (!to || !(+votes >= MIN_VOTES)) continue;
  const a = verse(from), [s, e] = to.split("-"), t = verse(s), end = e ? verse(e) : null;
  if (!a || !t) continue;
  let code = `${t.b}.${t.c}.${t.v}`;
  if (end && end.b === t.b && (end.c !== t.c || end.v !== t.v)) code += end.c === t.c ? `-${end.v}` : `-${end.c}.${end.v}`;
  const key = `${a.b}|${a.c}.${a.v}`;
  if (!by.has(key)) by.set(key, []);
  by.get(key).push([+votes, code]);
}
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "bible", "xref");
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const books = Array.from({ length: 66 }, () => ({}));
let total = 0;
for (const [key, list] of by) {
  const [b, cv] = key.split("|");
  const keep = list.sort((x, y) => y[0] - x[0]).slice(0, PER_VERSE).map((x) => x[1]);
  books[+b][cv] = keep.join(" "); total += keep.length;
}
let bytes = 0;
books.forEach((o, i) => { const s = JSON.stringify(o); bytes += s.length; writeFileSync(join(out, `${i}.json`), s); });
writeFileSync(join(out, "README.txt"), "Cross-references from OpenBible.info (https://www.openbible.info/labs/cross-references/), CC-BY.\nBuilt by tools/xrefs.mjs: references with at least 3 votes, up to 6 per verse.\n");
console.log(`${total} cross-references for ${by.size} verses, ${(bytes / 1024).toFixed(0)} KB in 66 files`);
