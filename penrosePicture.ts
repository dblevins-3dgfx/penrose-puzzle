// Penrose tiling pictures for the jigsaw (spec section 9) as plain functions
// without React, so the tiling geometry and circular matching-arc math can be
// unit-tested (penrosePicture.test.ts). ui/penrosePictureDraw.ts paints them.

import { PHI, TILE_SIZE, centroidOf, getVertices, type Point, type Tile } from './rules';
import { deflateNTimes, joinToTiling, splitTile, sunHalves, type TilingTile } from './penroseTiling';
import { boundsOf, seededRandom } from './jigsaw';
import type { PictureStyle } from './settings';

export type { TilingTile };
export type PenrosePictureStyle = Exclude<PictureStyle, 'sunset'>;
export type RGB = [number, number, number];
export type GradientKind = 'bilinear' | 'conic';

export interface PenrosePalette {
  id: string;
  // Four harmonious jewel-tone stops in cyclic order around the hue wheel
  // (used as [TL, TR, BR, BL] in bilinear mode and cyclic stops in conic mode).
  colors: readonly [RGB, RGB, RGB, RGB];
}

export interface PenroseColorScheme {
  paletteId: string;
  gradient: GradientKind;
  colors: readonly [RGB, RGB, RGB, RGB];
  angle: number;
  flip: boolean;
  // Normalized off-center focal offset for conic sweeps (fraction of box size).
  focalOffset: Point;
}

// Curated mid-value stained-glass palettes that keep dark lead lines and
// bright gold/aqua Conway matching arcs crisp across every tile.
export const PENROSE_PALETTES: readonly PenrosePalette[] = [
  {
    id: 'cathedral',
    colors: [
      [234, 152, 46], // golden amber
      [196, 61, 108], // ruby rose
      [66, 78, 184], // royal sapphire
      [28, 156, 152] // peacock teal
    ]
  },
  {
    id: 'aurora',
    colors: [
      [168, 182, 48], // sunlit lime-gold
      [32, 158, 128], // emerald jade
      [52, 98, 202], // arctic cobalt
      [176, 66, 164] // aurora orchid
    ]
  },
  {
    id: 'canyon',
    colors: [
      [228, 156, 48], // desert marigold
      [198, 56, 72], // terracotta crimson
      [118, 62, 166], // mesa plum
      [34, 152, 148] // desert turquoise
    ]
  },
  {
    id: 'botanical',
    colors: [
      [156, 174, 46], // sunlit olive
      [34, 146, 98], // forest emerald
      [62, 86, 178], // twilight indigo
      [206, 98, 56] // warm copper
    ]
  },
  {
    id: 'oceania',
    colors: [
      [228, 166, 50], // sunset gold
      [220, 88, 76], // coral vermilion
      [54, 92, 192], // cobalt ultramarine
      [28, 160, 146] // seafoam teal
    ]
  },
  {
    id: 'prism',
    colors: [
      [228, 126, 44], // warm tangerine
      [196, 58, 134], // jewel magenta
      [44, 126, 204], // cerulean blue
      [42, 164, 108] // rich jade
    ]
  }
];

const KITE_TINT: RGB = [255, 248, 232];
const DART_SHADE: RGB = [15, 23, 42];

const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Deterministically selects a palette, gradient geometry, orientation, and
// cyclic color rotation from the puzzle seed so every new puzzle has a fresh
// color map while ?seed= stays 100% reproducible.
export const colorSchemeForSeed = (seed: number): PenroseColorScheme => {
  const random = seededRandom((seed ^ 0x9e3779b9) >>> 0);
  const palette = PENROSE_PALETTES[Math.floor(random() * PENROSE_PALETTES.length)];
  const shift = Math.floor(random() * 4);
  const colors = [0, 1, 2, 3].map(i => palette.colors[(i + shift) % 4]) as [RGB, RGB, RGB, RGB];
  const gradient: GradientKind = random() < 0.6 ? 'bilinear' : 'conic';
  const angle = random() * 2 * Math.PI;
  const flip = random() < 0.5;
  const focalR = 0.12 + random() * 0.08;
  const focalA = random() * 2 * Math.PI;
  return {
    paletteId: palette.id,
    gradient,
    colors,
    angle,
    flip,
    focalOffset: { x: focalR * Math.cos(focalA), y: focalR * Math.sin(focalA) }
  };
};

