/**
 * Builds public/data from open sources. Run after cloning the sources listed in DATA-LICENSES.md:
 *   node --no-warnings scripts/build-data.mjs --sources ../sources
 *
 * Nothing here is written by hand: every verse, word, definition, cross-reference, topic, person and
 * family link comes from a named source, and scripts/check-data.mjs verifies the result.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as esbuild from "esbuild";

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const SRC = path.resolve(arg("--sources", "../sources"));
const OUT = path.resolve("public/data");
fs.rmSync(OUT, { recursive: true, force: true });
const mk = (d) => fs.mkdirSync(path.join(OUT, d), { recursive: true });
["bible", "words", "xref", "lex", "conc", "topics"].forEach(mk);
const write = (rel, data) => fs.writeFileSync(path.join(OUT, rel), JSON.stringify(data));
// Per-book lookups (quotations, confession citations, topics, people) share one file per book, to stay within the host's file limit.
const refBooks = Array.from({ length: 66 }, () => ({}));
const BOOK_NAMES = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const CODES = "Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev".split(" ");
const codeToBook = new Map(CODES.map((c, i) => [c.toUpperCase(), i + 1]));
const nameToBook = new Map(BOOK_NAMES.map((n, i) => [n, i + 1]));
const vcode = (b, c, v) => b * 1000000 + c * 1000 + v;

// ---------- 1. Bible text ----------
const fromScroll = (file, clean = (t) => t) => {
  const src = JSON.parse(fs.readFileSync(path.join(SRC, "sc/formats/json", `${file}.json`), "utf8"));
  if (src.books.length !== 66) throw new Error(file);
  return src.books.map((book) =>
    [...book.chapters].sort((a, b) => a.chapter - b.chapter).map((ch) => {
      const verses = [];
      for (const v of ch.verses) verses[v.verse - 1] = clean(String(v.text).trim(), v.verse);
      return Array.from(verses, (x) => x ?? "");
    }),
  );
};
const BIBLES = {
  BSB: fromScroll("BSB"),
  NHEB: fromScroll("NHEB"),
  // Pure Cambridge Edition: drop pilcrows, and the drop-cap capitals at chapter starts ("IN the beginning").
  KJV: fromScroll("KJVPCE", (t, verse) => {
    let out = t.replace(/¶\s*/g, "");
    if (verse === 1) out = out.replace(/\b([A-Z])([A-Z]+)\b/, (_, x, y) => x + y.toLowerCase());
    return out;
  }),
  ASV: fromScroll("ASV", (t) => t.replace(/\s*\[Selah\]?/g, " Selah").trim()),
  YLT: fromScroll("YLT"),
};
const counts = BOOK_NAMES.map((_, b) =>
  // A chapter ends at the last verse that has text in at least one translation.
  BIBLES.KJV[b].map((_c, c) => Math.max(...Object.values(BIBLES).map((t) => { const v = t[b][c] ?? []; let n = v.length; while (n > 0 && !v[n - 1]) n--; return n; }))),
);
for (const [id, books] of Object.entries(BIBLES)) {
  write(`bible/${id}-ot.json`, books.slice(0, 39));
  write(`bible/${id}-nt.json`, books.slice(39));
  let n = 0;
  books.forEach((b) => b.forEach((c) => c.forEach((v) => v && n++)));
  console.log(id, n, "verses");
}
write("verse-counts.json", counts);

// ---------- 2. Original-language words + 3. concordance ----------
const conc = new Map(); // base id -> Set of verse codes in order
const tokenCount = new Map();
const baseId = (d) => {
  const m = d.match(/^([HG])0*(\d+)/);
  return m ? `${m[1]}${m[2]}` : null;
};
const clean = (s) => s.replace(/[\/\\]/g, "").trim();
const cleanGloss = (s) => s.replace(/\s*[\/\\]\s*/g, " ").replace(/\s+/g, " ").trim();
const lines = [];
const dir = path.join(SRC, "STEPBible-Data/Translators Amalgamated OT+NT");
for (const f of fs.readdirSync(dir).filter((f) => /^TA(HOT|GNT)/.test(f)).sort()) {
  for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) lines.push(line);
}
const REF = /^([1-3A-Za-z]{3})\.(\d+)\.(\d+)[^#]*#(\d+)=([^\t]*)\t/;
const perVerse = new Map(); // code -> {ot:[], nt:{n:[],k:[],o:[]}}
for (const line of lines) {
  const m = line.match(REF);
  if (!m) continue;
  const b = codeToBook.get(m[1].toUpperCase());
  if (!b) throw new Error("book " + m[1]);
  const code = vcode(b, +m[2], +m[3]);
  const type = m[5];
  const f = line.split("\t");
  let word;
  if (b <= 39) {
    if (/^[Kk]/.test(type)) continue; // Ketiv is a variant of the Qere that translators follow
    const roots = f[4] || "";
    const main = (roots.match(/\{([^}]+)\}/) || [])[1] || roots.split(/[\/\\+]/).find((t) => t && !/^H9/.test(t)) || roots.split(/[\/\\]/)[0] || "";
    word = [clean(f[1]), clean(f[2]), cleanGloss(f[3]), main.replace(/^([HG])0*/, "$1"), (f[5] || "").trim()];
    let e = perVerse.get(code);
    if (!e) perVerse.set(code, (e = { w: [] }));
    e.w.push(word);
  } else {
    const tm = (f[1] || "").match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    const [ds, morph] = (f[3] || "").split("=");
    word = [(tm ? tm[1] : f[1]).trim(), tm ? tm[2] : "", cleanGloss(f[2] || ""), (ds || "").replace(/^([HG])0*/, "$1"), (morph || "").trim()];
    const t = type.toLowerCase();
    const bucket = /^n/.test(t) || (t.includes("n") && !t.startsWith("k")) ? "n" : t.includes("k") ? "k" : "o";
    let e = perVerse.get(code);
    if (!e) perVerse.set(code, (e = { n: [], k: [], o: [] }));
    e[bucket].push(word);
  }
}
const wordsByBook = BOOK_NAMES.map(() => []);
for (const [code, e] of [...perVerse.entries()].sort((a, b) => a[0] - b[0])) {
  const b = Math.floor(code / 1000000), c = Math.floor(code / 1000) % 1000, v = code % 1000;
  const words = e.w ?? (e.n.length ? e.n : e.k.length ? e.k : e.o);
  ((wordsByBook[b - 1][c - 1] ??= [])[v - 1] = words);
  for (const w of words) {
    const id = baseId(w[3]);
    if (!id || /^H9\d{3}$/.test(id)) continue;
    tokenCount.set(id, (tokenCount.get(id) || 0) + 1);
    let s = conc.get(id);
    if (!s) conc.set(id, (s = []));
    if (s[s.length - 1] !== code) s.push(code);
  }
}
let wordTotal = 0;
wordsByBook.forEach((chapters, i) => {
  for (let c = 0; c < chapters.length; c++) {
    if (!chapters[c]) chapters[c] = [];
    chapters[c] = Array.from(chapters[c], (x) => x ?? []);
    chapters[c].forEach((vv) => (wordTotal += vv.length));
  }
  write(`words/${String(i + 1).padStart(2, "0")}.json`, chapters);
});
console.log("words", wordTotal);
const shard = (id) => `${id[0]}${Math.floor(Number(id.slice(1)) / 1000)}`;
const concShards = {};
for (const [id, codes] of conc) {
  const deltas = codes.map((c, i) => (i ? c - codes[i - 1] : c));
  (concShards[shard(id)] ??= {})[id] = deltas;
}
for (const [s, data] of Object.entries(concShards)) write(`conc/${s}.json`, data);

