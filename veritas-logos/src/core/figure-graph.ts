import type { Figure, ParentLink } from "./figure-types";

/**
 * The genealogy graph, carried over from BibliaTree. Relationship lists are made symmetric once at startup so every
 * lookup can rely on both sides (parent ↔ child, spouse ↔ spouse, sibling ↔ sibling).
 */
function buildGraph(source: Figure[]): { list: Figure[]; map: Map<string, Figure> } {
  const list: Figure[] = source.map((f) => ({
    ...f,
    parents: [...f.parents],
    spouses: [...f.spouses],
    children: [...f.children],
    siblings: [...(f.siblings ?? [])],
    associates: [...(f.associates ?? [])],
  }));
  const map = new Map(list.map((f) => [f.id, f]));
  const link = (from: Figure, key: "children" | "parents" | "spouses" | "siblings" | "associates", id: string) => {
    const list = from[key];
    if (list && !list.includes(id)) list.push(id);
  };

  for (const person of list) {
    for (const id of person.parents) map.get(id) && link(map.get(id)!, "children", person.id);
    for (const id of person.children) map.get(id) && link(map.get(id)!, "parents", person.id);
    for (const id of person.spouses) map.get(id) && link(map.get(id)!, "spouses", person.id);
    for (const id of person.siblings ?? []) map.get(id) && link(map.get(id)!, "siblings", person.id);
    for (const id of person.associates ?? []) map.get(id) && link(map.get(id)!, "associates", person.id);
  }
  return { list, map };
}

let graph: { list: Figure[]; map: Map<string, Figure> } = { list: [], map: new Map() };

/** All figures in their original (chronological) order. */
export let allFigures: readonly Figure[] = [];

/** Figures sorted by name, for pickers. */
export let figuresByName: readonly Figure[] = [];

/** Loads the people dataset. Call once before using anything else in this module. */
export function initFigures(source: Figure[]): void {
  graph = buildGraph(source);
  allFigures = graph.list;
  figuresByName = [...graph.list].sort((a, b) => a.name.localeCompare(b.name));
  adamPathCache.clear();
}

export const DEFAULT_FIGURE_ID = "david-1";

/** Records that turned out to be one person point to the record that remains, so saved guides still resolve. */
let aliases: Record<string, string> = {};
export const setFigureAliases = (a: Record<string, string>) => { aliases = a; };

export function getFigure(id: string | undefined | null): Figure | undefined {
  return id ? graph.map.get(id) ?? graph.map.get(aliases[id]) : undefined;
}

export function hasFigure(id: string): boolean {
  return graph.map.has(id) || graph.map.has(aliases[id]);
}

/** Resolves ids to figures, silently skipping ids with no record. */
export function resolveFigures(ids: readonly string[] | undefined): Figure[] {
  return (ids ?? []).map((id) => graph.map.get(id)).filter((f): f is Figure => Boolean(f));
}

/** Details of the link from a parent to a child (undefined = a plain, direct parent). */
export function parentLink(childId: string, parentId: string): ParentLink | undefined {
  return graph.map.get(childId)?.parentLinks?.[parentId];
}

/** Siblings through a shared parent, plus siblings recorded directly. */
export function getSiblings(personId: string): string[] {
  const person = graph.map.get(personId);
  if (!person) return [];
  const siblings = new Set<string>(person.siblings ?? []);
  for (const parentId of person.parents) {
    // A tribal or national ancestor doesn't make everyone descended from them siblings.
    if (person.parentLinks?.[parentId]?.kind === "descendant") continue;
    for (const childId of graph.map.get(parentId)?.children ?? []) {
      if (childId !== personId && graph.map.get(childId)?.parentLinks?.[parentId]?.kind !== "descendant") siblings.add(childId);
    }
  }
  return [...siblings];
}

export type RelationStep = "parent" | "child" | "spouse" | "sibling" | "relative";

export function relationBetween(fromId: string, toId: string): RelationStep {
  const from = graph.map.get(fromId);
  if (!from) return "relative";
  if (from.children.includes(toId)) return "parent";
  if (from.parents.includes(toId)) return "child";
  if (from.spouses.includes(toId)) return "spouse";
  if (from.siblings?.includes(toId) || getSiblings(fromId).includes(toId)) return "sibling";
  return "relative";
}

/** Generations a parent→child link spans, and whether that number is a lower bound. */
function linkGenerations(link: ParentLink | undefined): { generations: number; exact: boolean } {
  if (link?.kind !== "descendant") return { generations: 1, exact: true };
  return link.generations ? { generations: link.generations, exact: true } : { generations: 1, exact: false };
}

