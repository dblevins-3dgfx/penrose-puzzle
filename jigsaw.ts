// The jigsaw puzzle (spec section 9) as plain functions, with no React, so
// it can be unit-tested (jigsaw.test.ts). ui/Jigsaw.tsx only calls them.
//
// A puzzle is a patch of a real Penrose kite and dart tiling with a picture
// laid over it. Each tile is a piece; the pieces start scattered around the
// board at random angles, and each one locks into place when it is dropped
// near its home at its home angle.

import {
  DEFAULT_BOARD,
  PHI,
  ROTATION_STEP,
  TILE_SIZE,
  centroidOf,
  rotateBy,
  getVertices,
  sameEdge,
  samePoint,
  edgesOf,
  toTriangles,
  type BoardSize,
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

// Responsive viewport layout for the jigsaw: since unplaced pieces live in a
// separate scrollable tray, the solved puzzle can expand to fill almost the
// entire board canvas, centered in both landscape and portrait orientations.
export interface ViewportLayout {
  board: BoardSize;
  // CSS pixels per world unit
  scale: number;
  frameCenter: Point;
}

const FRAME_PAD = 20;
const MIN_SCALE = 0.45;
const MAX_SCALE = 3.0;

export const computeViewportLayout = (
  box: { w: number; h: number },
  _count: number,
  viewport: BoardSize
): ViewportLayout => {
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const fitScale = Math.min((vw * 0.88) / (box.w + FRAME_PAD * 2), (vh * 0.88) / (box.h + FRAME_PAD * 2));
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitScale));
  const board: BoardSize = { width: vw / scale, height: vh / scale };
  const frameCenter: Point = { x: board.width / 2, y: board.height / 2 };
  return { board, scale, frameCenter };
};

// The solved puzzle: `count` pieces from a random part of the tiling, at a
// random one of its ten orientations, centered on `frameCenter`.
export const solvedTiling = (count: number, random: () => number, frameCenter: Point = FRAME_CENTER): Tile[] => {
  const patch = generatePatch(6);
  // A random spot away from the sun at the patch center, so puzzles differ
  const r = TILE_SIZE * 6 * Math.sqrt(random());
  const a = random() * 2 * Math.PI;
  const chosen = choosePieces(patch, { x: r * Math.cos(a), y: r * Math.sin(a) }, count);

  const steps = Math.floor(random() * 10);
  const turned = chosen.map(t => turnAndMove(t, steps, 0, 0));
  const box = boundsOf(turned);
  const dx = frameCenter.x - (box.x + box.w / 2);
  const dy = frameCenter.y - (box.y + box.h / 2);
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
  // True while the piece sits in the scrollable piece tray instead of on the board.
  inTray: boolean;
  // Pieces snapped together share a group and move as one. A piece on its
  // own is a group of one, numbered with its id.
  group: number;
  // Which of the piece's edges (by index: edge i runs from corner i to
  // corner i + 1) lie on the outer border of the solved puzzle. Empty for
  // an interior piece.
  border: number[];
}

// The piece as a tile where it is now.
export const pieceTile = (p: Piece): Tile => ({ type: p.home.type, x: p.x, y: p.y, rotation: p.rotation });

// For each tile, the indices of its edges that no other tile shares: the
// outer border of the solved puzzle (and of any hole in it).
export const borderEdges = (homes: readonly Tile[]): number[][] => {
  const edges = homes.map(edgesOf);
  return edges.map((own, i) =>
    own.flatMap((e, k) => (edges.some((other, j) => j !== i && other.some(f => sameEdge(e, f))) ? [] : [k]))
  );
};

export const isEdgePiece = (p: Piece): boolean => p.border.length > 0;

// Spacing of the spots where loose pieces start, and how far a spot's
// center stays from the board edge and the solved puzzle's box. A piece
// reaches at most about 40 units from its centroid.
export const SCATTER_SPACING = 72;
const SCATTER_MARGIN = 42;

