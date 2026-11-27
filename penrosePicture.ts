// Penrose tiling pictures for the jigsaw (spec section 9) as plain functions
// without React, so the tiling geometry and circular matching-arc math can be
// unit-tested (penrosePicture.test.ts). ui/penrosePictureDraw.ts paints them.

import { PHI, TILE_SIZE, getVertices, type Point, type Tile } from './rules';
import { deflateNTimes, joinToTiling, splitTile, sunHalves, type TilingTile } from './penroseTiling';
import { boundsOf, seededRandom } from './jigsaw';
import type { PictureStyle } from './settings';

export type { TilingTile };
export type PenrosePictureStyle = Exclude<PictureStyle, 'sunset'>;

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
  const halves = deflateNTimes(homes.flatMap(splitTile), depth);
  return joinToTiling(halves, TILE_SIZE / PHI ** depth, true);
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
  const halves = deflateNTimes(sunHalves(INDEPENDENT_TILE_SIZE * PHI ** depth), depth);
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

export const PENROSE_TILING_GENERATORS: Record<
  PenrosePictureStyle,
  (homes: readonly Tile[], seed: number) => TilingTile[]
> = {
  matching: homes => matchingTiling(homes),
  subdivided: homes => subdividedTiling(homes, SUBDIVIDE_DEPTH),
  independent: (homes, seed) => independentTiling(boundsOf(homes), seed)
};

export const pictureTiles = (style: PenrosePictureStyle, homes: readonly Tile[], seed: number): TilingTile[] =>
  homes.length === 0 ? [] : PENROSE_TILING_GENERATORS[style](homes, seed);
