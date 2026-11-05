import { load } from "./data";

/** A definition quoted from a named public-domain work. Nothing here is written for the app. */
export interface TermDefinition { source: string; short: string; head: string; text: string; url: string }
export interface GlossaryTerm {
  id: string;
  term: string;
  /** Definitions quoted from named public-domain works. */
  defs: TermDefinition[];
  refs: string[];
  topic: string;
  /** Word for word from the owner's own glossary, which names no sources. */
  own: string;
  ownHead?: string;
  aliases: string[];
  /** Another term's id, when this one is only a cross-reference. */
  see: string;
  /** A writer page for this person. */
  writer: string;
}

export const getGlossary = () => load<{ terms: GlossaryTerm[] }>("glossary.json").then((g) => g.terms);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const termById = async (id: string) => {
  const terms = await getGlossary();
  return terms.find((t) => t.id === id) ?? terms.find((t) => t.aliases.some((a) => slug(a) === id));
};
export const termText = (t: GlossaryTerm) => `${t.term} ${t.aliases.join(" ")} ${t.own} ${t.defs.map((d) => d.text).join(" ")}`.toLowerCase();

/** Exact and starts-with matches first, then terms whose definitions mention the word. */
export async function searchGlossary(query: string, limit = 40): Promise<GlossaryTerm[]> {
  const q = query.trim().toLowerCase();
  const terms = await getGlossary();
  if (!q) return terms.slice(0, limit);
  const rank = (t: GlossaryTerm) => {
    const names = [t.term, ...t.aliases].map((n) => n.toLowerCase());
    if (names.includes(q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    if (names.some((n) => n.includes(q))) return 2;
    return termText(t).includes(q) ? 3 : 9;
  };
  return terms.map((t) => [rank(t), t] as const).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, t]) => t);
}