// ---------- 4. Lexicon ----------
const loadStrongs = (file, name) => {
  const txt = fs.readFileSync(path.join(SRC, "strongs", file), "utf8");
  const start = txt.indexOf(`var ${name} = `) + `var ${name} = `.length;
  const end = txt.lastIndexOf("};") + 1;
  return JSON.parse(txt.slice(start, end));
};
const heb = loadStrongs("hebrew/strongs-hebrew-dictionary.js", "strongsHebrewDictionary");
const grk = loadStrongs("greek/strongs-greek-dictionary.js", "strongsGreekDictionary");
const lex = new Map();
for (const [k, e] of Object.entries({ ...heb, ...grk })) {
  lex.set(k, {
    l: e.lemma, x: e.xlit || e.translit, p: e.pron, d: e.derivation, s: e.strongs_def, k: e.kjv_def?.replace(/\s*\uFFFD\s*/g, " ").trim(),
  });
}
/** Keeps only <b>, <i> and line breaks; turns <ref> into plain text so nothing executable survives. */
const sanitize = (html) =>
  html
    .replace(/<ref=[^>]*>/gi, "").replace(/<\/ref>/gi, "")
    .replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "")
    .replace(/<\/?(author|date|re)\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(?!\/?(b|i)>)[^>]*>/gi, "")
    .replace(/_{2,}/g, "  ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
for (const f of fs.readdirSync(path.join(SRC, "STEPBible-Data/Lexicons")).filter((f) => /^TBES[GH]/.test(f))) {
  for (const line of fs.readFileSync(path.join(SRC, "STEPBible-Data/Lexicons", f), "utf8").split("\n")) {
    const c = line.split("\t");
    if (!/^[HG]\d{4,5}/.test(c[0] || "") || c.length < 8) continue;
    const id = baseId(c[0]);
    const dm = (c[1] || "").match(/^([HG]\d+)([A-Z]?)/);
    let e = lex.get(id);
    if (!e) lex.set(id, (e = { l: c[3], x: c[4] }));
    (e.m ??= []).push({ a: dm?.[2] || "", l: c[3], x: c[4], g: c[6], m: c[5], t: sanitize(c[7] || "") });
  }
}
const lexShards = {};
const lexIndex = [];
for (const [id, e] of lex) {
  if (!/^[HG]\d+$/.test(id)) continue;
  const count = tokenCount.get(id) || 0;
  e.c = count;
  e.v = conc.get(id)?.length || 0;
  (lexShards[shard(id)] ??= {})[id] = e;
  const gloss = e.m?.[0]?.g || (e.s || "").split(/[;,.]/)[0] || "";
  lexIndex.push([id, e.l || "", e.x || "", gloss.slice(0, 60), count]);
}
for (const [s, data] of Object.entries(lexShards)) write(`lex/${s}.json`, data);
write("lex/index.json", lexIndex);
console.log("lexicon", lexIndex.length, "shards", Object.keys(lexShards).length);

// ---------- 5. Cross references ----------
const xrefs = new Map();
let xTotal = 0;
for (const f of fs.readdirSync(path.join(SRC, "sc/formats/sqlite/extras")).filter((f) => /^cross_references_\d+\.db$/.test(f)).sort()) {
  const db = new DatabaseSync(path.join(SRC, "sc/formats/sqlite/extras", f), { readOnly: true });
  for (const r of db.prepare("select * from cross_references where votes > 0").iterate()) {
    const a = nameToBook.get(r.from_book === "Psalm" ? "Psalms" : r.from_book), t = nameToBook.get(r.to_book === "Psalm" ? "Psalms" : r.to_book);
    if (!a || !t) continue;
    const key = vcode(a, r.from_chapter, r.from_verse);
    let list = xrefs.get(key);
    if (!list) xrefs.set(key, (list = []));
    list.push([vcode(t, r.to_chapter, r.to_verse_start), r.to_verse_end > r.to_verse_start ? r.to_verse_end : 0, r.votes]);
  }
  db.close();
}
const xBooks = BOOK_NAMES.map(() => ({}));
for (const [k, list] of xrefs) {
  const b = Math.floor(k / 1000000);
  list.sort((x, y) => y[2] - x[2]);
  const uniq = new Set();
  const top = list.filter((x) => { const k = `${x[0]}-${x[1]}`; if (uniq.has(k)) return false; uniq.add(k); return true; }).slice(0, 12);
  xTotal += top.length;
  xBooks[b - 1][`${Math.floor(k / 1000) % 1000}:${k % 1000}`] = top;
}
xBooks.forEach((d, i) => write(`xref/${String(i + 1).padStart(2, "0")}.json`, d));
console.log("crossrefs kept", xTotal);

// ---------- 6. Nave's topics ----------
const parseCsv = (txt) => {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
};
const navRows = parseCsv(fs.readFileSync(path.join(SRC, "bible-data/NavesTopicalDictionary.csv"), "utf8").replace(/^﻿/, "")).slice(1);
const CODE_RE = /\b(GEN|EXO|LEV|NUM|DEU|JOS|JDG|RUT|1SA|2SA|1KI|2KI|1CH|2CH|EZR|NEH|EST|JOB|PSA|PRO|ECC|SNG|ISA|JER|LAM|EZK|DAN|HOS|JOL|AMO|OBA|JON|MIC|NAM|HAB|ZEP|HAG|ZEC|MAL|MAT|MRK|LUK|JHN|ACT|ROM|1CO|2CO|GAL|EPH|PHP|COL|1TH|2TH|1TI|2TI|TIT|PHM|HEB|JAS|1PE|2PE|1JN|2JN|3JN|JUD|REV) (\d+(?::\d+)?[\d:,\- ]*(?:; ?\d+(?![A-Z\d])(?::\d+)?[\d:,\- ]*)*)/g;
const verseCount = (b, c) => counts[b - 1]?.[c - 1] ?? 0;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const topicIndex = [];
const byLetter = {};
const seen = new Set();
let badRefs = 0, goodRefs = 0;
for (const [, subject, entry] of navRows) {
  if (!subject || !entry) continue;
  let slug = slugify(subject);
  if (!slug || seen.has(slug)) continue;
  seen.add(slug);
  const items = [];
  for (const rawLine of entry.split("\n")) {
    const depth = rawLine.match(/^\s*/)[0].length > 0 ? 1 : 0;
    const line = rawLine.trim().replace(/^-/, "");
    if (!line) continue;
    const first = line.search(CODE_RE);
    const label = (first >= 0 ? line.slice(0, first) : line).trim();
    const refs = [];
    for (const m of line.matchAll(CODE_RE)) {
      const b = codeToBook.get(m[1]);
      for (const part of m[2].split(";")) {
        const p = part.trim().replace(/[ ,\-]+$/, "");
        if (!p) continue;
        // chapter-only refs must exist; verse refs are bounds-checked on the first verse
        const chap = +p.split(":")[0].split(",")[0].split("-")[0];
        const v1 = p.includes(":") ? +p.split(":")[1].split(/[,\-]/)[0] : 1;
        if (!verseCount(b, chap) || v1 > verseCount(b, chap)) { badRefs++; continue; }
        goodRefs++;
        refs.push(`${BOOK_NAMES[b - 1]} ${p.replace(/\s+/g, "")}`);
      }
    }
    items.push(refs.length ? { t: label, d: depth, r: refs } : { t: label, d: depth });
  }
  const refCount = items.reduce((a, i) => a + (i.r?.length || 0), 0);
  const name = subject.charAt(0) + subject.slice(1).toLowerCase();
  const letter = slug[0];
  (byLetter[letter] ??= {})[slug] = { name, items };
  topicIndex.push([slug, name, refCount]);
}
for (const [l, data] of Object.entries(byLetter)) write(`topics/${l}.json`, data);
write("topics/index.json", topicIndex);
console.log("topics", topicIndex.length, "refs ok", goodRefs, "dropped", badRefs);

// ---------- 9. Quoted, parallel, possibly alluded to ----------
// A reference pair counts as a quotation or parallel only if the wording visibly matches.
const STOP = new Set("the and of to in that a he i for it his is was not with you be they them shall but on as all have will who my me we by at from this your him are her she or so had which their what when then there were an unto ye thee thou thy said".split(" "));
const norm = (s) => s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
const vTexts = (b, c, v1, v2) => {
  const out = [];
  for (const id of ["BSB", "ASV", "KJV", "NHEB"]) {
    const chapter = BIBLES[id][b - 1]?.[c - 1] ?? [];
    out.push(chapter.slice(v1 - 1, (v2 || v1)).join(" "));
  }
  return out;
};
function longestRun(aText, bText) {
  const a = norm(aText), b = norm(bText);
  let best = [0, 0];
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      diag = tmp;
      if (prev[j] > best[0]) best = [prev[j], i];
    }
  }
  const words = a.slice(best[1] - best[0], best[1]);
  return { len: best[0], content: words.filter((w) => !STOP.has(w)).length, words };
}
const FORMULA = /(it is written|it was written|as it is written|scripture|the prophet|prophet|says the lord|moses (said|wrote|says)|david (says|said)|isaiah|jeremiah|the law|have you not read|did you never read|have ye not read|god said|he says|he said|for it says|says|saith|fulfilled)/i;
const rawPairs = [];
for (const [from, list] of xrefs) rawPairs.push([from, list]);
const inter = BOOK_NAMES.map(() => ({}));
const addI = (code, field, value) => {
  const b = Math.floor(code / 1000000);
  const key = `${Math.floor(code / 1000) % 1000}:${code % 1000}`;
  const e = (inter[b - 1][key] ??= {});
  (e[field] ??= []).push(value);
};
const refName = (code, end) => `${BOOK_NAMES[Math.floor(code / 1000000) - 1]} ${Math.floor(code / 1000) % 1000}:${code % 1000}${end ? `–${end}` : ""}`;
const seenPair = new Set();
let nQ = 0, nP = 0, nA = 0;
const titlesOf = (s) => s.join(" ");
for (const [from, list] of rawPairs) {
  const fb = Math.floor(from / 1000000), fc = Math.floor(from / 1000) % 1000, fv = from % 1000;
  for (const [to, endV, votes] of list) {
    const pk = `${from}>${to}-${endV}`;
    if (seenPair.has(pk)) continue;
    seenPair.add(pk);
    const tb = Math.floor(to / 1000000), tc = Math.floor(to / 1000) % 1000, tv = to % 1000;
    if (tb === fb && tc === fc) continue;
    const fromTexts = vTexts(fb, fc, fv, fv), toTexts = vTexts(tb, tc, tv, endV || tv);
    let best = { len: 0, content: 0, words: [] };
    for (let i = 0; i < fromTexts.length; i++) {
      const r = longestRun(fromTexts[i], toTexts[i]);
      if (r.content > best.content || (r.content === best.content && r.len > best.len)) best = r;
    }
    const ntFrom = fb >= 40, otTo = tb <= 39, otFrom = fb <= 39, ntTo = tb >= 40;
    const hasFormula = fromTexts.some((t) => FORMULA.test(t));
    const strong = best.content >= 3 && best.len >= 5;
    const withFormula = best.content >= 2 && best.len >= 4 && hasFormula;
    if (ntFrom && otTo && (strong || withFormula)) {
      addI(from, "q", [refName(to, endV), best.words.join(" ")]);
      for (let v = tv; v <= (endV || tv); v++) addI(tb * 1000000 + tc * 1000 + v, "by", [refName(from, 0), best.words.join(" ")]);
      nQ++;
    } else if (((ntFrom && ntTo) || (otFrom && otTo)) && best.content >= 4 && best.len >= 6) {
      addI(from, "p", [refName(to, endV), best.words.join(" ")]);
      nP++;
    } else if (((ntFrom && otTo) || (otFrom && ntTo)) && votes >= 20) {
      addI(from, "a", [refName(to, endV), votes]);
      nA++;
    }
  }
}
inter.forEach((d, i) => {
  for (const e of Object.values(d)) {
    if (e.a) e.a = e.a.sort((x, y) => y[1] - x[1]).slice(0, 8);
    for (const f of ["q", "by", "p"]) if (e[f]) e[f] = e[f].filter((x, j, arr) => arr.findIndex((y) => y[0] === x[0]) === j).slice(0, 8);
  }
  refBooks[i].i = d;
});
console.log("intertext quotes", nQ, "parallels", nP, "possible allusions", nA);

