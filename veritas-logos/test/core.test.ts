import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import { getPassage, getVerse, searchText, TRANSLATIONS } from "../src/core/bible";
import { checkReferences, coerceDraftSections, coerceInsight, parseJsonReply } from "../src/core/ai";
import { setLoader } from "../src/core/data";
import { generateGuide, GuideInputError, guideToHtml, guideToMarkdown, resolveGuide, sanitizeGuide } from "../src/core/guide";
import { getInsights } from "../src/core/insights";
import { decodeMorph, gematria, getConcordance, getLexEntry, getVerseWords, searchLexicon } from "../src/core/lexicon";
import { parseReference } from "../src/core/references";
import { findShortestPath, getFigure } from "../src/core/figure-graph";
import { ensureFigures, getTimeline, peopleInPassage, versesOfPerson } from "../src/core/people";
import { getGlossary, searchGlossary, termById } from "../src/core/glossary";
import { excerptsByWriter, excerptsForPassage, getWritingsIndex, searchWritings, sermonsForPassage } from "../src/core/writings";
import { ahToX, formatSpan, formatYear, getTimelineItems, parseTimelineRoute, timelineForPassage, timelineHash } from "../src/core/timeline";

before(() => setLoader(async (p) => JSON.parse(await fs.promises.readFile(path.join("public/data", p), "utf8"))));

