import { isOffered, isTranslationId, type TranslationId } from "../core/bible";
import { BOOKS, parseReference } from "../core/references";

export const bookSlug = (book: number) => BOOKS[book - 1].name.toLowerCase().replace(/\s+/g, "");
const bySlug = new Map(BOOKS.map((b) => [b.name.toLowerCase().replace(/\s+/g, ""), b.number]));

export interface ReadRoute { book: number; chapter: number; verse?: number; verseEnd?: number; translation?: TranslationId }

export function readHash(r: ReadRoute): string {
  const t = r.translation ? `-${r.translation.toLowerCase()}` : "";
  const v = r.verse ? `-${r.verse}${r.verseEnd && r.verseEnd !== r.verse ? `-${r.verseEnd}` : ""}` : "";
  return `read-${bookSlug(r.book)}-${r.chapter}${v}${t}`;
}

/** Parses "john-3-16-18-kjv" (the part after read-). */
export function parseReadParts(rest: string): ReadRoute | null {
  const parts = rest.split("-").filter(Boolean);
  if (!parts.length) return null;
  const book = bySlug.get(parts[0]);
  if (!book) return null;
  let translation: TranslationId | undefined;
  const last = parts[parts.length - 1]?.toUpperCase();
  // A translation that isn't offered yet (a link to the ESV, say) opens in the reader's own choice instead.
  if (isTranslationId(last)) { if (isOffered(last)) translation = last; parts.pop(); }
  const [chapter, verse, verseEnd] = parts.slice(1).map(Number);
  if (!chapter || Number.isNaN(chapter)) return { book, chapter: 1, translation };
  return { book, chapter, verse: verse || undefined, verseEnd: verseEnd || undefined, translation };
}

export function hashForReference(ref: string): string | null {
  const s = parseReference(ref)?.[0];
  if (!s) return null;
  return readHash({ book: s.book, chapter: s.chapter, verse: s.verseStart, verseEnd: s.chapterEnd === s.chapter ? s.verseEnd : undefined });
}
