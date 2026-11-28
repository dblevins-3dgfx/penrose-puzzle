// Topographic Relief Map picture plugin for Jigsaw (spec section 9).
// Pure elevation, hypsometric color, hillshading, and contour math is
// unit-tested in pictures/topographic.test.ts; `makeTopographicPicture` paints
// the pixels onto a cached offscreen canvas when invoked in the browser.
import { seededRandom, type Picture, type PicturePlugin, type RGB } from './types';

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

const TOPO_MAX_COARSE_STEP = 3;
const TOPO_MIN_COARSE_SAMPLES = 240;
const LUT_SIZE = 2048;
const LUT_MIN = -0.55;
const LUT_MAX = 0.86;
const LUT_SCALE = (LUT_SIZE - 1) / (LUT_MAX - LUT_MIN);

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

  return (x0: number, y0: number, octaves: number): number => {
    let sum = 0;
    let amp = 0.5;
    let fx = x0;
    let fy = y0;
    for (let i = 0; i < octaves; i++) {
      const ix0 = Math.floor(fx);
      const iy0 = Math.floor(fy);
      const xi = ix0 & 255;
      const yi = iy0 & 255;
      const xf = fx - ix0;
      const yf = fy - iy0;
      const u = fade(xf);
      const v = fade(yf);
      const pxi = perm[xi];
      const pxi1 = perm[xi + 1];
      const aa = perm[pxi + yi];
      const ab = perm[pxi + yi + 1];
      const ba = perm[pxi1 + yi];
      const bb = perm[pxi1 + yi + 1];
      const xf1 = xf - 1;
      const yf1 = yf - 1;
      const n00 = gx[aa] * xf + gy[aa] * yf;
      const n10 = gx[ba] * xf1 + gy[ba] * yf;
      const n01 = gx[ab] * xf + gy[ab] * yf1;
      const n11 = gx[bb] * xf1 + gy[bb] * yf1;
      const x1 = n00 + (n10 - n00) * u;
      const x2 = n01 + (n11 - n01) * u;
      sum += amp * (x1 + (x2 - x1) * v);
      fx *= 2.03;
      fy *= 2.03;
      amp *= 0.5;
    }
    return sum;
  };
};

// Smooth warped base terrain (without the sharp |ridge| crease) so it can be
// bicubically upsampled without ringing.
const sampleBaseElevation = (
  nx: number,
  ny: number,
  cfg: TopoConfig,
  fbm: (x: number, y: number, octaves: number) => number
): number => {
  const { ox, oy, peakX, peakY, basinX, basinY } = cfg;
  const wx = fbm(nx * 2.4 + ox, ny * 2.4 + oy, 3) * 0.42;
  const wy = fbm(nx * 2.4 + ox + 17.3, ny * 2.4 + oy + 9.1, 3) * 0.42;
  const h = fbm(nx * 3.1 + ox + wx, ny * 3.1 + oy + wy, 5) * 0.95;
  const dxp = nx - peakX;
  const dyp = ny - peakY;
  const dxb = nx - basinX;
  const dyb = ny - basinY;
  return h + 0.62 * Math.exp(-(dxp * dxp + dyp * dyp) * 4.5) - 0.58 * Math.exp(-(dxb * dxb + dyb * dyb) * 4.6) - 0.08;
};

const sampleRidgeSignal = (
  nx: number,
  ny: number,
  cfg: TopoConfig,
  fbm: (x: number, y: number, octaves: number) => number
): number => fbm(nx * 5.2 + cfg.ox + 31, ny * 5.2 + cfg.oy + 12, 3);

const ridgeContribution = (ridgeNoise: number): number => {
  const ridge = 1 - Math.abs(ridgeNoise);
  return (ridge * ridge - 0.38) * 0.32;
};

