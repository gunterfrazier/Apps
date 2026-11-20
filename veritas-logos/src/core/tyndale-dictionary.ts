import { load } from "./data";

type PlaceReference = [book: number, chapter: number, verse: number];
export type DictionaryIndexEntry = [id: string, title: string, shard: number, aliases: string[], place: PlaceReference | null];
type Inline = [text: string] | [text: string, kind: "article" | "scripture" | "section", target: string];
type Paragraph = [heading: boolean, anchor: string, text: Inline[]];

export const getTyndaleDictionaryIndex = () => load<DictionaryIndexEntry[]>("tyndale-dictionary/index.json");

const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
  .replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function searchTyndaleDictionary(entries: DictionaryIndexEntry[], query: string) {
  const key = normalize(query);
  if (!key) return entries;
  const scored = entries.flatMap((entry) => {
    const heading = normalize(entry[1]);
    const aliases = entry[3].map(normalize);
    if (heading === key) return [{ entry, score: 0 }];
    if (aliases.includes(key)) return [{ entry, score: 1 }];
    if ([heading, ...aliases].some((term) => term.startsWith(key))) return [{ entry, score: 2 }];
    if ([heading, ...aliases].some((term) => term.includes(key))) return [{ entry, score: 3 }];
    return [];
  });
  return scored.sort((a, b) => a.score - b.score).map(({ entry }) => entry);
}

export async function getTyndaleDictionaryArticle(id: string) {
  const index = await getTyndaleDictionaryIndex();
  const entry = index.find(([key]) => key === id);
  if (!entry) return null;
  const shard = await load<Record<string, Paragraph[]>>(`tyndale-dictionary/${entry[2]}.json`);
  const paragraphs = shard[id];
  return paragraphs ? { entry, paragraphs } : null;
}