test("verses are real text in each translation, never invented", async () => {
  // Spot checks against known wording, including verses the old prototype fabricated.
  assert.match(await getVerse("KJV", 43, 3, 16), /For God so loved the world/);
  assert.match(await getVerse("KJV", 43, 11, 35), /^Jesus wept\.?$/);
  assert.match(await getVerse("BSB", 40, 18, 21), /Peter came to Jesus/);
  assert.match(await getVerse("ASV", 33, 6, 8), /He hath showed thee, O man, what is good/);
  assert.match(await getVerse("YLT", 1, 1, 1), /In the beginning of God's preparing/);
  assert.match(await getVerse("NHEB", 19, 23, 1), /shepherd/i);
  for (const t of TRANSLATIONS) {
    const p = await getPassage(t.id, "Obadiah 1:3");
    assert.ok(p && !/inspired witness|canonical witness|covenantal message/.test(p.parts[0].verses[0].text));
  }
});

test("translations genuinely differ", async () => {
  const texts = new Set(await Promise.all(TRANSLATIONS.map((t) => getVerse(t.id, 1, 1, 27))));
  assert.equal(texts.size, TRANSLATIONS.length);
});

test("references out of range are refused", async () => {
  assert.equal(await getPassage("BSB", "John 99:1"), null);
  assert.equal(await getPassage("BSB", "not a verse"), null);
  assert.equal((await getPassage("BSB", "Psalm 117"))?.parts[0].verses.length, 2);
});

test("search finds real matches", async () => {
  const { hits, total } = await searchText("KJV", "Jesus wept", { mode: "phrase" });
  assert.equal(total, 1);
  assert.equal(hits[0].ref, "John 11:35");
});

test("word data lines up with lexicon and concordance", async () => {
  const words = await getVerseWords(43, 3, 16);
  assert.ok(words.some((w) => w[3] === "G25"), "agapao in John 3:16");
  const entry = await getLexEntry("G26");
  assert.equal(entry?.l, "ἀγάπη");
  assert.equal((await getLexEntry("h0430"))?.l, "אֱלֹהִים");
  const conc = await getConcordance("G26");
  assert.equal(conc.length, entry!.v);
  assert.ok(conc.includes(46013004), "1 Corinthians 13:4 uses agape");
  assert.equal((await searchLexicon("G26"))[0][0], "G26");
  assert.equal(decodeMorph("V-AAI-3S"), "Verb · aorist, active, indicative, 3rd person, singular");
  assert.match(decodeMorph("HVqp3ms"), /Verb · qal, perfect, 3rd person, masculine, singular/);
});

test("standard gematria values", () => {
  assert.equal(gematria("יהוה").total, 26);
  assert.equal(gematria("λόγος").total, 373);
  assert.equal(gematria("אהבה").total, 13);
});

test("insights: quotations, parallels, confessions and topics, all from sources", async () => {
  const quote = await getInsights("Matthew 4:4");
  assert.ok(quote.quotes.some((q) => q.ref.startsWith("Deuteronomy 8:3")));
  const quoted = await getInsights("Habakkuk 2:4");
  assert.ok(quoted.quotedBy.some((q) => q.ref.startsWith("Romans 1:17")));
  assert.ok(quoted.quotedBy.some((q) => q.ref.startsWith("Galatians 3:11")));
  const conf = await getInsights("Romans 8:30");
  assert.ok(conf.confessions.some((c) => c.doc === "WCF"));
  const topics = await getInsights("Matthew 18:21-22");
  assert.ok(topics.topics.some((t) => t.slug === "forgiveness"));
});

test("the generator follows the request, with only real verses", async () => {
  const g = await generateGuide({ input: "Matthew 18:21-35", format: "inductive", translation: "BSB", peopleFor: peopleInPassage });
  assert.equal(g.title, "Matthew 18:21–35");
  assert.ok(g.sections.some((s) => s.kind === "passage" && s.ref === "Matthew 18:21–35"));
  assert.ok(!g.sections.some((s) => s.ref?.startsWith("Genesis 1")), "the old prototype opened every custom guide with Genesis 1");
  const r = await resolveGuide(g);
  const passage = r.sections.find((s) => s.kind === "passage")!;
  assert.equal(passage.verses!.length, 15);
  assert.match(passage.verses![0].text, /Peter/);
  assert.ok(!JSON.stringify(g).includes('"origin":"veritas"') && !JSON.stringify(g).includes('"origin":"curated"'));
  const words = r.sections.find((s) => s.kind === "words");
  assert.ok(words?.items?.length);

  const topic = await generateGuide({ input: "forgiveness", format: "smallgroup" });
  const refs = topic.sections.filter((s) => s.kind === "passage").map((s) => s.ref!);
  assert.ok(refs.length >= 2);
  for (const ref of refs) assert.ok(await getPassage("BSB", ref), `${ref} resolves`);

  for (const format of ["exegetical", "teaching"] as const) {
    const guide = await generateGuide({ input: "Romans 8:28-30", format, lens: "reformed" });
    assert.equal(guide.format, format);
    const html = guideToHtml(await resolveGuide(guide));
    assert.match(html, /foreknew/);
  }
  await assert.rejects(generateGuide({ input: "zzzqqq xyzzy" }), GuideInputError);
  await assert.rejects(generateGuide({ input: "John 99:1" }), GuideInputError);
});

test("no hand-written reference content remains in the data", () => {
  assert.ok(!fs.existsSync("public/data/notes.json"));
  assert.ok(!fs.existsSync("public/data/doctrines.json"));
  assert.ok(!fs.existsSync("public/data/cultural-notes.json"));
  assert.ok(!fs.existsSync("content"));
});

test("people: every family link cites a verse that names both people", async () => {
  await ensureFigures();
  const levi = getFigure("levi-1")!;
  assert.deepEqual(levi.parents.sort(), ["jacob-1", "leah-1"]);
  const jesus = getFigure("jesus-christ")!;
  assert.deepEqual(jesus.parentLinks!["mary-1"].refs, ["Matthew 1:16"]);
  assert.match(await getVerse("KJV", 40, 1, 16), /Mary.*Jesus/);
  assert.match(await getVerse("BSB", 42, 3, 23), /Joseph/);
  assert.ok((await versesOfPerson("jesus-christ")).length > 500);
  assert.ok((await peopleInPassage("Ruth 4:13")).some((p) => p.id === "boaz-1"));
  const { rows, events, excluded } = await getTimeline();
  // Lifespans must match what the verses say.
  for (const [id, years] of [["adam-1", 930], ["methuselah-1", 969], ["abram-1", 175], ["joseph-1", 110]] as const) {
    const r = rows.find((x) => x.id === id && x.kind === "life")!;
    assert.equal(r.to - r.from, years, id);
  }
  assert.ok(excluded.some((e) => e.name === "Noah" && e.verse === 950), "the source's 951 for Noah disagrees with Genesis 9:29");
  assert.ok(!rows.some((r) => r.id === "noah-1" && r.kind === "life"));
  assert.ok(events.some((e) => e.label === "The Exodus"));
});

test("guides from outside are cleaned", async () => {
  assert.equal(sanitizeGuide({ nope: true }), null);
  const clean = sanitizeGuide({ title: "<script>x</script>", sections: [{ kind: "evil", heading: "A", origin: "system", body: "b", items: [{ text: "t", wordId: "javascript:alert(1)", level: 99 }] }, { kind: "text", heading: "Old note", origin: "veritas", body: "removed" }], translation: "NIV", lens: "x" })!;
  assert.equal(clean.sections.length, 1, "sections from the removed notes are dropped");
  assert.equal(clean.translation, "BSB");
  assert.equal(clean.lens, "all");
  assert.equal(clean.sections[0].kind, "text");
  assert.equal(clean.sections[0].origin, "you");
  assert.equal(clean.sections[0].items![0].wordId, undefined);
  const html = guideToHtml(await resolveGuide(clean));
  assert.ok(!html.includes("<script>x"), "escaped in export");
  assert.ok(guideToMarkdown(await resolveGuide(clean)).includes("A"));
});

test("AI helpers read replies safely and catch bad references", async () => {
  assert.deepEqual(parseJsonReply('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseJsonReply("no json"), null);
  const i = coerceInsight({ summary: "s", culture: [{ point: "p", detail: "d", extra: "x" }], intertext: [{ reference: "Rom 1:17", relation: "bogus" }], idioms: "not a list" })!;
  assert.equal(i.intertext[0].relation, "echoes");
  assert.deepEqual(i.idioms, []);
  assert.equal(coerceInsight({ culture: [] }), null);
  const s = coerceDraftSections({ sections: [{ heading: "Q", kind: "questions", items: ["one", { text: "two" }] }, { kind: "text" }] });
  assert.equal(s.length, 1);
  assert.equal(s[0].origin, "ai");
  const checks = await checkReferences("See John 3:16 and Jude 1:99 and John 22:1.");
  assert.deepEqual(checks.map((c) => c.ok), [true, false, false]);
});

test("BibliaTree's pathfinder works on the sourced people", async () => {
  await ensureFigures();
  const path1 = findShortestPath("abram-1", "david-1");
  assert.ok(path1 && path1.includes("jesse-1") && path1.includes("boaz-1"));
  assert.ok((await peopleInPassage("Ruth 4:18-22")).length > 0);
});

test("reference parsing", () => {
  assert.equal(parseReference("Psalm 23")?.[0].book, 19);
  assert.equal(parseReference("1 Cor 13:4-7")?.[0].verseEnd, 7);
});

test("writers: every excerpt names an edition, and modern authors are left out", async () => {
  const index = await getWritingsIndex();
  for (const banned of ["CS Lewis", "JRR Tolkien", "Douglas Wilson", "GK Chesterton"]) assert.ok(!index.authors.some((a) => a.name === banned), banned);
  const john = await excerptsForPassage("John 3:16");
  assert.ok(john.some((e) => e.writer.name === "Tertullian" && /Ante-Nicene/.test(e.source) && /only-begotten/.test(e.text)));
  assert.ok(john.every((e) => e.source && e.title));
  assert.deepEqual(john.map((e) => e.writer.year ?? 9999), john.map((e) => e.writer.year ?? 9999).sort((a, b) => a - b), "earliest first");
  // A verse lookup only returns what touches that verse.
  assert.ok(john.every((e) => e.book === 43 && e.c1 <= 3 && e.c2 >= 3));
  assert.ok(!(await excerptsForPassage("John 3:16", "comm")).some((e) => e.v1 === 0), "chapter introductions stay with the whole chapter");
  assert.ok((await excerptsForPassage("John 3", "comm")).some((e) => e.v1 === 0));
});

test("writers: commentaries, Calvin's citations and the sermon index", async () => {
  assert.ok((await excerptsForPassage("John 3:16", "comm")).some((e) => e.writer.name === "Matthew Henry"));
  assert.ok((await excerptsForPassage("Psalm 23:1", "comm")).some((e) => /Treasury/.test(e.title) && /shepherd/i.test(e.text)));
  assert.ok((await excerptsForPassage("Galatians 2:20", "comm")).some((e) => e.writer.name === "Martin Luther" && /Graebner/.test(e.source)));
  assert.ok((await excerptsForPassage("Deuteronomy 32:35", "comm")).some((e) => /Sinners in the Hands/.test(e.title) && /Their foot shall slide/.test(e.text)));
  assert.ok((await excerptsByWriter("john-calvin", 45)).length > 100);
  assert.ok((await sermonsForPassage("Song of Solomon 6:13")).some((s) => s.number === 593 && /spurgeon\.org\/sermons\/inward-conflicts$/.test(s.url)));
  assert.ok((await searchWritings("only-begotten", { book: 43, limit: 5 })).length === 5);
});

test("timeline: years convert, and each item points to real verses", async () => {
  assert.equal(formatYear(0), "1 BC");
  assert.equal(formatYear(1), "AD 1");
  assert.equal(formatYear(ahToX(3919)), "43 BC"); // BibleData's own bce_year for this row
  assert.equal(formatYear(ahToX(3969)), "AD 8");
  assert.equal(formatSpan(-1040, -970), "1041 to 971 BC");
  assert.equal(parseTimelineRoute(timelineHash(70).slice(9)), 70);
  assert.equal(parseTimelineRoute(timelineHash(-1446).slice(9)), -1446);
  const { items } = await getTimelineItems();
  const find = (label: string, band: string) => items.find((i) => i.label === label && i.band === band)!;
  assert.equal(formatYear(find("Birth of Jesus", "nt").x1), "5 BC"); // Ussher's Annals, paragraph 6059
  assert.equal(formatYear(find("Pentecost", "nt").x1), "AD 33");
  assert.equal(formatYear(find("The Exodus", "event").x1), "1447 BC");
  assert.ok(items.some((i) => i.band === "writer" && i.writerId === "augustine-of-hippo" && i.x1 === 430));
  assert.ok(items.some((i) => i.band === "confession"));
  assert.ok((await timelineForPassage("Acts 2:1")).some((i) => i.label === "Pentecost"));
});

test("writers: citations from CCEL are marked, and objections in the Summa are left out", async () => {
  const gen = await excerptsForPassage("Genesis 1:1");
  assert.ok(gen.some((e) => e.cites && /Ante-Nicene|Nicene/.test(e.source)));
  const rom = await excerptsByWriter("thomas-aquinas", 45);
  assert.ok(rom.some((e) => /Summa/.test(e.source)));
  assert.ok(rom.every((e) => !/^(… )?Objection \d/.test(e.text)));
  const verse = await excerptsForPassage("Romans 8:28", "comm");
  assert.ok(verse.some((e) => e.writer.name === "John Calvin" && /Calvin Translation Society/.test(e.source)));
  // Dates and labels: every Fathers-series quote names one exact volume.
  for (const e of await excerptsForPassage("Hebrews 11:1")) if (/Ante-Nicene|Nicene/.test(e.source)) assert.match(e.source, /vol\. \d+,/);
});

test("glossary: definitions are quoted with sources, and gaps stay visible", async () => {
  const terms = await getGlossary();
  assert.ok(terms.length > 150);
  const just = (await termById("justification"))!;
  assert.ok(just.defs.some((d) => /Easton/.test(d.source) && /forensic/.test(d.text)));
  assert.ok(just.defs.some((d) => /Westminster Larger Catechism/.test(d.source) && /free grace/.test(d.text)));
  assert.ok(just.defs.every((d) => d.source && d.text));
  const peri = (await termById("perichoresis"))!;
  assert.equal(peri.defs.length, 0);
  assert.match(peri.own, /mutual indwelling/);
  assert.equal((await termById("circumincession"))!.id, "perichoresis", "other names in a heading find the same entry");
  assert.ok(terms.some((t) => !t.defs.length && !t.own && !t.see), "gaps stay visible");
  assert.equal((await termById("credobaptism"))!.see, "believers-baptism");
  assert.match((await termById("priest"))!.own, /^As an office of Christ: /);
  assert.equal((await termById("tertullian"))!.writer, "tertullian");
  assert.equal((await searchGlossary("propitiation", 1))[0].id, "propitiation");
  assert.ok(!terms.some((t) => t.defs.some((d) => /Hastings/.test(d.source))), "that file's title page says it's Schaff's dictionary");
});

test("older works: added with dated editions, and the excluded ones stay out", async () => {
  const index = await getWritingsIndex();
  const names = index.authors.map((a) => a.name);
  for (const n of ["Jonathan Edwards", "Thomas Manton", "John Owen", "John Gill", "Charles Hodge", "J. C. Ryle", "Philip Schaff"]) assert.ok(names.includes(n), n);
  assert.ok(index.sources.some((s) => /Goold/.test(s) && /1850/.test(s)));
  assert.ok(!index.sources.some((s) => /Atherton|Bondage|Rutherford/.test(s)), "Luther's 1931 revision and the Rutherford selection are left out");
  const owen = index.authors.find((a) => a.name === "John Owen")!;
  assert.ok(!owen.works.some(([w]) => /Pneumatologia|Sermons/i.test(w)), "files marked (c) AGES Software are left out");
  assert.ok(((await termById("arianism"))!).defs.length > 0);
});
