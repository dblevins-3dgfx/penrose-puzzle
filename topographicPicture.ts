// Topographic relief map generator for Jigsaw (spec section 9) as plain
// functions without React or Canvas, so the seeded elevation field, hypsometric
// ramp, directional hillshading, and contour math can be unit-tested
// (topographicPicture.test.ts). ui/topographicPictureDraw.ts paints the pixels.

import { seededRandom } from './jigsaw';
import type { RGB } from './penrosePicture';

export const TOPO_CANVAS_SIZE = 840;
export const TOPO_CONTOUR_LEVELS = 16;

export interface TopoConfig {
  ox: number;
  oy: number;
  peakX: number;
  peakY: number;
  basinX: number;
  basinY: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

// Deterministic geographic anchors (landmass peak, ocean basin, noise offset)
// so every seed gives a distinct, asymmetric map while ?seed= is reproducible.
export const topoConfigForSeed = (seed: number): TopoConfig => {
  const rand = seededRandom((seed ^ 0x1a2b3c4d) >>> 0);
  const ox = rand() * 40 + 5;
  const oy = rand() * 40 + 5;
  const peakX = 0.32 + rand() * 0.36;
  const peakY = 0.32 + rand() * 0.36;
  const basinX = clamp(1 - peakX + (rand() - 0.5) * 0.18, 0.14, 0.86);
  const basinY = clamp(1 - peakY + (rand() - 0.5) * 0.18, 0.14, 0.86);
  return { ox, oy, peakX, peakY, basinX, basinY };
};

const makeFbm = (seed: number): ((x: number, y: number, octaves: number) => number) => {
  const rand = seededRandom((seed ^ 0x9e3779b9) >>> 0);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const gx = new Float64Array(256);
  const gy = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }

  const noise2 = (x: number, y: number): number => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const x1 = lerp(gx[aa] * xf + gy[aa] * yf, gx[ba] * (xf - 1) + gy[ba] * yf, u);
    const x2 = lerp(gx[ab] * xf + gy[ab] * (yf - 1), gx[bb] * (xf - 1) + gy[bb] * (yf - 1), u);
    return lerp(x1, x2, v);
  };

  return (x: number, y: number, octaves: number): number => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise2(x * freq, y * freq);
      freq *= 2.03;
      amp *= 0.5;
    }
    return sum;
  };
};

// Returns a seeded elevation sampler on normalized [0, 1] x [0, 1] coordinates
// (sea level = 0; ocean < 0; land and alpine peaks >= 0).
export const makeElevationSampler = (seed: number): ((nx: number, ny: number) => number) => {
  const { ox, oy, peakX, peakY, basinX, basinY } = topoConfigForSeed(seed);
  const fbm = makeFbm(seed);
  return (nx: number, ny: number): number => {
    const wx = fbm(nx * 2.4 + ox, ny * 2.4 + oy, 3) * 0.42;
    const wy = fbm(nx * 2.4 + ox + 17.3, ny * 2.4 + oy + 9.1, 3) * 0.42;
    let h = fbm(nx * 3.1 + ox + wx, ny * 3.1 + oy + wy, 5) * 0.95;
    const ridge = 1 - Math.abs(fbm(nx * 5.2 + ox + 31, ny * 5.2 + oy + 12, 3));
    h += (ridge * ridge - 0.38) * 0.32;
    const dPeak = Math.hypot(nx - peakX, ny - peakY);
    const dBasin = Math.hypot(nx - basinX, ny - basinY);
    return h + 0.62 * Math.exp(-dPeak * dPeak * 4.5) - 0.58 * Math.exp(-dBasin * dBasin * 4.6) - 0.08;
  };
};

// Hypsometric stops from deep ocean trenches (h < 0) through sandy shores,
// forested valleys, ochre foothills, and rocky alpine snow peaks (h > 0.74).
const HYPSOMETRIC_STOPS: readonly (readonly [number, RGB])[] = [
  [-0.55, [12, 45, 86]],
  [-0.28, [22, 86, 134]],
  [-0.08, [44, 146, 162]],
  [-0.01, [96, 188, 186]],
  [0.0, [232, 214, 166]],
  [0.05, [154, 194, 120]],
  [0.18, [88, 152, 94]],
  [0.34, [66, 118, 82]],
  [0.48, [176, 146, 86]],
  [0.62, [142, 114, 96]],
  [0.74, [202, 196, 192]],
  [0.86, [246, 249, 252]]
];