// ---------- 10. Historic confessions: where each verse is cited as a proof text ----------
const CONFESSIONS = [
  ["westminster_confession_of_faith", "WCF", "Westminster Confession", 1647, "Reformed"],
  ["westminster_larger_catechism", "WLC", "Westminster Larger Catechism", 1648, "Reformed"],
  ["heidelberg_catechism", "HC", "Heidelberg Catechism", 1563, "Reformed"],
  ["1695_baptist_catechism", "BC", "Baptist Catechism", 1695, "Baptist"],
];
const SHORT = { Gen: 1, Exod: 2, Lev: 3, Num: 4, Deut: 5, Josh: 6, Judg: 7, Ruth: 8, "1Sam": 9, "2Sam": 10, "1Kgs": 11, "2Kgs": 12, "1Chr": 13, "2Chr": 14, Ezra: 15, Neh: 16, Esth: 17, Job: 18, Ps: 19, Prov: 20, Eccl: 21, Song: 22, Isa: 23, Jer: 24, Lam: 25, Ezek: 26, Dan: 27, Hos: 28, Joel: 29, Amos: 30, Obad: 31, Jonah: 32, Mic: 33, Nah: 34, Hab: 35, Zeph: 36, Hag: 37, Zech: 38, Mal: 39, Matt: 40, Mark: 41, Luke: 42, John: 43, Acts: 44, Rom: 45, "1Cor": 46, "2Cor": 47, Gal: 48, Eph: 49, Phil: 50, Col: 51, "1Thess": 52, "2Thess": 53, "1Tim": 54, "2Tim": 55, Titus: 56, Phlm: 57, Heb: 58, Jas: 59, "1Pet": 60, "2Pet": 61, "1John": 62, "2John": 63, "3John": 64, Jude: 65, Rev: 66 };
const confSections = [];
const confBooks = BOOK_NAMES.map(() => ({}));
let confCites = 0, confBad = 0;
const addCite = (code, sectionIndex) => {
  const b = Math.floor(code / 1000000);
  const key = `${Math.floor(code / 1000) % 1000}:${code % 1000}`;
  const list = (confBooks[b - 1][key] ??= []);
  if (!list.includes(sectionIndex)) list.push(sectionIndex);
  confCites++;
};
const expand = (ref) => {
  // "Rom.3.24", "Acts.13.38-Acts.13.39", "1Cor.6.19,1Cor.6.2" (later items may be typos in the source: bounds-checked)
  const out = [];
  for (const piece of ref.split(",")) {
    const m = piece.trim().match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)(?:-(?:[1-3]?[A-Za-z]+\.)?(?:(\d+)\.)?(\d+))?$/);
    if (!m || !SHORT[m[1]]) { confBad++; continue; }
    const b = SHORT[m[1]], c = +m[2], v1 = +m[3], c2 = m[4] ? +m[4] : c, v2 = m[5] ? +m[5] : v1;
    if (!verseCount(b, c) || v1 > verseCount(b, c)) { confBad++; continue; }
    if (c2 !== c) out.push(vcode(b, c, v1));
    else for (let v = v1; v <= Math.min(v2, verseCount(b, c)); v++) out.push(vcode(b, c, v));
  }
  return out;
};
for (const [file, abbr, name, year, tradition] of CONFESSIONS) {
  const doc = JSON.parse(fs.readFileSync(path.join(SRC, "creeds/creeds", `${file}.json`), "utf8"));
  if (!/public domain/i.test(doc.Metadata.SourceAttribution || "")) throw new Error(`${file} is not public domain`);
  const addSection = (label, title, text, proofs) => {
    const idx = confSections.length;
    confSections.push([abbr, label, title, text.slice(0, 420)]);
    for (const p of proofs || []) for (const r of p.References || []) expand(r).forEach((code) => addCite(code, idx));
  };
  for (const item of doc.Data) {
    if (item.Sections) for (const s of item.Sections) addSection(`${item.Chapter}.${s.Section}`, item.Title || "", s.Content || "", s.Proofs);
    else if (item.Question) addSection(`Q${item.Number}`, item.Question, item.Answer || "", item.Proofs);
  }
}
write("confession-sections.json", { docs: Object.fromEntries(CONFESSIONS.map(([, a, n, y, t]) => [a, { name: n, year: y, tradition: t }])), sections: confSections });
confBooks.forEach((d, i) => { refBooks[i].c = d; });
console.log("confession sections", confSections.length, "citations", confCites, "unparsed", confBad);


