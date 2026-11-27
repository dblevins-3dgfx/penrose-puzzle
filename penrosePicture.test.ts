import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHI,
  TILE_SIZE,
  autoRotatePlacement,
  centroidOf,
  getVertices,
  toTriangles,
  trianglesOverlap,
  type Point,
  type Tile
} from './rules';
import { boundsOf, newPuzzle } from './jigsaw';
import {
  INDEPENDENT_TILE_SIZE,
  PENROSE_PALETTES,
  PENROSE_TILING_GENERATORS,
  SUBDIVIDE_DEPTH,
  arcsForTile,
  colorSchemeForSeed,
  independentTiling,
  matchingTiling,
  pictureTiles,
  sampleGradientColor,
  sampleTileColor,
  subdividedTiling,
  tileArcs,
  type CircularArc,
  type RGB,
  type TilingTile
} from './penrosePicture';
import { PICTURE_STYLES } from './settings';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (actual: number, expected: number, eps = 1e-6, msg?: string) =>
  assert.ok(Math.abs(actual - expected) < eps, msg ?? `${actual} should be ${expected}`);

// Clockwise sweep from startAngle to endAngle in (0, 2*pi].
const cwSweep = (start: number, end: number) => {
  let d = (end - start) % (2 * Math.PI);
  if (d <= 0) d += 2 * Math.PI;
  return d;
};

const arcPoint = (arc: CircularArc, angle: number): Point => ({
  x: arc.center.x + arc.radius * Math.cos(angle),
  y: arc.center.y + arc.radius * Math.sin(angle)
});

// Distance from point p to segment a-b.
const distToSeg = (p: Point, a: Point, b: Point) => {
  const abx = b.x - a.x,
    aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
};

const inTriangle = (p: Point, [a, b, c]: Point[]): boolean => {
  const side = (u: Point, v: Point) => (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x);
  const d1 = side(a, b),
    d2 = side(b, c),
    d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

const pointInTilingTile = (p: Point, t: TilingTile): boolean => toTriangles(t.vertices).some(tri => inTriangle(p, tri));

const checkValidShapes = (tiles: TilingTile[], expectedLong: number) => {
  assert.ok(tiles.length > 0);
  const expectedShort = expectedLong / PHI;
  for (const t of tiles) {
    near(t.longEdge, expectedLong);
    const [v0, v1, v2, v3] = t.vertices;
    near(dist(v0, v1), expectedLong);
    near(dist(v1, v2), expectedShort);
    near(dist(v2, v3), expectedShort);
    near(dist(v3, v0), expectedLong);
    const cross = (v2.x - v0.x) * (v1.y - v0.y) - (v2.y - v0.y) * (v1.x - v0.x);
    assert.ok(cross > 0, 'v1 lies on the clockwise side of the symmetry axis');
  }
};

const arcHitsOnEdge = (arcs: [CircularArc, CircularArc], a: Point, b: Point) => {
  const hits: { pt: Point; family: CircularArc['family'] }[] = [];
  for (const arc of arcs) {
    for (const ang of [arc.startAngle, arc.endAngle]) {
      const pt = arcPoint(arc, ang);
      if (distToSeg(pt, a, b) < 1e-3) hits.push({ pt, family: arc.family });
    }
  }
  return hits;
};

const checkPairArcs = (ti: TilingTile, tj: TilingTile): number => {
  const eps = 1e-4;
  const arcsI = tileArcs(ti),
    arcsJ = tileArcs(tj);
  let count = 0;
  for (let ei = 0; ei < 4; ei++) {
    const a1 = ti.vertices[ei],
      b1 = ti.vertices[(ei + 1) % 4];
    for (let ej = 0; ej < 4; ej++) {
      const a2 = tj.vertices[ej],
        b2 = tj.vertices[(ej + 1) % 4];
      const shared = (dist(a1, a2) < eps && dist(b1, b2) < eps) || (dist(a1, b2) < eps && dist(b1, a2) < eps);
      if (!shared) continue;
      count++;
      const hitsI = arcHitsOnEdge(arcsI, a1, b1);
      const hitsJ = arcHitsOnEdge(arcsJ, a1, b1);
      assert.equal(hitsI.length, 1, 'exactly one arc meets each edge of tile i');
      assert.equal(hitsJ.length, 1, 'exactly one arc meets each edge of tile j');
      assert.equal(hitsI[0].family, hitsJ[0].family, 'arc families match across shared edge');
      near(dist(hitsI[0].pt, hitsJ[0].pt), 0, 1e-3, 'arc endpoints coincide on shared edge');
    }
  }
  return count;
};

// Every shared edge between two tiles in a valid Penrose tiling must have one
// arc endpoint from each tile landing at the exact same point and family.
const checkArcContinuity = (tiles: TilingTile[]) => {
  let sharedEdges = 0;
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      sharedEdges += checkPairArcs(tiles[i], tiles[j]);
    }
  }
  assert.ok(sharedEdges > 0, 'checked at least one shared edge');
};

