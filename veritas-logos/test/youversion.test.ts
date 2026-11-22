import assert from "node:assert/strict";
import { test } from "node:test";
import { chapterPassage, fromHex, highlightsByVerse, passageVerses, TO_HEX, versePassage } from "../src/core/youversion";

test("YouVersion passages", () => {
  assert.equal(chapterPassage(43, 3), "JHN.3"); assert.equal(versePassage(62, 4, 8), "1JN.4.8");
  assert.deepEqual(passageVerses("JHN.3.16"), { book: 43, chapter: 3, verses: [16] });
  assert.deepEqual(passageVerses("PSA.23.1-3"), { book: 19, chapter: 23, verses: [1, 2, 3] });
  assert.deepEqual(passageVerses("jhn.3.16-JHN.3.17"), { book: 43, chapter: 3, verses: [16, 17] });
  assert.equal(passageVerses("JHN.3"), null); assert.equal(passageVerses("XYZ.1.1"), null);
});

test("colors round trip and land on the nearest of the app's four", () => {
  for (const [c, hex] of Object.entries(TO_HEX)) assert.equal(fromHex(hex), c);
  assert.equal(fromHex("ffff00"), "amber"); assert.equal(fromHex("#FFA500"), "amber");
  assert.equal(fromHex("00ff00"), "green"); assert.equal(fromHex("4fc3f7"), "blue"); assert.equal(fromHex("ce93d8"), "rose");
  assert.equal(fromHex("ff0000"), "rose"); assert.equal(fromHex("ffffff"), "amber"); assert.equal(fromHex("nope"), "amber");
});

test("a chapter's highlights by verse, ignoring other chapters", () => {
  const got = highlightsByVerse({ data: [{ bible_id: 3034, passage_id: "JHN.3.16", color: "fff59d" }, { bible_id: 3034, passage_id: "JHN.3.18-19", color: "90caf9" }, { passage_id: "JHN.4.1", color: "fff59d" }, { passage_id: "bad" }] }, 43, 3);
  assert.deepEqual(got, { "43:3:16": "amber", "43:3:18": "blue", "43:3:19": "blue" });
  assert.deepEqual(highlightsByVerse("", 43, 3), {});
});
