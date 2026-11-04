import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_H, BOARD_W, TILE_SIZE, getVertices, isLegalPlacement, isOutsidePlayfield, tilesOverlap, type Tile } from './rules';
import {
  FRAME_CENTER,
  LOCK_RADIUS,
  PIECE_COUNTS,
  boundsOf,
  bringToFront,
  choosePieces,
  coverRect,
  dropPiece,
  generatePatch,
  isSolved,
  movePiece,
  rotatePiece,
  newPuzzle,
  pieceAt,
  pieceTile,
  pointInTile,
  progress,
  scatterSpots,
  seededRandom,
  seedFromQuery,
  shareEdge,
  solvedTiling,
  tileFromVertices,
  transformPoint,
  type Piece
} from './jigsaw';

const near = (actual: number, expected: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, msg ?? `${actual} should be ${expected}`);

const patch = generatePatch(6);

// Can these tiles be put down one at a time, each obeying the placement
// rules (spec 4)?
const buildableUnderTheRules = (tiles: readonly Tile[]) => {
  const placed: Tile[] = [tiles[0]];
  const rest = tiles.slice(1);
  while (rest.length) {
    const i = rest.findIndex(t => isLegalPlacement(placed, t, true));
    if (i < 0) return false;
    placed.push(...rest.splice(i, 1));
  }
  return true;
};

// ---------------------------------------------------------------------
// The solved tiling
// ---------------------------------------------------------------------

test('a tile rebuilt from its corners has the same corners', () => {
  for (const type of ['kite', 'dart'] as const) {
    for (let rotation = 0; rotation < 360; rotation += 36) {
      const t: Tile = { type, x: 123, y: 45, rotation };
      const back = tileFromVertices(type, getVertices(t));
      assert.equal(back.rotation, rotation);
      near(back.x, t.x);
      near(back.y, t.y);
    }
  }
});

test('the generated tiling has full-size kites and darts at the ten angles', () => {
  assert.ok(patch.length > 500);
  for (const t of patch) {
    assert.equal(t.rotation % 36, 0);
    const v = getVertices(t);
    near(Math.hypot(v[1].x - v[0].x, v[1].y - v[0].y), TILE_SIZE);
  }
  assert.equal(new Set(patch.map(t => t.rotation)).size, 10);
});

test('the generated tiling has no overlaps and obeys the matching rules', () => {
  const middle = patch.filter(t => Math.hypot(t.x, t.y) < 250);
  for (let i = 0; i < middle.length; i++) {
    for (let j = i + 1; j < middle.length; j++) {
      assert.equal(tilesOverlap(getVertices(middle[i]), getVertices(middle[j])), false);
    }
  }
  const sorted = [...middle].sort((s, t) => Math.hypot(s.x, s.y) - Math.hypot(t.x, t.y));
  assert.ok(buildableUnderTheRules(sorted));
});

test('the chosen pieces are one connected group, nearest the center first', () => {
  const center = { x: 100, y: -50 };
  const chosen = choosePieces(patch, center, 20);
  assert.equal(chosen.length, 20);
  const nearest = [...patch].sort((s, t) => Math.hypot(s.x - center.x, s.y - center.y) - Math.hypot(t.x - center.x, t.y - center.y))[0];
  assert.deepEqual(chosen[0], nearest);
  chosen.slice(1).forEach((t, i) => {
    assert.ok(chosen.slice(0, i + 1).some(c => shareEdge(c, t)), 'each piece touches an earlier one along an edge');
  });
});

test('a nearer tile that does not connect to the group is skipped', () => {
  const [kite, neighbor] = choosePieces(patch, { x: 0, y: 0 }, 2);
  const gap = Math.hypot(neighbor.x - kite.x, neighbor.y - kite.y);
  // A loose tile closer to the center than the neighbor, touching nothing
  const loose: Tile = { type: 'dart', x: kite.x, y: kite.y + gap * 0.9, rotation: 0 };
  assert.ok(!shareEdge(loose, kite));
  const chosen = choosePieces([kite, loose, neighbor], { x: kite.x, y: kite.y }, 2);
  assert.deepEqual(chosen, [kite, neighbor]);
});

test('the whole puzzle is turned to a random one of the ten orientations', () => {
  // Fixed random numbers: same spot in the tiling, different turn
  const sequence = (...values: number[]) => () => values.shift() ?? 0;
  const plain = solvedTiling(12, sequence(0, 0, 0));
  const turned = solvedTiling(12, sequence(0, 0, 0.35));
  turned.forEach((t, i) => assert.equal(t.rotation, (plain[i].rotation + 3 * 36) % 360));
  assert.ok(buildableUnderTheRules(turned));
});

