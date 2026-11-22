// Builds public/hymns/hymns.json, the Hymn library, from a checkout of the Open Hymnal Project
// (openhymnal.org; a copy is at github.com/mzealey/openhymnal). Run: node tools/hymns.mjs /path/to/openhymnal
//
// Only scores whose copyright line says the hymn is in the public domain are kept; hymns with newer copyrighted
// words are left out. The Open Hymnal has words and music but no guitar chords, so the library gives words, key,
// time signature, topics and Scripture references; churches add chords in the song editor if they want them.
//
// The words come from the ABC files' syllable lines (w:), one line per verse under each line of music, plus any
// extra verses written out as text (W:). Syllables are joined back into words and the text is broken into lines
// by the hymn's meter (8.6.8.6 and so on), or at punctuation when the syllables don't fit the meter.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) { console.error("Usage: node tools/hymns.mjs /path/to/openhymnal"); process.exit(1); }
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "hymns", "hymns.json");

const complete = join(root, "Complete");
const files = readdirSync(complete).flatMap((d) => {
  const p = join(complete, d);
  return statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith(".abc")).map((f) => join(p, f)) : [];
});

/** One "w:" line -> syllables, each with whether a word ends after it. */
function syllables(line) {
  const out = [];
  const text = line.replace(/^\s*\d+\.\s*~?/, "").replace(/\\-/g, "‐");
  for (let tok of text.split(/\s+/)) {
    if (!tok || tok === "*" || tok === "_" || tok === "|") continue;
    tok = tok.replace(/[*_|]/g, "");
    if (!tok) continue;
    // "~" ties words to one note: "the~Lord" is one syllable of two words.
    const hyphen = tok.endsWith("-");
    const s = tok.replace(/-$/, "").replace(/~/g, " ").replace(/‐/g, "-");
    if (s) out.push({ s, end: !hyphen });
    else if (out.length) out[out.length - 1].end = false; // a lone "-" carries the word on
  }
  return out;
}

const verseNum = (line) => (line.match(/^\s*(\d+)\./) || [])[1];