const checkNoOverlaps = (tiles: TilingTile[]) => {
  for (let i = 0; i < tiles.length; i++) {
    const ti = toTriangles(tiles[i].vertices);
    for (let j = i + 1; j < tiles.length; j++) {
      const tj = toTriangles(tiles[j].vertices);
      for (const a of ti) {
        for (const b of tj) {
          assert.equal(trianglesOverlap(a, b, 0.5), false, `tiles ${i} and ${j} must not overlap`);
        }
      }
    }
  }
};

// ---------------------------------------------------------------------
// Circular arc geometry
// ---------------------------------------------------------------------

test('kite and dart arcs sweep their exact interior angles and meet their own edges', () => {
  const homes = newPuzzle('small', 7).map(p => p.home);
  const tiles = matchingTiling(homes);
  assert.ok(tiles.some(t => t.type === 'kite') && tiles.some(t => t.type === 'dart'));

  for (const t of tiles) {
    const [primary, secondary] = tileArcs(t);
    const [v0, v1, v2, v3] = t.vertices;
    assert.equal(primary.family, 'primary');
    assert.equal(secondary.family, 'secondary');
    assert.equal(primary.anticlockwise, false);
    assert.equal(secondary.anticlockwise, false);

    // Primary arc spans the 72 deg angle at v0, from edge v0-v3 to edge v0-v1
    near(cwSweep(primary.startAngle, primary.endAngle), (72 * Math.PI) / 180);
    near(distToSeg(arcPoint(primary, primary.startAngle), v0, v3), 0);
    near(distToSeg(arcPoint(primary, primary.endAngle), v0, v1), 0);

    // Secondary arc spans 144 deg (kite) or 216 deg (dart) at v2, from v2-v1 to v2-v3
    const expectedSecSweep = ((t.type === 'kite' ? 144 : 216) * Math.PI) / 180;
    near(cwSweep(secondary.startAngle, secondary.endAngle), expectedSecSweep);
    near(distToSeg(arcPoint(secondary, secondary.startAngle), v2, v1), 0);
    near(distToSeg(arcPoint(secondary, secondary.endAngle), v2, v3), 0);

    // Both arc midpoints lie on the symmetry axis v0-v2 (and touch tangentially)
    const midP = arcPoint(primary, primary.startAngle + cwSweep(primary.startAngle, primary.endAngle) / 2);
    const midS = arcPoint(secondary, secondary.startAngle + cwSweep(secondary.startAngle, secondary.endAngle) / 2);
    near(distToSeg(midP, v0, v2), 0);
    near(distToSeg(midS, v0, v2), 0);
    near(dist(midP, midS), 0, 1e-6, 'golden-ratio arcs meet tangentially on the axis');
  }
});