// ---------- 11. Which Nave's topics cite each verse ----------
const { outputFiles: refBuild } = await esbuild.build({ entryPoints: ["src/core/references.ts"], bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent" });
const { parseReference } = await import("data:text/javascript;base64," + Buffer.from(refBuild[0].text).toString("base64"));
const topicVerses = BOOK_NAMES.map(() => ({}));
const topicRows = topicIndex.map((t) => [t[0], t[1]]);
const topicNumber = new Map(topicIndex.map((t, i) => [t[0], i]));
for (const letter of Object.keys(byLetter)) {
  for (const [slug, topic] of Object.entries(byLetter[letter])) {
    const n = topicNumber.get(slug);
    for (const item of topic.items) for (const ref of item.r ?? []) {
      for (const seg of parseReference(ref) ?? []) {
        if (seg.chapterEnd !== seg.chapter || seg.verseStart === undefined) continue; // whole chapters would swamp the index
        const end = Math.min(seg.verseEnd ?? seg.verseStart, seg.verseStart + 12);
        for (let v = seg.verseStart; v <= end; v++) {
          const list = (topicVerses[seg.book - 1][`${seg.chapter}:${v}`] ??= []);
          if (!list.includes(n)) list.push(n);
        }
      }
    }
  }
}
topicVerses.forEach((d, i) => { refBooks[i].t = d; });
write("topics/names.json", topicRows);

// ---------- 12. Books, people and chronology from BibleData (CC BY 4.0) ----------
const csvRows = (file) => {
  const rows = parseCsv(fs.readFileSync(path.join(SRC, "bible-data", file), "utf8").replace(/^﻿/, ""));
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
};
const prettyRefs = (text) => text.replace(/\b([1-3]?[A-Z]{2,3}) (\d+:\d+)/g, (m, code, rest) => {
  const b = codeToBook.get(code);
  return b ? `${BOOK_NAMES[b - 1]} ${rest}` : m;
});
const refCode = (ref) => {
  const m = (ref || "").match(/^([1-3]?[A-Z]{2,3}) (\d+):(\d+)/);
  const b = m && codeToBook.get(m[1]);
  return b && verseCount(b, +m[2]) >= +m[3] ? vcode(b, +m[2], +m[3]) : 0;
};
const niceRef = (ref) => { const c = refCode(ref); return c ? refName(c, 0) : ""; };

const books = csvRows("BibleData-Book.csv").map((b, i) => {
  if (+b.chapter_count !== counts[i].length) console.log(`note: ${b.book_name} chapters ${b.chapter_count} vs ${counts[i].length}`);
  return { name: BOOK_NAMES[i], testament: i < 39 ? "Old Testament" : "New Testament", chapters: counts[i].length, verses: counts[i].reduce((x, y) => x + y, 0), hebrew: b.hebrew_name, hebrewTranslit: b.hebrew_transliteration, hebrewMeaning: b.hebrew_meaning, greek: b.greek_name, greekTranslit: b.greek_transliteration, greekMeaning: b.greek_meaning };
});
write("books.json", books);

const idOf = (pid) => pid.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clearName = (s) => s.replace(/G-d/g, "God").replace(/L-RD/g, "LORD");
const personRows = csvRows("BibleData-Person.csv").filter((p) => p.person_id !== "YHVH_1");
const figuresOut = new Map();
for (const p of personRows) {
  figuresOut.set(p.person_id, {
    id: idOf(p.person_id), name: [p.person_name, p.surname].filter(Boolean).join(" "), title: prettyRefs(clearName(p.unique_attribute)), gender: p.sex, ...(p.tribe ? { tribe: p.tribe } : {}),
    parents: [], parentLinks: {}, spouses: [], spouseRefs: {}, children: [], siblings: [],
  });
}
for (const l of csvRows("BibleData-PersonLabel.csv")) {
  const f = figuresOut.get(l.person_id);
  if (!f || l.label_type !== "proper name") continue;
  const label = clearName(l.english_label);
  if (label && label !== f.name) (f.alt ??= []).includes(label) || f.alt.push(label);
  const meaning = l.hebrew_label_meaning || l.greek_label_meaning;
  if (meaning && !f.meaning) f.meaning = clearName(meaning);
}
// A family link is kept only if both people are named in the chapter it cites, in some translation. Narrative often
// says "she" or "her husband" in the verse itself (Genesis 29:34), so the chapter is the fair test.
let famLinks = 0, famDropped = 0;
const droppedLinks = [];
const nearText = (ref) => {
  const code = refCode(ref);
  if (!code) return "";
  const b = Math.floor(code / 1000000), c = Math.floor(code / 1000) % 1000;
  return Object.values(BIBLES).map((t) => (t[b - 1]?.[c - 1] ?? []).join(" ")).join(" ").toLowerCase();
};
const spellingsOf = (f) => [f.name, ...(f.alt ?? [])].map((n) => n.toLowerCase().split(/[\s-]/)[0].replace(/[^a-z]/g, "")).filter((n) => n.length > 1);
const bothNamed = (a, b, refId) => {
  const text = nearText(refId);
  // Compare loosely, since translations spell names differently (Noah, Noe; Jebus, Jebusite).
  const has = (f) => spellingsOf(f).some((n) => text.includes(n.slice(0, Math.max(3, n.length - 1))));
  return has(a) && has(b);
};
const keepLink = (a, b, r) => {
  if (bothNamed(a, b, r.reference_id)) return true;
  famDropped++;
  droppedLinks.push(`${a.name} / ${b.name} (${r.reference_id})`);
  return false;
};
const addParent = (parentPid, childPid, row) => {
  const parent = figuresOut.get(parentPid), child = figuresOut.get(childPid), ref = niceRef(row.reference_id);
  if (!parent || !child || !ref) { famDropped++; return; }
  if (!keepLink(parent, child, row)) return;
  if (!child.parents.includes(parent.id)) { child.parents.push(parent.id); famLinks++; }
  if (!parent.children.includes(child.id)) parent.children.push(child.id);
  const link = (child.parentLinks[parent.id] ??= { refs: [] });
  if (!link.refs.includes(ref)) link.refs.push(ref);
  if (row.relationship_category === "explicit") link.explicit = true;
};
for (const r of csvRows("BibleData-PersonRelationship.csv")) {
  const t = r.relationship_type;
  if (t === "father" || t === "mother") addParent(r.person_id_1, r.person_id_2, r);
  else if (t === "son" || t === "daughter") addParent(r.person_id_2, r.person_id_1, r);
  else if (t === "husband" || t === "wife") {
    const a = figuresOut.get(r.person_id_1), b = figuresOut.get(r.person_id_2), ref = niceRef(r.reference_id);
    if (!a || !b || !ref) { famDropped++; continue; }
    if (!keepLink(a, b, r)) continue;
    if (!a.spouses.includes(b.id)) a.spouses.push(b.id);
    if (!b.spouses.includes(a.id)) b.spouses.push(a.id);
    a.spouseRefs[b.id] = ref; b.spouseRefs[a.id] = ref;
  } else if (t === "brother" || t === "sister") {
    const a = figuresOut.get(r.person_id_1), b = figuresOut.get(r.person_id_2);
    if (!a || !b || !niceRef(r.reference_id)) { famDropped++; continue; }
    if (!keepLink(a, b, r)) continue;
    if (!a.siblings.includes(b.id)) a.siblings.push(b.id);
    if (!b.siblings.includes(a.id)) b.siblings.push(a.id);
  }
}
// BibleData files Jesus under its YHVH_1 record. People here treats him as a person in the family lines, using only the
// dataset's Jesus labels and two links anyone can read in the verses cited: Matthew 1:16 and Luke 3:23.
figuresOut.set("Jesus_Messiah", { id: "jesus-christ", name: "Jesus", title: "who is called the Messiah (Matthew 1:16)", gender: "male", parents: ["mary-1", "joseph-6"], parentLinks: { "mary-1": { refs: ["Matthew 1:16"], explicit: true }, "joseph-6": { refs: ["Luke 3:23"], kind: "legal", explicit: true } }, spouses: [], spouseRefs: {}, children: [], siblings: [], alt: ["Jesus Christ", "Christ"] });
for (const pid of ["Mary_1", "Joseph_6"]) figuresOut.get(pid)?.children.push("jesus-christ");
for (const pid of ["James_3", "Joseph_7", "Simon_3", "Judas_2"]) { const f = figuresOut.get(pid); if (f) { f.siblings.push("jesus-christ"); figuresOut.get("Jesus_Messiah").siblings.push(f.id); } }
const figuresList = [...figuresOut.values()].map((f) => ({ ...f, altNames: f.alt?.join(", ") || undefined, alt: undefined }));
write("figures.json", figuresList);

const verseIndex = BOOK_NAMES.map(() => ({}));
const personVerses = {};
const JESUS_LABELS = new Set(["Jesus", "Jesus Christ", "Christ", "Christ Jesus", "Jesus of Nazareth", "Messiah", "Lord Jesus", "Lord Jesus Christ"]);
for (const row of csvRows("BibleData-PersonVerse.csv")) {
  // New Testament only: applying "Messiah" to an Old Testament verse would be an interpretation, not an index entry.
  const asJesus = row.person_id === "YHVH_1" && JESUS_LABELS.has(row.person_label) && refCode(row.reference_id) >= 40000000;
  const f = figuresOut.get(asJesus ? "Jesus_Messiah" : row.person_id), code = refCode(row.reference_id);
  if (!f || !code) continue;
  const list = (personVerses[f.id] ??= []);
  if (list[list.length - 1] !== code) list.push(code);
  const b = Math.floor(code / 1000000), key = `${Math.floor(code / 1000) % 1000}:${code % 1000}`;
  const v = (verseIndex[b - 1][key] ??= []);
  if (!v.includes(f.id)) v.push(f.id);
}
verseIndex.forEach((d, i) => { refBooks[i].p = d; });
const pvDelta = Object.fromEntries(Object.entries(personVerses).map(([id, codes]) => [id, [...codes].sort((a, b) => a - b).map((c, i, arr) => (i ? c - arr[i - 1] : c))]));
write("person-verses-all.json", pvDelta);
fs.mkdirSync(path.join(OUT, "refs"), { recursive: true });
refBooks.forEach((d, i) => write(`refs/${String(i + 1).padStart(2, "0")}.json`, d));

// Lifespans and reigns, keeping only those whose start cites a verse. The dataset's own calculation is shown with each.
// Where the cited verse gives a total ("lived a total of 950 years"), the row must agree with it or it's left out.
const timelineExcluded = [];
const totalInVerse = (ref) => {
  const code = refCode(ref);
  if (!code) return null;
  const text = BIBLES.BSB[Math.floor(code / 1000000) - 1]?.[Math.floor(code / 1000) % 1000 - 1]?.[code % 1000 - 1] ?? "";
  const m = text.match(/total of ([\d,]+) years/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};
const timeline = csvRows("BibleData-Epoch.csv").flatMap((e) => {
  const f = figuresOut.get(e.person_id);
  if (!f || !["Life", "Reign", "Judge", "Prophet"].includes(e.epoch_type) || !e.start_year_ah || !e.end_year_ah) return [];
  const startRef = niceRef(e.start_year_reference_id);
  if (!startRef) return [];
  const stated = e.epoch_type === "Life" ? totalInVerse(e.end_year_reference_id) : null;
  if (stated !== null && stated !== +e.end_year_ah - +e.start_year_ah) {
    timelineExcluded.push({ name: f.name, source: +e.end_year_ah - +e.start_year_ah, verse: stated, ref: niceRef(e.end_year_reference_id) });
    return [];
  }
  return [{ id: f.id, kind: e.epoch_type.toLowerCase(), label: clearName(e.epoch_name).replace(/\*$/, ""), estimated: /\*\s*$/.test(e.epoch_name) || /HYPOTHESIS|ESTIMATE/i.test(e.epoch_notes), from: +e.start_year_ah, to: +e.end_year_ah, startRef, endRef: niceRef(e.end_year_reference_id), calc: prettyRefs(clearName(e.start_year_calculation)) }];
});
// Periods that aren't one person's life: bondage, exile, building work and the like.
const PERIOD_TYPES = new Set(["Period", "Bondage", "Exile", "Travel", "Construction", "Captivity", "Battle", "Unique"]);
const periods = csvRows("BibleData-Epoch.csv").flatMap((e) => {
  if (!PERIOD_TYPES.has(e.epoch_type) || !e.start_year_ah || !e.end_year_ah || /\bduring\b/i.test(e.epoch_name)) return [];
  const startRef = niceRef(e.start_year_reference_id);
  if (!startRef) return [];
  return [{ id: "", kind: "period", label: clearName(e.epoch_name).replace(/\*\s*$/, ""), estimated: /\*\s*$/.test(e.epoch_name) || /HYPOTHESIS|ESTIMATE/i.test(e.epoch_notes), from: +e.start_year_ah, to: +e.end_year_ah, startRef, endRef: niceRef(e.end_year_reference_id), calc: prettyRefs(clearName(e.start_year_calculation)) }];
});

// Single dated events. Births, deaths and begin/end markers are left out because the bars above already show them.
const EVENT_TYPES = new Set(["Travel", "Unique", "Covenant", "Battle", "Prophesy", "Marriage", "Message", "Construction", "Meeting", "Destruction", "Vision"]);
const WANT = new Set(["Begin_Flood", "The_Exodus", "Begin_first_Temple_construction", "Destruction_of_Solomons_Temple", "Cyrus_Decree", "End_second_Temple_construction"]);
const events = csvRows("BibleData-Event.csv").flatMap((e) => {
  if (!(WANT.has(e.event_id) || EVENT_TYPES.has(e.event_type)) || !e.event_year_ah || +e.event_year_ah >= 3962) return [];
  const ref = niceRef(e.event_reference_id);
  if (!ref) return [];
  return [{ label: clearName(e.event_name).replace(/\*\s*$/, ""), year: +e.event_year_ah, kind: e.event_type, estimated: /\*\s*$/.test(e.event_name) || /HYPOTHESIS|ESTIMATE/i.test(e.event_notes), bce: +e.bce_year || null, ussherBc: +e.ussher_bce_year || null, ref, calc: prettyRefs(clearName(e.event_year_calculation || "")) }];
});

// BibleData's chronology stops at Malachi. For the New Testament the year is read from Ussher's Annals (1650), row by row.
// The wording here is a plain caption for the cited passage. Only the year comes from the Annals, which is why the row number is kept.
const NT_EVENTS = [
  [6027, "John the Baptist's birth foretold", "Luke 1:5-22"], [6041, "Jesus's birth foretold to Mary", "Luke 1:26-38"], [6059, "Birth of Jesus", "Luke 2:1-7"],
  [6062, "Wise men visit", "Matthew 2:1-12"], [6066, "Flight to Egypt", "Matthew 2:13-15"], [6086, "Return from Egypt", "Matthew 2:19-21"], [6187, "Jesus at the temple, aged twelve", "Luke 2:41-47"],
  [6283, "John the Baptist begins preaching", "Luke 3:1-2"], [6289, "Baptism of Jesus", "Matthew 3:13-17"], [6339, "Jesus teaches the crowds on the mountain", "Luke 6:20-49"], [6380, "Transfiguration", "Luke 9:28-36"],
  [6456, "Last Supper", "Luke 22:14-18"], [6480, "Crucifixion of Jesus", "Luke 23:26-46"], [6488, "Resurrection of Jesus", "Luke 24:1-12"], [6507, "Ascension", "Acts 1:6-11"], [6511, "Pentecost", "Acts 2:1-41"],
  [6520, "Stephen's speech and death", "Acts 7:1-60"], [6536, "Saul's conversion", "Acts 9:1-7"], [6659, "Peter and Cornelius", "Acts 10:9-48"], [6676, "James son of Zebedee killed", "Acts 12:2"], [6679, "Death of Herod Agrippa", "Acts 12:18-23"],
  [6692, "Paul and Barnabas sent from Antioch", "Acts 13:1-4"], [6758, "Council at Jerusalem", "Acts 15:6-32"], [6781, "Paul and Barnabas part ways", "Acts 15:36-41"], [6794, "Paul at Athens", "Acts 17:16-31"],
  [6804, "Paul writes 1 Thessalonians", "1 Thessalonians 1:1-5"], [6823, "Paul at Ephesus", "Acts 19:1-8"], [6831, "Paul writes Galatians", "Galatians 1:6-7"], [6836, "Paul writes 1 Corinthians", "1 Corinthians 16:10"], [6842, "Paul writes 2 Corinthians", "2 Corinthians 1:8-9"], [6844, "Paul writes Romans", "Romans 16:1"],
  [6852, "Paul's arrest in Jerusalem", "Acts 21:17-40"], [6868, "Paul appeals to Caesar", "Acts 25:1-12"], [6874, "Paul's voyage and shipwreck", "Acts 27:9-44"], [6878, "Paul in Rome", "Acts 28:14-31"],
  [6908, "Paul writes Philippians", "Philippians 1:12-13"], [6909, "Paul writes Colossians and Philemon", "Colossians 1:7-8"], [6910, "Paul writes Ephesians", "Ephesians 6:21-22"], [6913, "Paul writes Hebrews, on Ussher's reading", "Hebrews 13:23-24"],
  [6924, "Paul writes 1 Timothy", "1 Timothy 1:20"], [6925, "Paul writes Titus", "Titus 3:12-13"], [6938, "Peter writes 2 Peter", "2 Peter 3:1"], [6939, "Paul writes 2 Timothy", "2 Timothy 4:12"],
  [6978, "Jerusalem and its temple destroyed, as Jesus foretold", "Luke 21:20-24"],
];
const ussher = new Map(csvRows("Ussher-AnnalsOfTheWorld.csv").map((u) => [+u.paragraph_nr, u]));
const USX = { Luke: "LUK", Matthew: "MAT", Acts: "ACT", Romans: "ROM", Galatians: "GAL", Philippians: "PHP", Colossians: "COL", Ephesians: "EPH", Hebrews: "HEB", Titus: "TIT", "1 Thessalonians": "1TH", "1 Corinthians": "1CO", "2 Corinthians": "2CO", "1 Timothy": "1TI", "2 Timothy": "2TI", "2 Peter": "2PE" };
const nt = NT_EVENTS.map(([para, label, ref]) => {
  const u = ussher.get(para);
  const book = ref.replace(/ \d+:.*$/, "");
  // The row must actually cite the passage, except the fall of Jerusalem, which the Annals record as history.
  if (!u || (para !== 6978 && !u.event.includes(USX[book]))) throw new Error(`Ussher row ${para} doesn't match ${ref}`);
  const year = u.gc_bc_ad === "BC" ? 1 - +u.gc_year : +u.gc_year;
  return { label, x: year, ref, para };
});
write("timeline.json", { rows: [...timeline, ...periods], events, nt, excluded: timelineExcluded });
console.log("timeline rows left out for disagreeing with the verse:", JSON.stringify(timelineExcluded));
console.log("dropped family links, sample:", droppedLinks.slice(0, 30).join("; "));
console.log("people", figuresList.length, "family links", famLinks, "dropped", famDropped, "timeline rows", timeline.length + periods.length, "events", events.length, "nt", nt.length);

const size = (p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0) : fs.statSync(p).size;
for (const d of fs.readdirSync(OUT)) console.log(d, (size(path.join(OUT, d)) / 1e6).toFixed(1) + "MB", fs.statSync(path.join(OUT, d)).isDirectory() ? fs.readdirSync(path.join(OUT, d)).length + " files" : "");
