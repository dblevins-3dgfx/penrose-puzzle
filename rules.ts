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

// A tile's four edges in perimeter order, each with its end colors and
// length label.
export interface Edge {
  a: Point;
  b: Point;
  colorA: VertexColor;
  colorB: VertexColor;
  label: EdgeLength;
}

export const edgesOf = (tile: Tile): Edge[] => {
  const v = getVertices(tile);
  const c = getVertexColors(tile);
  return [0, 1, 2, 3].map(i => ({
    a: v[i], b: v[(i + 1) % 4], colorA: c[i], colorB: c[(i + 1) % 4], label: EDGE_LENGTHS[i]
  }));
};

// Do two edges have the same end points, in either direction?
export const sameEdge = (e: Pick<Edge, 'a' | 'b'>, f: Pick<Edge, 'a' | 'b'>): boolean =>
  (samePoint(e.a, f.a) && samePoint(e.b, f.b)) || (samePoint(e.a, f.b) && samePoint(e.b, f.a));

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
  const corners = allTiles.flatMap(tile => {
    const colors = getVertexColors(tile);
    return getVertices(tile).map((p, i) => ({ p, color: colors[i] }));
  });
  const cColors = getVertexColors(candidate);
  let touches = false;
  let colorsMatch = true;

  getVertices(candidate).forEach((v, i) => {
    for (const corner of corners) {
      if (!samePoint(v, corner.p)) continue;
      touches = true;
      if (cColors[i] !== corner.color) colorsMatch = false;
    }
  });
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
  const candidateEdges = edgesOf(candidate);
  let sharesEdge = false;
  let tJunction = false;

  for (const tile of allTiles) {
    const tv = getVertices(tile);

    const tileEdges = edgesOf(tile);
    if (candidateEdges.some(e => tileEdges.some(f => sameEdge(e, f)))) sharesEdge = true;

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
  const candidateEdges = edgesOf(candidate);
  // Every existing edge, with the centroid of the tile it belongs to
  const targets = allTiles.flatMap(tile => {
    const tc = centroidOf(getVertices(tile));
    return edgesOf(tile).map(edge => ({ edge, tc }));
  });
  let best: { x: number; y: number; rank: number } | null = null;

  // Moving the candidate by (tx, ty) lays its edge c1-c2 on target edge
  // t1-t2. Returns the ranked position, or null if that is not a snap.
  const trySnap = (c1: Point, c2: Point, t1: Point, t2: Point, tc: Point) => {
    const tx = t1.x - c1.x, ty = t1.y - c1.y;

    // Both endpoints must land on the target edge (edge is parallel)
    if (Math.hypot(c2.x + tx - t2.x, c2.y + ty - t2.y) > 2) return null;

    const dist = Math.hypot(tx, ty);
    if (dist > SNAP_RADIUS) return null;
    if (best && dist >= best.rank) return null;

    // Tiles must sit on opposite sides of the shared edge
    const ex = t2.x - t1.x, ey = t2.y - t1.y;
    const sideExisting = ex * (tc.y - t1.y) - ey * (tc.x - t1.x);
    const sideCandidate = ex * (cc.y + ty - t1.y) - ey * (cc.x + tx - t1.x);
    if (sideExisting * sideCandidate >= 0) return null;

    const moved = { ...candidate, x: x + tx, y: y + ty };
    const oob = isOutsidePlayfield(cv.map(v => ({ x: v.x + tx, y: v.y + ty })));
    if (!isLegalPlacement(allTiles, moved, oob)) return null;

    return { x: moved.x, y: moved.y, rank: dist + (oob ? 1000 : 0) };
  };

  for (const { edge, tc } of targets) {
    for (const ce of candidateEdges) {
      if (ce.label !== edge.label) continue;
      // The edges can coincide in either direction
      for (const [t1, t2] of [[edge.a, edge.b], [edge.b, edge.a]]) {
        const snap = trySnap(ce.a, ce.b, t1, t2, tc);
        if (snap && (!best || snap.rank < best.rank)) best = snap;
      }
    }
  }

  return best ? { x: best.x, y: best.y, snapped: true } : { x, y, snapped: false };
};