// Spots on the board for loose pieces: a grid over the whole board, minus
// the area around the solved puzzle. Falls back to the full grid (or board
// center) if the board is too tight to leave clear spots outside the frame.
export const scatterSpots = (
  frame: { x: number; y: number; w: number; h: number },
  board: BoardSize = DEFAULT_BOARD
): Point[] => {
  const spots: Point[] = [];
  const allSpots: Point[] = [];
  for (let y = SCATTER_MARGIN; y <= board.height - SCATTER_MARGIN; y += SCATTER_SPACING) {
    for (let x = SCATTER_MARGIN; x <= board.width - SCATTER_MARGIN; x += SCATTER_SPACING) {
      allSpots.push({ x, y });
      const nearFrame =
        x > frame.x - SCATTER_MARGIN && x < frame.x + frame.w + SCATTER_MARGIN &&
        y > frame.y - SCATTER_MARGIN && y < frame.y + frame.h + SCATTER_MARGIN;
      if (!nearFrame) spots.push({ x, y });
    }
  }
  if (spots.length > 0) return spots;
  return allSpots.length > 0 ? allSpots : [{ x: board.width / 2, y: board.height / 2 }];
};

// Breaks the solved puzzle up: every piece goes to a random free spot
// (spots are reused, slightly offset, if there are more pieces than spots)
// at a random angle, in random order.
export const scatterPieces = (
  homes: readonly Tile[],
  random: () => number,
  board: BoardSize = DEFAULT_BOARD
): Piece[] => {
  const borders = borderEdges(homes);
  const spots = scatterSpots(boundsOf(homes), board);
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
      x: Math.min(board.width - SCATTER_MARGIN / 2, spot.x + nudge),
      y: Math.min(board.height - SCATTER_MARGIN / 2, spot.y + nudge),
      rotation: Math.floor(random() * 10) * ROTATION_STEP,
      locked: false,
      inTray: false,
      group: id,
      border: borders[id]
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

// A new puzzle of the given size on the default 800 x 600 board (pieces loose on board).
export const newPuzzle = (size: PuzzleSize, seed: number): Piece[] => {
  const random = seededRandom(seed);
  return scatterPieces(solvedTiling(PIECE_COUNTS[size], random), random);
};

// A new puzzle sized and centered for the given CSS pixel viewport, with all
// pieces starting in the scrollable piece tray in shuffled order at random angles.
export const newPuzzleForViewport = (
  size: PuzzleSize,
  seed: number,
  viewport: BoardSize
): { pieces: Piece[]; layout: ViewportLayout } => {
  const random = seededRandom(seed);
  const rawHomes = solvedTiling(PIECE_COUNTS[size], random);
  const box = boundsOf(rawHomes);
  const layout = computeViewportLayout(box, rawHomes.length, viewport);
  const dx = layout.frameCenter.x - (box.x + box.w / 2);
  const dy = layout.frameCenter.y - (box.y + box.h / 2);
  const homes = rawHomes.map(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
  const borders = borderEdges(homes);
  const pieces: Piece[] = homes.map((home, id) => ({
    id,
    home,
    x: layout.frameCenter.x,
    y: layout.frameCenter.y,
    rotation: Math.floor(random() * 10) * ROTATION_STEP,
    locked: false,
    inTray: true,
    group: id,
    border: borders[id]
  }));
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return { pieces, layout };
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

// Index of the loose on-board piece under p that is drawn on top (pieces later
// in the list are drawn over earlier ones), or -1. Locked and tray pieces can't
// be picked up on the board.
export const pieceAt = (pieces: readonly Piece[], p: Point): number => {
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (!pieces[i].locked && !pieces[i].inTray && pointInTile(p, pieceTile(pieces[i]))) return i;
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
// every piece's center stays on the board. Locked and tray pieces don't move.
export const moveGroup = (
  pieces: readonly Piece[],
  id: number,
  dx: number,
  dy: number,
  board: BoardSize = DEFAULT_BOARD
): Piece[] => {
  const group = groupOf(pieces, id);
  const members = pieces.filter(p => p.group === group && !p.locked && !p.inTray);
  if (members.length === 0) return [...pieces];
  const cdx = Math.min(Math.max(dx, ...members.map(p => -p.x)), ...members.map(p => board.width - p.x));
  const cdy = Math.min(Math.max(dy, ...members.map(p => -p.y)), ...members.map(p => board.height - p.y));
  return pieces.map(p => (p.group === group && !p.locked && !p.inTray ? { ...p, x: p.x + cdx, y: p.y + cdy } : p));
};

// Clamps each loose on-board group so every member's center stays inside
// `board` (with a grab margin), moving snapped groups rigidly. Locked and tray
// pieces are untouched.
export const clampLoosePieces = (pieces: readonly Piece[], board: BoardSize): Piece[] => {
  const mx = Math.min(24, board.width / 4);
  const my = Math.min(24, board.height / 4);
  const shifts = new Map<number, Point>();
  const looseGroups = new Set(pieces.filter(p => !p.locked && !p.inTray).map(p => p.group));

  const clampAxis = (min: number, max: number, lo: number, hi: number): number => {
    if (max - min > hi - lo) return (lo + hi) / 2 - (min + max) / 2;
    if (min < lo) return lo - min;
    if (max > hi) return hi - max;
    return 0;
  };

  for (const g of looseGroups) {
    const members = pieces.filter(p => !p.locked && !p.inTray && p.group === g);
    const xs = members.map(p => p.x), ys = members.map(p => p.y);
    const dx = clampAxis(Math.min(...xs), Math.max(...xs), mx, board.width - mx);
    const dy = clampAxis(Math.min(...ys), Math.max(...ys), my, board.height - my);
    if (dx !== 0 || dy !== 0) shifts.set(g, { x: dx, y: dy });
  }
  if (shifts.size === 0) return [...pieces];
  return pieces.map(p => {
    if (p.locked || p.inTray) return p;
    const s = shifts.get(p.group);
    return s ? { ...p, x: p.x + s.x, y: p.y + s.y } : p;
  });
};

// Reflows an in-progress puzzle when the viewport resizes: re-fits the frame,
// shifts homes and on-board pieces together, and clamps loose pieces inside
// the new board.
export const repositionForViewport = (
  pieces: readonly Piece[],
  viewport: BoardSize
): { pieces: Piece[]; layout: ViewportLayout } => {
  if (pieces.length === 0) {
    return { pieces: [], layout: { board: viewport, scale: 1, frameCenter: { x: viewport.width / 2, y: viewport.height / 2 } } };
  }
  const box = boundsOf(pieces.map(p => p.home));
  const layout = computeViewportLayout(box, pieces.length, viewport);
  const dx = layout.frameCenter.x - (box.x + box.w / 2);
  const dy = layout.frameCenter.y - (box.y + box.h / 2);
  const shifted = pieces.map(p => ({
    ...p,
    home: { ...p.home, x: p.home.x + dx, y: p.home.y + dy },
    x: p.inTray ? p.x : p.x + dx,
    y: p.inTray ? p.y : p.y + dy
  }));
  return { pieces: clampLoosePieces(shifted, layout.board), layout };
};

// ---------------------------------------------------------------------
// Camera (board zoom and pan)
// ---------------------------------------------------------------------

export interface Camera {
  // Zoom multiplier on top of layout.scale (1 = fitted to screen)
  zoom: number;
  // Pan offset in CSS pixels: where world (0, 0) lands on the canvas
  panX: number;
  panY: number;
}

export const DEFAULT_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 };
export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;

export const screenToWorld = (screen: Point, layoutScale: number, camera: Camera): Point => {
  const s = layoutScale * camera.zoom;
  return { x: (screen.x - camera.panX) / s, y: (screen.y - camera.panY) / s };
};

export const worldToScreen = (world: Point, layoutScale: number, camera: Camera): Point => {
  const s = layoutScale * camera.zoom;
  return { x: world.x * s + camera.panX, y: world.y * s + camera.panY };
};

const clampPanAxis = (pan: number, vp: number, zoom: number): number => {
  const rendered = vp * zoom;
  if (rendered <= vp) return (vp - rendered) / 2;
  const pad = Math.min(80, vp * 0.15);
  return Math.max(vp - rendered - pad, Math.min(pad, pan));
};

// Keeps zoom within [MIN_ZOOM, MAX_ZOOM] and prevents panning the board
// completely off-screen. At zoom <= 1 the board stays centered cleanly.
export const clampCamera = (camera: Camera, viewport: BoardSize): Camera => {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom));
  return {
    zoom,
    panX: clampPanAxis(camera.panX, Math.max(1, viewport.width), zoom),
    panY: clampPanAxis(camera.panY, Math.max(1, viewport.height), zoom)
  };
};

export const panCamera = (camera: Camera, dx: number, dy: number, viewport: BoardSize): Camera =>
  clampCamera({ zoom: camera.zoom, panX: camera.panX + dx, panY: camera.panY + dy }, viewport);

// Zooms by `factor` while keeping the world point under `focus` (CSS pixels)
// stationary, then clamps the resulting camera to the viewport.
export const zoomCameraAt = (camera: Camera, factor: number, focus: Point, viewport: BoardSize): Camera => {
  const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor));
  const ratio = nextZoom / camera.zoom;
  return clampCamera(
    {
      zoom: nextZoom,
      panX: focus.x - (focus.x - camera.panX) * ratio,
      panY: focus.y - (focus.y - camera.panY) * ratio
    },
    viewport
  );
};