test('arcsForTile produces matching Conway arcs for Sandbox tiles and joins smoothly across legal placements', () => {
  const seed: Tile = { type: 'kite', x: 400, y: 300, rotation: 36 };
  const [kiteP, kiteS] = arcsForTile(seed);
  near(kiteP.radius, TILE_SIZE / PHI);
  near(kiteS.radius, TILE_SIZE / (PHI * PHI));

  const dart: Tile = { type: 'dart', x: 400, y: 300, rotation: 270 };
  const [dartP, dartS] = arcsForTile(dart);
  near(dartP.radius, TILE_SIZE / (PHI * PHI));
  near(dartS.radius, TILE_SIZE / (PHI * PHI * PHI));

  // Place a legal kite and dart adjacent to the seed tile using Sandbox auto-rotate
  const verts = getVertices(seed);
  const longEdgeMid = { x: (verts[0].x + verts[1].x) / 2, y: (verts[0].y + verts[1].y) / 2 };
  const shortEdgeMid = { x: (verts[1].x + verts[2].x) / 2, y: (verts[1].y + verts[2].y) / 2 };
  const neighborKite = autoRotatePlacement([seed], 'kite', longEdgeMid, 0);
  const neighborDart = autoRotatePlacement([seed], 'dart', shortEdgeMid, 0);
  assert.ok(neighborKite && neighborDart, 'found legal Sandbox neighbors on long and short edges');

  const placed = [seed, neighborKite.tile, neighborDart.tile];
  checkArcContinuity(matchingTiling(placed));
  // arcsForTile matches tileArcs on the equivalent TilingTile
  placed.forEach((tile, i) => {
    assert.deepEqual(arcsForTile(tile), tileArcs(matchingTiling(placed)[i]));
  });
});

// ---------------------------------------------------------------------
// 1. Matching tiling
// ---------------------------------------------------------------------

test('matching tiling aligns 1:1 with the solved puzzle and has continuous arcs', () => {
  const homes = newPuzzle('medium', 42).map(p => p.home);
  const tiles = matchingTiling(homes);
  assert.equal(tiles.length, homes.length);
  checkValidShapes(tiles, TILE_SIZE);
  checkArcContinuity(tiles);
  tiles.forEach((t, i) => {
    const expected = getVertices(homes[i]);
    t.vertices.forEach((v, k) => {
      near(v.x, expected[k].x);
      near(v.y, expected[k].y);
    });
  });
});

// ---------------------------------------------------------------------
// 2. Subdivided tiling
// ---------------------------------------------------------------------

test('2-level subdivided tiling shrinks by phi^2, has no overlaps, covers every piece, and has continuous arcs', () => {
  const homes = newPuzzle('small', 11).map(p => p.home);
  const tiles = subdividedTiling(homes, SUBDIVIDE_DEPTH);
  assert.ok(tiles.length > homes.length * 4, '2-level deflation produces several sub-tiles per piece');
  checkValidShapes(tiles, TILE_SIZE / PHI ** SUBDIVIDE_DEPTH);
  checkNoOverlaps(tiles);
  checkArcContinuity(tiles);

  // Sample interior points near each piece's centroid and toward every corner
  for (const h of homes) {
    const verts = getVertices(h);
    const c = centroidOf(verts);
    const samples = [c, ...verts.map(v => ({ x: c.x + (v.x - c.x) * 0.85, y: c.y + (v.y - c.y) * 0.85 }))];
    for (const s of samples) {
      assert.ok(
        tiles.some(t => pointInTilingTile(s, t)),
        'subdivided tiling covers the whole piece including near borders'
      );
    }
  }
});

// ---------------------------------------------------------------------
// 3. Independent tiling
// ---------------------------------------------------------------------

test('independent tiling covers the puzzle box, is deterministic per seed, and has continuous arcs', () => {
  const homes = newPuzzle('small', 19).map(p => p.home);
  const box = boundsOf(homes);
  const tilesA = independentTiling(box, 19);
  const tilesB = independentTiling(box, 19);
  const tilesOther = independentTiling(box, 20);

  checkValidShapes(tilesA, INDEPENDENT_TILE_SIZE);
  checkNoOverlaps(tilesA);
  checkArcContinuity(tilesA);
  assert.deepEqual(tilesA, tilesB, 'same seed gives identical independent tiling');
  assert.notDeepEqual(tilesA, tilesOther, 'different seed gives a different independent tiling');

  // Every puzzle piece centroid lies inside the independent tiling
  for (const h of homes) {
    const c = centroidOf(getVertices(h));
    assert.ok(
      tilesA.some(t => pointInTilingTile(c, t)),
      'independent tiling covers the puzzle'
    );
  }
});

