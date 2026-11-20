import { segmentsOverlap } from "./content";
import { load } from "./data";
import { parseReference, type RefSegment } from "./references";

export type MapPoint = [longitude: number, latitude: number];
export interface PlaceCandidate { id: string; name: string; slug: string; point: MapPoint }
interface PlaceRecord {
  id: string;
  name: string;
  slug: string;
  types: string[];
  mentions: [book: number, chapter: number, verse: number, wording: "named" | "varies" | "context"][];
  candidates: PlaceCandidate[];
}
export interface Basemap { land: MapPoint[][]; lakes: MapPoint[][] }
type NoteRow = [number, number, number, number, string, string[]];

export const getBasemap = () => load<Basemap>("study/basemap.json");

function matches(segments: RefSegment[], book: number, chapter: number, verse: number) {
  return segments.some((segment) => segmentsOverlap(segment, { book, chapter, chapterEnd: chapter, verseStart: verse }));
}

export async function getPassagePlaces(reference: string): Promise<PlaceRecord[]> {
  const segments = parseReference(reference);
  if (!segments) return [];
  const places = await load<PlaceRecord[]>("study/places.json");
  return places.flatMap((place) => {
    const mentions = place.mentions.filter(([book, chapter, verse]) => matches(segments, book, chapter, verse));
    return mentions.length ? [{ ...place, mentions }] : [];
  });
}

export async function getTyndaleNotes(reference: string) {
  const segments = parseReference(reference);
  if (!segments) return [];
  const books = [...new Set(segments.map((segment) => segment.book))];
  const chunks = await Promise.all(books.map(async (book) => {
    const group = await load<Record<number, NoteRow[]>>(`study/tyndale-${Math.floor((book - 1) / 8)}.json`);
    return (group[book] ?? []).flatMap(([chapter, verseStart, chapterEnd, verseEnd, sourceReference, paragraphs]) => {
      const range = { book, chapter, chapterEnd, verseStart, verseEnd };
      return segments.some((segment) => segmentsOverlap(range, segment)) ? [{ range, sourceReference, paragraphs }] : [];
    });
  }));
  return chunks.flat();
}
