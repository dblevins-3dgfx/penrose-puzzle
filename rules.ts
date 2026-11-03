// The rules of Penrose Puzzle as plain functions, with no React, so they
// can be unit-tested (rules.test.ts). penrose-puzzle.tsx only calls them.
// Section numbers refer to penrose-puzzle-spec.md.

export type TileType = 'kite' | 'dart';
export type VertexColor = 'black' | 'white';
export type EdgeLength = 'long' | 'short';

export interface Point {
  x: number;
  y: number;
}

// A tile as placed: its type, the position of its centroid, and its
// rotation in degrees (a multiple of 36).
export interface Tile {
  type: TileType;
  x: number;
  y: number;
  rotation: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ---------------------------------------------------------------------
// Section 3: Tile geometry
// ---------------------------------------------------------------------

export const PHI = (1 + Math.sqrt(5)) / 2;
export const TILE_SIZE = 60;

// Two vertices closer than this (in each axis) are the same point.
export const VERTEX_EPS = 4;

// Edge length labels walking the perimeter from vertex i to vertex i+1.
// Both kite and dart share this long/short/short/long pattern.
export const EDGE_LENGTHS: readonly EdgeLength[] = ['long', 'short', 'short', 'long'];

// Penrose's matching rule (vertex 2-coloring). Colors follow vertex order
// [O,B,C,D] for the kite and [M,N,A',N'] for the dart:
// Kite: axis vertices (O at 72°, C at 144°) = black; off-axis (B,D) = white.
// Dart: axis vertices (M at 72°, A' at 216°) = white; off-axis (N,N') = black.
export const KITE_VERTEX_COLORS: readonly VertexColor[] = ['black', 'white', 'black', 'white'];
export const DART_VERTEX_COLORS: readonly VertexColor[] = ['white', 'black', 'white', 'black'];

export const normalize = (dx: number, dy: number): Point => {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
};

export const samePoint = (p: Point, q: Point): boolean =>
  Math.abs(p.x - q.x) < VERTEX_EPS && Math.abs(p.y - q.y) < VERTEX_EPS;

export const centroidOf = (verts: readonly Point[]): Point => ({
  x: verts.reduce((s, v) => s + v.x, 0) / verts.length,
  y: verts.reduce((s, v) => s + v.y, 0) / verts.length
});

// Both tiles start at vertex 0 at the origin with the symmetry axis along
// the rotation angle; the third vertex is at distance L (kite) or L/phi
// (dart) along that axis. The result is shifted so the centroid sits at
// (x, y), which keeps the tile centered under the cursor.
export const getVertices = (tile: Tile): Point[] => {
  const r = tile.rotation * Math.PI / 180;
  const long = TILE_SIZE;
  const deg36 = 36 * Math.PI / 180;
  const axis = tile.type === 'kite' ? long : long / PHI;

  const local = [
    { x: 0, y: 0 },
    { x: long * Math.cos(r + deg36), y: long * Math.sin(r + deg36) },
    { x: axis * Math.cos(r), y: axis * Math.sin(r) },
    { x: long * Math.cos(r - deg36), y: long * Math.sin(r - deg36) }
  ];

  const c = centroidOf(local);
  return local.map(v => ({ x: tile.x + v.x - c.x, y: tile.y + v.y - c.y }));
};

export const getVertexColors = (tile: Pick<Tile, 'type'>): readonly VertexColor[] =>
  tile.type === 'kite' ? KITE_VERTEX_COLORS : DART_VERTEX_COLORS;

// Both the kite and the dart split cleanly into two triangles along the
// diagonal from vertex 0 to vertex 2 (their axis of symmetry), which also
// handles the dart's concave notch.
export const toTriangles = (v: readonly Point[]): Point[][] => [[v[0], v[1], v[2]], [v[0], v[2], v[3]]];

// ---------------------------------------------------------------------
// Section 4: Matching rules
// ---------------------------------------------------------------------

// Playfield size (matches the canvas). Every tile vertex must stay inside it.
export const BOARD_W = 800;
export const BOARD_H = 600;

// Rule 4: true if any vertex lies outside the playfield (0.5 px tolerance).
export const isOutsidePlayfield = (verts: readonly Point[]): boolean => {
  const EDGE_TOL = 0.5;
  return verts.some(v =>
    v.x < -EDGE_TOL || v.x > BOARD_W + EDGE_TOL ||
    v.y < -EDGE_TOL || v.y > BOARD_H + EDGE_TOL
  );
};

// Rule 2: does the candidate touch the structure at a vertex at all, and
// does every coincident vertex agree in Penrose color?
export const checkVertexMatching = (candidate: Tile, allTiles: readonly Tile[]) => {
  const cVerts = getVertices(candidate);
  const cColors = getVertexColors(candidate);
  let touches = false;
  let colorsMatch = true;

  for (const tile of allTiles) {
    const tVerts = getVertices(tile);
    const tColors = getVertexColors(tile);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (samePoint(cVerts[i], tVerts[j])) {
          touches = true;
          if (cColors[i] !== tColors[j]) colorsMatch = false;
        }
      }
    }
  }
  return { touches, colorsMatch };
};