for (const [size, count] of Object.entries(PIECE_COUNTS)) {
  test(`a ${size} puzzle has ${count} pieces forming a legal tiling, inside the board and centered on the frame`, () => {
    for (const seed of [1, 2, 3]) {
      const homes = solvedTiling(count, seededRandom(seed));
      assert.equal(homes.length, count);
      assert.ok(homes.every(h => !isOutsidePlayfield(getVertices(h))));
      assert.ok(buildableUnderTheRules(homes));
      const box = boundsOf(homes);
      near(box.x + box.w / 2, FRAME_CENTER.x);
      near(box.y + box.h / 2, FRAME_CENTER.y);
    }
  });
}

test('a seed can be given in the page address', () => {
  assert.equal(seedFromQuery('?seed=123'), 123);
  assert.equal(seedFromQuery('?x=1&seed=0'), 0);
  assert.equal(seedFromQuery(''), null);
  assert.equal(seedFromQuery('?seed=abc'), null);
  assert.equal(seedFromQuery('?seed=-5'), null);
  assert.equal(seedFromQuery('?seed=1.5'), null);
  assert.equal(seedFromQuery(`?seed=${2 ** 31}`), null);
});

test('different seeds give different puzzles; the same seed the same one', () => {
  const a = solvedTiling(24, seededRandom(1));
  const b = solvedTiling(24, seededRandom(2));
  assert.notDeepEqual(a, b);
  assert.deepEqual(solvedTiling(24, seededRandom(1)), a);
});

// ---------------------------------------------------------------------
// Breaking it up
// ---------------------------------------------------------------------

test('scatter spots stay on the board and clear of the solved puzzle', () => {
  const frame = { x: 100, y: 150, w: 300, h: 300 };
  const spots = scatterSpots(frame);
  assert.ok(spots.length > 20);
  for (const s of spots) {
    assert.ok(s.x >= 40 && s.x <= BOARD_W - 40 && s.y >= 40 && s.y <= BOARD_H - 40);
    const inFrame = s.x > frame.x - 40 && s.x < frame.x + frame.w + 40 && s.y > frame.y - 40 && s.y < frame.y + frame.h + 40;
    assert.ok(!inFrame, `spot ${s.x},${s.y}`);
  }
});

for (const size of ['small', 'medium', 'large'] as const) {
  test(`a new ${size} puzzle starts with every piece loose, on the board, away from its home`, () => {
    const pieces = newPuzzle(size, 7);
    assert.equal(pieces.length, PIECE_COUNTS[size]);
    assert.deepEqual(progress(pieces), { placed: 0, total: PIECE_COUNTS[size] });
    assert.equal(isSolved(pieces), false);
    assert.deepEqual(pieces.map(p => p.id).sort((a, b) => a - b), [...Array(pieces.length).keys()]);
    for (const p of pieces) {
      assert.equal(p.locked, false);
      assert.equal(p.rotation % 36, 0);
      assert.ok(!isOutsidePlayfield(getVertices(pieceTile(p))), 'loose piece on the board');
      assert.ok(Math.hypot(p.x - p.home.x, p.y - p.home.y) > LOCK_RADIUS, 'not already in place');
    }
  });
}

test('loose pieces start at a variety of angles', () => {
  const angles = new Set(newPuzzle('large', 3).map(p => p.rotation));
  assert.ok(angles.size >= 5);
});

// ---------------------------------------------------------------------
// Moving pieces
// ---------------------------------------------------------------------

const kitePiece = (over: Partial<Piece> = {}): Piece => ({
  id: 0,
  home: { type: 'kite', x: 300, y: 300, rotation: 72 },
  x: 600,
  y: 100,
  rotation: 0,
  locked: false,
  ...over
});

test('a point is in a piece only inside its outline', () => {
  const t: Tile = { type: 'dart', x: 400, y: 300, rotation: 0 };
  assert.equal(pointInTile({ x: 400, y: 300 - 10 }, t), true);
  assert.equal(pointInTile({ x: 400 + 200, y: 300 }, t), false);
  // A dart's notch is outside it
  const v = getVertices(t);
  const notch = { x: (v[0].x + v[2].x) / 2 + 0.6 * (v[2].x - v[0].x), y: v[0].y };
  assert.equal(pointInTile(notch, t), false);
});