// True when the camera is effectively already at DEFAULT_CAMERA (Fit).
export const isCameraAtFit = (camera: Camera): boolean =>
  Math.abs(camera.zoom - DEFAULT_CAMERA.zoom) < 1e-3 &&
  Math.abs(camera.panX - DEFAULT_CAMERA.panX) < 0.5 &&
  Math.abs(camera.panY - DEFAULT_CAMERA.panY) < 0.5;

// Smoothly eases from one camera pose to another with ease-out cubic timing.
// Interpolating zoom, panX and panY by the same factor moves every world point
// along a straight line on screen.
export const easeCamera = (from: Camera, to: Camera, t: number): Camera => {
  if (t <= 0) return { ...from };
  if (t >= 1) return { ...to };
  const e = 1 - (1 - t) ** 3;
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * e,
    panX: from.panX + (to.panX - from.panX) * e,
    panY: from.panY + (to.panY - from.panY) * e
  };
};

// ---------------------------------------------------------------------
// Piece tray
// ---------------------------------------------------------------------

export type TrayFilter = 'all' | 'edges';

export const trayPieces = (pieces: readonly Piece[], filter: TrayFilter = 'all'): Piece[] =>
  pieces.filter(p => p.inTray && !p.locked && (filter === 'all' || isEdgePiece(p)));

