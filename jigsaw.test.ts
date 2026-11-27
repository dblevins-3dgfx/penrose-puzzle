import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_H,
  BOARD_W,
  PHI,
  TILE_SIZE,
  edgesOf,
  getVertices,
  isLegalPlacement,
  isOutsidePlayfield,
  pointInTile,
  sameEdge,
  tilesOverlap,
  type Tile
} from './rules';
import { TAP_MAX_MOVE } from './gestures';
import { generatePatch, tileFromVertices } from './penroseTiling';
import { PIECE_COUNTS, PUZZLE_SIZES } from './settings';
import {
  FRAME_CENTER,
  LOCK_RADIUS,
  borderEdges,
  boundsOf,
  bringToFront,
  canReturnToTray,
  choosePieces,
  chooseSymmetricPieces,
  clampLoosePieces,
  computeViewportLayout,
  coverRect,
  detectCelebrations,
  orderedBorderLoops,
  dropPiece,
  drawLayers,
  isBorderComplete,
  isEdgePiece,
  isGroupSelected,
  isSolved,
  moveGroup,
  neighbors,
  newPuzzle,
  newPuzzleForViewport,
  placeBeside,
  popSpotOnBoard,
  repositionForViewport,
  resolveTrayFilter,
  returnToTray,
  rotateGroup,
  settleGroup,
  shouldTapRotate,
  takeFromTray,
  trayPieces,
  turnOf,
  pieceAt,
  pieceTile,
  progress,
  scatterSpots,
  seededRandom,
  seedFromQuery,
  shareEdge,
  solvedTiling,
  soundCueFor,
  transformPoint,
  type Piece
} from './jigsaw';

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
const edgesOfTile = (t: Tile) => {
  const v = getVertices(t);
  return v.map((p, i) => [p, v[(i + 1) % 4]] as const);
};

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
  const nearest = [...patch].sort(
    (s, t) => Math.hypot(s.x - center.x, s.y - center.y) - Math.hypot(t.x - center.x, t.y - center.y)
  )[0];
  assert.deepEqual(chosen[0], nearest);
  chosen.slice(1).forEach((t, i) => {
    assert.ok(
      chosen.slice(0, i + 1).some(c => shareEdge(c, t)),
      'each piece touches an earlier one along an edge'
    );
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
  const sequence =
    (...values: number[]) =>
    () =>
      values.shift() ?? 0;
  const plain = solvedTiling(12, sequence(0, 0, 0), FRAME_CENTER, false);
  const turned = solvedTiling(12, sequence(0, 0, 0.35), FRAME_CENTER, false);
  turned.forEach((t, i) => assert.equal(t.rotation, (plain[i].rotation + 3 * 36) % 360));
  assert.ok(buildableUnderTheRules(turned));
});