/** Syllables -> lines of text, by the meter when it fits, otherwise at punctuation. */
function toLines(syl, meter) {
  const words = [];
  let cur = "", count = 0;
  for (const x of syl) {
    cur += x.s; count++;
    if (x.end) { words.push({ w: cur, n: count }); cur = ""; count = 0; }
  }
  if (cur) words.push({ w: cur, n: count });
  const total = words.reduce((a, b) => a + b.n, 0);
  const per = meter.reduce((a, b) => a + b, 0);
  if (meter.length && per && total % per === 0) {
    const lines = [];
    let i = 0, line = [], n = 0, ok = true;
    for (const w of words) {
      line.push(w.w); n += w.n;
      if (n === meter[i % meter.length]) { lines.push(line.join(" ")); line = []; n = 0; i++; }
      else if (n > meter[i % meter.length]) { ok = false; break; }
    }
    if (ok && !line.length) return lines;
  }
  // Otherwise fit lines to the meter's lengths as closely as the words allow, preferring to start a line at a
  // capital letter or after punctuation. With no meter (a refrain), start a line at each capitalized word that
  // isn't a name or pronoun that is capitalized mid-line anyway.
  const capital = (w) => /^["'‘“(]*[A-Z]/.test(w) && !NOBREAK.has(w.replace(/[^A-Za-z']/g, ""));
  const punct = (w) => /[,;:.!?]["'’”)]*$/.test(w);
  const breaks = [];
  if (meter.length && per) {
    const cum = [];
    words.reduce((a, w, i) => (cum[i] = a + w.n), 0);
    let target = 0, k = 0, last = -1;
    while (true) {
      target += meter[k++ % meter.length];
      if (target >= total) break;
      let best = -1, score = Infinity;
      for (let b = last + 1; b < words.length - 1; b++) {
        const d = Math.abs(cum[b] - target);
        if (d > 3) { if (cum[b] > target) break; continue; }
        const sc = d - (capital(words[b + 1].w) ? 2 : 0) - (punct(words[b].w) ? 1.5 : 0);
        if (sc < score) { score = sc; best = b; }
      }
      if (best < 0) continue;
      breaks.push(best); last = best;
      target = cum[best];
    }
  } else {
    words.forEach((w, i) => { if (i < words.length - 1 && capital(words[i + 1].w) && i - (breaks.at(-1) ?? -1) >= 3) breaks.push(i); });
  }
  const lines = [];
  let from = 0;
  for (const b of [...breaks, words.length - 1]) { lines.push(words.slice(from, b + 1).map((w) => w.w).join(" ")); from = b + 1; }
  // A word or two left on a line of its own goes back on the line before.
  const merged = [];
  for (const l of lines.filter(Boolean)) {
    if (merged.length && l.split(" ").length <= 2 && /^[a-z]/.test(l)) merged[merged.length - 1] += ` ${l}`;
    else merged.push(l);
  }
  return merged;
}

const NOBREAK = new Set(["I", "O", "God", "Lord", "Jesus", "Christ", "He", "His", "Him", "Thee", "Thou", "Thy", "Thine", "Spirit", "Savior", "Saviour",
  "Son", "Father", "King", "Lamb", "Holy", "Ghost", "Word", "Israel", "Zion", "Jerusalem", "Bethlehem", "David", "Heaven", "Christmas", "Easter",
  "Trinity", "Redeemer", "Lord's", "God's", "Christ's", "Jesus'", "Emmanuel", "Immanuel", "Almighty", "Creator", "Shepherd", "Friend", "Master", "Who", "Whose", "Whom", "Me", "My", "Mine"]);

const clean = (s) => s.replace(/\\-\s*/g, "-").replace(/\s+([,;:.!?])/g, "$1").replace(/\s+/g, " ").replace(/`/g, "'").trim();
const titleCase = (s) => s;

const hymns = [];
const skipped = [];
for (const file of files.sort()) {
  const abc = readFileSync(file, "latin1");
  const lines = abc.split(/\r?\n/);
  const head = (k) => lines.filter((l) => l.startsWith(`${k}:`)).map((l) => l.slice(k.length + 1).trim());
  const meta = (k) => (lines.find((l) => l.startsWith(`%${k} `)) || "").slice(k.length + 2).trim();
  const cLines = head("C");
  const copy = cLines.find((l) => /^copyright/i.test(l)) || "";
  if (!/^copyright:\s*public domain/i.test(copy) || /words:\s*copyright/i.test(copy)) { skipped.push([file, copy]); continue; }
  const title = head("T")[0];
  if (!title) continue;
  // "Words: ... Music: ..." can share one line.
  const credits = cLines.filter((l) => /^(words|music|tune)\b/i.test(l)).join("  ");
  const wordsBy = ((credits.match(/words[^:]*:\s*(.*?)(?=\s+(?:music|tune|setting)\b[^:]*:|$)/i) || [])[1] || "").trim();
  const musicBy = ((credits.match(/(?:music|tune)[^:]*:\s*(.*?)(?=\s+words\b[^:]*:|$)/i) || [])[1] || "").trim();
  const key = (head("K")[0] || "").split(/\s|%/)[0];
  const timeSig = (head("M")[0] || "").split(/\s|%/)[0];
  const meter = meta("OHMETRICAL").split(/\s+/).map(Number).filter((n) => n > 0);

  // Blocks of w: lines, one block under each line of the melody (the first voice); words under other voices, such
  // as a bass echo, are left out.
  const voiceOf = (l) => (l.match(/^\[?V:\s*([^\]\s]+)/) || [])[1];
  const melody = lines.map(voiceOf).find(Boolean);
  const blocks = [];
  let block = null, voice = melody;
  for (const l of lines) {
    if (l.startsWith("w:")) { if (!melody || voice === melody) (block ||= []).push(l.slice(2)); continue; }
    if (block) { blocks.push(block); block = null; }
    const v = voiceOf(l);
    if (v) voice = v;
  }
  if (block) blocks.push(block);
  if (!blocks.length) { skipped.push([file, "no words"]); continue; }
  const nVerses = Math.max(...blocks.map((b) => b.length));
  const verses = Array.from({ length: nVerses }, () => []);
  const refrain = [];
  let sawRefrain = false;
  blocks.forEach((b, bi) => {
    if (b.length === 1 && nVerses > 1) { sawRefrain = true; refrain.push(...syllables(b[0])); return; }
    const syl = b.map(syllables);
    // The refrain's first words are often written at the end of verse 1's line, with the other verses padded out
    // ("It is" in It Is Well): they belong to the refrain.
    const next = blocks[bi + 1];
    if (next && next.length === 1 && nVerses > 1 && syl.length > 1) {
      const rest = Math.max(...syl.slice(1).map((x) => x.length));
      if (syl[0].length > rest) refrain.push(...syl[0].splice(rest));
    }
    syl.forEach((x, i) => verses[i].push(...x));
  });
  const parts = verses.filter((v) => v.length).map((v, i) => ({ type: "verse", label: `Verse ${i + 1}`, lyrics: toLines(v, sawRefrain ? [] : meter).map(clean).join("\n") }));
  if (refrain.length) parts.push({ type: "chorus", label: "Refrain", lyrics: toLines(refrain, []).map(clean).join("\n") });

  // Extra verses written out in full (W:), each starting "6." or similar.
  let extra = null;
  for (const l of lines.filter((x) => x.startsWith("W:")).map((x) => x.slice(2).trim())) {
    const n = verseNum(l);
    if (n) { if (extra) parts.splice(parts.filter((p) => p.type === "verse").length, 0, extra); extra = { type: "verse", label: `Verse ${n}`, lyrics: clean(l.replace(/^\s*\d+\.\s*/, "")) }; }
    else if (l && extra) extra.lyrics += `\n${clean(l)}`;
  }
  if (extra) parts.splice(parts.filter((p) => p.type === "verse").length, 0, extra);
  // Renumber verses in order, in case W: verses arrived out of step.
  let v = 0;
  for (const p of parts) if (p.type === "verse") p.label = `Verse ${++v}`;
  const verseLabels = parts.filter((p) => p.type === "verse").map((p) => p.label);
  const order = refrain.length ? verseLabels.flatMap((l) => [l, "Refrain"]) : verseLabels;
  if (!parts.some((p) => p.lyrics.split("\n").length > 1 || p.lyrics.length > 20)) { skipped.push([file, "words didn't parse"]); continue; }

  const tune = (musicBy.match(/['‘’"]([^'‘’"]+)['‘’"]/) || [])[1] || "";
  const id = file.split("/").pop().replace(/\.abc$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  hymns.push({
    id, title: titleCase(title), tune, words: wordsBy, music: musicBy, key, timeSig,
    meter: meter.join(" "), category: meta("OHCATEGORY"), scripture: meta("OHSCRIP"),
    topics: [...meta("OHTOPICS").matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim()),
    parts, order,
  });
}

// One entry per title: when a hymn is set to two tunes, keep both, named by tune.
const byTitle = new Map();
for (const h of hymns) (byTitle.get(h.title) || byTitle.set(h.title, []).get(h.title)).push(h);
for (const list of byTitle.values()) if (list.length > 1) list.forEach((h) => { if (h.tune) h.title = `${h.title} (${h.tune})`; });

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: "The Open Hymnal Project (openhymnal.org), public domain", built: new Date().toISOString().slice(0, 10), hymns: hymns.sort((a, b) => a.title.localeCompare(b.title)) }));
console.log(`${hymns.length} hymns -> ${out} (${(statSync(out).size / 1024).toFixed(0)} KB); skipped ${skipped.length}`);
for (const [f, why] of skipped) console.log(`  skipped ${f.split("/").pop()}: ${why.slice(0, 70)}`);