// Moves a piece out of the tray onto the board at `at` (clamped inside `board`),
// placing it at the top of the board stacking order.
export const takeFromTray = (
  pieces: readonly Piece[],
  id: number,
  at: Point,
  board: BoardSize = DEFAULT_BOARD
): Piece[] => {
  const i = pieces.findIndex(p => p.id === id);
  if (i < 0 || pieces[i].locked || !pieces[i].inTray) return [...pieces];
  const x = Math.max(0, Math.min(board.width, at.x));
  const y = Math.max(0, Math.min(board.height, at.y));
  const taken: Piece = { ...pieces[i], inTray: false, x, y };
  return [...pieces.filter((_, idx) => idx !== i), taken];
};

// Where a tapped tray piece lands on the board: staggered around `anchor`
// (default: board center, or the visible center of the zoomed camera) so
// tapping several pieces in a row fans them out cleanly inside the board.
export const popSpotOnBoard = (
  pieces: readonly Piece[],
  board: BoardSize,
  anchor: Point = { x: board.width / 2, y: board.height / 2 }
): Point => {
  const onBoardLoose = pieces.filter(p => !p.locked && !p.inTray).length;
  const angle = (onBoardLoose * 137.5 * Math.PI) / 180;
  const radius = onBoardLoose === 0 ? 0 : Math.min(48, 18 + (onBoardLoose % 5) * 8);
  const mx = Math.min(36, board.width / 4);
  const my = Math.min(36, board.height / 4);
  return {
    x: Math.max(mx, Math.min(board.width - mx, anchor.x + radius * Math.cos(angle))),
    y: Math.max(my, Math.min(board.height - my, anchor.y + radius * Math.sin(angle)))
  };
};

