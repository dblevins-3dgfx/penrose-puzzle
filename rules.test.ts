import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_W,
  DART_VERTEX_COLORS,
  EDGE_LENGTHS,
  KITE_VERTEX_COLORS,
  PHI,
  SNAP_RADIUS,
  TILE_SIZE,
  checkEdgeContact,
  checkVertexMatching,
  countTiles,
  findConnectedEdges,
  getVertices,
  isLegalPlacement,
  isOutsidePlayfield,
  removeLastTile,
  rotateBy,
  snapPosition,
  tilesOverlap,
  wheelDeltaPixels,
  wheelSteps,
  type Point,
  type Tile,
  type TileType
} from './rules';

// A tile of `type` at `rotation`, positioned so its vertex number `vertex`
// sits on point p.
const tileWithVertexAt = (type: TileType, rotation: number, vertex: number, p: Point): Tile => {
  const v = getVertices({ type, x: 0, y: 0, rotation })[vertex];
  return { type, rotation, x: p.x - v.x, y: p.y - v.y };
};

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (actual: number, expected: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, msg ?? `${actual} should be ${expected}`);

// Interior angle at vertex i of a polygon (degrees), measured inside it.
const interiorAngle = (vs: Point[], i: number) => {
  const prev = vs[(i + 3) % 4], cur = vs[i], next = vs[(i + 1) % 4];
  const a1 = Math.atan2(prev.y - cur.y, prev.x - cur.x);
  const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
  let d = ((a1 - a2) * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
};

const O = { x: 400, y: 300 };
const kite = tileWithVertexAt('kite', 0, 0, O);
// A second kite turned 72°, sharing vertex O: its O-D edge lies on the
// first kite's O-B edge (the start of a five-kite "sun").
const kiteNeighbor = tileWithVertexAt('kite', 72, 0, O);

// ---------------------------------------------------------------------
// Spec 3: Tile geometry
// ---------------------------------------------------------------------

test('kite edges run long, short, short, long with the short edge L/phi', () => {
  const vs = getVertices({ type: 'kite', x: 0, y: 0, rotation: 0 });
  const lengths = [0, 1, 2, 3].map(i => dist(vs[i], vs[(i + 1) % 4]));
  near(lengths[0], TILE_SIZE);
  near(lengths[1], TILE_SIZE / PHI);
  near(lengths[2], TILE_SIZE / PHI);
  near(lengths[3], TILE_SIZE);
  assert.deepEqual(EDGE_LENGTHS, ['long', 'short', 'short', 'long']);
});

test('dart edges run long, short, short, long with the short edge L/phi', () => {
  const vs = getVertices({ type: 'dart', x: 0, y: 0, rotation: 0 });
  const lengths = [0, 1, 2, 3].map(i => dist(vs[i], vs[(i + 1) % 4]));
  near(lengths[0], TILE_SIZE);
  near(lengths[1], TILE_SIZE / PHI);
  near(lengths[2], TILE_SIZE / PHI);
  near(lengths[3], TILE_SIZE);
});

test('kite angles are 72, 72, 144, 72 and dart angles 72, 36, 216, 36', () => {
  const k = getVertices({ type: 'kite', x: 0, y: 0, rotation: 0 });
  const d = getVertices({ type: 'dart', x: 0, y: 0, rotation: 0 });
  // Vertices run counter-clockwise on screen, so measure the other way round
  const kAngles = [0, 1, 2, 3].map(i => 360 - interiorAngle(k, i));
  const dAngles = [0, 1, 2, 3].map(i => 360 - interiorAngle(d, i));
  [72, 72, 144, 72].forEach((a, i) => near(kAngles[i], a, `kite vertex ${i}: ${kAngles[i]}`));
  [72, 36, 216, 36].forEach((a, i) => near(dAngles[i], a, `dart vertex ${i}: ${dAngles[i]}`));
});

test('vertex colors: kite axis black, dart axis white', () => {
  assert.deepEqual(KITE_VERTEX_COLORS, ['black', 'white', 'black', 'white']);
  assert.deepEqual(DART_VERTEX_COLORS, ['white', 'black', 'white', 'black']);
});

test('a tile is centered on its position, at any rotation', () => {
  for (const type of ['kite', 'dart'] as const) {
    for (let rotation = 0; rotation < 360; rotation += 36) {
      const vs = getVertices({ type, x: 123, y: 456, rotation });
      near(vs.reduce((s, v) => s + v.x, 0) / 4, 123);
      near(vs.reduce((s, v) => s + v.y, 0) / 4, 456);
    }
  }
});

test('rotating turns the tile about its center', () => {
  const a = getVertices({ type: 'kite', x: 0, y: 0, rotation: 0 });
  const b = getVertices({ type: 'kite', x: 0, y: 0, rotation: 36 });
  const r = (36 * Math.PI) / 180;
  a.forEach((v, i) => {
    near(b[i].x, v.x * Math.cos(r) - v.y * Math.sin(r));
    near(b[i].y, v.x * Math.sin(r) + v.y * Math.cos(r));
  });
});

// ---------------------------------------------------------------------
// Spec 4: Matching rules
// ---------------------------------------------------------------------

test('the first tile can go anywhere inside the board', () => {
  assert.equal(isLegalPlacement([], { type: 'dart', x: 100, y: 500, rotation: 252 }), true);
});

test('rule 4: the first tile must still be inside the board', () => {
  assert.equal(isLegalPlacement([], { type: 'kite', x: 5, y: 300, rotation: 0 }), false);
});

test('a tile sharing a full edge with matching colors is legal', () => {
  assert.equal(isLegalPlacement([kite], kiteNeighbor), true);
});

test('rule 1: touching at a single vertex is not enough', () => {
  // A kite turned 180°, meeting the first kite only at its C vertex
  const c = getVertices(kite)[2];
  const cand = tileWithVertexAt('kite', 180, 2, c);
  assert.deepEqual(checkVertexMatching(cand, [kite]), { touches: true, colorsMatch: true });
  assert.equal(checkEdgeContact(cand, [kite]).sharesEdge, false);
  assert.equal(isLegalPlacement([kite], cand), false);
});

test('rule 1: no corner may land partway along another edge', () => {
  // The neighbor kite slid halfway along the shared edge: its corner O sits
  // in the middle of the first kite's O-B edge
  const vs = getVertices(kite);
  const mid = { x: (vs[0].x + vs[1].x) / 2, y: (vs[0].y + vs[1].y) / 2 };
  const cand = tileWithVertexAt('kite', 72, 0, mid);
  assert.equal(tilesOverlap(getVertices(cand), vs), false, 'not rejected for overlap');
  assert.equal(checkEdgeContact(cand, [kite]).tJunction, true);
  assert.equal(isLegalPlacement([kite], cand), false);
});

test('rule 1: sharing a full edge does not excuse a corner partway along another edge', () => {
  // A dart against the kite's D-O edge, with a second dart beside it: the
  // candidate shares a full edge with the kite, but its corner lands in the
  // middle of the second dart's edge
  const vs = getVertices(kite);
  const dart = tileWithVertexAt('dart', 144, 2, vs[3]);
  assert.equal(isLegalPlacement([kite], dart), true, 'the second dart fits');
  const cand = tileWithVertexAt('dart', 180, 0, vs[3]);
  assert.equal(checkEdgeContact(cand, [kite]).sharesEdge, true);
  assert.deepEqual(checkEdgeContact(cand, [dart]), { sharesEdge: false, tJunction: true });
  assert.deepEqual(checkVertexMatching(cand, [kite, dart]), { touches: true, colorsMatch: true });
  assert.equal(isLegalPlacement([kite, dart], cand), false);
});

test('rule 2: vertex colors must match where tiles meet', () => {
  // A dart whose white M vertex sits on the kite's black O vertex, sharing
  // a long edge
  const cand = tileWithVertexAt('dart', 288, 0, O);
  assert.equal(checkEdgeContact(cand, [kite]).sharesEdge, true);
  assert.deepEqual(checkVertexMatching(cand, [kite]), { touches: true, colorsMatch: false });
  assert.equal(isLegalPlacement([kite], cand), false);
});

test('rule 2: a dart with matching colors fits against a kite', () => {
  // Dart N (black) on kite O (black), sharing the kite's O-D long edge
  const cand = tileWithVertexAt('dart', 180, 1, O);
  assert.equal(isLegalPlacement([kite], cand), true);
});

test('rule 3: tiles may not overlap', () => {
  assert.equal(isLegalPlacement([kite], { ...kite }), false);
  assert.equal(isLegalPlacement([kite], { ...kite, x: kite.x + 10 }), false);
});

test('rule 3: tiles that only share an edge do not overlap', () => {
  assert.equal(tilesOverlap(getVertices(kite), getVertices(kiteNeighbor)), false);
});

test('rule 4: a tile with any vertex off the board is illegal', () => {
  const edgeKite = tileWithVertexAt('kite', 0, 0, { x: 1, y: 300 });
  const cand = tileWithVertexAt('kite', 72, 0, { x: 1, y: 300 });
  assert.equal(isOutsidePlayfield(getVertices(cand)), true);
  assert.equal(isLegalPlacement([edgeKite], cand), false);
  assert.equal(isLegalPlacement([edgeKite], cand, true), true, 'legal apart from the board edge');
});

test('rule 4: half a pixel over the edge is tolerated, more is not', () => {
  assert.equal(isOutsidePlayfield([{ x: BOARD_W + 0.4, y: 10 }]), false);
  assert.equal(isOutsidePlayfield([{ x: BOARD_W + 0.6, y: 10 }]), true);
  assert.equal(isOutsidePlayfield([{ x: -0.6, y: 10 }]), true);
});

// ---------------------------------------------------------------------
// Spec 5: Snapping
// ---------------------------------------------------------------------

test('the first tile does not snap', () => {
  const cand: Tile = { type: 'kite', x: 100, y: 100, rotation: 0 };
  assert.deepEqual(snapPosition([], cand), { x: 100, y: 100, snapped: false });
});

test('a tile near a legal spot snaps exactly onto it', () => {
  const cand = { ...kiteNeighbor, x: kiteNeighbor.x + 10, y: kiteNeighbor.y - 7 };
  const s = snapPosition([kite], cand);
  assert.equal(s.snapped, true);
  near(s.x, kiteNeighbor.x);
  near(s.y, kiteNeighbor.y);
  assert.equal(isLegalPlacement([kite], { ...cand, x: s.x, y: s.y }), true);
});

test('a tile further than the snap radius stays where it is', () => {
  const cand = { ...kiteNeighbor, x: kiteNeighbor.x + SNAP_RADIUS + 10 };
  assert.deepEqual(snapPosition([kite], cand), { x: cand.x, y: cand.y, snapped: false });
});

test('a tile does not snap onto the same side of an edge as the existing tile', () => {
  // The same rotation as the first kite, close to it: every edge pairing
  // would put it on top of the kite, so there is nothing to snap to
  const s = snapPosition([kite], { ...kite, x: kite.x + 5, y: kite.y + 5 });
  assert.equal(s.snapped, false);
});

test('a tile does not snap to a spot that breaks a rule', () => {
  // Near the dart position that fails the color rule (spec 4, rule 2)
  const bad = tileWithVertexAt('dart', 288, 0, O);
  const s = snapPosition([kite], { ...bad, x: bad.x + 3, y: bad.y + 3 });
  assert.ok(!(s.snapped && Math.abs(s.x - bad.x) < 1e-6 && Math.abs(s.y - bad.y) < 1e-6));
  if (s.snapped) assert.equal(isLegalPlacement([kite], { ...bad, x: s.x, y: s.y }), true);
});

test('a snap blocked only by the board edge is still shown', () => {
  const edgeKite = tileWithVertexAt('kite', 0, 0, { x: 1, y: 300 });
  const target = tileWithVertexAt('kite', 72, 0, { x: 1, y: 300 });
  const s = snapPosition([edgeKite], { ...target, x: target.x + 5, y: target.y + 5 });
  assert.equal(s.snapped, true);
  near(s.x, target.x, `x ${s.x}`);
  near(s.y, target.y, `y ${s.y}`);
  assert.equal(isLegalPlacement([edgeKite], { ...target, x: s.x, y: s.y }), false, 'and is not placeable');
});

// ---------------------------------------------------------------------
// Spec 6: Play
// ---------------------------------------------------------------------

test('undo removes the most recent tile only', () => {
  assert.deepEqual(removeLastTile([kite, kiteNeighbor]), [kite]);
  assert.deepEqual(removeLastTile([kite]), []);
  assert.deepEqual(removeLastTile([]), []);
});

test('the counts show how many kites and darts are placed', () => {
  const dart = tileWithVertexAt('dart', 180, 1, O);
  assert.deepEqual(countTiles([]), { kite: 0, dart: 0 });
  assert.deepEqual(countTiles([kite, kiteNeighbor, dart]), { kite: 2, dart: 1 });
});

// ---------------------------------------------------------------------
// Spec 7: Connected edges
// ---------------------------------------------------------------------

test('an edge shared with matching colors is a connected edge', () => {
  const edges = findConnectedEdges([kite, kiteNeighbor]);
  assert.equal(edges.length, 1);
  const vs = getVertices(kite);
  const ends = [{ x: edges[0].x1, y: edges[0].y1 }, { x: edges[0].x2, y: edges[0].y2 }];
  assert.ok(ends.some(p => dist(p, vs[0]) < 1e-6) && ends.some(p => dist(p, vs[1]) < 1e-6),
    'it is the kite\'s O-B edge');
});

test('an edge shared with clashing colors is not a connected edge', () => {
  const clash = tileWithVertexAt('dart', 288, 0, O);
  assert.equal(findConnectedEdges([kite, clash]).length, 0);
});

test('tiles that do not touch have no connected edges', () => {
  assert.equal(findConnectedEdges([kite, { ...kite, x: kite.x + 300 }]).length, 0);
});

// ---------------------------------------------------------------------
// Spec 8: Rotation controls
// ---------------------------------------------------------------------

test('rotation turns in 36 degree steps and wraps around', () => {
  assert.equal(rotateBy(0, 1), 36);
  assert.equal(rotateBy(0, -1), 324);
  assert.equal(rotateBy(324, 1), 0);
  assert.equal(rotateBy(36, 3), 144);
  assert.equal(rotateBy(36, -12), 324);
});

test('wheel deltas in lines and pages convert to pixels', () => {
  assert.equal(wheelDeltaPixels(3, 0), 3);
  assert.equal(wheelDeltaPixels(3, 1), 48);
  assert.equal(wheelDeltaPixels(1, 2), 400);
});

test('a mouse wheel notch turns one step: up clockwise, down counter-clockwise', () => {
  assert.deepEqual(wheelSteps(0, -100), { steps: 1, total: 0 });
  assert.deepEqual(wheelSteps(0, 100), { steps: -1, total: 0 });
  assert.deepEqual(wheelSteps(20, 50), { steps: -1, total: 20 }, 'a notch leaves the swipe total alone');
});

test('a trackpad swipe turns one step per 50 px scrolled', () => {
  let total = 0;
  let steps = 0;
  for (let i = 0; i < 13; i++) {
    const r = wheelSteps(total, -10); // 130 px upward in small deltas
    total = r.total;
    steps += r.steps;
  }
  assert.equal(steps, 2);
  near(total, -30);
});

test('a swipe that reverses direction works its total back', () => {
  const a = wheelSteps(0, -40);
  assert.deepEqual(a, { steps: 0, total: -40 });
  const b = wheelSteps(a.total, 30);
  assert.deepEqual(b, { steps: 0, total: -10 });
});
