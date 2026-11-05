import { load } from "./data";

/** A definition quoted from a named public-domain work. Nothing here is written for the app. */
export interface TermDefinition { source: string; short: string; head: string; text: string; url: string }
export interface GlossaryTerm { id: string; term: string; defs: TermDefinition[]; refs: string[]; topic: string }

export const getGlossary = () => load<{ terms: GlossaryTerm[] }>("glossary.json").then((g) => g.terms);
export const termById = async (id: string) => (await getGlossary()).find((t) => t.id === id);

/** Exact and starts-with matches first, then terms whose definitions mention the word. */
export async function searchGlossary(query: string, limit = 40): Promise<GlossaryTerm[]> {
  const q = query.trim().toLowerCase();
  const terms = await getGlossary();
  if (!q) return terms.slice(0, limit);
  const rank = (t: GlossaryTerm) => {
    const name = t.term.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    return t.defs.some((d) => d.text.toLowerCase().includes(q)) ? 3 : 9;
  };
  return terms.map((t) => [rank(t), t] as const).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, t]) => t);
}
