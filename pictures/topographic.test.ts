import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPO_CONTOUR_LEVELS,
  makeElevationSampler,
  renderTopographicPixels,
  sampleHypsometricColor,
  shadeTopographicPixel,
  topoConfigForSeed
} from './topographic';

test('topoConfigForSeed is deterministic per seed, varies across seeds, and keeps anchors in-bounds', () => {
  const a = topoConfigForSeed(42);
  const b = topoConfigForSeed(42);
  const other = topoConfigForSeed(43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, other);

  for (const seed of [0, 1, 42, 999, 123456]) {
    const cfg = topoConfigForSeed(seed);
    assert.ok(cfg.peakX >= 0.32 && cfg.peakX <= 0.68);
    assert.ok(cfg.peakY >= 0.32 && cfg.peakY <= 0.68);
    assert.ok(cfg.basinX >= 0.14 && cfg.basinX <= 0.86);
    assert.ok(cfg.basinY >= 0.14 && cfg.basinY <= 0.86);
  }
});

test('makeElevationSampler is deterministic, varies across seeds, and spans both ocean and elevated land', () => {
  const s1 = makeElevationSampler(42);
  const s2 = makeElevationSampler(42);
  const sOther = makeElevationSampler(77);

  assert.equal(s1(0.35, 0.62), s2(0.35, 0.62));
  assert.notEqual(s1(0.35, 0.62), sOther(0.35, 0.62));

  for (const seed of [7, 42, 108, 512]) {
    const sample = makeElevationSampler(seed);
    let minH = Infinity;
    let maxH = -Infinity;
    for (let iy = 0; iy <= 20; iy++) {
      for (let ix = 0; ix <= 20; ix++) {
        const h = sample(ix / 20, iy / 20);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    assert.ok(minH < -0.1, `seed ${seed} should include ocean below sea level (min=${minH})`);
    assert.ok(maxH > 0.35, `seed ${seed} should include elevated terrain (max=${maxH})`);
  }
});

test('sampleHypsometricColor maps deep ocean, coastal forest, and snow peaks to distinct valid RGB bands', () => {
  const ocean = sampleHypsometricColor(-0.55);
  const forest = sampleHypsometricColor(0.18);
  const snow = sampleHypsometricColor(0.86);

  assert.ok(ocean[2] > ocean[0] && ocean[2] > ocean[1], 'deep ocean is blue-dominant');
  assert.ok(forest[1] > forest[0] && forest[1] > forest[2], 'mid-elevation valleys are green-dominant');
  assert.ok(snow[0] > 235 && snow[1] > 235 && snow[2] > 235, 'high peaks are bright snow');

  for (const h of [-2, -0.55, -0.1, 0, 0.1, 0.4, 0.75, 2]) {
    const [r, g, b] = sampleHypsometricColor(h);
    assert.ok(r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255);
  }
});

test('shadeTopographicPixel illuminates NW-facing slopes brighter than SE-facing slopes and draws contour lines', () => {
  // Off-contour elevation (halfway between contour steps) so hillshading is isolated
  const midH = 2.5 / TOPO_CONTOUR_LEVELS;
  const nwSlope = shadeTopographicPixel(midH, 0.004, 0.004, 480);
  const seSlope = shadeTopographicPixel(midH, -0.004, -0.004, 480);
  const lum = ([r, g, b]: [number, number, number]) => 0.299 * r + 0.587 * g + 0.114 * b;
  assert.ok(lum(nwSlope) > lum(seSlope) + 15, 'NW-facing slope should be noticeably brighter than SE-facing slope');

  // Exact index contour level should be darkened relative to an adjacent off-contour point
  const onContour = shadeTopographicPixel(4 / TOPO_CONTOUR_LEVELS, 0.002, 0.002, 480);
  const offContour = shadeTopographicPixel(4.5 / TOPO_CONTOUR_LEVELS, 0.002, 0.002, 480);
  assert.ok(lum(onContour) < lum(offContour), 'index contour line darkens the terrain');

  // Coastline (h = 0) should be stroked darker than adjacent beach
  const coast = shadeTopographicPixel(0, 0.002, 0.002, 480);
  const beach = shadeTopographicPixel(0.025, 0.002, 0.002, 480);
  assert.ok(lum(coast) < lum(beach) - 40, 'coastline contour contrasts crisply against sandy shore');
});

test('renderTopographicPixels produces a deterministic opaque RGBA buffer that varies with seed', () => {
  const size = 32;
  const a = renderTopographicPixels(size, 42);
  const b = renderTopographicPixels(size, 42);
  const c = renderTopographicPixels(size, 99);

  assert.equal(a.length, size * size * 4);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (let i = 3; i < a.length; i += 4) {
    assert.equal(a[i], 255, 'every pixel is fully opaque');
  }
});

test('renderTopographicPixels upsampled fast path closely matches direct per-pixel sampling and shading', () => {
  const size = 720;
  const seed = 42;
  const fast = renderTopographicPixels(size, seed);
  const sample = makeElevationSampler(seed);

  let totalErr = 0;
  let count = 0;
  for (let py = 12; py < size - 12; py += 23) {
    for (let px = 12; px < size - 12; px += 23) {
      const h = sample(px / size, py / size);
      const dhx = (sample((px + 1) / size, py / size) - sample((px - 1) / size, py / size)) * 0.5;
      const dhy = (sample(px / size, (py + 1) / size) - sample(px / size, (py - 1) / size)) * 0.5;
      const [r, g, b] = shadeTopographicPixel(h, dhx, dhy, size);
      const o = (py * size + px) * 4;
      totalErr += (Math.abs(fast[o] - r) + Math.abs(fast[o + 1] - g) + Math.abs(fast[o + 2] - b)) / 3;
      count++;
    }
  }

  const meanErr = totalErr / count;
  assert.ok(meanErr < 2, `upsampled render should closely match reference (mean RGB error=${meanErr.toFixed(2)})`);
});
