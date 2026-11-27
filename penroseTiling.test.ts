import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHI, TILE_SIZE, getVertices, type Tile } from './rules';
import {
  deflateHalves,
  deflateNTimes,
  generatePatch,
  joinToTiling,
  splitTile,
  starHalves,
  sunHalves,
  tileFromVertices
} from './penroseTiling';

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, msg ?? `${a} vs ${b}`);

test('sunHalves and starHalves create 10 symmetric halves that join into 5 kites or 5 darts', () => {
  const sun = joinToTiling(sunHalves(TILE_SIZE), TILE_SIZE, false);
  assert.equal(sun.length, 5);
  assert.ok(sun.every(t => t.type === 'kite'));

  const star = joinToTiling(starHalves(TILE_SIZE), TILE_SIZE, false);
  assert.equal(star.length, 5);
  assert.ok(star.every(t => t.type === 'dart'));
});

test('splitTile and joinToTiling round-trip a tile and completeBoundary reflects unpaired halves', () => {
  const kite: Tile = { type: 'kite', x: 100, y: 50, rotation: 72 };
  const dart: Tile = { type: 'dart', x: -40, y: 80, rotation: 144 };

  for (const tile of [kite, dart]) {
    const halves = splitTile(tile);
    assert.equal(halves.length, 2);
    const joined = joinToTiling(halves, TILE_SIZE, false);
    assert.equal(joined.length, 1);
    const rebuilt = tileFromVertices(joined[0].type, joined[0].vertices);
    assert.equal(rebuilt.type, tile.type);
    assert.equal(rebuilt.rotation, tile.rotation);
    near(rebuilt.x, tile.x);
    near(rebuilt.y, tile.y);

    // Dropping one half produces 0 tiles unless completeBoundary is true
    assert.equal(joinToTiling([halves[0]], TILE_SIZE, false).length, 0);
    const completed = joinToTiling([halves[0]], TILE_SIZE, true);
    assert.equal(completed.length, 1);
    const fromCompleted = tileFromVertices(completed[0].type, completed[0].vertices);
    assert.equal(fromCompleted.rotation, tile.rotation);
    near(fromCompleted.x, tile.x);
    near(fromCompleted.y, tile.y);
  }
});

test('deflateHalves splits each half-kite into 3 halves and each half-dart into 2 halves, shrinking by phi', () => {
  const kite: Tile = { type: 'kite', x: 0, y: 0, rotation: 0 };
  const dart: Tile = { type: 'dart', x: 0, y: 0, rotation: 0 };
  assert.equal(deflateHalves(splitTile(kite)).length, 6);
  assert.equal(deflateHalves(splitTile(dart)).length, 4);

  const sub = joinToTiling(deflateNTimes(splitTile(kite), 2), TILE_SIZE / PHI ** 2, true);
  assert.ok(sub.length > 0);
  for (const t of sub) {
    const [v0, v1] = t.vertices;
    near(Math.hypot(v1.x - v0.x, v1.y - v0.y), TILE_SIZE / PHI ** 2);
  }
});

test('generatePatch builds full-size tiles for both sun and star seeds', () => {
  for (const seed of ['sun', 'star'] as const) {
    const patch = generatePatch(4, seed);
    assert.ok(patch.length > 40, `${seed} patch has tiles`);
    for (const t of patch) {
      assert.equal(t.rotation % 36, 0);
      const [v0, v1] = getVertices(t);
      near(Math.hypot(v1.x - v0.x, v1.y - v0.y), TILE_SIZE);
    }
  }
});