// Only a single ungrouped loose on-board piece can be returned to the tray
// (multi-piece groups stay on the board so they aren't accidentally broken up).
export const canReturnToTray = (pieces: readonly Piece[], id: number): boolean => {
  const piece = pieces.find(p => p.id === id);
  if (!piece || piece.locked || piece.inTray) return false;
  return pieces.filter(p => p.group === piece.group).length === 1;
};

// Returns a single ungrouped loose piece to the top of the tray.
export const returnToTray = (pieces: readonly Piece[], id: number): Piece[] => {
  if (!canReturnToTray(pieces, id)) return [...pieces];
  const piece = pieces.find(p => p.id === id)!;
  return [{ ...piece, inTray: true }, ...pieces.filter(p => p.id !== id)];
};

// The best neighbor for the group to join: a piece outside the group,
// bordering one of its pieces in the solved puzzle, turned the same way,
// with that piece within LOCK_RADIUS of where it would sit against it.
// Returns the move that puts it there, or null.
const nearestJoin = (pieces: readonly Piece[], group: number) => {
  let best: { dx: number; dy: number; dist: number; other: Piece } | null = null;
  for (const m of pieces.filter(p => p.group === group && !p.inTray)) {
    for (const n of pieces) {
      if (n.inTray || n.group === group || turnOf(n) !== turnOf(m) || !neighbors(m, n)) continue;
      const at = placeBeside(n, m);
      const dist = Math.hypot(at.x - m.x, at.y - m.y);
      if (dist <= LOCK_RADIUS && (!best || dist < best.dist)) best = { dx: at.x - m.x, dy: at.y - m.y, dist, other: n };
    }
  }
  return best;
};

const lockGroup = (pieces: readonly Piece[], group: number): Piece[] =>
  pieces.map(p => (p.group === group ? { ...p, x: p.home.x, y: p.home.y, rotation: p.home.rotation, locked: true, inTray: false } : p));

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
    const members = current.filter(p => p.group === group && !p.inTray);
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

// Maximum CSS-pixel pointer travel for a press-and-release on a loose piece
// to count as a tap rather than a drag.
export const TAP_MAX_MOVE = 6;

// True if `pieceId` is a loose on-board piece belonging to the same group as
// `selectedId` (so tapping any piece in an already-selected group rotates it).
export const isGroupSelected = (
  pieces: readonly Piece[],
  selectedId: number | null,
  pieceId: number
): boolean => {
  if (selectedId === null) return false;
  const sel = pieces.find(p => p.id === selectedId);
  const target = pieces.find(p => p.id === pieceId);
  if (!sel || !target || sel.locked || sel.inTray || target.locked || target.inTray) return false;
  return sel.group === target.group;
};

// First tap on a loose piece selects it; subsequent taps on an already-selected
// group (with pointer travel within TAP_MAX_MOVE) rotate it 36°.
export const shouldTapRotate = (wasSelected: boolean, moveDistPx: number): boolean =>
  wasSelected && moveDistPx <= TAP_MAX_MOVE;

// The group of piece `id` turned `steps` 36° steps (positive = clockwise)
// about that piece's center, then settled as if dropped.
export const rotateGroup = (pieces: readonly Piece[], id: number, steps: number): Piece[] => {
  const pivot = pieces.find(p => p.id === id);
  if (!pivot || pivot.locked || pivot.inTray) return [...pieces];
  const turned = pieces.map(p => {
    if (p.group !== pivot.group) return p;
    const at = turnAbout(p, pivot, steps * ROTATION_STEP);
    return { ...p, x: at.x, y: at.y, rotation: rotateBy(p.rotation, steps) };
  });
  return settleGroup(turned, id);
};

