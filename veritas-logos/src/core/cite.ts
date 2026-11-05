/**
 * Formats sources for scholarly work. Each style is built from the same small record, so nothing is invented:
 * a field the source doesn't give is left out, and the caller shows the result for checking.
 */
export interface CiteRecord {
  id: string;
  kind: "section" | "book" | "article" | "web" | "bible";
  author?: string;
  title: string;
  container?: string;
  series?: string;
  volume?: string;
  editors?: string;
  publisher?: string;
  place?: string;
  year?: string;
  pages?: string;
  doi?: string;
  url?: string;
  journal?: string;
  issue?: string;
  note?: string;
}
export type CiteStyle = "chicago" | "turabian" | "sbl" | "bibtex" | "ris";
export const CITE_STYLES: { id: CiteStyle; label: string }[] = [
  { id: "chicago", label: "Chicago" },
  { id: "turabian", label: "Turabian" },
  { id: "sbl", label: "SBL" },
  { id: "bibtex", label: "BibTeX" },
  { id: "ris", label: "RIS" },
];

const lastFirst = (a: string) => {
  const parts = a.trim().split(/\s+/);
  return parts.length < 2 || /\b(of|the)\b/i.test(a) ? a : `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
};
const SERIES_ABBR: [RegExp, string][] = [[/^Ante-Nicene Fathers/, "ANF"], [/^Nicene and Post-Nicene Fathers, Series 1/, "NPNF1"], [/^Nicene and Post-Nicene Fathers, Series 2/, "NPNF2"]];

/** Pulls the series, volume, editors and year out of a source line such as "Ante-Nicene Fathers, vol. 3, ed. Roberts and Donaldson (1885–96)". */
export function parseSourceLine(source: string): Pick<CiteRecord, "container" | "volume" | "editors" | "year"> {
  const vol = /,? vol\. ([\w-]+)/.exec(source)?.[1];
  const ed = /,? ed\. ([^(,]+)/.exec(source)?.[1]?.trim();
  const year = /\(([^()]*\d{4}[^()]*)\)\s*$/.exec(source)?.[1];
  const head = source.split(/, vol\.|, ed\.| \(/)[0].trim();
  return { container: head, volume: vol, editors: ed, year: year?.replace(/^.*?(\d{4}.*)$/, "$1") };
}

const pagesPart = (r: CiteRecord) => (r.pages ? r.pages : "");
const pubPart = (r: CiteRecord) => [r.place, r.publisher].filter(Boolean).join(": ");

function note(r: CiteRecord, style: "chicago" | "turabian"): string {
  const by = r.author ? `${r.author}, ` : "";
  if (r.kind === "article") return `${by}“${r.title},” ${r.journal ?? ""}${r.volume ? ` ${r.volume}` : ""}${r.issue ? `, no. ${r.issue}` : ""}${r.year ? ` (${r.year})` : ""}${r.pages ? `: ${r.pages}` : ""}${r.doi ? `, https://doi.org/${r.doi}` : ""}.`;
  if (r.kind === "web") return `${by}“${r.title},”${r.container ? ` ${r.container},` : ""}${r.url ? ` ${r.url}` : ""}.`;
  if (r.kind === "book") return `${by}${r.title}${r.volume ? `, vol. ${r.volume}` : ""}${r.editors ? `, ed. ${r.editors}` : ""} (${[pubPart(r), r.year].filter(Boolean).join(", ")})${r.pages ? `, ${r.pages}` : ""}.`;
  const inPart = r.container ? ` in ${r.container}${r.volume ? `, vol. ${r.volume}` : ""}${r.editors ? `, ed. ${r.editors}` : ""}${r.year || r.publisher ? ` (${[pubPart(r), r.year].filter(Boolean).join(", ")})` : ""}` : "";
  const quoted = style === "turabian" ? `“${r.title},”` : `“${r.title},”`;
  return `${by}${quoted}${inPart}${r.pages ? `, ${r.pages}` : ""}${r.url && !r.pages ? `, ${r.url}` : ""}.`;
}

function bibliography(r: CiteRecord): string {
  const by = r.author ? `${lastFirst(r.author)}. ` : "";
  if (r.kind === "article") return `${by}“${r.title}.” ${r.journal ?? ""}${r.volume ? ` ${r.volume}` : ""}${r.issue ? `, no. ${r.issue}` : ""}${r.year ? ` (${r.year})` : ""}${r.pages ? `: ${r.pages}` : ""}.${r.doi ? ` https://doi.org/${r.doi}.` : ""}`;
  if (r.kind === "web") return `${by}“${r.title}.”${r.container ? ` ${r.container}.` : ""}${r.url ? ` ${r.url}.` : ""}`;
  if (r.kind === "book") return `${by}${r.title}.${r.volume ? ` Vol. ${r.volume}.` : ""}${r.editors ? ` Edited by ${r.editors}.` : ""} ${[pubPart(r), r.year].filter(Boolean).join(", ")}.`;
  return `${by}“${r.title}.”${r.container ? ` In ${r.container}${r.volume ? `, vol. ${r.volume}` : ""}.` : ""}${r.editors ? ` Edited by ${r.editors}.` : ""}${r.year ? ` ${r.year}.` : ""}`;
}

function sbl(r: CiteRecord): string {
  const series = SERIES_ABBR.find(([rx]) => rx.test(`${r.container ?? ""}${r.series ?? ""}`));
  if (series && r.volume) return `${r.author ? `${r.author}, ` : ""}${r.title} (${series[1]} ${r.volume}${r.pages ? `:${r.pages}` : ""})`;
  return note(r, "chicago").replace(/“([^”]*),”/, "“$1,”");
}

const bibKey = (r: CiteRecord) => `${(r.author ?? "anon").split(/\s+/).pop()!.toLowerCase().replace(/[^a-z]/g, "")}${(r.year ?? "").replace(/\D.*$/, "")}${r.title.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10)}`;
const bibEsc = (s: string) => s.replace(/[{}]/g, "").replace(/&/g, "\\&").replace(/%/g, "\\%");

function bibtex(r: CiteRecord): string {
  const type = r.kind === "article" ? "article" : r.kind === "book" ? "book" : r.kind === "web" ? "misc" : "incollection";
  const f: [string, string | undefined][] = [
    ["author", r.author], ["title", r.title], ["booktitle", r.kind === "section" ? r.container : undefined], ["journal", r.journal],
    ["editor", r.editors], ["volume", r.volume], ["number", r.issue], ["pages", r.pages], ["publisher", r.publisher], ["address", r.place],
    ["year", r.year], ["doi", r.doi], ["url", r.url], ["note", r.note],
  ];
  return `@${type}{${bibKey(r)},\n${f.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${bibEsc(v!)}}`).join(",\n")}\n}`;
}

