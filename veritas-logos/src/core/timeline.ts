import { load } from "./data";
import { parseReference } from "./references";
import { segmentsOverlap } from "./content";
import { getTimeline } from "./people";
import { getWritingsIndex, writerYearLabel } from "./writings";

export type Band = "milestone" | "life" | "rule" | "prophet" | "period" | "event" | "nt" | "writer" | "confession" | "council" | "creed" | "schism" | "reform" | "shift" | "turning";

/** A point or span on the chart. x is a calendar year with no gap: AD 1 is 1, 1 BC is 0, 2 BC is -1. */
export interface TimeItem {
  key: string;
  band: Band;
  label: string;
  x1: number;
  x2: number;
  estimated: boolean;
  refs: string[];
  calc?: string;
  kind?: string;
  personId?: string;
  writerId?: string;
  /** Years counted from creation in BibleData. */
  ah?: [number, number];
  ussherBc?: number | null;
  note?: string;
  /** A church history event's id. */
  eventId?: string;
}

export const BANDS: { id: Band; label: string; hint: string }[] = [
  { id: "milestone", label: "Milestones", hint: "A few landmarks, shown when zoomed out" },
  { id: "life", label: "Lives", hint: "Lifespans from the ages Scripture gives" },
  { id: "rule", label: "Kings and judges", hint: "Reigns and judgeships" },
  { id: "prophet", label: "Prophets", hint: "Years of a prophet's ministry" },
  { id: "period", label: "Periods", hint: "Bondage, exile, building work and other spans" },
  { id: "event", label: "Events", hint: "Dated events in the Old Testament" },
  { id: "nt", label: "New Testament", hint: "Dated by Ussher's Annals (1650)" },
  { id: "writer", label: "Writers", hint: "Church Fathers and later teachers" },
  { id: "confession", label: "Confessions", hint: "Historic confessions and catechisms in this app" },
];

/** BibleData counts years from creation, with AH 3961 as 1 BC. */
export const ahToX = (ah: number) => ah - 3961;
export const formatYear = (x: number) => (x <= 0 ? `${1 - x} BC` : `AD ${x}`);
export const formatSpan = (a: number, b: number) => {
  if (a === b) return formatYear(a);
  if (a <= 0 && b <= 0) return `${1 - a} to ${1 - b} BC`;
  return `${formatYear(a)} to ${formatYear(b)}`;
};

export const TIME_MIN = -3999;
export const TIME_MAX = 2030;

export const CHURCH_BANDS: { id: Band; label: string; hint: string }[] = [
  { id: "council", label: "Councils", hint: "Councils and synods" },
  { id: "creed", label: "Creeds and confessions", hint: "Creeds, confessions and declarations" },
  { id: "schism", label: "Schisms and divisions", hint: "Where churches divided" },
  { id: "reform", label: "Reformations and renewal", hint: "Reform and renewal movements, and reconciliation" },
  { id: "shift", label: "Theological shifts", hint: "Changes in how theology was done" },
  { id: "turning", label: "Turning points", hint: "Events that changed the church's setting" },
  { id: "writer", label: "Writers", hint: "Church Fathers and later teachers in this app" },
];
export const CHURCH_MIN = 1;
export const CHURCH_ERAS: { id: string; label: string; from: number; to: number }[] = [
  { id: "all", label: "All of it", from: 1, to: 2030 },
  { id: "early", label: "Early church", from: 30, to: 325 },
  { id: "councils", label: "Age of the councils", from: 300, to: 800 },
  { id: "medieval", label: "Medieval", from: 780, to: 1300 },
  { id: "late", label: "Late medieval", from: 1280, to: 1520 },
  { id: "reformation", label: "Reformation", from: 1500, to: 1660 },
  { id: "modern", label: "Modern", from: 1650, to: 2030 },
];

export const ERAS: { id: string; label: string; from: number; to: number }[] = [
  { id: "all", label: "Whole story", from: TIME_MIN, to: TIME_MAX },
  { id: "early", label: "Creation to Babel", from: -3980, to: -1900 },
  { id: "patriarchs", label: "Patriarchs", from: -2000, to: -1600 },
  { id: "exodus", label: "Egypt and Exodus", from: -1700, to: -1380 },
  { id: "judges", label: "Judges", from: -1420, to: -1020 },
  { id: "kings", label: "Kings", from: -1060, to: -570 },
  { id: "exile", label: "Exile and return", from: -620, to: -390 },
  { id: "jesus", label: "Jesus and the apostles", from: -10, to: 95 },
  { id: "fathers", label: "Church Fathers", from: 50, to: 800 },
  { id: "medieval", label: "Medieval", from: 700, to: 1500 },
  { id: "reformation", label: "Reformation onward", from: 1450, to: 1950 },
];

