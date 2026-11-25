// Penrose tiling pictures for the jigsaw (spec section 9) as plain functions
// without React, so the tiling geometry and circular matching-arc math can be
// unit-tested (penrosePicture.test.ts). ui/penrosePictureDraw.ts paints them.

import { PHI, TILE_SIZE, getVertices, type Point, type Tile, type TileType } from './rules';
import { boundsOf, seededRandom, type PictureStyle } from './jigsaw';

export type PenrosePictureStyle = Exclude<PictureStyle, 'sunset'>;

export interface TilingTile {
  type: TileType;
  // Perimeter order matching rules.ts:
  //   kite: [O (72°), B (72°), C (144°), D (72°)]
  //   dart: [M (72°), N (36°), A' (216°), N' (36°)]
  // with (v2 - v0) x (v1 - v0) > 0 (v1 on the clockwise side of the axis).
  vertices: [Point, Point, Point, Point];
  longEdge: number;
}

export interface CircularArc {
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  anticlockwise: boolean;
  family: 'primary' | 'secondary';
}

export const SUBDIVIDE_DEPTH = 2;
export const INDEPENDENT_TILE_SIZE = 38;

// ---------------------------------------------------------------------
// Robinson half-tile deflation at arbitrary scale & orientation
// ---------------------------------------------------------------------

type Half = [TileType, Point, Point, Point];

const lerp = (p: Point, q: Point, t: number): Point => ({
  x: p.x + (q.x - p.x) * t,
  y: p.y + (q.y - p.y) * t
});

const deflateHalves = (halves: Half[]): Half[] =>
  halves.flatMap(([type, apex, axisEnd, side]): Half[] => {
    if (type === 'kite') {
      const P = lerp(apex, axisEnd, 1 / PHI);
      const Q = lerp(side, apex, 1 / PHI);
      return [['kite', side, P, axisEnd], ['kite', side, P, Q], ['dart', Q, apex, P]];
    }
    const P = lerp(axisEnd, side, 1 / PHI);
    return [['kite', axisEnd, apex, P], ['dart', P, side, apex]];
  });

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
// across its own symmetry axis so tiles straddling the puzzle border are whole.
const joinToTiling = (halves: Half[], longEdge: number, completeBoundary: boolean): TilingTile[] => {
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

// Splits a whole tile (from rules.ts) into its two Robinson half-tiles.
const splitTile = (tile: Tile): Half[] => {
  const [v0, v1, v2, v3] = getVertices(tile);
  if (tile.type === 'kite') {
    return [['kite', v0, v2, v1], ['kite', v0, v2, v3]];
  }
  return [['dart', v2, v0, v1], ['dart', v2, v0, v3]];
};

// ---------------------------------------------------------------------
// Conway's circular matching arcs
//
// Each kite and dart carries two circular arcs centered at its symmetry-axis
// vertices, with golden-ratio radii L/phi, L/phi^2, L/phi^3:
//   - Primary:   kite O (r = L/phi)    <-> dart M (r = L/phi^2)   on long edges
//   - Secondary: kite C (r = L/phi^2)  <-> dart A' (r = L/phi^3)  on short edges
// Every arc meets both adjacent edges at 90 degrees and joins smoothly across
// every legal Penrose edge (L/phi + L/phi^2 = L, L/phi^2 + L/phi^3 = L/phi).
// ---------------------------------------------------------------------

const angleTo = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x);

export const tileArcs = (tile: TilingTile): [CircularArc, CircularArc] => {
  const [v0, v1, v2, v3] = tile.vertices;
  const L = tile.longEdge;
  const rPrimary = tile.type === 'kite' ? L / PHI : L / (PHI * PHI);
  const rSecondary = tile.type === 'kite' ? L / (PHI * PHI) : L / (PHI * PHI * PHI);
  return [
    {
      center: v0,
      radius: rPrimary,
      startAngle: angleTo(v0, v3),
      endAngle: angleTo(v0, v1),
      anticlockwise: false,
      family: 'primary'
    },
    {
      center: v2,
      radius: rSecondary,
      startAngle: angleTo(v2, v1),
      endAngle: angleTo(v2, v3),
      anticlockwise: false,
      family: 'secondary'
    }
  ];
};

// ---------------------------------------------------------------------
// The three Penrose tiling pictures
// ---------------------------------------------------------------------

// 1. Matching tiling: aligns 1:1 with the puzzle's solved tiles.
export const matchingTiling = (homes: readonly Tile[]): TilingTile[] =>
  homes.map(h => {
    const [v0, v1, v2, v3] = getVertices(h);
    return { type: h.type, vertices: [v0, v1, v2, v3], longEdge: TILE_SIZE };
  });

// 2. Subdivided tiling: deflates the puzzle's tiles `depth` times (default 2).
// Boundary halves are completed by reflection so child tiles straddling the
// puzzle's outer edge render completely up to the piece border.
export const subdividedTiling = (homes: readonly Tile[], depth = SUBDIVIDE_DEPTH): TilingTile[] => {
  let halves = homes.flatMap(splitTile);
  for (let i = 0; i < depth; i++) halves = deflateHalves(halves);
  return joinToTiling(halves, TILE_SIZE / PHI ** depth, true);
};

const sunAt = (radius: number): Half[] => {
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

const transformPoint2D = (p: Point, cos: number, sin: number, dx: number, dy: number): Point => ({
  x: p.x * cos - p.y * sin + dx,
  y: p.x * sin + p.y * cos + dy
});

const tileIntersectsBox = (t: TilingTile, box: { x: number; y: number; w: number; h: number }, pad: number): boolean => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of t.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return maxX >= box.x - pad && minX <= box.x + box.w + pad && maxY >= box.y - pad && minY <= box.y + box.h + pad;
};

// 3. Independent tiling: a separate Penrose tiling from a derived seed, at
// INDEPENDENT_TILE_SIZE and an independent angle and offset, covering `box`.
export const independentTiling = (
  box: { x: number; y: number; w: number; h: number },
  seed: number
): TilingTile[] => {
  const depth = 6;
  let halves = sunAt(INDEPENDENT_TILE_SIZE * PHI ** depth);
  for (let i = 0; i < depth; i++) halves = deflateHalves(halves);
  const raw = joinToTiling(halves, INDEPENDENT_TILE_SIZE, false);

  const random = seededRandom((seed ^ 0x5f3759df) >>> 0);
  const angle = random() * 2 * Math.PI;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const offsetR = INDEPENDENT_TILE_SIZE * 4 * Math.sqrt(random());
  const offsetA = random() * 2 * Math.PI;
  const cx = box.x + box.w / 2 - offsetR * Math.cos(offsetA);
  const cy = box.y + box.h / 2 - offsetR * Math.sin(offsetA);

  const placed: TilingTile[] = [];
  for (const t of raw) {
    const verts = t.vertices.map(v => transformPoint2D(v, cos, sin, cx, cy)) as [Point, Point, Point, Point];
    const moved: TilingTile = { type: t.type, vertices: verts, longEdge: t.longEdge };
    if (tileIntersectsBox(moved, box, INDEPENDENT_TILE_SIZE)) placed.push(moved);
  }
  return placed;
};

export const pictureTiles = (style: PenrosePictureStyle, homes: readonly Tile[], seed: number): TilingTile[] => {
  if (homes.length === 0) return [];
  if (style === 'matching') return matchingTiling(homes);
  if (style === 'subdivided') return subdividedTiling(homes, SUBDIVIDE_DEPTH);
  return independentTiling(boundsOf(homes), seed);
};