test('picking up takes the topmost loose piece under the pointer', () => {
  const a = kitePiece({ id: 0 });
  const b = kitePiece({ id: 1 });
  const c = kitePiece({ id: 2, x: 100 });
  assert.equal(pieceAt([a, b, c], { x: 600, y: 100 }), 1);
  assert.equal(pieceAt([a, b, c], { x: 100, y: 100 }), 2);
  assert.equal(pieceAt([a, b, c], { x: 400, y: 500 }), -1);
  assert.equal(pieceAt([a, { ...b, locked: true }], { x: 600, y: 100 }), 0, 'locked pieces cannot be picked up');
});

test('a picked-up piece is drawn on top', () => {
  const ps = [kitePiece({ id: 0 }), kitePiece({ id: 1 }), kitePiece({ id: 2 })];
  assert.deepEqual(bringToFront(ps, 0).map(p => p.id), [1, 2, 0]);
});

test('a piece dropped near its home at its home angle locks exactly into place', () => {
  const p = kitePiece({ x: 300 + 12, y: 300 - 9, rotation: 72 });
  const dropped = dropPiece(p);
  assert.equal(dropped.locked, true);
  assert.equal(dropped.x, 300);
  assert.equal(dropped.y, 300);
  assert.equal(dropped.rotation, 72);
});

test('a piece dropped at the wrong angle or too far away stays loose', () => {
  assert.equal(dropPiece(kitePiece({ x: 300, y: 300, rotation: 108 })).locked, false);
  const far = kitePiece({ x: 300 + LOCK_RADIUS + 1, y: 300, rotation: 72 });
  assert.deepEqual(dropPiece(far), far);
  assert.equal(dropPiece(kitePiece({ x: 300 + LOCK_RADIUS, y: 300, rotation: 72 })).locked, true, 'the radius is inclusive');
  assert.equal(dropPiece(kitePiece({ x: 300, y: 300, rotation: 72 + 360 })).locked, true, 'a full turn is the same angle');
});

test('dragging moves a loose piece but keeps its center on the board', () => {
  const p = kitePiece();
  assert.deepEqual(movePiece(p, 450, 260), { ...p, x: 450, y: 260 });
  assert.deepEqual(movePiece(p, -30, BOARD_H + 10), { ...p, x: 0, y: BOARD_H });
  assert.deepEqual(movePiece(p, BOARD_W + 5, -1), { ...p, x: BOARD_W, y: 0 });
});

test('a locked piece cannot be moved or turned', () => {
  const p = kitePiece({ x: 300, y: 300, rotation: 72, locked: true });
  assert.deepEqual(movePiece(p, 500, 500), p);
  assert.deepEqual(rotatePiece(p, 1), p);
});

test('turning a piece rotates it about its center in 36 degree steps', () => {
  const p = kitePiece({ rotation: 324 });
  assert.deepEqual(rotatePiece(p, 1), { ...p, rotation: 0 });
  assert.deepEqual(rotatePiece(p, -2), { ...p, rotation: 252 });
});

test('turning a piece near its home to its home angle locks it in', () => {
  const p = kitePiece({ x: 305, y: 300, rotation: 36 });
  const turned = rotatePiece(p, 1);
  assert.equal(turned.locked, true);
  assert.equal(turned.x, 300);
});

test('the puzzle is solved when every piece is locked', () => {
  const ps = [kitePiece({ locked: true }), kitePiece({ id: 1 })];
  assert.deepEqual(progress(ps), { placed: 1, total: 2 });
  assert.equal(isSolved(ps), false);
  assert.equal(isSolved(ps.map(p => ({ ...p, locked: true }))), true);
  assert.equal(isSolved([]), false);
});

test('solving a whole puzzle by dropping every piece on its home', () => {
  const pieces = newPuzzle('small', 11).map(p => dropPiece({ ...p, x: p.home.x + 5, y: p.home.y, rotation: p.home.rotation }));
  assert.equal(isSolved(pieces), true);
});

// ---------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------

test('the picture covers the frame, keeping its proportions, centered', () => {
  const box = { x: 100, y: 100, w: 300, h: 200 };
  const wide = coverRect(1600, 800, box);
  near(wide.h, 200);
  near(wide.w, 400);
  near(wide.x, 50);
  near(wide.y, 100);
  const tall = coverRect(500, 1000, box);
  near(tall.w, 300);
  near(tall.h, 600);
  near(tall.y, -100);
});

test('each piece carries its part of the picture to wherever it is', () => {
  for (const p of newPuzzle('medium', 5)) {
    const homeCorners = getVertices(p.home);
    const nowCorners = getVertices(pieceTile(p));
    homeCorners.forEach((c, i) => {
      const moved = transformPoint(p, c);
      near(moved.x, nowCorners[i].x);
      near(moved.y, nowCorners[i].y);
    });
  }
});