// The pieces in the layers they are drawn in, bottom first: all locked
// pieces together, then each loose on-board group, ordered by where its topmost
// piece is in the stacking order. Pieces still in the tray are omitted.
export const drawLayers = (pieces: readonly Piece[]): Piece[][] => {
  const locked = pieces.filter(p => p.locked);
  const loose = pieces.filter(p => !p.locked && !p.inTray);
  const top = new Map<number, number>();
  loose.forEach((p, i) => top.set(p.group, i));
  const groups = [...top.keys()].sort((g, h) => (top.get(g) ?? 0) - (top.get(h) ?? 0));
  const layers = groups.map(g => loose.filter(p => p.group === g));
  return locked.length ? [locked, ...layers] : layers;
};

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

export type PictureStyle = 'subdivided' | 'matching' | 'independent' | 'sunset';
export const PICTURE_STYLES: readonly PictureStyle[] = ['subdivided', 'matching', 'independent', 'sunset'];

export interface JigsawSettings {
  // The whole picture shown faintly inside the outline, like a puzzle box
  showPicture: boolean;
  // Edges drawn around each piece and each tile of the outline
  showOutlines: boolean;
  // Which built-in picture is drawn on the puzzle
  picture: PictureStyle;
  // Piece count preset for new puzzles
  size: PuzzleSize;
}

export const DEFAULT_SETTINGS: JigsawSettings = {
  showPicture: false,
  showOutlines: true,
  picture: 'subdivided',
  size: 'medium'
};

// Where the settings are kept in the browser's local storage.
export const SETTINGS_KEY = 'penrose-puzzle.jigsaw-settings';

export const serializeSettings = (settings: JigsawSettings): string => JSON.stringify(settings);

const isPictureStyle = (value: unknown): value is PictureStyle =>
  typeof value === 'string' && (PICTURE_STYLES as readonly string[]).includes(value);

const isPuzzleSize = (value: unknown): value is PuzzleSize =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PIECE_COUNTS, value);

// Settings read back from storage. Anything missing, unreadable or of the
// wrong type falls back to its default, field by field, and unknown fields
// are dropped, so an old or damaged saved value never breaks the page.
export const parseSettings = (raw: string | null): JigsawSettings => {
  let saved: unknown = null;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  const fields = saved !== null && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const flag = (key: 'showPicture' | 'showOutlines') =>
    typeof fields[key] === 'boolean' ? (fields[key] as boolean) : DEFAULT_SETTINGS[key];
  const picture = isPictureStyle(fields.picture) ? fields.picture : DEFAULT_SETTINGS.picture;
  const size = isPuzzleSize(fields.size) ? fields.size : DEFAULT_SETTINGS.size;
  return { showPicture: flag('showPicture'), showOutlines: flag('showOutlines'), picture, size };
};

export const progress = (pieces: readonly Piece[]) => ({
  placed: pieces.filter(p => p.locked).length,
  total: pieces.length
});

export const isSolved = (pieces: readonly Piece[]): boolean => pieces.length > 0 && pieces.every(p => p.locked);

// True once the puzzle has at least one edge piece and every edge piece is locked.
export const isBorderComplete = (pieces: readonly Piece[]): boolean => {
  const edges = pieces.filter(isEdgePiece);
  return edges.length > 0 && edges.every(p => p.locked);
};

export interface JoinedSeam {
  // One of the two newly merged loose pieces, and its shared neighbor
  pieceId: number;
  partnerId: number;
  // Edge index (0..3) on `pieceId` running from corner k to corner (k + 1) % 4
  edgeIndex: number;
}