/** The link between two adjacent people on a path, whichever direction it points. */
export function stepLink(fromId: string, toId: string): ParentLink | undefined {
  const rel = relationBetween(fromId, toId);
  if (rel === "parent") return parentLink(toId, fromId);
  if (rel === "child") return parentLink(fromId, toId);
  return undefined;
}

export function describeRelationshipStep(fromId: string, toId: string): string {
  const rel = relationBetween(fromId, toId);
  const link = stepLink(fromId, toId);
  const span =
    link?.kind === "descendant" ? (link.generations ? ` · ${link.generations} generations` : " · generations unrecorded") : "";
  switch (rel) {
    case "parent":
      return link?.kind === "descendant" ? `Ancestor of ↓${span}` : link?.kind === "legal" ? "Legal parent of ↓" : "Parent of ↓";
    case "child":
      return link?.kind === "descendant" ? `Descendant of ↑${span}` : link?.kind === "legal" ? "Legal child of ↑" : "Child of ↑";
    case "spouse":
      return "Spouse of ∞";
    case "sibling":
      return "Sibling of ↔";
    default:
      return "Relative of";
  }
}

export interface PathSummary {
  /** People-to-people links on the path. */
  links: number;
  /** Generations crossed by parent/child links (marriages and siblings add none). */
  generations: number;
  /** True when a link has unrecorded generations, so `generations` is a minimum. */
  atLeast: boolean;
  /** True when a link rests on tradition rather than an explicit statement. */
  traditional: boolean;
  /** True when every link runs the same way (a straight line of ancestry), so `generations` is a real distance. */
  direct: boolean;
}

export function summarizePath(path: readonly string[]): PathSummary {
  let generations = 0;
  let atLeast = false;
  let traditional = false;
  const directions = new Set<string>();
  for (let i = 0; i + 1 < path.length; i++) {
    const rel = relationBetween(path[i], path[i + 1]);
    directions.add(rel);
    if (rel !== "parent" && rel !== "child") continue;
    const link = stepLink(path[i], path[i + 1]);
    const span = linkGenerations(link);
    generations += span.generations;
    if (!span.exact) atLeast = true;
    if (link?.tradition) traditional = true;
  }
  const direct = directions.size === 1 && (directions.has("parent") || directions.has("child"));
  return { links: Math.max(0, path.length - 1), generations, atLeast, traditional, direct };
}

export function formatGenerations(summary: PathSummary): string {
  const n = `${summary.atLeast ? "at least " : ""}${summary.generations}`;
  return `${n} ${summary.generations === 1 && !summary.atLeast ? "generation" : "generations"}`;
}

const SPOUSE_STEP_COST = 3;
const SIBLING_STEP_COST = 2;
const UNRECORDED_GENERATIONS_COST = 3;
const TRADITION_COST = 1;
const OFF_MESSIANIC_LINE_COST = 3;

/**
 * Lowest-cost genealogical chain over parent, child, spouse and sibling links.
 *
 * A parent link costs the generations it spans (so Luke's compressed lists count fully), and
 * bloodline steps are preferred over marriages, recorded links over traditional ones, and the
 * Messianic line over side branches. Among people off the Messianic line every direct step
 * costs the same, so those paths are still the shortest by generation count.
 */
export function findShortestPath(startId: string, endId: string, options: { descentOnly?: boolean } = {}): string[] | null {
  if (!graph.map.has(startId) || !graph.map.has(endId)) return null;
  if (startId === endId) return [startId];

  const cost = new Map<string, number>([[startId, 0]]);
  const previous = new Map<string, string>();
  const done = new Set<string>();
  const frontier = new Set([startId]);

  while (frontier.size > 0) {
    let currentId = "";
    let best = Infinity;
    for (const id of frontier) {
      const c = cost.get(id)!;
      if (c < best) {
        best = c;
        currentId = id;
      }
    }
    frontier.delete(currentId);
    if (currentId === endId) break;
    done.add(currentId);

    const current = graph.map.get(currentId)!;
    const steps: [string, number][] = [];
    const linkCost = (link: ParentLink | undefined) => {
      const span = linkGenerations(link);
      return (span.exact ? span.generations : UNRECORDED_GENERATIONS_COST) + (link?.tradition ? TRADITION_COST : 0);
    };
    for (const id of current.children) steps.push([id, linkCost(parentLink(id, currentId))]);
    if (!options.descentOnly) {
      for (const id of current.parents) steps.push([id, linkCost(parentLink(currentId, id))]);
      for (const id of current.spouses) steps.push([id, SPOUSE_STEP_COST]);
      for (const id of current.siblings ?? []) steps.push([id, SIBLING_STEP_COST]);
    }

    for (const [nextId, stepCost] of steps) {
      const next = graph.map.get(nextId);
      if (!next || done.has(nextId)) continue;
      const candidate = best + stepCost + (next.messianic ? 0 : OFF_MESSIANIC_LINE_COST);
      if (candidate < (cost.get(nextId) ?? Infinity)) {
        cost.set(nextId, candidate);
        previous.set(nextId, currentId);
        frontier.add(nextId);
      }
    }
  }

  if (!previous.has(endId)) return null;
  const path = [endId];
  while (path[0] !== startId) path.unshift(previous.get(path[0])!);
  return path;
}