// Returns a seeded elevation sampler on normalized [0, 1] x [0, 1] coordinates
// (sea level = 0; ocean < 0; land and alpine peaks >= 0).
export const makeElevationSampler = (seed: number): ((nx: number, ny: number) => number) => {
  const cfg = topoConfigForSeed(seed);
  const fbm = makeFbm(seed);
  return (nx: number, ny: number): number =>
    sampleBaseElevation(nx, ny, cfg, fbm) + ridgeContribution(sampleRidgeSignal(nx, ny, cfg, fbm));
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

// Precomputed O(1) hypsometric color lookup table for the hot pixel shading loop.
const HYPSOMETRIC_LUT_R = new Float32Array(LUT_SIZE);
const HYPSOMETRIC_LUT_G = new Float32Array(LUT_SIZE);
const HYPSOMETRIC_LUT_B = new Float32Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const [r, g, b] = sampleHypsometricColor(LUT_MIN + (i / (LUT_SIZE - 1)) * (LUT_MAX - LUT_MIN));
  HYPSOMETRIC_LUT_R[i] = r;
  HYPSOMETRIC_LUT_G[i] = g;
  HYPSOMETRIC_LUT_B[i] = b;
}

// Combines hypsometric tinting, directional NW hillshading, and uniform-width
// elevation contour lines (with crisp shoreline and thicker index contours).
export const shadeTopographicPixel = (h: number, dhx: number, dhy: number, size: number): RGB => {
  let [r, g, b] = sampleHypsometricColor(h);

  if (h >= 0) {
    const nx = -dhx * size * 0.38;
    const ny = -dhy * size * 0.38;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
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

  const grad = Math.sqrt(dhx * dhx + dhy * dhy) + 1e-6;
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

interface CatmullWeights {
  w0: Float32Array;
  w1: Float32Array;
  w2: Float32Array;
  w3: Float32Array;
}

const makeCatmullWeights = (step: number): CatmullWeights => {
  const w0 = new Float32Array(step);
  const w1 = new Float32Array(step);
  const w2 = new Float32Array(step);
  const w3 = new Float32Array(step);
  const invStep = 1 / step;
  for (let s = 0; s < step; s++) {
    const t = s * invStep;
    const t2 = t * t;
    const t3 = t2 * t;
    w0[s] = 0.5 * (-t + 2 * t2 - t3);
    w1[s] = 0.5 * (2 - 5 * t2 + 3 * t3);
    w2[s] = 0.5 * (t + 4 * t2 - 3 * t3);
    w3[s] = 0.5 * (-t2 + t3);
  }
  return { w0, w1, w2, w3 };
};

const upsampleHorizontal = (
  coarse: Float32Array,
  padW: number,
  size: number,
  step: number,
  weights: CatmullWeights,
  horiz: Float32Array
): void => {
  const { w0, w1, w2, w3 } = weights;
  for (let gy = 0; gy < padW; gy++) {
    const crow = gy * padW;
    const hrow = gy * size;
    let g = 0;
    let s = 0;
    for (let px = 0; px < size; px++) {
      const c = crow + g;
      horiz[hrow + px] =
        s === 0
          ? coarse[c + 1]
          : w0[s] * coarse[c] + w1[s] * coarse[c + 1] + w2[s] * coarse[c + 2] + w3[s] * coarse[c + 3];
      s++;
      if (s === step) {
        s = 0;
        g++;
      }
    }
  }
};

const upsampleVertical = (
  horiz: Float32Array,
  size: number,
  step: number,
  weights: CatmullWeights,
  heights: Float32Array,
  addAsRidge: boolean
): void => {
  const { w0, w1, w2, w3 } = weights;
  let g = 0;
  let s = 0;
  for (let py = 0; py < size; py++) {
    const outRow = py * size;
    const r0 = g * size;
    const r1 = r0 + size;
    if (s === 0 && !addAsRidge) {
      heights.set(horiz.subarray(r1, r1 + size), outRow);
    } else {
      const r2 = r1 + size;
      const r3 = r2 + size;
      const k0 = w0[s];
      const k1 = w1[s];
      const k2 = w2[s];
      const k3 = w3[s];
      for (let px = 0; px < size; px++) {
        const val =
          s === 0
            ? horiz[r1 + px]
            : k0 * horiz[r0 + px] + k1 * horiz[r1 + px] + k2 * horiz[r2 + px] + k3 * horiz[r3 + px];
        if (addAsRidge) heights[outRow + px] += ridgeContribution(val);
        else heights[outRow + px] = val;
      }
    }
    s++;
    if (s === step) {
      s = 0;
      g++;
    }
  }
};

// Samples the smooth base and ridge noise fields on a coarse grid (`1/step`
// resolution) and bicubically upsamples both before applying the sharp |ridge|
// crease at full pixel resolution, cutting FBM evaluations by ~9x at canvas
// resolution with no ridge ringing artifacts. Keeps >= 240 coarse samples
// across [0, 1] so all 5 FBM octaves (~53 cycles max) stay well above Nyquist.
const buildElevationGrid = (size: number, seed: number): Float32Array => {
  const heights = new Float32Array(size * size);
  const invSize = 1 / size;
  const step = Math.min(TOPO_MAX_COARSE_STEP, Math.max(1, Math.floor(size / TOPO_MIN_COARSE_SAMPLES)));

  if (step === 1) {
    const sample = makeElevationSampler(seed);
    for (let py = 0; py < size; py++) {
      const ny = py * invSize;
      const row = py * size;
      for (let px = 0; px < size; px++) {
        heights[row + px] = sample(px * invSize, ny);
      }
    }
    return heights;
  }

  const cfg = topoConfigForSeed(seed);
  const fbm = makeFbm(seed);
  const padW = Math.ceil((size - 1) / step) + 3;
  const coarseBase = new Float32Array(padW * padW);
  const coarseRidge = new Float32Array(padW * padW);
  const stepNorm = step * invSize;

  for (let gy = 0; gy < padW; gy++) {
    const ny = (gy - 1) * stepNorm;
    const crow = gy * padW;
    for (let gx = 0; gx < padW; gx++) {
      const nx = (gx - 1) * stepNorm;
      coarseBase[crow + gx] = sampleBaseElevation(nx, ny, cfg, fbm);
      coarseRidge[crow + gx] = sampleRidgeSignal(nx, ny, cfg, fbm);
    }
  }

  const weights = makeCatmullWeights(step);
  const horiz = new Float32Array(padW * size);
  upsampleHorizontal(coarseBase, padW, size, step, weights, horiz);
  upsampleVertical(horiz, size, step, weights, heights, false);
  upsampleHorizontal(coarseRidge, padW, size, step, weights, horiz);
  upsampleVertical(horiz, size, step, weights, heights, true);
  return heights;
};

const writeContourPixel = (
  pixels: Uint8ClampedArray<ArrayBuffer>,
  o: number,
  r: number,
  g: number,
  b: number,
  h: number,
  nearest: number,
  dLevel: number,
  grad2: number,
  lineScale: number
): void => {
  const isCoast = nearest === 0;
  const isIndex = (nearest & 3) === 0;
  const width = (isCoast ? 1.35 : isIndex ? 0.95 : 0.55) * lineScale;
  const distPx = dLevel / ((Math.sqrt(grad2) + 1e-6) * TOPO_CONTOUR_LEVELS);
  if (distPx < width) {
    const strength = isCoast ? 0.78 : isIndex ? 0.45 : h < 0 ? 0.2 : 0.28;
    const alpha = (1 - distPx / width) * strength;
    const ir = isCoast ? 28 : h < 0 ? 185 : 54;
    const ig = isCoast ? 52 : h < 0 ? 232 : 42;
    const ib = isCoast ? 70 : h < 0 ? 240 : 30;
    pixels[o] = r + (ir - r) * alpha;
    pixels[o + 1] = g + (ig - g) * alpha;
    pixels[o + 2] = b + (ib - b) * alpha;
  } else {
    pixels[o] = r;
    pixels[o + 1] = g;
    pixels[o + 2] = b;
  }
  pixels[o + 3] = 255;
};

const shadeHeightsToRgba = (heights: Float32Array, size: number): Uint8ClampedArray<ArrayBuffer> => {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const hillScale = size * 0.38;
  const hillScale2 = hillScale * hillScale;
  const depthScale = size * 0.12;
  const lineScale = size / 480;
  const maxWidthLevels2 = (1.35 * lineScale * TOPO_CONTOUR_LEVELS) ** 2;
  const lutLast = LUT_SIZE - 1;

  for (let py = 0; py < size; py++) {
    const row = py * size;
    const row0 = (py > 0 ? py - 1 : 0) * size;
    const row1 = (py < size - 1 ? py + 1 : size - 1) * size;
    for (let px = 0; px < size; px++) {
      const idx = row + px;
      const h = heights[idx];
      const dhx = (heights[row + (px < size - 1 ? px + 1 : size - 1)] - heights[row + (px > 0 ? px - 1 : 0)]) * 0.5;
      const dhy = (heights[row1 + px] - heights[row0 + px]) * 0.5;

      const li = h <= LUT_MIN ? 0 : h >= LUT_MAX ? lutLast : ((h - LUT_MIN) * LUT_SCALE + 0.5) | 0;
      const grad2 = dhx * dhx + dhy * dhy;
      const light =
        h >= 0
          ? clamp(
              0.76 + (((dhx + dhy) * hillScale * 0.58 + 0.57) / Math.sqrt(grad2 * hillScale2 + 1) - 0.52) * 0.72,
              0.58,
              1.22
            )
          : clamp(0.95 + (dhx + dhy) * depthScale, 0.88, 1.06);
      const r = HYPSOMETRIC_LUT_R[li] * light;
      const g = HYPSOMETRIC_LUT_G[li] * light;
      const b = HYPSOMETRIC_LUT_B[li] * light;

      const o = idx * 4;
      const scaled = h * TOPO_CONTOUR_LEVELS;
      const nearest = Math.round(scaled);
      const dLevel = Math.abs(scaled - nearest);
      // Fast reject pixels too far from any contour level without taking sqrt.
      if (dLevel * dLevel < maxWidthLevels2 * (grad2 + 1e-12)) {
        writeContourPixel(pixels, o, r, g, b, h, nearest, dLevel, grad2, lineScale);
      } else {
        pixels[o] = r;
        pixels[o + 1] = g;
        pixels[o + 2] = b;
        pixels[o + 3] = 255;
      }
    }
  }
  return pixels;
};

// Renders a complete RGBA pixel buffer (`size x size`) for the topographic map.
export const renderTopographicPixels = (size: number, seed: number): Uint8ClampedArray<ArrayBuffer> =>
  shadeHeightsToRgba(buildElevationGrid(size, seed), size);

let cached: { seed: number; picture: Picture } | null = null;

export const makeTopographicPicture = (seed: number): Picture => {
  if (cached && cached.seed === seed) return cached.picture;

  const size = TOPO_CANVAS_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { image: canvas, width: size, height: size };

  const pixels = renderTopographicPixels(size, seed);
  ctx.putImageData(new ImageData(pixels, size, size), 0, 0);

  // Subtle cartographic graticule hairlines across the relief map
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 252, 240, 0.16)';
  ctx.lineWidth = Math.max(0.75, size / 560);
  const step = size / 6;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  ctx.restore();

  const picture: Picture = { image: canvas, width: size, height: size };
  cached = { seed, picture };
  return picture;
};

export const topographicPlugin: PicturePlugin<'topographic'> = {
  id: 'topographic',
  label: 'Topographic Map',
  render: ({ seed }) => makeTopographicPicture(seed)
};