export interface CelebrationEvents {
  // Piece IDs that transitioned from unlocked to locked on this update
  newlyLockedIds: number[];
  // Shared edges newly formed by loose pieces/groups snapping together
  joinedSeams: JoinedSeam[];
  // True on the exact update that completes the outer border (suppressed if
  // that same update also solves the entire puzzle, so the solve finale wins)
  borderCompleted: boolean;
  // True on the exact update that solves the entire puzzle
  puzzleSolved: boolean;
}

const NO_CELEBRATIONS: CelebrationEvents = {
  newlyLockedIds: [],
  joinedSeams: [],
  borderCompleted: false,
  puzzleSolved: false
};

const sharedEdgeIndex = (a: Piece, b: Piece): number => {
  const eb = edgesOf(pieceTile(b));
  return edgesOf(pieceTile(a)).findIndex(e => eb.some(f => sameEdge(e, f)));
};

const findJoinedSeams = (prevById: ReadonlyMap<number, Piece>, next: readonly Piece[]): JoinedSeam[] => {
  const byGroup = new Map<number, Piece[]>();
  for (const p of next) {
    if (p.locked || p.inTray) continue;
    const list = byGroup.get(p.group);
    if (list) list.push(p);
    else byGroup.set(p.group, [p]);
  }

  const seams: JoinedSeam[] = [];
  for (const members of byGroup.values()) {
    if (members.length < 2) continue;
    for (let i = 0; i < members.length; i++) {
      const a = members[i];
      const prevGroupA = prevById.get(a.id)!.group;
      for (let j = i + 1; j < members.length; j++) {
        const b = members[j];
        if (prevGroupA === prevById.get(b.id)!.group) continue;
        const edgeIndex = sharedEdgeIndex(a, b);
        if (edgeIndex >= 0) seams.push({ pieceId: a.id, partnerId: b.id, edgeIndex });
      }
    }
  }
  return seams;
};

// Detects celebratory milestones between two states of the same puzzle.
// Returns no events if the puzzle was reset or replaced.
export const detectCelebrations = (prev: readonly Piece[], next: readonly Piece[]): CelebrationEvents => {
  if (prev.length === 0 || prev.length !== next.length) return NO_CELEBRATIONS;
  const prevById = new Map<number, Piece>();
  for (const p of prev) prevById.set(p.id, p);

  const newlyLockedIds: number[] = [];
  for (const p of next) {
    const before = prevById.get(p.id);
    if (!before || (before.locked && !p.locked)) return NO_CELEBRATIONS;
    if (!before.locked && p.locked) newlyLockedIds.push(p.id);
  }
  const joinedSeams = findJoinedSeams(prevById, next);
  if (newlyLockedIds.length === 0 && joinedSeams.length === 0) return NO_CELEBRATIONS;

  const puzzleSolved = !isSolved(prev) && isSolved(next);
  const borderCompleted = !puzzleSolved && !isBorderComplete(prev) && isBorderComplete(next);
  return { newlyLockedIds, joinedSeams, borderCompleted, puzzleSolved };
};

// Traces the solved puzzle's outer border (and any hole borders) into ordered
// closed vertex loops so visual effects can animate smoothly along the edge.
export const orderedBorderLoops = (pieces: readonly Piece[]): Point[][] => {
  interface Seg { a: Point; b: Point; used: boolean }
  const segments: Seg[] = [];
  for (const p of pieces) {
    if (p.border.length === 0) continue;
    const v = getVertices(p.home);
    for (const k of p.border) segments.push({ a: v[k], b: v[(k + 1) % 4], used: false });
  }

  const loops: Point[][] = [];
  for (const start of segments) {
    if (start.used) continue;
    start.used = true;
    const loop: Point[] = [start.a, start.b];
    let cur = start.b;
    while (!samePoint(cur, start.a)) {
      const next = segments.find(s => !s.used && (samePoint(s.a, cur) || samePoint(s.b, cur)));
      if (!next) break;
      next.used = true;
      cur = samePoint(next.a, cur) ? next.b : next.a;
      if (!samePoint(cur, start.a)) loop.push(cur);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
};

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
