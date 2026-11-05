import { decodeVerseCode, refOf } from "./bible";
import { load, pad2 } from "./data";
import { getFigure, initFigures } from "./figure-graph";
import type { Figure } from "./figure-types";
import { parseReference } from "./references";
import { getVerseCounts } from "./bible";

let ready: Promise<void> | null = null;

/** Loads the people data once. */
export function ensureFigures(): Promise<void> {
  ready ??= load<Figure[]>("figures.json").then(initFigures);
  return ready;
}

/** People the BibleData index records in this passage. */
export async function peopleInPassage(reference: string): Promise<{ id: string; name: string; title: string }[]> {
  await ensureFigures();
  const segs = parseReference(reference);
  if (!segs) return [];
  const counts = await getVerseCounts();
  const ids = new Set<string>();
  for (const s of segs) {
    const index = await load<Record<string, string[]>>(`person-verses/${pad2(s.book)}.json`);
    for (let c = s.chapter; c <= s.chapterEnd; c++) {
      const total = counts[s.book - 1]?.[c - 1] ?? 0;
      const from = s.verseStart !== undefined && c === s.chapter ? s.verseStart : 1;
      const to = s.verseStart !== undefined && c === s.chapterEnd ? s.verseEnd ?? s.verseStart : total;
      for (let v = from; v <= Math.min(to, total); v++) for (const id of index[`${c}:${v}`] ?? []) ids.add(id);
    }
  }
  return [...ids].flatMap((id) => { const f = getFigure(id); return f ? [{ id, name: f.name, title: f.title }] : []; });
}

/** Every verse the index records for a person, in canonical order. */
export async function versesOfPerson(id: string): Promise<{ book: number; chapter: number; verse: number; ref: string }[]> {
  const deltas = (await load<Record<string, number[]>>("person-verses/all.json"))[id] ?? [];
  let cur = 0;
  return deltas.map((d) => { cur += d; const v = decodeVerseCode(cur); return { ...v, ref: refOf(v.book, v.chapter, v.verse) }; });
}

export interface TimelineRow { id: string; kind: string; label: string; estimated: boolean; from: number; to: number; startRef: string; endRef: string; calc: string }
export interface TimelineEvent { label: string; year: number; bce: number | null; ref: string }
export interface TimelineExcluded { name: string; source: number; verse: number; ref: string }
export const getTimeline = () => load<{ rows: TimelineRow[]; events: TimelineEvent[]; excluded: TimelineExcluded[] }>("timeline.json");
