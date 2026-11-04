// The jigsaw puzzle (spec section 11) as plain functions, with no React, so
// it can be unit-tested (jigsaw.test.ts). ui/Jigsaw.tsx only calls them.
//
// A puzzle is a patch of a real Penrose kite and dart tiling with a picture
// laid over it. Each tile is a piece; the pieces start scattered around the
// board at random angles, and each one locks into place when it is dropped
// near its home at its home angle.

import {
  BOARD_H,
  BOARD_W,
  PHI,
  ROTATION_STEP,
  TILE_SIZE,
  centroidOf,
  rotateBy,
  getVertices,
  sameEdge,
  edgesOf,
  toTriangles,
  type Point,
  type Tile,
  type TileType
} from './rules';

// ---------------------------------------------------------------------
// Random numbers: seeded, so a puzzle can be rebuilt and tested
// ---------------------------------------------------------------------

// mulberry32: a small, fast seeded generator returning numbers in [0, 1)
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------------------------------------------------------
// The solved tiling
//
// Built by repeatedly subdividing ("deflating") Robinson half-tiles,
// starting from a sun of five kites. Each half-kite splits into two
// half-kites and a half-dart, and each half-dart into a half-kite and a
// half-dart, every piece shrinking by the golden ratio. Mirror-image halves
// that share their axis edge are then joined into whole kites and darts.
// The result is a correct Penrose tiling by construction. (Ported from
// Penrogo's penrose-board.ts.)
//
// Half-tiles are [type, apex, axisEnd, side]:
//   half-kite: apex = kite tip O (72°), axisEnd = C (144°), side = B or D
//   half-dart: apex = reflex vertex A' (216°), axisEnd = tip M, side = N or N'
// ---------------------------------------------------------------------

type HalfType = 'kite' | 'dart';
type Half = [HalfType, Point, Point, Point];

const lerp = (p: Point, q: Point, t: number): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

const deflate = (halves: Half[]): Half[] =>
  halves.flatMap(([type, apex, axisEnd, side]): Half[] => {
    if (type === 'kite') {
      const P = lerp(apex, axisEnd, 1 / PHI);
      const Q = lerp(side, apex, 1 / PHI);
      return [['kite', side, P, axisEnd], ['kite', side, P, Q], ['dart', Q, apex, P]];
    }
    const P = lerp(axisEnd, side, 1 / PHI);
    return [['kite', axisEnd, apex, P], ['dart', P, side, apex]];
  });