export const sampleHypsometricColor = (elevation: number): RGB => {
  if (elevation <= HYPSOMETRIC_STOPS[0][0]) return [...HYPSOMETRIC_STOPS[0][1]];
  for (let i = 1; i < HYPSOMETRIC_STOPS.length; i++) {
    const [hi, hiCol] = HYPSOMETRIC_STOPS[i];
    if (elevation <= hi) {
      const [lo, loCol] = HYPSOMETRIC_STOPS[i - 1];
      return mixRgb(loCol, hiCol, (elevation - lo) / (hi - lo));
    }
  }
  return [...HYPSOMETRIC_STOPS[HYPSOMETRIC_STOPS.length - 1][1]];
};

// Combines hypsometric tinting, directional NW hillshading, and uniform-width
// elevation contour lines (with crisp shoreline and thicker index contours).
export const shadeTopographicPixel = (h: number, dhx: number, dhy: number, size: number): RGB => {
  let [r, g, b] = sampleHypsometricColor(h);

  if (h >= 0) {
    const nx = -dhx * size * 0.38;
    const ny = -dhy * size * 0.38;
    const inv = 1 / Math.hypot(nx, ny, 1);
    const shade = (nx * -0.58 + ny * -0.58 + 0.57) * inv;
    const light = clamp(0.76 + (shade - 0.52) * 0.72, 0.58, 1.22);
    r *= light;
    g *= light;
    b *= light;
  } else {
    const depthShade = clamp(0.95 + (dhx + dhy) * size * 0.12, 0.88, 1.06);
    r *= depthShade;
    g *= depthShade;
    b *= depthShade;
  }

  const grad = Math.hypot(dhx, dhy) + 1e-6;
  const scaled = h * TOPO_CONTOUR_LEVELS;
  const nearest = Math.round(scaled);
  const distPx = Math.abs(scaled - nearest) / (grad * TOPO_CONTOUR_LEVELS);
  const isCoast = nearest === 0;
  const isIndex = nearest % 4 === 0;
  const lineScale = size / 480;
  const width = (isCoast ? 1.35 : isIndex ? 0.95 : 0.55) * lineScale;

  if (distPx < width) {
    const strength = isCoast ? 0.78 : isIndex ? 0.45 : h < 0 ? 0.2 : 0.28;
    const alpha = clamp(1 - distPx / width, 0, 1) * strength;
    const ink: RGB = isCoast ? [28, 52, 70] : h < 0 ? [185, 232, 240] : [54, 42, 30];
    r = lerp(r, ink[0], alpha);
    g = lerp(g, ink[1], alpha);
    b = lerp(b, ink[2], alpha);
  }

  return [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)];
};

// Renders a complete RGBA pixel buffer (`size x size`) for the topographic map.
export const renderTopographicPixels = (size: number, seed: number): Uint8ClampedArray => {
  const sample = makeElevationSampler(seed);
  const heights = new Float32Array(size * size);
  const invSize = 1 / size;

  for (let py = 0; py < size; py++) {
    const ny = py * invSize;
    const row = py * size;
    for (let px = 0; px < size; px++) {
      heights[row + px] = sample(px * invSize, ny);
    }
  }

  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    const y0 = py > 0 ? py - 1 : 0;
    const y1 = py < size - 1 ? py + 1 : size - 1;
    const row = py * size;
    for (let px = 0; px < size; px++) {
      const x0 = px > 0 ? px - 1 : 0;
      const x1 = px < size - 1 ? px + 1 : size - 1;
      const idx = row + px;
      const dhx = (heights[row + x1] - heights[row + x0]) * 0.5;
      const dhy = (heights[y1 * size + px] - heights[y0 * size + px]) * 0.5;
      const [r, g, b] = shadeTopographicPixel(heights[idx], dhx, dhy, size);
      const o = idx * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 255;
    }
  }
  return pixels;
};