// True if point p lies on the interior of segment a-b (not at an endpoint).
export const pointOnEdgeInterior = (p: Point, a: Point, b: Point): boolean => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  if (t <= 0 || t >= 1) return false;
  const px = a.x + t * abx, py = a.y + t * aby;
  if (Math.hypot(p.x - px, p.y - py) > VERTEX_EPS) return false;
  return !samePoint(p, a) && !samePoint(p, b);
};

// Rule 1: the candidate must share at least one full edge with an existing
// tile, and no corner may land in the middle of another tile's edge (a
// T-junction), in either direction.
export const checkEdgeContact = (candidate: Tile, allTiles: readonly Tile[]) => {
  const cv = getVertices(candidate);
  let sharesEdge = false;
  let tJunction = false;

  for (const tile of allTiles) {
    const tv = getVertices(tile);

    for (let a = 0; a < 4; a++) {
      const a1 = cv[a], a2 = cv[(a + 1) % 4];
      for (let b = 0; b < 4; b++) {
        const b1 = tv[b], b2 = tv[(b + 1) % 4];
        if ((samePoint(a1, b1) && samePoint(a2, b2)) ||
            (samePoint(a1, b2) && samePoint(a2, b1))) {
          sharesEdge = true;
        }
      }
    }

    for (const p of cv) {
      for (let b = 0; b < 4; b++) {
        if (pointOnEdgeInterior(p, tv[b], tv[(b + 1) % 4])) tJunction = true;
      }
    }
    for (const p of tv) {
      for (let a = 0; a < 4; a++) {
        if (pointOnEdgeInterior(p, cv[a], cv[(a + 1) % 4])) tJunction = true;
      }
    }
  }
  return { sharesEdge, tJunction };
};

// Separating-axis test for two triangles. Shapes that merely touch (or
// overlap by less than `tol` pixels) are not overlapping, so tiles sharing
// an edge or vertex are fine.
export const trianglesOverlap = (t1: readonly Point[], t2: readonly Point[], tol: number): boolean => {
  for (const tri of [t1, t2]) {
    for (let i = 0; i < 3; i++) {
      const p = tri[i], q = tri[(i + 1) % 3];
      const n = normalize(-(q.y - p.y), q.x - p.x);
      let min1 = Infinity, max1 = -Infinity, min2 = Infinity, max2 = -Infinity;
      for (const v of t1) {
        const d = v.x * n.x + v.y * n.y;
        min1 = Math.min(min1, d); max1 = Math.max(max1, d);
      }
      for (const v of t2) {
        const d = v.x * n.x + v.y * n.y;
        min2 = Math.min(min2, d); max2 = Math.max(max2, d);
      }
      if (max1 <= min2 + tol || max2 <= min1 + tol) return false;
    }
  }
  return true;
};

// Rule 3: do two tile polygons overlap (1.5 px tolerance)?
export const tilesOverlap = (vertsA: readonly Point[], vertsB: readonly Point[]): boolean => {
  for (const ta of toTriangles(vertsA)) {
    for (const tb of toTriangles(vertsB)) {
      if (trianglesOverlap(ta, tb, 1.5)) return true;
    }
  }
  return false;
};

// All four rules. The first tile only has to be inside the playfield.
// `ignoreBounds` skips only the playfield test; it lets the preview show a
// snapped position that is blocked solely for being out of bounds.
export const isLegalPlacement = (allTiles: readonly Tile[], candidate: Tile, ignoreBounds = false): boolean => {
  const candVerts = getVertices(candidate);

  if (!ignoreBounds && isOutsidePlayfield(candVerts)) return false;

  if (allTiles.length === 0) return true;

  for (const tile of allTiles) {
    if (tilesOverlap(candVerts, getVertices(tile))) return false;
  }

  const { touches, colorsMatch } = checkVertexMatching(candidate, allTiles);
  if (!touches || !colorsMatch) return false;

  const { sharesEdge, tJunction } = checkEdgeContact(candidate, allTiles);
  if (!sharesEdge || tJunction) return false;

  return true;
};

// ---------------------------------------------------------------------
// Section 5: Snapping
// ---------------------------------------------------------------------

export const SNAP_RADIUS = 45;

