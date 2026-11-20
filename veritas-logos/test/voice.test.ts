import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { test } from "node:test";
import { cleanVerse, clauses, phonemeIds, phonemeString, speechUnits } from "../src/voice/text";
import { unpackPiece, widen, type VoiceManifest } from "../src/voice/model";
import { phonemize } from "../src/voice/espeak";

test("verse text is cleaned for speaking", () => {
  assert.equal(cleanVerse("The LORD is my shepherd; I shall not want."), "The Lord is my shepherd; I shall not want.");
  assert.equal(cleanVerse("THE KING OF THE JEWS"), "The King Of The Jews");
  assert.equal(cleanVerse("And he said, [It is] I."), "And he said, It is I.");
  assert.equal(cleanVerse("“Go,” said he—“now.”"), "Go, said he, now.");
  assert.equal(cleanVerse("for his name’s sake; the Levites’ cities"), "for his name's sake; the Levites cities");
  assert.equal(cleanVerse("(and he was the priest of the most high God.)"), "and he was the priest of the most high God.");
  assert.equal(cleanVerse("A Psalm of David. I AM THAT I AM"), "A Psalm of David. I Am That I Am");
});

test("long verses are split into units of speech at sentence and clause ends", () => {
  assert.deepEqual(speechUnits("In the beginning God created the heaven and the earth. And the earth was without form, and void."),
    ["In the beginning God created the heaven and the earth.", "And the earth was without form, and void."]);
  const long = "Then were the king's scribes called at that time in the third month, that is, the month Sivan, on the three and twentieth day thereof; and it was written according to all that Mordecai commanded unto the Jews, and to the lieutenants, and the deputies and rulers of the provinces which are from India unto Ethiopia, an hundred twenty and seven provinces, unto every province according to the writing thereof, and unto every people after their language, and to the Jews according to their writing, and according to their language.";
  const units = speechUnits(long);
  assert.ok(units.length > 1);
  for (const u of units) assert.ok(u.length <= 220, u);
  assert.equal(units.join(" "), long);
  assert.deepEqual(speechUnits(""), []);
});

test("clauses keep their closing punctuation, as Piper's phonemizer does", () => {
  assert.deepEqual(clauses("The Lord is my shepherd; I shall not want."), [{ text: "The Lord is my shepherd", end: ";" }, { text: "I shall not want", end: "." }]);
  assert.deepEqual(clauses("Abraham begat Isaac"), [{ text: "Abraham begat Isaac", end: "" }]);
  assert.equal(phonemeString([{ ipa: "ðə lˈɔːɹd ɪz maɪ ʃˈɛpəd", end: ";" }, { ipa: "aɪ ʃˌal nˌɒt wˈɒnt", end: "." }]),
    "ðə lˈɔːɹd ɪz maɪ ʃˈɛpəd; aɪ ʃˌal nˌɒt wˈɒnt.".normalize("NFD"));
  assert.equal(phonemeString([{ ipa: "(en)ɐ sˈɑːm(fr)", end: "" }]), "ɐ sˈɑːm");
  const map = { "^": [1], "_": [0], "$": [2], " ": [3], "a": [14], ";": [12] };
  assert.deepEqual(phonemeIds("a; a?", map), [1, 0, 14, 0, 12, 0, 3, 0, 14, 0, 2]);
});

test("eSpeak NG, built from the fork Piper was trained with, gives the phonemes phonemizer.js gave", async () => {
  // Each expected line is phonemizer.js 1.2.1's output, which the bundled engine matched on 2,828 sampled BSB verses.
  assert.deepEqual(await phonemize("In the beginning God created the heavens and the earth."), ["ɪnðə bɪɡˈɪnɪŋ ɡˈɑːd kɹiːˈeɪɾᵻd ðə hˈɛvənz ænd ðɪ ˈɜːθ"]);
  assert.deepEqual(await phonemize("And Rachel’s servant Bilhah conceived again and bore Jacob a second son."),
    ["ænd ɹˈeɪtʃəlz sˈɜːvənt bˈɪlhə kənsˈiːvd ɐɡˈɛn ænd bˈoːɹ dʒˈeɪkəb ɐ sˈɛkənd sˈʌn"]);
  assert.deepEqual(await phonemize("And there was evening, and there was morning—the fifth day."),
    ["ænd ðɛɹwˌʌz ˈiːvnɪŋ", "ænd ðɛɹwˌʌz mˈɔːɹnɪŋ ðə fˈɪfθ dˈeɪ"]);
  assert.deepEqual(await phonemize(""), []);
  // Norman was trained with eSpeak NG's "en" voice, which the bundled data also holds.
  assert.deepEqual(await phonemize("The Lord is my shepherd; I shall not want.", "en"), ["ðə lˈɔːd ɪz maɪ ʃˈɛpəd", "aɪʃˌal nˌɒt wˈɒnt"]);
  assert.deepEqual(await phonemize("And Rachel’s servant Bilhah conceived again and bore Jacob a second son.", "en"),
    ["and ɹˈeɪtʃəlz sˈɜːvənt bˈɪlhə kənsˈiːvd ɐɡˈɛn and bˈɔː dʒˈeɪkəb ɐ sˈɛkənd sˈʌn"]);
  const manifest = JSON.parse(fs.readFileSync("public/voice/norman.json", "utf8")) as VoiceManifest;
  assert.ok((await phonemize("Amen.", manifest.espeakVoice)).length);
});

test("the voice's weights widen from 16-bit floats exactly", () => {
  const halves = [0x3c00, 0xc000, 0x3555, 0x0001, 0x7bff, 0x0000];
  const values = [1, -2, 0.333251953125, 2 ** -24, 65504, 0];
  const graph = Buffer.from("graph!");
  const stored = new Uint8Array(32 + 16 + 4);
  stored.set(graph, 0);
  new Uint16Array(stored.buffer, 32, halves.length).set(halves);
  new Float32Array(stored.buffer, 48, 1).set([1e9]);
  const m = { bytes: stored.length, graph: [0, graph.length], weightsBytes: 48, segments: [[32, 6, 0, "f16"], [48, 1, 32, "f32"]] } as unknown as VoiceManifest;
  const { graph: g, weights } = widen(m, stored);
  assert.equal(Buffer.from(g).toString(), "graph!");
  const w = new Float32Array(weights.buffer);
  assert.deepEqual(Array.from(w.subarray(0, 6)), values);
  assert.equal(w[8], 1e9);
});

test("a voice piece unpacks to its bytes", async () => {
  const bytes = crypto.randomBytes(5000);
  const packed = JSON.stringify(zlib.gzipSync(bytes).toString("base64"));
  assert.deepEqual(Buffer.from(await unpackPiece(packed)), bytes);
});

test("the stored voice matches its settings", () => {
  const m = JSON.parse(fs.readFileSync("public/voice/norman.json", "utf8")) as VoiceManifest;
  const bin = fs.readFileSync("public/voice/norman.bin");
  assert.equal(bin.length, m.bytes);
  assert.equal(crypto.createHash("sha256").update(bin).digest("hex"), m.sha256);
  assert.equal(m.sampleRate, 22050);
  for (const k of ["^", "_", "$", " ", ".", ",", ";"]) assert.ok(m.phonemeIds[k], k);
  let end = 0;
  for (const [at, count, out, kind] of m.segments) {
    assert.ok(at % 4 === 0 && out % 4 === 0 && out >= end);
    assert.ok(at + count * (kind === "f16" ? 2 : 4) <= m.bytes);
    end = out + count * 4;
  }
  assert.ok(end <= m.weightsBytes);
});
