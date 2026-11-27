// Shared Robinson half-tile deflation engine for Penrose kite-and-dart tilings
// (spec section 9). Plain module without React so it can be unit-tested in
// penroseTiling.test.ts; shared by jigsaw.ts (puzzle patches) and
// penrosePicture.ts (subdivided & independent picture tilings).
//
// Half-tiles are [type, apex, axisEnd, side]:
//   half-kite: apex = kite tip O (72°), axisEnd = C (144°), side = B or D
//   half-dart: apex = reflex vertex A' (216°), axisEnd = tip M, side = N or N'
import { PHI, ROTATION_STEP, TILE_SIZE, centroidOf, getVertices, type Point, type Tile, type TileType } from './rules';

export type TilingSeed = 'sun' | 'star';
export type Half = [TileType, Point, Point, Point];

export interface TilingTile {
  type: TileType;
  // Perimeter order matching rules.ts:
  //   kite: [O (72°), B (72°), C (144°), D (72°)]
  //   dart: [M (72°), N (36°), A' (216°), N' (36°)]
  // with (v2 - v0) x (v1 - v0) > 0 (v1 on the clockwise side of the axis).
  vertices: [Point, Point, Point, Point];
  longEdge: number;
}

const lerp = (p: Point, q: Point, t: number): Point => ({
  x: p.x + (q.x - p.x) * t,
  y: p.y + (q.y - p.y) * t
});

// One deflation step: each half-kite splits into two half-kites and a
// half-dart, and each half-dart into a half-kite and a half-dart, shrinking by phi.
export const deflateHalves = (halves: readonly Half[]): Half[] =>
  halves.flatMap(([type, apex, axisEnd, side]): Half[] => {
    if (type === 'kite') {
      const P = lerp(apex, axisEnd, 1 / PHI);
      const Q = lerp(side, apex, 1 / PHI);
      return [['kite', side, P, axisEnd], ['kite', side, P, Q], ['dart', Q, apex, P]];
    }
    const P = lerp(axisEnd, side, 1 / PHI);
    return [['kite', axisEnd, apex, P], ['dart', P, side, apex]];
  });

export const deflateNTimes = (halves: readonly Half[], depth: number): Half[] => {
  let current: Half[] = [...halves];
  for (let i = 0; i < depth; i++) current = deflateHalves(current);
  return current;
};

// Sun of five kites (ten half-kites) around the origin, tips at the center.
export const sunHalves = (radius: number): Half[] => {
  const halves: Half[] = [];
  const d = (36 * Math.PI) / 180;
  for (let k = 0; k < 5; k++) {
    const a = (k * 72 * Math.PI) / 180;
    const C = { x: radius * Math.cos(a), y: radius * Math.sin(a) };
    for (const s of [a + d, a - d]) {
      halves.push(['kite', { x: 0, y: 0 }, C, { x: radius * Math.cos(s), y: radius * Math.sin(s) }]);
    }
  }
  return halves;
};

// Star of five darts (ten half-darts) around the origin, tips at the center.
export const starHalves = (radius: number): Half[] => {
  const halves: Half[] = [];
  const d = (36 * Math.PI) / 180;
  for (let k = 0; k < 5; k++) {
    const a = (k * 72 * Math.PI) / 180;
    const apex = { x: (radius / PHI) * Math.cos(a), y: (radius / PHI) * Math.sin(a) };
    for (const s of [a + d, a - d]) {
      halves.push(['dart', apex, { x: 0, y: 0 }, { x: radius * Math.cos(s), y: radius * Math.sin(s) }]);
    }
  }
  return halves;
};

// Splits a whole tile (from rules.ts) into its two Robinson half-tiles.
export const splitTile = (tile: Tile): Half[] => {
  const [v0, v1, v2, v3] = getVertices(tile);
  if (tile.type === 'kite') {
    return [['kite', v0, v2, v1], ['kite', v0, v2, v3]];
  }
  return [['dart', v2, v0, v1], ['dart', v2, v0, v3]];
};

const reflectAcross = (p: Point, a: Point, b: Point): Point => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const fx = a.x + t * dx, fy = a.y + t * dy;
  return { x: 2 * fx - p.x, y: 2 * fy - p.y };
};

// Orders the two off-axis vertices so (v2 - v0) x (v1 - v0) > 0, matching
// getVertices() in rules.ts.
const orientedTile = (type: TileType, v0: Point, v2: Point, s1: Point, s2: Point, longEdge: number): TilingTile => {
  const cross = (v2.x - v0.x) * (s1.y - v0.y) - (v2.y - v0.y) * (s1.x - v0.x);
  const [v1, v3] = cross >= 0 ? [s1, s2] : [s2, s1];
  return { type, vertices: [v0, v1, v2, v3], longEdge };
};

const pointKey = (p: Point) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

// Joins mirror half-tiles into whole tiles. When `completeBoundary` is true,
// an unpaired half-tile on the outer border is completed by reflecting it
// across its own symmetry axis so tiles straddling the boundary are whole.
export const joinToTiling = (halves: readonly Half[], longEdge: number, completeBoundary: boolean): TilingTile[] => {
  const byAxis = new Map<string, Half[]>();
  for (const h of halves) {
    const k = `${h[0]}|${pointKey(h[1])}|${pointKey(h[2])}`;
    const pair = byAxis.get(k);
    if (pair) pair.push(h);
    else byAxis.set(k, [h]);
  }

  const tiles: TilingTile[] = [];
  for (const pair of byAxis.values()) {
    if (pair.length < 2 && !completeBoundary) continue;
    const [type, apex, axisEnd, s1] = pair[0];
    const s2 = pair.length >= 2 ? pair[1][3] : reflectAcross(s1, apex, axisEnd);
    tiles.push(type === 'kite'
      ? orientedTile('kite', apex, axisEnd, s1, s2, longEdge)
      : orientedTile('dart', axisEnd, apex, s1, s2, longEdge));
  }
  return tiles;
};

// A whole tile as this game stores it: its type, centroid and the angle of
// its axis (vertex 0 to vertex 2), which is always a multiple of 36°.
export const tileFromVertices = (type: TileType, verts: readonly Point[]): Tile => {
  const c = centroidOf(verts);
  const angle = (Math.atan2(verts[2].y - verts[0].y, verts[2].x - verts[0].x) * 180) / Math.PI;
  const rotation = ((Math.round(angle / ROTATION_STEP) * ROTATION_STEP) % 360 + 360) % 360;
  return { type, x: c.x, y: c.y, rotation };
};

// A patch of the tiling around the origin, with long edges TILE_SIZE,
// covering a disc of radius about TILE_SIZE * PHI ** depth.
export const generatePatch = (depth: number, seedShape: TilingSeed = 'sun'): Tile[] => {
  const seed = (seedShape === 'star' ? starHalves : sunHalves)(TILE_SIZE * PHI ** depth);
  const halves = deflateNTimes(seed, depth);
  return joinToTiling(halves, TILE_SIZE, false).map(t => tileFromVertices(t.type, t.vertices));
};