function ris(r: CiteRecord): string {
  const type = r.kind === "article" ? "JOUR" : r.kind === "book" ? "BOOK" : r.kind === "web" ? "ELEC" : "CHAP";
  const lines: [string, string | undefined][] = [
    ["TY", type], ["AU", r.author], ["TI", r.title], ["T2", r.kind === "section" ? r.container : r.journal], ["ED", r.editors], ["VL", r.volume], ["IS", r.issue],
    ["SP", r.pages], ["PB", r.publisher], ["CY", r.place], ["PY", r.year?.replace(/\D.*$/, "")], ["DO", r.doi], ["UR", r.url], ["N1", r.note],
  ];
  return `${lines.filter(([, v]) => v).map(([k, v]) => `${k}  - ${v}`).join("\n")}\nER  - `;
}

export function formatCitation(r: CiteRecord, style: CiteStyle): string {
  if (style === "bibtex") return bibtex(r);
  if (style === "ris") return ris(r);
  if (style === "sbl") return sbl(r);
  return note(r, style);
}
export const formatBibliography = bibliography;
export const exportAll = (list: CiteRecord[], style: "bibtex" | "ris") => list.map((r) => formatCitation(r, style)).join("\n\n") + "\n";

export const citeId = (...parts: (string | number | undefined)[]) => parts.filter((p) => p !== undefined && p !== "").join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 90);

/** Reads Crossref's CSL JSON into a record. */
export function citeFromCsl(c: any): CiteRecord {
  const names = (c.author ?? []).map((a: any) => [a.given, a.family].filter(Boolean).join(" ") || a.name).filter(Boolean).join(" and ");
  const issued = c.issued?.["date-parts"]?.[0]?.[0] ?? c.created?.["date-parts"]?.[0]?.[0];
  const isArticle = /article/.test(c.type ?? "");
  return {
    id: citeId(c.DOI ?? c.title),
    kind: isArticle ? "article" : /book/.test(c.type ?? "") && !c["container-title"] ? "book" : isArticle ? "article" : c["container-title"] ? "section" : "book",
    author: names || undefined,
    title: Array.isArray(c.title) ? c.title[0] : c.title,
    journal: isArticle ? (Array.isArray(c["container-title"]) ? c["container-title"][0] : c["container-title"]) : undefined,
    container: !isArticle ? (Array.isArray(c["container-title"]) ? c["container-title"][0] : c["container-title"]) : undefined,
    volume: c.volume, issue: c.issue, pages: c.page, publisher: c.publisher, year: issued ? String(issued) : undefined, doi: c.DOI, url: c.URL,
  };
}

// ---------- Where to look for modern scholarship ----------
export function scholarshipLinks(query: string): { name: string; url: string; hint: string }[] {
  const q = encodeURIComponent(query);
  const doaj = encodeURIComponent(JSON.stringify({ query: { query_string: { query, default_operator: "AND" } } }));
  return [
    { name: "DOAJ", url: `https://doaj.org/search/articles?source=${doaj}`, hint: "Open-access journals" },
    { name: "Crossref", url: `https://search.crossref.org/?q=${q}`, hint: "Articles and books by DOI" },
    { name: "Google Scholar", url: `https://scholar.google.com/scholar?q=${q}`, hint: "Broad academic search" },
    { name: "Semantic Scholar", url: `https://www.semanticscholar.org/search?q=${q}`, hint: "Papers and citation links" },
    { name: "JSTOR", url: `https://www.jstor.org/action/doBasicSearch?Query=${q}`, hint: "Journal archive, some free to read" },
    { name: "Internet Archive", url: `https://archive.org/search?query=${q}`, hint: "Older public-domain books" },
    { name: "BiblicalStudies.org.uk", url: `https://www.google.com/search?q=${encodeURIComponent(`site:biblicalstudies.org.uk ${query}`)}`, hint: "Free theological journal articles" },
  ];
}