// ---------------------------------------------------------------------
// Section 5b: Auto-rotate
// ---------------------------------------------------------------------

// How close (in canvas units) the pointer must be to a free edge for
// auto-rotate to use it.
export const AUTO_ROTATE_RADIUS = 60;

// Edges of placed tiles that no other tile shares: where a new tile can go.
export const findOpenEdges = (allTiles: readonly Tile[]): Edge[] => {
  const edges = allTiles.map(edgesOf);
  return edges.flatMap((own, i) =>
    own.filter(e => !edges.some((other, j) => j !== i && other.some(f => sameEdge(e, f))))
  );
};

// Shortest distance from p to the segment a-b.
export const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
};

// Every legal placement of a `type` tile with one of its edges laid exactly
// on `edge` (at any of the 10 rotations, either way round).
export const fitsOnEdge = (allTiles: readonly Tile[], type: TileType, edge: Pick<Edge, 'a' | 'b' | 'label'>): Tile[] => {
  const fits: Tile[] = [];
  for (let rotation = 0; rotation < 360; rotation += ROTATION_STEP) {
    for (const ce of edgesOf({ type, x: 0, y: 0, rotation })) {
      if (ce.label !== edge.label) continue;
      for (const [t1, t2] of [[edge.a, edge.b], [edge.b, edge.a]]) {
        const tx = t1.x - ce.a.x, ty = t1.y - ce.a.y;
        if (!samePoint({ x: ce.b.x + tx, y: ce.b.y + ty }, t2)) continue;
        const tile = { type, x: tx, y: ty, rotation };
        const duplicate = fits.some(f => f.rotation === rotation && samePoint(f, tile));
        if (!duplicate && isLegalPlacement(allTiles, tile)) fits.push(tile);
      }
    }
  }
  return fits;
};

// Where auto-rotate puts a `type` tile with the pointer at p. `fits` are
// all the ways the tile fits a free edge within AUTO_ROTATE_RADIUS of p,
// ordered by how near p the edge is, then how near p the tile would be;
// `tile` is fits[choice], wrapping around, so choice 0 is the nearest free
// edge the tile fits and rotating steps through the others. Null when no
// free edge near p takes the tile; the board is then played as without
// auto-rotate.
export const autoRotatePlacement = (allTiles: readonly Tile[], type: TileType, p: Point, choice = 0): { tile: Tile; fits: Tile[] } | null => {
  const tileDist = (t: Tile) => Math.hypot(t.x - p.x, t.y - p.y);
  const fits = findOpenEdges(allTiles)
    .map(edge => ({ edge, dist: distanceToSegment(p, edge.a, edge.b) }))
    .filter(e => e.dist <= AUTO_ROTATE_RADIUS)
    .flatMap(({ edge, dist }) => fitsOnEdge(allTiles, type, edge).map(tile => ({ tile, dist })))
    .sort((s, t) => s.dist - t.dist || tileDist(s.tile) - tileDist(t.tile) || s.tile.rotation - t.tile.rotation)
    .map(f => f.tile)
    // The same placement can fit two neighboring free edges at once
    .filter((t, i, all) => all.findIndex(u => u.rotation === t.rotation && samePoint(u, t)) === i);

  if (fits.length === 0) return null;
  const n = fits.length;
  return { tile: fits[((choice % n) + n) % n], fits };
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
  const edges = allTiles.map(edgesOf);

  // An edge of one tile that coincides with an edge of the other, with the
  // colors agreeing at both ends
  const matches = (e: Edge, f: Edge) =>
    (samePoint(e.a, f.a) && samePoint(e.b, f.b) && e.colorA === f.colorA && e.colorB === f.colorB) ||
    (samePoint(e.a, f.b) && samePoint(e.b, f.a) && e.colorA === f.colorB && e.colorB === f.colorA);

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      for (const e of edges[i]) {
        if (edges[j].some(f => matches(e, f))) connected.push({ x1: e.a.x, y1: e.a.y, x2: e.b.x, y2: e.b.y });
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