for (const [size, count] of Object.entries(PIECE_COUNTS)) {
  test(`a ${size} puzzle has ${count} pieces forming a legal tiling, inside the board and centered on the frame`, () => {
    for (const seed of [1, 2, 3]) {
      const homes = solvedTiling(count, seededRandom(seed));
      assert.equal(homes.length, count);
      if (size !== 'giant') assert.ok(homes.every(h => !isOutsidePlayfield(getVertices(h))));
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

test('border edges are the edges of the solved puzzle no other piece shares', () => {
  const homes = solvedTiling(24, seededRandom(9));
  const borders = borderEdges(homes);
  const all = homes.map(t => getVertices(t));
  homes.forEach((t, i) => {
    edgesOfTile(t).forEach(([a, b], k) => {
      const shared = all.some(
        (vs, j) =>
          j !== i &&
          vs.some((p, q) => {
            const r = vs[(q + 1) % 4];
            return (dist(p, a) < 1e-6 && dist(r, b) < 1e-6) || (dist(p, b) < 1e-6 && dist(r, a) < 1e-6);
          })
      );
      assert.equal(borders[i].includes(k), !shared, `tile ${i} edge ${k}`);
    });
  });
});

test('the border edges join up into closed loops around the puzzle', () => {
  const homes = solvedTiling(40, seededRandom(2));
  const ends = new Map<string, number>();
  const key = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
  borderEdges(homes).forEach((ks, i) =>
    ks.forEach(k => {
      const [a, b] = edgesOfTile(homes[i])[k];
      for (const p of [a, b]) ends.set(key(p), (ends.get(key(p)) ?? 0) + 1);
    })
  );
  assert.ok(ends.size > 10);
  for (const [p, n] of ends) assert.equal(n % 2, 0, `border corner ${p}`);
});

test('a puzzle has both edge pieces and interior pieces, and every piece knows which it is', () => {
  for (const size of ['medium', 'large'] as const) {
    const pieces = newPuzzle(size, 6);
    const edge = pieces.filter(isEdgePiece);
    assert.ok(edge.length > 0 && edge.length < pieces.length, size);
    const borders = borderEdges(pieces.map(p => p.home));
    pieces.forEach((p, i) => assert.deepEqual(p.border, borders[i]));
  }
  assert.deepEqual(
    borderEdges([{ type: 'kite', x: 0, y: 0, rotation: 0 }]),
    [[0, 1, 2, 3]],
    'a lone tile is all border'
  );
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
    const inFrame =
      s.x > frame.x - 40 && s.x < frame.x + frame.w + 40 && s.y > frame.y - 40 && s.y < frame.y + frame.h + 40;
    assert.ok(!inFrame, `spot ${s.x},${s.y}`);
  }
});

for (const size of ['small', 'medium', 'large'] as const) {
  test(`a new ${size} puzzle starts with every piece loose, on the board, away from its home`, () => {
    const pieces = newPuzzle(size, 7);
    assert.equal(pieces.length, PIECE_COUNTS[size]);
    assert.deepEqual(progress(pieces), { placed: 0, total: PIECE_COUNTS[size] });
    assert.equal(isSolved(pieces), false);
    assert.deepEqual(
      pieces.map(p => p.id).sort((a, b) => a - b),
      [...Array(pieces.length).keys()]
    );
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
  inTray: false,
  group: over.id ?? 0,
  border: [],
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

test('a picked-up piece is drawn on top, with the rest of its group', () => {
  const ps = [kitePiece({ id: 0 }), kitePiece({ id: 1 }), kitePiece({ id: 2 })];
  assert.deepEqual(
    bringToFront(ps, 0).map(p => p.id),
    [1, 2, 0]
  );
  const grouped = [
    kitePiece({ id: 0, group: 5 }),
    kitePiece({ id: 1 }),
    kitePiece({ id: 2, group: 5 }),
    kitePiece({ id: 3 })
  ];
  assert.deepEqual(
    bringToFront(grouped, 2).map(p => p.id),
    [1, 3, 0, 2]
  );
});

test('pieces are drawn in layers: locked pieces first, then each loose group by its topmost piece', () => {
  const ps = [
    kitePiece({ id: 0, group: 0 }),
    kitePiece({ id: 1, locked: true }),
    kitePiece({ id: 2, group: 2 }),
    kitePiece({ id: 3, group: 0 }),
    kitePiece({ id: 4, locked: true })
  ];
  assert.deepEqual(
    drawLayers(ps).map(layer => layer.map(p => p.id)),
    [[1, 4], [2], [0, 3]]
  );
  assert.deepEqual(
    drawLayers([kitePiece({ id: 5 })]).map(l => l.map(p => p.id)),
    [[5]],
    'no empty layer when nothing is locked'
  );
});

test('every piece starts in a group of its own', () => {
  for (const p of newPuzzle('medium', 4)) assert.equal(p.group, p.id);
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
  assert.equal(
    dropPiece(kitePiece({ x: 300 + LOCK_RADIUS, y: 300, rotation: 72 })).locked,
    true,
    'the radius is inclusive'
  );
  assert.equal(
    dropPiece(kitePiece({ x: 300, y: 300, rotation: 72 + 360 })).locked,
    true,
    'a full turn is the same angle'
  );
});

test('dragging moves a loose piece but keeps its center on the board', () => {
  const p = kitePiece();
  assert.deepEqual(moveGroup([p], 0, -150, 160), [{ ...p, x: 450, y: 260 }]);
  assert.deepEqual(moveGroup([p], 0, -700, BOARD_H), [{ ...p, x: 0, y: BOARD_H }]);
  assert.deepEqual(moveGroup([p], 0, BOARD_W, -500), [{ ...p, x: BOARD_W, y: 0 }]);
});

test('dragging moves the whole group, stopping when any of its pieces reaches the edge', () => {
  const a = kitePiece({ id: 0, x: 100, y: 300, group: 0 });
  const b = kitePiece({ id: 1, x: 160, y: 300, group: 0 });
  const c = kitePiece({ id: 2, x: 400, y: 400 });
  const moved = moveGroup([a, b, c], 1, -150, 0);
  assert.deepEqual(
    moved.map(p => p.x),
    [0, 60, 400],
    'stops when the first piece reaches x = 0'
  );
});

test('a locked piece cannot be moved or turned', () => {
  const p = kitePiece({ x: 300, y: 300, rotation: 72, locked: true });
  assert.deepEqual(moveGroup([p], 0, 200, 200), [p]);
  assert.deepEqual(rotateGroup([p], 0, 1), [p]);
});

test('turning a piece rotates it about its center in 36 degree steps', () => {
  const p = kitePiece({ rotation: 324 });
  assert.deepEqual(rotateGroup([p], 0, 1), [{ ...p, rotation: 0 }]);
  assert.deepEqual(rotateGroup([p], 0, -2), [{ ...p, rotation: 252 }]);
});

test('turning a piece near its home to its home angle locks it in', () => {
  const [turned] = rotateGroup([kitePiece({ x: 305, y: 300, rotation: 36 })], 0, 1);
  assert.equal(turned.locked, true);
  assert.equal(turned.x, 300);
});

// ---------------------------------------------------------------------
// Snapping pieces together
// ---------------------------------------------------------------------

const puzzle = newPuzzle('medium', 21);
const byId = (id: number) => puzzle.find(p => p.id === id) as Piece;
// Two pieces that border each other in the solved puzzle, and a third that
// borders the first but not the second
const [m, n, k] = (() => {
  for (const a of puzzle) {
    const ns = puzzle.filter(b => b !== a && neighbors(a, b));
    for (const b of ns) {
      const c = ns.find(x => x !== b && !neighbors(b, x));
      if (c) return [a, b, c];
    }
  }
  throw new Error('no neighbors found');
})();
// Piece `piece` turned `turn` degrees from home, centered at (x, y)
const placed = (piece: Piece, x: number, y: number, turn: number, group = piece.id): Piece => ({
  ...piece,
  x,
  y,
  rotation: (piece.home.rotation + turn) % 360,
  group,
  locked: false
});

test('a piece sits against its neighbor as in the solved puzzle, whatever the angle', () => {
  for (const turn of [0, 36, 144, 288]) {
    const nn = placed(n, 600, 150, turn);
    const at = placeBeside(nn, m);
    const mm = placed(m, at.x, at.y, turn);
    // Their shared edge lines up: the pieces touch along a full edge
    const shared = getVertices(pieceTile(mm)).filter(v =>
      getVertices(pieceTile(nn)).some(w => Math.hypot(v.x - w.x, v.y - w.y) < 1e-6)
    );
    assert.equal(shared.length, 2, `turn ${turn}`);
    assert.equal(turnOf(mm), turn);
  }
});

test('a piece dropped next to its neighbor at the same angle snaps against it and joins its group', () => {
  const nn = placed(n, 600, 150, 108);
  const at = placeBeside(nn, m);
  const mm = placed(m, at.x + 8, at.y - 6, 108);
  const [n2, m2] = settleGroup([nn, mm], m.id);
  near(m2.x, at.x);
  near(m2.y, at.y);
  assert.equal(m2.group, n2.group);
  assert.deepEqual(n2, { ...nn, group: Math.min(m.id, n.id) }, 'the neighbor stays put');
  assert.equal(m2.locked, false);
});

test('a piece does not snap at the wrong angle, too far away, or to a piece it does not border', () => {
  const nn = placed(n, 600, 150, 108);
  const at = placeBeside(nn, m);
  const wrongAngle = [nn, placed(m, at.x + 3, at.y, 144)];
  assert.deepEqual(settleGroup(wrongAngle, m.id), wrongAngle);
  const tooFar = [nn, placed(m, at.x + LOCK_RADIUS + 1, at.y, 108)];
  assert.deepEqual(settleGroup(tooFar, m.id), tooFar);
  const kk = placed(k, 600, 150, 108);
  const beside = placeBeside(kk, n);
  const strangers = [kk, placed(n, beside.x + 2, beside.y, 108)];
  assert.deepEqual(settleGroup(strangers, n.id), strangers);
});

test('snapped pieces move and turn together', () => {
  const nn = placed(n, 600, 150, 108);
  const at = placeBeside(nn, m);
  const joined = settleGroup([nn, placed(m, at.x + 4, at.y, 108)], m.id);
  const moved = moveGroup(joined, n.id, -20, 30);
  moved.forEach((p, i) => {
    near(p.x, joined[i].x - 20);
    near(p.y, joined[i].y + 30);
  });
  const turned = rotateGroup(moved, m.id, 2);
  const [n3, m3] = turned;
  assert.equal(turnOf(n3), 180);
  assert.equal(turnOf(m3), 180);
  near(m3.x, moved[1].x, 'turned about the piece that was turned');
  const again = placeBeside(n3, m3);
  near(again.x, m3.x);
  near(again.y, m3.y);
});

test('one snap can bring another neighbor into reach, and it joins too', () => {
  // n and k are in separate groups but already where they belong around m
  const mHome = placed(m, 500, 450, 36);
  const nn = placed(n, 0, 0, 36);
  const kk = placed(k, 0, 0, 36);
  const nAt = placeBeside(mHome, nn),
    kAt = placeBeside(mHome, kk);
  const pieces = [
    { ...nn, ...nAt },
    { ...kk, ...kAt },
    { ...mHome, x: mHome.x + 5 }
  ];
  const settled = settleGroup(pieces, m.id);
  assert.equal(new Set(settled.map(p => p.group)).size, 1);
  near(settled[2].x, mHome.x);
});

test('a group dropped at home locks in as a whole', () => {
  const offset = (p: Piece) => placed(p, p.home.x + 10, p.home.y + 5, 0, m.id);
  const settled = settleGroup([offset(m), offset(n), byId(k.id)], n.id);
  assert.equal(settled[0].locked && settled[1].locked, true);
  assert.equal(settled[2].locked, false);
  near(settled[1].x, n.home.x);
});

test('a piece snapped against a locked piece locks into place', () => {
  const locked = { ...n, x: n.home.x, y: n.home.y, rotation: n.home.rotation, locked: true };
  const mm = placed(m, m.home.x - 7, m.home.y + 9, 0);
  const [, m2] = settleGroup([locked, mm], m.id);
  assert.equal(m2.locked, true);
  assert.equal(m2.x, m.home.x);
});

test('the puzzle is solved when every piece is locked', () => {
  const ps = [kitePiece({ locked: true }), kitePiece({ id: 1 })];
  assert.deepEqual(progress(ps), { placed: 1, total: 2 });
  assert.equal(isSolved(ps), false);
  assert.equal(isSolved(ps.map(p => ({ ...p, locked: true }))), true);
  assert.equal(isSolved([]), false);
});

test('solving a whole puzzle by dropping every piece on its home', () => {
  const pieces = newPuzzle('small', 11).map(p =>
    dropPiece({ ...p, x: p.home.x + 5, y: p.home.y, rotation: p.home.rotation })
  );
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

test('tap-to-rotate selects on first tap and rotates on subsequent taps within TAP_MAX_MOVE', () => {
  assert.equal(shouldTapRotate(false, 0), false, 'first tap only selects');
  assert.equal(shouldTapRotate(false, TAP_MAX_MOVE), false);
  assert.equal(shouldTapRotate(true, 0), true, 'second tap rotates');
  assert.equal(shouldTapRotate(true, TAP_MAX_MOVE), true);
  assert.equal(shouldTapRotate(true, TAP_MAX_MOVE + 0.1), false, 'dragging does not trigger tap-rotate');

  const pieces = newPuzzle('small', 5);
  const gA = { ...pieces[0], group: 50 };
  const gB = { ...pieces[1], group: 50 };
  const other = { ...pieces[2], group: 51 };
  const locked = { ...pieces[3], group: 50, locked: true };
  const inTray = { ...pieces[4], group: 50, inTray: true };
  const list = [gA, gB, other, locked, inTray];

  assert.equal(isGroupSelected(list, null, gA.id), false);
  assert.equal(isGroupSelected(list, gA.id, gA.id), true, 'same piece is selected');
  assert.equal(isGroupSelected(list, gA.id, gB.id), true, 'piece in same snapped group counts as selected');
  assert.equal(isGroupSelected(list, gA.id, other.id), false, 'different group is not selected');
  assert.equal(isGroupSelected(list, gA.id, locked.id), false, 'locked piece is not selectable');
  assert.equal(isGroupSelected(list, gA.id, inTray.id), false, 'tray piece is not selectable on board');
});

// ---------------------------------------------------------------------
// Responsive viewport layout and clamping
// ---------------------------------------------------------------------

test('viewport layout centers the puzzle in both orientations and scales smaller puzzles larger', () => {
  const desktop = { width: 1264, height: 840 };
  const phone = { width: 390, height: 590 };

  const small = computeViewportLayout({ w: 220, h: 210 }, 12, desktop);
  const large = computeViewportLayout({ w: 380, h: 370 }, 40, desktop);
  assert.ok(small.scale > large.scale, 'smaller puzzles zoom larger on the same screen');
  near(small.frameCenter.x, small.board.width / 2);
  near(small.frameCenter.y, small.board.height / 2);

  const portrait = computeViewportLayout({ w: 300, h: 290 }, 24, phone);
  near(portrait.frameCenter.x, portrait.board.width / 2);
  near(portrait.frameCenter.y, portrait.board.height / 2);
});

test('newPuzzleForViewport centers solved homes inside the board and starts every piece in the tray', () => {
  const viewports = [
    { width: 1264, height: 840 },
    { width: 390, height: 590 },
    { width: 500, height: 320 }
  ];
  for (const vp of viewports) {
    for (const size of PUZZLE_SIZES) {
      const { pieces, layout } = newPuzzleForViewport(size, 17, vp);
      assert.equal(pieces.length, PIECE_COUNTS[size]);
      const box = boundsOf(pieces.map(p => p.home));
      assert.ok(box.x >= 0 && box.x + box.w <= layout.board.width, `${size} homes fit horizontally`);
      assert.ok(box.y >= 0 && box.y + box.h <= layout.board.height, `${size} homes fit vertically`);
      assert.equal(trayPieces(pieces, 'all').length, PIECE_COUNTS[size]);
      assert.equal(drawLayers(pieces).length, 0, 'nothing drawn on board while all pieces are in the tray');
      for (const p of pieces) {
        assert.equal(p.inTray, true);
        assert.equal(p.locked, false);
        assert.equal(p.rotation % 36, 0);
      }
    }
  }
});

test('trayPieces filters all vs edge pieces and takeFromTray moves a piece onto the board on top', () => {
  const { pieces, layout } = newPuzzleForViewport('medium', 9, { width: 1200, height: 800 });
  const edges = trayPieces(pieces, 'edges');
  assert.ok(edges.length > 0 && edges.length < pieces.length);
  assert.ok(edges.every(isEdgePiece));

  const target = edges[0];
  const taken = takeFromTray(pieces, target.id, { x: -50, y: 9999 }, layout.board);
  const moved = taken.find(p => p.id === target.id)!;
  assert.equal(moved.inTray, false);
  near(moved.x, 0, 'clamped to board left edge');
  near(moved.y, layout.board.height, 'clamped to board bottom edge');
  assert.equal(taken[taken.length - 1].id, target.id, 'taken piece is on top of the stack');
  assert.equal(trayPieces(taken, 'all').length, pieces.length - 1);
  assert.equal(trayPieces(taken, 'edges').length, edges.length - 1);
  assert.equal(resolveTrayFilter(taken, 'edges'), 'edges', 'stays on edges while edge pieces remain');
  assert.equal(resolveTrayFilter(taken, 'all'), 'all');

  // Remove every remaining edge piece from the tray -> filter switches back to 'all'
  let noEdges = taken;
  for (const e of trayPieces(taken, 'edges')) {
    noEdges = takeFromTray(noEdges, e.id, { x: 200, y: 200 }, layout.board);
  }
  assert.equal(trayPieces(noEdges, 'edges').length, 0);
  assert.ok(trayPieces(noEdges, 'all').length > 0);
  assert.equal(resolveTrayFilter(noEdges, 'edges'), 'all', 'switches to all once edges reach 0');
  assert.equal(resolveTrayFilter(noEdges, 'all'), 'all');
});

test('popSpotOnBoard stays inside the board and fans out multiple tapped pieces', () => {
  const { pieces, layout } = newPuzzleForViewport('small', 4, { width: 1000, height: 700 });
  const spots: { x: number; y: number }[] = [];
  let cur = pieces;
  for (let i = 0; i < 4; i++) {
    const spot = popSpotOnBoard(cur, layout.board);
    assert.ok(spot.x > 0 && spot.x < layout.board.width);
    assert.ok(spot.y > 0 && spot.y < layout.board.height);
    spots.push(spot);
    cur = takeFromTray(cur, cur[0].id, spot, layout.board);
  }
  assert.ok(Math.hypot(spots[1].x - spots[0].x, spots[1].y - spots[0].y) > 5, 'subsequent pops fan out');
});

test('only a single ungrouped loose on-board piece can be returned to the tray', () => {
  const pieces = newPuzzle('small', 5);
  const single = pieces[0];
  const locked = {
    ...pieces[1],
    x: pieces[1].home.x,
    y: pieces[1].home.y,
    rotation: pieces[1].home.rotation,
    locked: true
  };
  const inTray = { ...pieces[2], inTray: true };
  const grpA = { ...pieces[3], group: 99 };
  const grpB = { ...pieces[4], group: 99 };
  const state = [single, locked, inTray, grpA, grpB];

  assert.equal(canReturnToTray(state, single.id), true);
  assert.equal(canReturnToTray(state, locked.id), false);
  assert.equal(canReturnToTray(state, inTray.id), false);
  assert.equal(canReturnToTray(state, grpA.id), false, 'multi-piece groups stay on the board');

  const returned = returnToTray(state, single.id);
  assert.equal(returned[0].id, single.id, 'returned piece goes to top of tray');
  assert.equal(returned[0].inTray, true);
  assert.deepEqual(returnToTray(state, grpA.id), state, 'returning a multi-piece group is a no-op');
});

test('board hit-testing, moving, rotating, and snapping ignore pieces still in the tray', () => {
  const { pieces, layout } = newPuzzleForViewport('small', 6, { width: 1000, height: 700 });
  const a = pieces[0];
  const b = pieces.find(p => p.id !== a.id && neighbors(a, p))!;
  // Put `a` on the board at its home offset by 5 (wrong angle so it doesn't lock),
  // while neighbor `b` stays in the tray right at the matching neighbor spot.
  const onBoardA: Piece = { ...a, inTray: false, x: a.home.x, y: a.home.y, rotation: (a.home.rotation + 36) % 360 };
  const trayB: Piece = {
    ...b,
    inTray: true,
    x: placeBeside(onBoardA, b).x,
    y: placeBeside(onBoardA, b).y,
    rotation: (b.home.rotation + 36) % 360
  };
  const list = [onBoardA, trayB];

  assert.equal(pieceAt(list, { x: trayB.x, y: trayB.y }), -1, 'tray piece cannot be picked up on the board');
  assert.deepEqual(moveGroup(list, trayB.id, 10, 10, layout.board), list, 'tray piece cannot be moved on the board');
  assert.deepEqual(rotateGroup(list, trayB.id, 1), list, 'tray piece cannot be rotated on the board');
  const settled = settleGroup(list, onBoardA.id);
  assert.notEqual(settled[0].group, settled[1].group, 'on-board piece does not snap to a piece still in the tray');
});

test('clampLoosePieces brings off-board groups inside rigidly and leaves locked and tray pieces alone', () => {
  const pieces = newPuzzle('small', 5);
  const locked = {
    ...pieces[0],
    x: pieces[0].home.x,
    y: pieces[0].home.y,
    rotation: pieces[0].home.rotation,
    locked: true
  };
  // Two pieces snapped into one group, pushed past the right and bottom edges
  const gA = { ...pieces[1], x: 650, y: 420, group: 99, locked: false };
  const gB = { ...pieces[2], x: 690, y: 450, group: 99, locked: false };
  const trayP = { ...pieces[3], x: 999, y: 999, inTray: true };
  const smallBoard = { width: 500, height: 350 };

  const clamped = clampLoosePieces([locked, gA, gB, trayP], smallBoard);
  assert.deepEqual(clamped[0], locked, 'locked piece is untouched');
  assert.deepEqual(clamped[3], trayP, 'tray piece is untouched');
  const [, cA, cB] = clamped;
  assert.ok(cA.x >= 0 && cA.x <= smallBoard.width && cA.y >= 0 && cA.y <= smallBoard.height);
  assert.ok(cB.x >= 0 && cB.x <= smallBoard.width && cB.y >= 0 && cB.y <= smallBoard.height);
  near(cB.x - cA.x, gB.x - gA.x, 'snapped group keeps its relative x offset');
  near(cB.y - cA.y, gB.y - gA.y, 'snapped group keeps its relative y offset');
});

test('repositionForViewport keeps locked pieces at home, keeps tray pieces in tray, and clamps on-board loose pieces', () => {
  const { pieces } = newPuzzleForViewport('small', 8, { width: 1264, height: 840 });
  // Lock piece 0 at its home, take piece 1 onto the board far to the right, leave the rest in tray
  const inProgress = pieces.map((p, i) =>
    i === 0
      ? { ...p, x: p.home.x, y: p.home.y, rotation: p.home.rotation, locked: true, inTray: false }
      : i === 1
        ? { ...p, x: 950, y: 40, inTray: false }
        : p
  );

  const { pieces: resized, layout } = repositionForViewport(inProgress, { width: 390, height: 590 });
  const locked = resized[0];
  assert.equal(locked.locked, true);
  near(locked.x, locked.home.x);
  near(locked.y, locked.home.y);
  const looseOnBoard = resized[1];
  assert.equal(looseOnBoard.inTray, false);
  assert.ok(looseOnBoard.x >= 0 && looseOnBoard.x <= layout.board.width, 'clamped loose x inside portrait board');
  assert.ok(looseOnBoard.y >= 0 && looseOnBoard.y <= layout.board.height, 'clamped loose y inside portrait board');
  assert.ok(
    resized.slice(2).every(p => p.inTray),
    'remaining pieces stay in tray'
  );
});

test('moveGroup respects custom board bounds', () => {
  const pieces = newPuzzle('small', 2);
  const custom = { width: 1200, height: 900 };
  const moved = moveGroup(pieces, pieces[0].id, 2000, 2000, custom);
  const p = moved.find(q => q.id === pieces[0].id)!;
  near(p.x, custom.width);
  near(p.y, custom.height);
});

test('popSpotOnBoard places a tapped piece near a custom zoomed-view anchor inside the board', () => {
  const { pieces, layout } = newPuzzleForViewport('small', 4, { width: 1000, height: 700 });
  const anchor = { x: 120, y: 90 };
  const spot = popSpotOnBoard(pieces, layout.board, anchor);
  near(spot.x, anchor.x);
  near(spot.y, anchor.y);
});

// ---------------------------------------------------------------------
// Celebratory milestones and ordered border loops
// ---------------------------------------------------------------------

const lockIds = (pieces: readonly Piece[], ids: ReadonlySet<number>): Piece[] =>
  pieces.map(p =>
    ids.has(p.id) ? { ...p, x: p.home.x, y: p.home.y, rotation: p.home.rotation, locked: true, inTray: false } : p
  );

test('isBorderComplete is true only once every edge piece is locked', () => {
  assert.equal(isBorderComplete([]), false);
  const pieces = newPuzzle('medium', 7);
  const edges = pieces.filter(isEdgePiece);
  const interiors = pieces.filter(p => !isEdgePiece(p));
  assert.ok(edges.length > 0 && interiors.length > 0);

  assert.equal(isBorderComplete(pieces), false);
  const almostBorder = lockIds(pieces, new Set(edges.slice(0, -1).map(p => p.id)));
  assert.equal(isBorderComplete(almostBorder), false, 'one unlocked edge piece keeps border incomplete');

  const fullBorder = lockIds(pieces, new Set(edges.map(p => p.id)));
  assert.equal(isBorderComplete(fullBorder), true, 'all edge pieces locked completes the border');
  assert.equal(isSolved(fullBorder), false, 'interior pieces still loose');
});

test('detectCelebrations reports newly locked pieces, border completion, and puzzle solve cleanly', () => {
  const pieces = newPuzzle('medium', 7);
  const edges = pieces.filter(isEdgePiece);
  const interiors = pieces.filter(p => !isEdgePiece(p));

  // No lock change -> no events
  assert.deepEqual(detectCelebrations(pieces, pieces), {
    newlyLockedIds: [],
    joinedSeams: [],
    borderCompleted: false,
    puzzleSolved: false
  });

  // Locking a multi-piece group (two edge pieces) triggers only newlyLockedIds
  const step1 = lockIds(pieces, new Set([edges[0].id, edges[1].id]));
  assert.deepEqual(detectCelebrations(pieces, step1), {
    newlyLockedIds: [edges[0].id, edges[1].id].sort(
      (a, b) => step1.findIndex(p => p.id === a) - step1.findIndex(p => p.id === b)
    ),
    joinedSeams: [],
    borderCompleted: false,
    puzzleSolved: false
  });

  // Locking the remaining edge pieces completes the border while interiors remain
  const step2 = lockIds(pieces, new Set(edges.map(p => p.id)));
  const borderEv = detectCelebrations(step1, step2);
  assert.equal(borderEv.newlyLockedIds.length, edges.length - 2);
  assert.deepEqual(borderEv.joinedSeams, []);
  assert.equal(borderEv.borderCompleted, true);
  assert.equal(borderEv.puzzleSolved, false);

  // Locking an interior piece afterward does not re-trigger borderCompleted
  const step3 = lockIds(step2, new Set([interiors[0].id]));
  assert.deepEqual(detectCelebrations(step2, step3), {
    newlyLockedIds: [interiors[0].id],
    joinedSeams: [],
    borderCompleted: false,
    puzzleSolved: false
  });

  // Locking the remaining interior pieces triggers puzzleSolved
  const solved = lockIds(pieces, new Set(pieces.map(p => p.id)));
  const solveEv = detectCelebrations(step3, solved);
  assert.equal(solveEv.newlyLockedIds.length, interiors.length - 1);
  assert.deepEqual(solveEv.joinedSeams, []);
  assert.equal(solveEv.borderCompleted, false);
  assert.equal(solveEv.puzzleSolved, true);

  // If the very last piece placed is an edge piece (completing border + puzzle together),
  // puzzleSolved takes priority so borderCompleted is suppressed
  const oneEdgeLeft = lockIds(pieces, new Set(pieces.filter(p => p.id !== edges[0].id).map(p => p.id)));
  assert.deepEqual(detectCelebrations(oneEdgeLeft, solved), {
    newlyLockedIds: [edges[0].id],
    joinedSeams: [],
    borderCompleted: false,
    puzzleSolved: true
  });

  // Resetting to a new puzzle (unlocked pieces or different size) fires no celebrations
  assert.deepEqual(detectCelebrations(solved, pieces), {
    newlyLockedIds: [],
    joinedSeams: [],
    borderCompleted: false,
    puzzleSolved: false
  });
  assert.deepEqual(detectCelebrations(pieces, newPuzzle('small', 3)), {
    newlyLockedIds: [],
    joinedSeams: [],
    borderCompleted: false,
    puzzleSolved: false
  });
});

test('detectCelebrations reports newly joined shared seams on loose snaps and ignores drags or locks', () => {
  const pieces = newPuzzle('medium', 7);
  // Find a piece A with two neighbors B and C so we can test both single and chain snaps
  const a = pieces.find(p => pieces.filter(q => q.id !== p.id && neighbors(p, q)).length >= 2)!;
  const [b, c] = pieces.filter(q => q.id !== a.id && neighbors(a, q));

  // Turn A 36° off home so none of them lock into home
  const turn = 36;
  const placedA: Piece = {
    ...a,
    x: 400,
    y: 300,
    rotation: (a.home.rotation + turn) % 360,
    locked: false,
    inTray: false
  };
  const spotB = placeBeside(placedA, b);
  const nearB: Piece = {
    ...b,
    x: spotB.x + 6,
    y: spotB.y - 4,
    rotation: (b.home.rotation + turn) % 360,
    locked: false,
    inTray: false
  };
  const farC: Piece = { ...c, x: 100, y: 100, rotation: (c.home.rotation + turn) % 360, locked: false, inTray: false };

  const beforeSingle = pieces.map(p => (p.id === a.id ? placedA : p.id === b.id ? nearB : p.id === c.id ? farC : p));
  const afterSingle = settleGroup(beforeSingle, b.id);
  const ev1 = detectCelebrations(beforeSingle, afterSingle);
  assert.deepEqual(ev1.newlyLockedIds, []);
  assert.equal(ev1.borderCompleted, false);
  assert.equal(ev1.puzzleSolved, false);
  assert.equal(ev1.joinedSeams.length, 1, 'exactly one seam joined');

  const seam = ev1.joinedSeams[0];
  const p1 = afterSingle.find(p => p.id === seam.pieceId)!;
  const p2 = afterSingle.find(p => p.id === seam.partnerId)!;
  assert.equal(p1.group, p2.group);
  const seamEdge = edgesOf(pieceTile(p1))[seam.edgeIndex];
  assert.ok(
    edgesOf(pieceTile(p2)).some(f => sameEdge(seamEdge, f)),
    'edgeIndex points to the shared edge'
  );

  // Dragging the already-merged group does not re-trigger joinedSeams
  const dragged = moveGroup(afterSingle, a.id, 15, -10);
  assert.deepEqual(detectCelebrations(afterSingle, dragged).joinedSeams, []);

  // Now bring C right beside A in the dragged cluster and settle -> only the new seam(s) with C spark
  const curA = dragged.find(p => p.id === a.id)!;
  const spotC = placeBeside(curA, c);
  const beforeSecond = dragged.map(p => (p.id === c.id ? { ...p, x: spotC.x - 5, y: spotC.y + 3 } : p));
  const afterSecond = settleGroup(beforeSecond, c.id);
  const ev2 = detectCelebrations(beforeSecond, afterSecond);
  assert.ok(ev2.joinedSeams.length >= 1, 'joining C to the cluster reports its new seam(s)');
  assert.ok(
    ev2.joinedSeams.every(s => s.pieceId === c.id || s.partnerId === c.id),
    'existing A-B seam does not re-spark'
  );

  // Locking the cluster at home triggers newlyLockedIds, not joinedSeams
  const mergedGroup = afterSecond.find(p => p.id === a.id)!.group;
  const atHome = afterSecond.map(p =>
    p.group === mergedGroup ? { ...p, x: p.home.x, y: p.home.y, rotation: p.home.rotation } : p
  );
  const locked = settleGroup(atHome, a.id);
  const evLock = detectCelebrations(atHome, locked);
  assert.equal(evLock.newlyLockedIds.length, 3);
  assert.deepEqual(evLock.joinedSeams, []);
});

test('soundCueFor picks the single highest-priority sound cue for celebratory events', () => {
  const seam = { pieceId: 0, partnerId: 1, edgeIndex: 0 };
  assert.equal(soundCueFor({ newlyLockedIds: [], joinedSeams: [], borderCompleted: false, puzzleSolved: false }), null);
  assert.equal(
    soundCueFor({ newlyLockedIds: [], joinedSeams: [seam], borderCompleted: false, puzzleSolved: false }),
    'snap'
  );
  assert.equal(
    soundCueFor({ newlyLockedIds: [1], joinedSeams: [], borderCompleted: false, puzzleSolved: false }),
    'lock'
  );
  assert.equal(
    soundCueFor({ newlyLockedIds: [1], joinedSeams: [seam], borderCompleted: false, puzzleSolved: false }),
    'lock'
  );
  assert.equal(
    soundCueFor({ newlyLockedIds: [1], joinedSeams: [], borderCompleted: true, puzzleSolved: false }),
    'border'
  );
  assert.equal(
    soundCueFor({ newlyLockedIds: [1], joinedSeams: [], borderCompleted: false, puzzleSolved: true }),
    'solve'
  );
  assert.equal(
    soundCueFor({ newlyLockedIds: [1], joinedSeams: [seam], borderCompleted: true, puzzleSolved: true }),
    'solve'
  );
});

test('orderedBorderLoops chains every puzzle border segment into closed edge loops', () => {
  const shortLen = TILE_SIZE / PHI;
  for (const size of ['small', 'medium', 'large'] as const) {
    for (const seed of [1, 7, 42]) {
      const pieces = newPuzzle(size, seed);
      const expectedSegments = pieces.reduce((sum, p) => sum + p.border.length, 0);
      const loops = orderedBorderLoops(pieces);
      assert.ok(loops.length >= 1, `${size} seed ${seed} has at least one border loop`);
      const totalVerts = loops.reduce((sum, loop) => sum + loop.length, 0);
      assert.equal(totalVerts, expectedSegments, `${size} seed ${seed} uses every border segment once`);
      for (const loop of loops) {
        assert.ok(loop.length >= 3);
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i];
          const b = loop[(i + 1) % loop.length];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          assert.ok(
            Math.abs(len - TILE_SIZE) < 0.5 || Math.abs(len - shortLen) < 0.5,
            `segment length ${len} matches a kite/dart edge`
          );
        }
      }
    }
  }
});

// ---------------------------------------------------------------------
// Symmetric puzzle layouts (D5 5-fold mandalas and D1 bilateral mirror)
// ---------------------------------------------------------------------

const isRotationSymmetric72 = (tiles: readonly Tile[]): boolean => {
  const cx = tiles.reduce((s, t) => s + t.x, 0) / tiles.length;
  const cy = tiles.reduce((s, t) => s + t.y, 0) / tiles.length;
  const a = (72 * Math.PI) / 180;
  return tiles.every(t => {
    const dx = t.x - cx,
      dy = t.y - cy;
    const rx = cx + dx * Math.cos(a) - dy * Math.sin(a);
    const ry = cy + dx * Math.sin(a) + dy * Math.cos(a);
    return tiles.some(u => u.type === t.type && Math.hypot(u.x - rx, u.y - ry) < 1.5);
  });
};

const hasMirrorSymmetry = (tiles: readonly Tile[]): boolean => {
  const cx = tiles.reduce((s, t) => s + t.x, 0) / tiles.length;
  const cy = tiles.reduce((s, t) => s + t.y, 0) / tiles.length;
  // Check all 10 Penrose mirror axes (multiples of 18°) passing through the centroid
  for (let k = 0; k < 10; k++) {
    const a = (k * 18 * Math.PI) / 180;
    const ux = Math.cos(a),
      uy = Math.sin(a);
    const ok = tiles.every(t => {
      const dx = t.x - cx,
        dy = t.y - cy;
      const dot = dx * ux + dy * uy;
      const mx = cx + 2 * dot * ux - dx;
      const my = cy + 2 * dot * uy - dy;
      return tiles.some(u => u.type === t.type && Math.hypot(u.x - mx, u.y - my) < 1.5);
    });
    if (ok) return true;
  }
  return false;
};

test('symmetric layouts produce exact connected legal Penrose tilings with D5 (40/60/100) and D1 (12/24) symmetry', () => {
  const starPatch = generatePatch(6, 'star');
  assert.ok(starPatch.length > 500, 'star seed generates a full patch');

  for (const size of PUZZLE_SIZES) {
    const count = PIECE_COUNTS[size];
    for (const seed of [1, 7, 19]) {
      const { pieces, layout } = newPuzzleForViewport(size, seed, { width: 390, height: 590 });
      const homes = pieces.map(p => p.home);
      assert.equal(pieces.length, count, `${size} symmetric puzzle has exact count`);
      assert.ok(buildableUnderTheRules(homes), `${size} seed ${seed} symmetric puzzle is legal and connected`);
      const box = boundsOf(homes);
      assert.ok(box.x >= 0 && box.x + box.w <= layout.board.width);
      assert.ok(box.y >= 0 && box.y + box.h <= layout.board.height);

      if (count % 5 === 0) {
        assert.ok(isRotationSymmetric72(homes), `${size} (${count}) seed ${seed} has exact 5-fold rotational symmetry`);
      }
      assert.ok(hasMirrorSymmetry(homes), `${size} (${count}) seed ${seed} has exact mirror symmetry`);
    }
  }

  // Non-symmetric option still produces exact legal connected patches
  const nonSym = newPuzzleForViewport('medium', 7, { width: 390, height: 590 }, false);
  assert.equal(nonSym.pieces.length, PIECE_COUNTS.medium);
  assert.ok(buildableUnderTheRules(nonSym.pieces.map(p => p.home)));

  // Deterministic per seed, varied across seeds
  const a = newPuzzle('large', 11, true).map(p => p.home);
  const b = newPuzzle('large', 11, true).map(p => p.home);
  assert.deepEqual(a, b, 'same seed produces identical symmetric puzzle');

  const direct = chooseSymmetricPieces(starPatch, 40, seededRandom(5));
  assert.equal(direct.length, 40);
  assert.ok(isRotationSymmetric72(direct));
});
