import { getFigure } from "./figure-graph";

export interface LayoutDims {
  nodeW: number;
  nodeH: number;
  hGap: number;
  vGap: number;
  padX: number;
  padTop: number;
  padBottom: number;
}

/** Card geometry for the on-screen tree. */
export const SCREEN_DIMS: LayoutDims = {
  nodeW: 176,
  nodeH: 118,
  hGap: 18,
  vGap: 164,
  padX: 48,
  padTop: 64,
  padBottom: 160,
};

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  gen: number;
}

export interface TreeLayout {
  positions: Map<string, NodePosition>;
  rows: { gen: number; ids: string[] }[];
  width: number;
  height: number;
  dims: LayoutDims;
}

/**
 * Lays generations out as rows, top (oldest) to bottom. Each person is ordered and
 * placed beneath the average position of their parents, spouses who married in sit
 * beside their partner, and overlaps are pushed apart. The focus person and
 * Messianic-line figures break ties.
 */
export function layoutTree(genMap: Map<string, number>, focusId: string, dims: LayoutDims = SCREEN_DIMS): TreeLayout {
  const byGen = new Map<number, string[]>();
  for (const [id, gen] of genMap) {
    if (!byGen.has(gen)) byGen.set(gen, []);
    byGen.get(gen)!.push(id);
  }
  const gens = [...byGen.keys()].sort((a, b) => a - b);
  const step = dims.nodeW + dims.hGap;

  // Centre x of every placed card, in an unshifted coordinate space.
  const centers = new Map<string, number>();
  const parentCenter = (id: string): number | null => {
    const xs = (getFigure(id)?.parents ?? []).map((p) => centers.get(p)).filter((v): v is number => v !== undefined);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  };

  const rows: { gen: number; ids: string[] }[] = [];
  for (const gen of gens) {
    const ids = orderRow(byGen.get(gen)!, focusId, parentCenter);
    rows.push({ gen, ids });

    // Desired centres: under the parents, or next to the neighbour that has one.
    const anchors = ids.map(parentCenter);
    const desired = [...anchors];
    for (let i = 1; i < desired.length; i++) {
      if (desired[i] === null && desired[i - 1] !== null) desired[i] = desired[i - 1]! + step;
    }
    for (let i = desired.length - 2; i >= 0; i--) {
      if (desired[i] === null && desired[i + 1] !== null) desired[i] = desired[i + 1]! - step;
    }
    const target = desired.map((d, i) => d ?? (i - (ids.length - 1) / 2) * step);

    // Push apart left-to-right, then shift the row back: the focus person sits directly
    // under their parents; other rows balance the people whose parents are shown.
    const placed: number[] = [];
    target.forEach((t, i) => placed.push(i === 0 ? t : Math.max(t, placed[i - 1] + step)));
    const focusIndex = ids.indexOf(focusId);
    const anchored = ids.map((_, i) => i).filter((i) => anchors[i] !== null);
    const shift =
      focusIndex >= 0 && anchors[focusIndex] !== null
        ? anchors[focusIndex]! - placed[focusIndex]
        : anchored.length > 0
          ? anchored.reduce((sum, i) => sum + (anchors[i]! - placed[i]), 0) / anchored.length
          : target.reduce((sum, t, i) => sum + (t - placed[i]), 0) / target.length;
    ids.forEach((id, i) => centers.set(id, placed[i] + shift));
  }

  const allCenters = [...centers.values()];
  const minC = Math.min(0, ...allCenters);
  const maxC = Math.max(0, ...allCenters);
  const width = maxC - minC + dims.nodeW + dims.padX * 2;
  const height = dims.padTop + Math.max(0, rows.length - 1) * dims.vGap + dims.nodeH + dims.padBottom;

  const positions = new Map<string, NodePosition>();
  rows.forEach((row, rowIndex) => {
    const y = dims.padTop + rowIndex * dims.vGap;
    for (const id of row.ids) {
      const x = centers.get(id)! - minC + dims.padX;
      positions.set(id, { id, x, y, cx: x + dims.nodeW / 2, cy: y + dims.nodeH / 2, gen: row.gen });
    }
  });

  return { positions, rows, width, height, dims };
}

function orderRow(ids: string[], focusId: string, parentCenter: (id: string) => number | null): string[] {
  // Base order (stable): focus first, then Messianic line, then source order.
  const base = ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => {
      if (a.id === focusId) return -1;
      if (b.id === focusId) return 1;
      const ma = getFigure(a.id)?.messianic ? 1 : 0;
      const mb = getFigure(b.id)?.messianic ? 1 : 0;
      if (ma !== mb) return mb - ma;
      return a.i - b.i;
    })
    .map((x) => x.id);

  const keyed = base
    .map((id, i) => ({ id, i, key: parentCenter(id) }))
    .filter((x): x is { id: string; i: number; key: number } => x.key !== null)
    .sort((a, b) => a.key - b.key || a.i - b.i);
  const keyedIds = new Set(keyed.map((k) => k.id));
  const rowSet = new Set(ids);

  const ordered: string[] = [];
  const placed = new Set<string>();
  const place = (id: string) => {
    if (placed.has(id)) return;
    ordered.push(id);
    placed.add(id);
    for (const spouseId of getFigure(id)?.spouses ?? []) {
      // Spouses who married in (no parents in the row above) sit beside their partner.
      if (rowSet.has(spouseId) && !keyedIds.has(spouseId) && !placed.has(spouseId)) {
        ordered.push(spouseId);
        placed.add(spouseId);
      }
    }
  };
  // Siblings of the focus person go on both sides of the focus (and the focus's spouses).
  let sequence = keyed.map((k) => k.id);
  const focusAt = sequence.indexOf(focusId);
  if (focusAt >= 0) {
    const others = sequence.filter((id) => id !== focusId);
    const half = Math.floor(others.length / 2);
    sequence = [...others.slice(0, half), focusId, ...others.slice(half)];
  }
  sequence.forEach(place);
  base.forEach(place);
  return ordered;
}

/** Label for a card's generation chip, matching the prototype. */
export function generationLabel(gen: number, isFocus: boolean, isAssociate: boolean, standalone: boolean): string {
  if (gen === 0) return isFocus ? (standalone ? "★ Standalone" : "★ Focus") : "Same Gen";
  if (isAssociate) return "Contemporary";
  return gen < 0 ? `${gen} Gen` : `+${gen} Gen`;
}