// Sun of five kites (ten half-kites) around the origin, tips at the center.
const sun = (radius: number): Half[] => {
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

const pointKey = (p: Point) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

// A whole tile as this game stores it: its type, centroid and the angle of
// its axis (vertex 0 to vertex 2), which is always a multiple of 36°.
export const tileFromVertices = (type: TileType, verts: Point[]): Tile => {
  const c = centroidOf(verts);
  const angle = (Math.atan2(verts[2].y - verts[0].y, verts[2].x - verts[0].x) * 180) / Math.PI;
  const rotation = ((Math.round(angle / ROTATION_STEP) * ROTATION_STEP) % 360 + 360) % 360;
  return { type, x: c.x, y: c.y, rotation };
};

// Joins mirror halves into whole tiles. Halves at the patch edge whose
// mirror was cut off are dropped.
const joinHalves = (halves: Half[]): Tile[] => {
  const byAxis = new Map<string, Half[]>();
  for (const h of halves) {
    const k = `${h[0]}|${pointKey(h[1])}|${pointKey(h[2])}`;
    const pair = byAxis.get(k);
    if (pair) pair.push(h);
    else byAxis.set(k, [h]);
  }

  const tiles: Tile[] = [];
  for (const pair of byAxis.values()) {
    if (pair.length !== 2) continue;
    const [[type, apex, axisEnd, s1], [, , , s2]] = pair;
    tiles.push(type === 'kite'
      ? tileFromVertices('kite', [apex, s1, axisEnd, s2])
      : tileFromVertices('dart', [axisEnd, s1, apex, s2]));
  }
  return tiles;
};

// A patch of the tiling around the origin, with long edges TILE_SIZE,
// covering a disc of radius about TILE_SIZE * PHI ** depth.
export const generatePatch = (depth: number): Tile[] => {
  let halves = sun(TILE_SIZE * PHI ** depth);
  for (let i = 0; i < depth; i++) halves = deflate(halves);
  return joinHalves(halves);
};

// ---------------------------------------------------------------------
// Choosing the puzzle
// ---------------------------------------------------------------------

export type PuzzleSize = 'small' | 'medium' | 'large';
export const PIECE_COUNTS: Record<PuzzleSize, number> = { small: 12, medium: 24, large: 40 };

// Where the solved puzzle sits: centered here, on the left of the board,
// leaving the right side and the margins for the loose pieces.
export const FRAME_CENTER: Point = { x: 270, y: 300 };

// Do two tiles share a full edge?
export const shareEdge = (s: Tile, t: Tile): boolean => {
  const te = edgesOf(t);
  return edgesOf(s).some(e => te.some(f => sameEdge(e, f)));
};

// `count` tiles of the patch forming one edge-connected group around
// `center`: starting from the tile nearest it, repeatedly add the
// neighboring tile nearest it.
export const choosePieces = (patch: readonly Tile[], center: Point, count: number): Tile[] => {
  const dist = (t: Tile) => Math.hypot(t.x - center.x, t.y - center.y);
  // Only tiles near the center can be chosen; keeps this fast
  const reach = TILE_SIZE * (2 + Math.sqrt(count));
  const pool = patch.filter(t => dist(t) <= reach).sort((s, t) => dist(s) - dist(t));
  if (pool.length === 0) return [];

  const chosen = [pool[0]];
  const rest = pool.slice(1);
  while (chosen.length < count) {
    const next = rest.findIndex(t => chosen.some(c => shareEdge(c, t)));
    if (next < 0) break;
    chosen.push(rest[next]);
    rest.splice(next, 1);
  }
  return chosen;
};

// The smallest box around some tiles.
export const boundsOf = (tiles: readonly Tile[]) => {
  const verts = tiles.flatMap(getVertices);
  const xs = verts.map(v => v.x), ys = verts.map(v => v.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// Turns a tile about the origin by `steps` 36° steps, then moves it.
const turnAndMove = (t: Tile, steps: number, dx: number, dy: number): Tile => {
  const a = (steps * ROTATION_STEP * Math.PI) / 180;
  return {
    type: t.type,
    x: t.x * Math.cos(a) - t.y * Math.sin(a) + dx,
    y: t.x * Math.sin(a) + t.y * Math.cos(a) + dy,
    rotation: (t.rotation + steps * ROTATION_STEP) % 360
  };
};

// The solved puzzle: `count` pieces from a random part of the tiling, at a
// random one of its ten orientations, centered on FRAME_CENTER.
export const solvedTiling = (count: number, random: () => number): Tile[] => {
  const patch = generatePatch(6);
  // A random spot away from the sun at the patch center, so puzzles differ
  const r = TILE_SIZE * 6 * Math.sqrt(random());
  const a = random() * 2 * Math.PI;
  const chosen = choosePieces(patch, { x: r * Math.cos(a), y: r * Math.sin(a) }, count);

  const steps = Math.floor(random() * 10);
  const turned = chosen.map(t => turnAndMove(t, steps, 0, 0));
  const box = boundsOf(turned);
  const dx = FRAME_CENTER.x - (box.x + box.w / 2);
  const dy = FRAME_CENTER.y - (box.y + box.h / 2);
  return turned.map(t => turnAndMove(t, 0, dx, dy));
};

// ---------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------

export interface Piece {
  id: number;
  // Where the piece belongs in the solved puzzle
  home: Tile;
  // Where it is now: its centroid and rotation
  x: number;
  y: number;
  rotation: number;
  locked: boolean;
  // Pieces snapped together share a group and move as one. A piece on its
  // own is a group of one, numbered with its id.
  group: number;
}

// The piece as a tile where it is now.
export const pieceTile = (p: Piece): Tile => ({ type: p.home.type, x: p.x, y: p.y, rotation: p.rotation });

// Spacing of the spots where loose pieces start, and how far a spot's
// center stays from the board edge and the solved puzzle's box. A piece
// reaches at most about 40 units from its centroid.
export const SCATTER_SPACING = 72;
const SCATTER_MARGIN = 42;

// Spots on the board for loose pieces: a grid over the whole board, minus
// the area around the solved puzzle.
export const scatterSpots = (frame: { x: number; y: number; w: number; h: number }): Point[] => {
  const spots: Point[] = [];
  for (let y = SCATTER_MARGIN; y <= BOARD_H - SCATTER_MARGIN; y += SCATTER_SPACING) {
    for (let x = SCATTER_MARGIN; x <= BOARD_W - SCATTER_MARGIN; x += SCATTER_SPACING) {
      const nearFrame =
        x > frame.x - SCATTER_MARGIN && x < frame.x + frame.w + SCATTER_MARGIN &&
        y > frame.y - SCATTER_MARGIN && y < frame.y + frame.h + SCATTER_MARGIN;
      if (!nearFrame) spots.push({ x, y });
    }
  }
  return spots;
};

// Breaks the solved puzzle up: every piece goes to a random free spot
// (spots are reused, slightly offset, if there are more pieces than spots)
// at a random angle, in random order.
export const scatterPieces = (homes: readonly Tile[], random: () => number): Piece[] => {
  const spots = scatterSpots(boundsOf(homes));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const pieces = homes.map((home, id) => {
    const spot = spots[id % spots.length];
    const nudge = id >= spots.length ? SCATTER_SPACING / 4 : 0;
    return {
      id,
      home,
      x: spot.x + nudge,
      y: spot.y + nudge,
      rotation: Math.floor(random() * 10) * ROTATION_STEP,
      locked: false,
      group: id
    };
  });
  // Shuffle the stacking order too
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return pieces;
};

// The seed named by a page address's query string (`?seed=123`), so a
// puzzle can be shared or replayed; null if there is none or it isn't a
// whole number from 0 to 2^31 - 1.
export const seedFromQuery = (search: string): number | null => {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n < 2 ** 31 ? n : null;
};

// A new puzzle of the given size.
export const newPuzzle = (size: PuzzleSize, seed: number): Piece[] => {
  const random = seededRandom(seed);
  return scatterPieces(solvedTiling(PIECE_COUNTS[size], random), random);
};

// ---------------------------------------------------------------------
// Moving pieces
// ---------------------------------------------------------------------

// Is p inside the triangle (edges included)?
const inTriangle = (p: Point, [a, b, c]: Point[]): boolean => {
  const side = (u: Point, v: Point) => (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x);
  const d1 = side(a, b), d2 = side(b, c), d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

export const pointInTile = (p: Point, t: Tile): boolean => toTriangles(getVertices(t)).some(tri => inTriangle(p, tri));

// Index of the loose piece under p that is drawn on top (pieces later in
// the list are drawn over earlier ones), or -1. Locked pieces can't be
// picked up.
export const pieceAt = (pieces: readonly Piece[], p: Point): number => {
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (!pieces[i].locked && pointInTile(p, pieceTile(pieces[i]))) return i;
  }
  return -1;
};

// How close (in canvas units, centroid to centroid) a piece at the right
// angle must be dropped to lock into its home, or to join a neighbor.
export const LOCK_RADIUS = 20;

// How far a piece is turned from its home angle, in degrees [0, 360).
export const turnOf = (p: Piece): number => ((p.rotation - p.home.rotation) % 360 + 360) % 360;

// q turned by `degrees` (clockwise on screen) about `pivot`.
const turnAbout = (q: Point, pivot: Point, degrees: number): Point => {
  const a = (degrees * Math.PI) / 180;
  const dx = q.x - pivot.x, dy = q.y - pivot.y;
  return { x: pivot.x + dx * Math.cos(a) - dy * Math.sin(a), y: pivot.y + dx * Math.sin(a) + dy * Math.cos(a) };
};

// A dropped piece: locked into its exact home if it is at its home angle
// and within LOCK_RADIUS of it, otherwise unchanged.
export const dropPiece = (piece: Piece): Piece => {
  const near = Math.hypot(piece.x - piece.home.x, piece.y - piece.home.y) <= LOCK_RADIUS;
  if (turnOf(piece) !== 0 || !near) return piece;
  return { ...piece, x: piece.home.x, y: piece.home.y, rotation: piece.home.rotation, locked: true };
};

// Where piece m goes to sit against piece n as it does in the solved
// puzzle: m's home seen from n's home, turned as n is turned.
export const placeBeside = (n: Piece, m: Piece): Point =>
  turnAbout({ x: n.x + m.home.x - n.home.x, y: n.y + m.home.y - n.home.y }, n, turnOf(n));

// Do the two pieces border each other in the solved puzzle?
export const neighbors = (m: Piece, n: Piece): boolean => shareEdge(m.home, n.home);

// Moves the group of piece i to the end of the list (keeping its pieces'
// order), so it is drawn on top.
export const bringToFront = (pieces: readonly Piece[], i: number): Piece[] => {
  const group = pieces[i].group;
  return [...pieces.filter(p => p.group !== group), ...pieces.filter(p => p.group === group)];
};

const groupOf = (pieces: readonly Piece[], id: number) => {
  const piece = pieces.find(p => p.id === id);
  return piece ? piece.group : -1;
};

// The group of piece `id` dragged by (dx, dy). The move is cut short so
// every piece's center stays on the board. Locked pieces don't move.
export const moveGroup = (pieces: readonly Piece[], id: number, dx: number, dy: number): Piece[] => {
  const group = groupOf(pieces, id);
  const members = pieces.filter(p => p.group === group && !p.locked);
  if (members.length === 0) return [...pieces];
  const cdx = Math.min(Math.max(dx, ...members.map(p => -p.x)), ...members.map(p => BOARD_W - p.x));
  const cdy = Math.min(Math.max(dy, ...members.map(p => -p.y)), ...members.map(p => BOARD_H - p.y));
  return pieces.map(p => (p.group === group && !p.locked ? { ...p, x: p.x + cdx, y: p.y + cdy } : p));
};

// The best neighbor for the group to join: a piece outside the group,
// bordering one of its pieces in the solved puzzle, turned the same way,
// with that piece within LOCK_RADIUS of where it would sit against it.
// Returns the move that puts it there, or null.
const nearestJoin = (pieces: readonly Piece[], group: number) => {
  let best: { dx: number; dy: number; dist: number; other: Piece } | null = null;
  for (const m of pieces.filter(p => p.group === group)) {
    for (const n of pieces) {
      if (n.group === group || turnOf(n) !== turnOf(m) || !neighbors(m, n)) continue;
      const at = placeBeside(n, m);
      const dist = Math.hypot(at.x - m.x, at.y - m.y);
      if (dist <= LOCK_RADIUS && (!best || dist < best.dist)) best = { dx: at.x - m.x, dy: at.y - m.y, dist, other: n };
    }
  }
  return best;
};

const lockGroup = (pieces: readonly Piece[], group: number): Piece[] =>
  pieces.map(p => (p.group === group ? { ...p, x: p.home.x, y: p.home.y, rotation: p.home.rotation, locked: true } : p));

// A group just dropped or turned: locks into place if it is at its home
// angle near its home (the whole group locks), and otherwise snaps against
// the nearest matching neighbor (see nearestJoin) and joins its group.
// Repeats until nothing more snaps, since a snap can bring another
// neighbor into reach. (Snapping against a locked piece needs no rule of
// its own: a locked piece is at home, so a group close enough to snap
// against it is close enough to its own home and locks in first.)
export const settleGroup = (pieces: readonly Piece[], id: number): Piece[] => {
  let current = [...pieces];
  for (let round = 0; round < current.length; round++) {
    const group = groupOf(current, id);
    const members = current.filter(p => p.group === group);
    if (members.length === 0 || members.some(p => p.locked)) return current;
    if (dropPiece(members[0]).locked) return lockGroup(current, group);

    const join = nearestJoin(current, group);
    if (!join) return current;
    const joined = Math.min(group, join.other.group);
    current = current.map(p => {
      if (p.group === group) return { ...p, x: p.x + join.dx, y: p.y + join.dy, group: joined };
      if (p.group === join.other.group) return { ...p, group: joined };
      return p;
    });
  }
  return current;
};

// The group of piece `id` turned `steps` 36° steps (positive = clockwise)
// about that piece's center, then settled as if dropped.
export const rotateGroup = (pieces: readonly Piece[], id: number, steps: number): Piece[] => {
  const pivot = pieces.find(p => p.id === id);
  if (!pivot || pivot.locked) return [...pieces];
  const turned = pieces.map(p => {
    if (p.group !== pivot.group) return p;
    const at = turnAbout(p, pivot, steps * ROTATION_STEP);
    return { ...p, x: at.x, y: at.y, rotation: rotateBy(p.rotation, steps) };
  });
  return settleGroup(turned, id);
};

export const progress = (pieces: readonly Piece[]) => ({
  placed: pieces.filter(p => p.locked).length,
  total: pieces.length
});

export const isSolved = (pieces: readonly Piece[]): boolean => pieces.length > 0 && pieces.every(p => p.locked);

// ---------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------

// Where the picture is drawn so it covers the solved puzzle's box: scaled
// to cover it, keeping its proportions, and centered (any overhang is cut
// off evenly on both sides).
export const coverRect = (imageW: number, imageH: number, box: { x: number; y: number; w: number; h: number }) => {
  const scale = Math.max(box.w / imageW, box.h / imageH);
  const w = imageW * scale, h = imageH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
};

// The canvas transform that carries a piece's part of the picture from its
// home to where the piece is now: translate to the piece, turn by the
// difference in angle, translate back from home.
export const pieceTransform = (p: Piece) => ({
  angle: (((p.rotation - p.home.rotation) % 360 + 360) % 360) * Math.PI / 180,
  to: { x: p.x, y: p.y },
  from: { x: p.home.x, y: p.home.y }
});

// Applies pieceTransform to a point (for tests and hit-testing).
export const transformPoint = (p: Piece, q: Point): Point => {
  const { angle, to, from } = pieceTransform(p);
  const dx = q.x - from.x, dy = q.y - from.y;
  return {
    x: to.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: to.y + dx * Math.sin(angle) + dy * Math.cos(angle)
  };
};