// Where the candidate goes when the pointer is at its (x, y): moved so one
// of its edges lies exactly on an existing edge of the same length, on the
// far side of it from the existing tile, by the smallest legal movement
// within SNAP_RADIUS. A snap that fails only the playfield test is used
// when there is no in-bounds one (so the red border can show). With no
// snap, the tile stays where it is.
export const snapPosition = (allTiles: readonly Tile[], candidate: Tile): { x: number; y: number; snapped: boolean } => {
  const { x, y } = candidate;
  if (allTiles.length === 0) return { x, y, snapped: false };

  const cv = getVertices(candidate);
  const cc = centroidOf(cv);
  let best: { x: number; y: number; rank: number } | null = null;

  for (const tile of allTiles) {
    const tv = getVertices(tile);
    const tc = centroidOf(tv);

    for (let a = 0; a < 4; a++) {
      const a1 = tv[a], a2 = tv[(a + 1) % 4];

      for (let k = 0; k < 4; k++) {
        if (EDGE_LENGTHS[k] !== EDGE_LENGTHS[a]) continue;
        const c1 = cv[k], c2 = cv[(k + 1) % 4];

        // The edges can coincide in either direction
        for (const [t1, t2] of [[a1, a2], [a2, a1]]) {
          const tx = t1.x - c1.x, ty = t1.y - c1.y;

          // Both endpoints must land on the target edge (edge is parallel)
          if (Math.hypot(c2.x + tx - t2.x, c2.y + ty - t2.y) > 2) continue;

          const dist = Math.hypot(tx, ty);
          if (dist > SNAP_RADIUS) continue;
          if (best && dist >= best.rank) continue;

          // Tiles must sit on opposite sides of the shared edge
          const ex = a2.x - a1.x, ey = a2.y - a1.y;
          const sideExisting = ex * (tc.y - a1.y) - ey * (tc.x - a1.x);
          const sideCandidate = ex * (cc.y + ty - a1.y) - ey * (cc.x + tx - a1.x);
          if (sideExisting * sideCandidate >= 0) continue;

          const moved = { ...candidate, x: x + tx, y: y + ty };
          const oob = isOutsidePlayfield(cv.map(v => ({ x: v.x + tx, y: v.y + ty })));
          if (!isLegalPlacement(allTiles, moved, oob)) continue;

          const rank = dist + (oob ? 1000 : 0);
          if (best && rank >= best.rank) continue;
          best = { x: moved.x, y: moved.y, rank };
        }
      }
    }
  }

  return best ? { x: best.x, y: best.y, snapped: true } : { x, y, snapped: false };
};

// ---------------------------------------------------------------------
// Section 6: Play
// ---------------------------------------------------------------------

export const removeLastTile = <T>(tiles: readonly T[]): T[] => tiles.slice(0, -1);

export const countTiles = (tiles: readonly Tile[]) => ({
  kite: tiles.filter(t => t.type === 'kite').length,
  dart: tiles.filter(t => t.type === 'dart').length
});

// ---------------------------------------------------------------------
// Section 7: Connected edges
// ---------------------------------------------------------------------

// Every edge shared by two placed tiles (both endpoints coincide) where the
// vertex colors also agree at both ends.
export const findConnectedEdges = (allTiles: readonly Tile[]): Segment[] => {
  const connected: Segment[] = [];

  for (let i = 0; i < allTiles.length; i++) {
    const vi = getVertices(allTiles[i]);
    const ci = getVertexColors(allTiles[i]);
    for (let j = i + 1; j < allTiles.length; j++) {
      const vj = getVertices(allTiles[j]);
      const cj = getVertexColors(allTiles[j]);
      for (let a = 0; a < 4; a++) {
        const a1 = vi[a], a2 = vi[(a + 1) % 4];
        const ca1 = ci[a], ca2 = ci[(a + 1) % 4];
        for (let b = 0; b < 4; b++) {
          const b1 = vj[b], b2 = vj[(b + 1) % 4];
          const cb1 = cj[b], cb2 = cj[(b + 1) % 4];
          const forward = samePoint(a1, b1) && samePoint(a2, b2) && ca1 === cb1 && ca2 === cb2;
          const reverse = samePoint(a1, b2) && samePoint(a2, b1) && ca1 === cb2 && ca2 === cb1;
          if (forward || reverse) {
            connected.push({ x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y });
          }
        }
      }
    }
  }
  return connected;
};

// ---------------------------------------------------------------------
// Section 8: Rotation controls
// ---------------------------------------------------------------------

export const ROTATION_STEP = 36;

// Rotation after turning `steps` steps (positive = clockwise), in [0, 360).
export const rotateBy = (rotation: number, steps: number): number =>
  (((rotation + steps * ROTATION_STEP) % 360) + 360) % 360;

// Wheel deltas in pixels: line mode counts 16 px a line, page mode 400 px.
export const wheelDeltaPixels = (deltaY: number, deltaMode: number): number =>
  deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;

export const WHEEL_NOTCH = 50;
export const TRACKPAD_STEP = 50; // lower = faster trackpad rotation

// One wheel event. A delta of WHEEL_NOTCH px or more is a mouse wheel notch
// and turns one step by itself (the trackpad total is left alone). Smaller
// deltas are a trackpad swipe: they add up in `total`, and every
// TRACKPAD_STEP px turns one step. Scrolling up (negative) is clockwise.
// Returns the steps to turn and the new running total.
export const wheelSteps = (total: number, dy: number): { steps: number; total: number } => {
  if (Math.abs(dy) >= WHEEL_NOTCH) return { steps: dy < 0 ? 1 : -1, total };

  let t = total + dy;
  let steps = 0;
  while (Math.abs(t) >= TRACKPAD_STEP) {
    steps += t < 0 ? 1 : -1;
    t -= Math.sign(t) * TRACKPAD_STEP;
  }
  return { steps, total: t };
};
