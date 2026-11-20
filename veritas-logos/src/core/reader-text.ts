import { load } from "./data";
import type { TaggedWord } from "./scholar";

export interface ReadingWord {
  text: string;
  key: string;
  start: number;
  end: number;
}

/** Preserve offsets so the reader can annotate words without rebuilding the published text. */
export function readingWords(text: string): ReadingWord[] {
  return Array.from(text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu), (match) => ({
    text: match[0],
    key: match[0].normalize("NFC").toLowerCase().replace(/’/g, "'"),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function suffixLengths(a: ReadingWord[], b: ReadingWord[]): number[][] {
  const lengths = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i].key === b[j].key
        ? 1 + lengths[i + 1][j + 1]
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  return lengths;
}

/** Word-level differences on both sides, ignoring casing and punctuation outside words. */
export function wordDifferences(a: ReadingWord[], b: ReadingWord[]): [Set<number>, Set<number>] {
  const lengths = suffixLengths(a, b);
  const left = new Set(a.keys());
  const right = new Set(b.keys());
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].key === b[j].key) {
      left.delete(i++);
      right.delete(j++);
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return [left, right];
}

/** Return a tag only when the selected word has the same partner in every best alignment. */
export function readingWordTag(words: ReadingWord[], index: number, tags: TaggedWord[]): string {
  const tagged = tags.flatMap((tag) => readingWords(tag.text).map((word) => ({ ...word, strong: tag.strong })));
  if (!words[index] || !tagged.length) return "";
  const suffix = suffixLengths(words, tagged);
  const optimum = suffix[0][0];
  // Compute the LCS prefix ending just before the selected word.
  let prefix = Array<number>(tagged.length + 1).fill(0);
  for (const word of words.slice(0, index)) {
    const row = [0];
    for (let j = 0; j < tagged.length; j++) {
      row.push(word.key === tagged[j].key ? prefix[j] + 1 : Math.max(prefix[j + 1], row[j]));
    }
    prefix = row;
  }
  // If an equally good alignment skips the word, no tag can be assigned.
  if (prefix.some((n, j) => n + suffix[index + 1][j] === optimum)) return "";
  const partners = tagged.filter((word, j) =>
    word.key === words[index].key && prefix[j] + 1 + suffix[index + 1][j + 1] === optimum);
  return partners.length === 1 ? partners[0].strong : "";
}

type ChapterHeadings = Record<number, string[]>;
export async function getSectionHeadings(book: number, chapter: number): Promise<ChapterHeadings> {
  const headings = await load<Record<number, ChapterHeadings>[]>("bible/BSB-headings.json");
  return headings[book - 1]?.[chapter] ?? {};
}

/** Clear Bible's manual YLT alignment, checked against the actual words before using token positions. */
export async function yltWordTag(book: number, chapter: number, verse: number, words: ReadingWord[], index: number): Promise<string> {
  const groups = await load<Record<number, Record<string, [string, string]>>>(`aligned/YLT-${Math.floor((book - 1) / 8)}.json`);
  const record = groups[book]?.[`${chapter}:${verse}`];
  if (!record || record[0] !== words.map((word) => word.key).join(" ")) return "";
  return record[1].split(" ")[index] ?? "";
}
