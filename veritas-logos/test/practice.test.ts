import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays, chapterKey, combineRead, dayOf, dueVerses, firstLetters, isLearned, MAX_BOX, newMemoryVerse, nextUnread, readCount, review, sanitizeMemory, sanitizeRead, streak, TOTAL_CHAPTERS,
} from "../src/core/practice";

const at = (d: string) => new Date(`${d}T09:00:00`);

test("a new memory verse is due today and moves through the boxes", () => {
  let v = newMemoryVerse("m1", "John 3:16", 43, 3, 16, 16, at("2026-11-22"));
  assert.equal(v.box, 0); assert.equal(v.due, "2026-11-22");
  assert.deepEqual(dueVerses([v], "2026-11-22").map((x) => x.id), ["m1"]);
  v = review(v, true, at("2026-11-22")); assert.equal(v.box, 1); assert.equal(v.due, "2026-11-23");
  v = review(v, true, at("2026-11-23")); assert.equal(v.box, 2); assert.equal(v.due, "2026-11-26");
  assert.equal(dueVerses([v], "2026-11-25").length, 0);
  v = review(v, false, at("2026-11-26")); assert.equal(v.box, 0); assert.equal(v.due, "2026-11-27"); assert.equal(v.reviews, 3);
  for (let i = 0; i < 10; i++) v = review(v, true, at("2026-12-01"));
  assert.equal(v.box, MAX_BOX); assert.ok(isLearned(v)); assert.equal(v.due, "2026-12-31");
});

test("dates cross months and years", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(dayOf(new Date(2026, 0, 5)), "2026-01-05");
});

test("first-letter hints keep punctuation", () => {
  assert.equal(firstLetters("For God so loved the world, that he gave"), "F G s l t w, t h g");
  assert.equal(firstLetters("“In the beginning was the Word.”"), "“I t b w t W.”");
  assert.equal(firstLetters("Jesus' love isn't small"), "J l i s");
});

test("stored memory verses are checked", () => {
  const good = newMemoryVerse("m1", "Psalm 23:1", 19, 23, 1, 1);
  const out = sanitizeMemory([good, { id: "x" }, { ...good, id: "m2", book: 70 }, { ...good, id: "m3", box: 9 }, null]);
  assert.deepEqual(out.map((v) => [v.id, v.box]), [["m1", 0], ["m3", MAX_BOX]]);
  assert.deepEqual(sanitizeMemory("nope"), []);
});

test("reading progress counts, merges and finds the next chapter", () => {
  assert.equal(TOTAL_CHAPTERS, 1189);
  const read = sanitizeRead({ "1:1": "2026-11-20", "1:2": "2026-11-21", "1:99": "2026-11-21", "67:1": "x", "65:1": "2026-11-22", junk: "y" });
  assert.deepEqual(Object.keys(read).sort(), ["1:1", "1:2", "65:1"]);
  assert.equal(readCount(read), 3); assert.equal(readCount(read, 1), 2); assert.equal(readCount(read, 65), 1);
  assert.deepEqual(nextUnread(read), { book: 1, chapter: 3 });
  assert.deepEqual(nextUnread(read, { book: 64, chapter: 1 }), { book: 66, chapter: 1 });
  assert.deepEqual(nextUnread(read, { book: 66, chapter: 22 }), { book: 1, chapter: 3 });
  const merged = combineRead(read, { "1:1": "2026-11-01", "2:1": "2026-11-22" });
  assert.equal(merged[chapterKey(1, 1)], "2026-11-01"); assert.equal(readCount(merged), 4);
  assert.equal(streak(read, "2026-11-22"), 3);
  assert.equal(streak(read, "2026-11-23"), 3);
  assert.equal(streak(read, "2026-11-25"), 0);
});

import { dayOfYear, fallbackVerse, FALLBACK_VERSES, fromService, withoutPsalmTitle } from "../src/core/votd";
test("verse of the day: day numbers, the app's own list and what the service sends", () => {
  assert.equal(dayOfYear("2026-01-01"), 1); assert.equal(dayOfYear("2026-11-22"), 326); assert.equal(dayOfYear("2028-12-31"), 366);
  const a = fallbackVerse("2026-11-22"), b = fallbackVerse("2026-11-23");
  assert.equal(a.source, "app"); assert.notDeepEqual([a.book, a.chapter, a.verse], [b.book, b.chapter, b.verse]);
  for (const [bk, c, v, e] of FALLBACK_VERSES) assert.ok(bk >= 1 && bk <= 66 && c > 0 && v > 0 && e >= v);
  assert.deepEqual(fromService("2026-11-22", { book: 43, chapter: 3, verse: 16, end: 16 }), { date: "2026-11-22", book: 43, chapter: 3, verse: 16, end: 16, source: "youversion" });
  assert.equal(fromService("2026-11-22", { book: 70, chapter: 1, verse: 1 }), null);
  assert.equal(fromService("2026-11-22", { error: "x" }), null);
});

test("psalm titles come off verse 1", () => {
  assert.equal(withoutPsalmTitle(19, 23, 1, "A Psalm of David. The LORD is my shepherd; I shall not want."), "The LORD is my shepherd; I shall not want.");
  assert.equal(withoutPsalmTitle(19, 46, 1, "For the choirmaster. Of the sons of Korah. According to Alamoth. A song. God is our refuge and strength."), "God is our refuge and strength.");
  assert.equal(withoutPsalmTitle(19, 51, 1, "For the choirmaster. A Psalm of David. When Nathan the prophet came to him after his adultery with Bathsheba. Have mercy on me, O God."), "Have mercy on me, O God.");
  assert.equal(withoutPsalmTitle(19, 119, 1, "Blessed are those whose way is blameless."), "Blessed are those whose way is blameless.");
  assert.equal(withoutPsalmTitle(19, 23, 2, "A Psalm of David. Not a title here."), "A Psalm of David. Not a title here.");
  assert.equal(withoutPsalmTitle(43, 3, 16, "A Psalm of David. x"), "A Psalm of David. x");
});