// Samples the unshaded stained-glass wash color at an arbitrary board point.
export const sampleGradientColor = (
  p: Point,
  box: { x: number; y: number; w: number; h: number },
  scheme: PenroseColorScheme
): RGB => {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const nx = (p.x - cx) / ((box.w || 1) / 2);
  const ny = (p.y - cy) / ((box.h || 1) / 2);
  const [c0, c1, c2, c3] = scheme.colors;

  if (scheme.gradient === 'bilinear') {
    const cos = Math.cos(scheme.angle);
    const sin = Math.sin(scheme.angle);
    const rx = nx * cos - ny * sin;
    const ry = nx * sin + ny * cos;
    const u = clamp01(0.5 + (scheme.flip ? -rx : rx) * 0.55);
    const v = clamp01(0.5 + ry * 0.55);
    return mixRgb(mixRgb(c0, c1, u), mixRgb(c3, c2, u), v);
  }

  const fx = cx + scheme.focalOffset.x * (box.w || 1);
  const fy = cy + scheme.focalOffset.y * (box.h || 1);
  const dir = scheme.flip ? -1 : 1;
  const rawAngle = Math.atan2(p.y - fy, p.x - fx) * dir + scheme.angle;
  const wrapped = ((rawAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const pos = (wrapped / (2 * Math.PI)) * 4;
  const idx = Math.floor(pos) % 4;
  const frac = pos - Math.floor(pos);
  // Smoothstep keeps sector transitions silky without flat banding
  const smooth = frac * frac * (3 - 2 * frac);
  const angular = mixRgb(scheme.colors[idx], scheme.colors[(idx + 1) % 4], smooth);
  const radial = clamp01(Math.hypot(nx, ny) / 1.25);
  return mixRgb(mixRgb(angular, KITE_TINT, 0.08), mixRgb(angular, DART_SHADE, 0.1), radial);
};

// Final stained-glass tile fill color, keeping kites subtly brighter/warmer
// and darts deeper/cooler so tile shapes remain crisp.
export const sampleTileColor = (
  tile: TilingTile,
  box: { x: number; y: number; w: number; h: number },
  scheme: PenroseColorScheme
): RGB => {
  const base = sampleGradientColor(centroidOf(tile.vertices), box, scheme);
  const shaded = tile.type === 'kite' ? mixRgb(base, KITE_TINT, 0.16) : mixRgb(base, DART_SHADE, 0.26);
  return [Math.round(shaded[0]), Math.round(shaded[1]), Math.round(shaded[2])];
};

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

const toTilingTile = (tile: Tile): TilingTile => {
  const [v0, v1, v2, v3] = getVertices(tile);
  return { type: tile.type, vertices: [v0, v1, v2, v3], longEdge: TILE_SIZE };
};

// Conway's circular matching arcs for a single board Tile (used by Sandbox).
export const arcsForTile = (tile: Tile): [CircularArc, CircularArc] => tileArcs(toTilingTile(tile));

// ---------------------------------------------------------------------
// The three Penrose tiling pictures
// ---------------------------------------------------------------------

// 1. Matching tiling: aligns 1:1 with the puzzle's solved tiles.
export const matchingTiling = (homes: readonly Tile[]): TilingTile[] => homes.map(toTilingTile);

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

const tileIntersectsBox = (
  t: TilingTile,
  box: { x: number; y: number; w: number; h: number },
  pad: number
): boolean => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
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
export const independentTiling = (box: { x: number; y: number; w: number; h: number }, seed: number): TilingTile[] => {
  const depth = 6;
  const halves = deflateNTimes(sunHalves(INDEPENDENT_TILE_SIZE * PHI ** depth), depth);
  const raw = joinToTiling(halves, INDEPENDENT_TILE_SIZE, false);

  const random = seededRandom((seed ^ 0x5f3759df) >>> 0);
  const angle = random() * 2 * Math.PI;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
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
