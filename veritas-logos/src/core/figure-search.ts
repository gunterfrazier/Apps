import type { Figure } from "./figure-types";
import { allFigures } from "./figure-graph";

export type GroupFilter = "ANY" | "WOMEN" | "MEN";
export const GROUP_FILTERS: { key: GroupFilter; label: string }[] = [
  { key: "ANY", label: "Everyone" },
  { key: "WOMEN", label: "Women" },
  { key: "MEN", label: "Men" },
];
export const matchesGroup = (f: Figure, g: GroupFilter) => g === "ANY" || (g === "WOMEN" ? f.gender === "female" : f.gender === "male");

/** Finds people by name or alternate name, exact matches first. */
export function searchFigures(query: string, group: GroupFilter = "ANY", source: readonly Figure[] = allFigures): Figure[] {
  const q = query.trim().toLowerCase();
  const list = source.filter((f) => matchesGroup(f, group));
  if (!q) return list;
  const score = (f: Figure) => {
    const n = f.name.toLowerCase();
    const alt = f.altNames?.toLowerCase() ?? "";
    if (n === q) return 4;
    if (alt.split(", ").includes(q)) return 3;
    if (n.startsWith(q)) return 2;
    if (n.includes(q) || alt.includes(q) || f.title.toLowerCase().includes(q)) return 1;
    return 0;
  };
  return list.map((f) => [score(f), f] as const).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, f]) => f);
}
