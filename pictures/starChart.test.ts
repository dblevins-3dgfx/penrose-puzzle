import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAR_CHART_SIZE, starChartLayoutForSeed, starChartPlugin } from './starChart';

const near = (actual: number, expected: number, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} should be ${expected}`);

test('starChartLayoutForSeed is deterministic per seed and varies across seeds', () => {
  const a = starChartLayoutForSeed(STAR_CHART_SIZE, 42);
  const b = starChartLayoutForSeed(STAR_CHART_SIZE, 42);
  const other = starChartLayoutForSeed(STAR_CHART_SIZE, 43);

  assert.deepEqual(a, b);
  assert.notDeepEqual(a, other);
  assert.notEqual(a.milkyWayAngle, other.milkyWayAngle);
  assert.notDeepEqual(a.planet, other.planet);
});

test('starChartLayoutForSeed places nebulae, constellations, ecliptic, and landmarks cleanly within bounds', () => {
  for (const seed of [0, 1, 42, 777, 123456]) {
    const layout = starChartLayoutForSeed(STAR_CHART_SIZE, seed);
    assert.equal(layout.nebulae.length, 4);
    assert.equal(layout.constellations.length, 6);
    assert.equal(layout.stars.length, 260);

    // Every background star lies inside [0, size] with valid alpha
    for (const s of layout.stars) {
      assert.ok(s.x >= 0 && s.x <= STAR_CHART_SIZE && s.y >= 0 && s.y <= STAR_CHART_SIZE);
      assert.ok(s.alpha > 0 && s.alpha <= 1 && s.radius > 0);
    }

    // Constellations have 4–6 stars each
    for (const c of layout.constellations) {
      assert.ok(c.stars.length >= 4 && c.stars.length <= 6);
    }

    // Planet and moon sit directly on the ecliptic circle on roughly opposite sides
    const dPlanet = Math.hypot(layout.planet.x - layout.ecliptic.center.x, layout.planet.y - layout.ecliptic.center.y);
    const dMoon = Math.hypot(layout.moon.x - layout.ecliptic.center.x, layout.moon.y - layout.ecliptic.center.y);
    near(dPlanet, layout.ecliptic.radius);
    near(dMoon, layout.ecliptic.radius);
    const sep = Math.hypot(layout.planet.x - layout.moon.x, layout.planet.y - layout.moon.y);
    assert.ok(sep > layout.ecliptic.radius * 1.5, 'planet and moon sit on opposite halves of the ecliptic');

    // Compass rose sits inside the chart ring
    const dRose = Math.hypot(layout.compassRose.x - layout.center.x, layout.compassRose.y - layout.center.y);
    assert.ok(dRose < layout.chartRadius);
  }
});

test('starChartPlugin exposes expected id, label, and render function', () => {
  assert.equal(starChartPlugin.id, 'starchart');
  assert.equal(starChartPlugin.label, 'Celestial Star Chart');
  assert.equal(typeof starChartPlugin.render, 'function');
});