export async function getTimelineItems(): Promise<{ items: TimeItem[]; excluded: { name: string; source: number; verse: number; ref: string }[] }> {
  const [{ rows, events, nt, excluded }, index, confessions] = await Promise.all([
    getTimeline(),
    getWritingsIndex(),
    load<{ docs: Record<string, { name: string; year: number; tradition: string }> }>("confession-sections.json"),
  ]);
  const items: TimeItem[] = [];
  const bandOf: Record<string, Band> = { life: "life", reign: "rule", judge: "rule", prophet: "prophet", period: "period" };
  rows.forEach((r, i) => items.push({
    key: `r${i}`, band: bandOf[r.kind] ?? "period", kind: r.kind,
    label: r.label.replace(/^The (life|reign) of /i, ""),
    x1: ahToX(r.from), x2: ahToX(r.to), estimated: r.estimated,
    refs: [r.startRef, r.endRef].filter(Boolean), calc: r.calc, personId: r.id || undefined, ah: [r.from, r.to],
  }));
  events.forEach((e, i) => items.push({
    key: `e${i}`, band: "event", kind: e.kind, label: e.label, x1: ahToX(e.year), x2: ahToX(e.year),
    estimated: e.estimated, refs: [e.ref], calc: e.calc || undefined, ah: [e.year, e.year], ussherBc: e.ussherBc,
  }));
  nt.forEach((e, i) => items.push({
    key: `n${i}`, band: "nt", label: e.label, x1: e.x, x2: e.x, estimated: true, refs: [e.ref],
    note: `Year from Ussher's Annals of the World (1650), paragraph ${e.para}. Other chronologies differ by a few years.`,
  }));
  for (const w of index.authors) {
    if (w.year === null || w.year < 1 || w.flag === "pseudo" || !w.n) continue;
    items.push({
      key: `w-${w.id}`, band: "writer", label: w.name, x1: w.year, x2: w.year, estimated: !w.dates, refs: [], writerId: w.id,
      note: w.dates ? `${w.name} lived ${w.dates}. The mark sits at the end of that span.` : `Marked at the year the source dataset gives (${writerYearLabel(w)}), usually about when the writer died.`,
    });
  }
  for (const [id, d] of Object.entries(confessions.docs)) {
    items.push({ key: `c-${id}`, band: "confession", label: d.name, x1: d.year, x2: d.year, estimated: false, refs: [], note: `${d.tradition} document, dated ${d.year} in this app's confession data.` });
  }
  // A few landmarks repeated on their own row, so the zoomed-out view has names on it.
  const MILESTONES: [RegExp, string][] = [
    [/^The Flood began/, "The Flood"], [/^The Promise to Abram/, "Promise to Abram"], [/^The Exodus/, "The Exodus"], [/^First Temple construction began/, "First Temple"],
    [/^(First Temple|Solomon's Temple).*destroy|^Destruction of Solomon/i, "Temple destroyed"], [/^Birth of Jesus/, "Birth of Jesus"], [/^Augustine of Hippo$/, "Augustine"], [/^Martin Luther$/, "Luther"],
  ];
  const marks: TimeItem[] = [];
  for (const [rx, label] of MILESTONES) {
    const it = items.find((i) => rx.test(i.label));
    if (it) marks.push({ ...it, key: `m-${it.key}`, band: "milestone", label });
  }
  return { items: [...marks, ...items], excluded };
}

/** Timeline entries whose citations touch a passage. */
export async function timelineForPassage(reference: string): Promise<TimeItem[]> {
  const segs = parseReference(reference) ?? [];
  if (!segs.length) return [];
  const { items } = await getTimelineItems();
  return items.filter((it) => it.band !== "life" && it.band !== "milestone" && it.refs.some((r) => (parseReference(r) ?? []).some((a) => segs.some((b) => segmentsOverlap(a, b))))).slice(0, 8);
}

/** The route for a year, such as timeline-bc-1446 or timeline-ad-70. */
export const timelineHash = (x: number) => (x <= 0 ? `timeline-bc-${1 - x}` : `timeline-ad-${x}`);
export function parseTimelineRoute(tail: string): number | null {
  const m = /^(bc|ad)-(\d{1,4})$/.exec(tail);
  if (!m) return null;
  return m[1] === "bc" ? 1 - Number(m[2]) : Number(m[2]);
}