const adamPathCache = new Map<string, string[] | null>();

/** Line of descent from Adam to this person, parent to child only (memoised: the graph never changes). */
export function lineageFromAdam(personId: string): string[] | null {
  if (!adamPathCache.has(personId)) adamPathCache.set(personId, findShortestPath("adam-1", personId, { descentOnly: true }));
  return adamPathCache.get(personId) ?? null;
}

export interface SubgraphOptions {
  maxDepth: number;
  includeSpouses: boolean;
  includeSiblings: boolean;
  /** Ids of a highlighted lineage path that must appear in the tree. */
  highlightedPath?: readonly string[];
}

/**
 * Collects the people shown in a family tree centred on `focusId`, mapped to their
 * generation relative to the focus (0 = focus, negative = ancestors, positive = descendants).
 * Insertion order is meaningful: layout uses it as the tie-breaker within a row.
 */
export function buildSubgraph(focusId: string, options: SubgraphOptions): Map<string, number> {
  const { maxDepth, includeSpouses, includeSiblings, highlightedPath = [] } = options;
  const genMap = new Map<string, number>();
  const focus = graph.map.get(focusId);
  if (!focus) return genMap;
  genMap.set(focusId, 0);

  // 1. Ancestors (negative generations)
  const up = [{ id: focusId, gen: 0 }];
  while (up.length > 0) {
    const { id, gen } = up.shift()!;
    if (Math.abs(gen) >= maxDepth) continue;
    for (const parentId of graph.map.get(id)?.parents ?? []) {
      if (!genMap.has(parentId) && graph.map.has(parentId)) {
        genMap.set(parentId, gen - 1);
        up.push({ id: parentId, gen: gen - 1 });
      }
    }
  }

  // 2. Descendants (positive generations)
  const down = [{ id: focusId, gen: 0 }];
  while (down.length > 0) {
    const { id, gen } = down.shift()!;
    if (gen >= maxDepth) continue;
    for (const childId of graph.map.get(id)?.children ?? []) {
      if (!genMap.has(childId) && graph.map.has(childId)) {
        genMap.set(childId, gen + 1);
        down.push({ id: childId, gen: gen + 1 });
      }
    }
  }

  // 3. Siblings of the focus person
  if (includeSiblings) {
    for (const siblingId of getSiblings(focusId)) {
      if (!genMap.has(siblingId)) genMap.set(siblingId, 0);
    }
  }

  // 4. Spouses of everyone already in the tree
  if (includeSpouses) {
    for (const id of [...genMap.keys()]) {
      const gen = genMap.get(id) ?? 0;
      for (const spouseId of graph.map.get(id)?.spouses ?? []) {
        if (!genMap.has(spouseId) && graph.map.has(spouseId)) genMap.set(spouseId, gen);
      }
    }
  }

  // 5. Figures with no recorded genealogy (or a tiny tree) show their contemporaries
  const associates = focus.associates ?? [];
  if (focus.unrecordedGenealogy || (associates.length > 0 && genMap.size <= 3)) {
    for (const assocId of associates) {
      if (!genMap.has(assocId) && graph.map.has(assocId)) genMap.set(assocId, 1);
    }
  }

  // 6. Highlighted path members not reached above, placed relative to their path neighbours
  placePathNodes(highlightedPath, genMap);

  return genMap;
}

function placePathNodes(path: readonly string[], genMap: Map<string, number>) {
  const ids = path.filter((id) => graph.map.has(id));
  if (ids.length === 0 || ids.every((id) => genMap.has(id))) return;
  if (!ids.some((id) => genMap.has(id))) {
    ids.forEach((id, i) => genMap.set(id, i));
    return;
  }
  const offset = (from: string, to: string) => {
    const rel = relationBetween(from, to);
    return rel === "parent" ? 1 : rel === "child" ? -1 : 0;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < ids.length; i++) {
      const gen = genMap.get(ids[i]);
      if (gen === undefined) continue;
      const prev = ids[i - 1];
      const next = ids[i + 1];
      if (next && !genMap.has(next)) {
        genMap.set(next, gen + offset(ids[i], next));
        changed = true;
      }
      if (prev && !genMap.has(prev)) {
        genMap.set(prev, gen - offset(prev, ids[i]));
        changed = true;
      }
    }
  }
}