test('pictureTiles dispatches each Penrose picture style', () => {
  const penroseStyles = PICTURE_STYLES.filter(s => s !== 'sunset');
  assert.deepEqual(Object.keys(PENROSE_TILING_GENERATORS).sort(), [...penroseStyles].sort());

  const homes = newPuzzle('small', 3).map(p => p.home);
  assert.equal(pictureTiles('matching', homes, 3).length, homes.length);
  assert.equal(pictureTiles('subdivided', homes, 3)[0].longEdge, TILE_SIZE / PHI ** SUBDIVIDE_DEPTH);
  assert.equal(pictureTiles('independent', homes, 3)[0].longEdge, INDEPENDENT_TILE_SIZE);
  assert.deepEqual(pictureTiles('matching', [], 3), []);
});

// ---------------------------------------------------------------------
// Seeded color palettes and asymmetric gradients
// ---------------------------------------------------------------------

const rgbDist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('every curated stained-glass palette has four well-separated mid-value colors', () => {
  assert.ok(PENROSE_PALETTES.length >= 4);
  for (const palette of PENROSE_PALETTES) {
    assert.equal(palette.colors.length, 4);
    for (let i = 0; i < 4; i++) {
      const [r, g, b] = palette.colors[i];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      assert.ok(
        luma > 45 && luma < 210,
        `${palette.id}[${i}] luma ${luma} stays readable with dark leads & bright arcs`
      );
      for (let j = i + 1; j < 4; j++) {
        assert.ok(rgbDist(palette.colors[i], palette.colors[j]) > 80, `${palette.id} colors ${i} & ${j} are distinct`);
      }
    }
  }
});

test('colorSchemeForSeed is deterministic per seed and varies palettes, orientations, and gradient geometries across seeds', () => {
  assert.deepEqual(colorSchemeForSeed(42), colorSchemeForSeed(42));
  const schemes = Array.from({ length: 40 }, (_, i) => colorSchemeForSeed(i + 1));
  const palettes = new Set(schemes.map(s => s.paletteId));
  const gradients = new Set(schemes.map(s => s.gradient));
  const angles = new Set(schemes.map(s => Math.round(s.angle * 100)));

  assert.ok(palettes.size >= 4, 'multiple curated palettes appear across seeds');
  assert.deepEqual([...gradients].sort(), ['bilinear', 'conic'], 'both bilinear and conic geometries appear');
  assert.ok(angles.size > 20, 'gradient orientation varies widely across seeds');
});

test('both bilinear and conic gradients break 5-fold rotational symmetry to give clear placement clues', () => {
  const box = { x: 100, y: 100, w: 400, h: 400 };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radius = 140;

  let testedBilinear = 0;
  let testedConic = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const scheme = colorSchemeForSeed(seed);
    if (scheme.gradient === 'bilinear') testedBilinear++;
    else testedConic++;

    // Sample 5 points 72 degrees apart around the center (matching a D5 mandala's 5 petals)
    const petals = Array.from({ length: 5 }, (_, k) => {
      const a = (k * 72 * Math.PI) / 180;
      return sampleGradientColor({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }, box, scheme);
    });
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        assert.ok(
          rgbDist(petals[i], petals[j]) > 20,
          `seed ${seed} (${scheme.gradient}/${scheme.paletteId}) distinguishes petals ${i} and ${j}`
        );
      }
    }
  }
  assert.ok(testedBilinear > 0 && testedConic > 0);
});

test('sampleTileColor keeps RGB values valid and shades kites brighter than darts at the same position', () => {
  const homes = newPuzzle('small', 11).map(p => p.home);
  const box = boundsOf(homes);
  const scheme = colorSchemeForSeed(11);
  const tiles = matchingTiling(homes);
  for (const t of tiles) {
    const [r, g, b] = sampleTileColor(t, box, scheme);
    assert.ok(r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255);
  }
  const sameVerts = tiles[0].vertices;
  const kiteCol = sampleTileColor({ type: 'kite', vertices: sameVerts, longEdge: TILE_SIZE }, box, scheme);
  const dartCol = sampleTileColor({ type: 'dart', vertices: sameVerts, longEdge: TILE_SIZE }, box, scheme);
  const luma = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  assert.ok(luma(kiteCol) > luma(dartCol), 'kites render brighter than darts at the same spot');
});
