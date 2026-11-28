// Celestial Star Chart (vintage planisphere) picture plugin for Jigsaw
// (spec section 9). Pure seeded layout math (`starChartLayoutForSeed`) is
// unit-tested in pictures/starChart.test.ts; `makeStarChartPicture` paints it
// onto a cached offscreen canvas in the browser.
import type { Point } from '../rules';
import { seededRandom, type Picture, type PicturePlugin } from './types';

export const STAR_CHART_SIZE = 960;

export interface NebulaCloud {
  x: number;
  y: number;
  radius: number;
  innerColor: string;
  outerColor: string;
}

export interface BackgroundStar {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
}

export interface Constellation {
  stars: readonly { x: number; y: number; radius: number }[];
  closeLoop: boolean;
}

export interface StarChartLayout {
  size: number;
  center: Point;
  chartRadius: number;
  milkyWayAngle: number;
  nebulae: readonly NebulaCloud[];
  ecliptic: { center: Point; radius: number };
  stars: readonly BackgroundStar[];
  constellations: readonly Constellation[];
  planet: { x: number; y: number; radius: number; tilt: number };
  moon: { x: number; y: number; radius: number; rotation: number };
  compassRose: { x: number; y: number; radius: number };
}

const NEBULA_STOPS: readonly (readonly [string, string])[] = [
  ['rgba(56, 189, 248, 0.34)', 'rgba(14, 116, 144, 0)'],
  ['rgba(217, 70, 239, 0.28)', 'rgba(112, 26, 117, 0)'],
  ['rgba(251, 146, 60, 0.26)', 'rgba(154, 52, 18, 0)'],
  ['rgba(52, 211, 153, 0.24)', 'rgba(6, 95, 70, 0)']
];

const STAR_TINTS = ['#fef9c3', '#e0f2fe', '#ffffff', '#fed7aa', '#c7d2fe'] as const;

const buildNebulae = (rand: () => number, cx: number, cy: number, R: number, baseA: number): NebulaCloud[] =>
  NEBULA_STOPS.map(([innerColor, outerColor], i) => {
    const a = baseA + (i * Math.PI) / 2 + (rand() - 0.5) * 0.5;
    const distR = R * (0.34 + rand() * 0.32);
    return {
      x: cx + Math.cos(a) * distR,
      y: cy + Math.sin(a) * distR,
      radius: R * (0.42 + rand() * 0.28),
      innerColor,
      outerColor
    };
  });

const buildBackgroundStars = (rand: () => number, size: number): BackgroundStar[] =>
  Array.from({ length: 260 }, () => ({
    x: rand() * size,
    y: rand() * size,
    radius: (0.45 + rand() ** 2.6 * 2.1) * (size / 500),
    alpha: 0.35 + rand() * 0.65,
    color: STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)]
  }));

const buildConstellations = (
  rand: () => number,
  cx: number,
  cy: number,
  R: number,
  size: number,
  baseA: number
): Constellation[] =>
  Array.from({ length: 6 }, (_, c) => {
    const ang = baseA + 0.4 + (c * Math.PI * 2) / 6 + (rand() - 0.5) * 0.3;
    const rad = R * (0.28 + (c % 2) * 0.26 + rand() * 0.14);
    const ox = cx + Math.cos(ang) * rad;
    const oy = cy + Math.sin(ang) * rad;
    const count = 4 + Math.floor(rand() * 3);
    const stars = Array.from({ length: count }, (_, k) => {
      const ka = (k / count) * Math.PI * 2 + rand() * 0.7;
      const kr = R * (0.06 + rand() * 0.14);
      return {
        x: ox + Math.cos(ka) * kr,
        y: oy + Math.sin(ka) * kr,
        radius: (2.2 + rand() * 1.8) * (size / 500)
      };
    });
    return { stars, closeLoop: rand() < 0.45 && stars.length > 3 };
  });

// Deterministic seeded layout for all planisphere elements so ?seed= is
// reproducible while every New puzzle varies nebulae, constellations, and landmarks.
export const starChartLayoutForSeed = (size: number, seed: number): StarChartLayout => {
  const rand = seededRandom((seed ^ 0x7f4a7c15) >>> 0);
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.46;
  const baseA = rand() * Math.PI * 2;
  const nebulae = buildNebulae(rand, cx, cy, R, baseA);
  const milkyWayAngle = rand() * Math.PI;

  const eclA = rand() * Math.PI * 2;
  const eclCenter = { x: cx + Math.cos(eclA) * R * 0.16, y: cy + Math.sin(eclA) * R * 0.16 };
  const eclRadius = R * 0.64;

  const stars = buildBackgroundStars(rand, size);
  const constellations = buildConstellations(rand, cx, cy, R, size, baseA);

  const pAng = eclA + 0.9 + rand() * 1.2;
  const planet = {
    x: eclCenter.x + Math.cos(pAng) * eclRadius,
    y: eclCenter.y + Math.sin(pAng) * eclRadius,
    radius: R * 0.075,
    tilt: -0.35 + (rand() - 0.5) * 0.3
  };

  const mAng = pAng + Math.PI + (rand() - 0.5) * 0.6;
  const moon = {
    x: eclCenter.x + Math.cos(mAng) * eclRadius,
    y: eclCenter.y + Math.sin(mAng) * eclRadius,
    radius: R * 0.068,
    rotation: rand() * 0.8 - 0.4
  };

  const crA = pAng + Math.PI * 0.52;
  const compassRose = {
    x: cx + Math.cos(crA) * R * 0.48,
    y: cy + Math.sin(crA) * R * 0.48,
    radius: R * 0.12
  };

  return {
    size,
    center: { x: cx, y: cy },
    chartRadius: R,
    milkyWayAngle,
    nebulae,
    ecliptic: { center: eclCenter, radius: eclRadius },
    stars,
    constellations,
    planet,
    moon,
    compassRose
  };
};

// ---------------------------------------------------------------------
// Canvas painting
// ---------------------------------------------------------------------

const drawBackdrop = (ctx: CanvasRenderingContext2D, layout: StarChartLayout) => {
  const { size, center, chartRadius: R } = layout;
  const bg = ctx.createRadialGradient(center.x, center.y, R * 0.08, center.x, center.y, size * 0.72);
  bg.addColorStop(0, '#162447');
  bg.addColorStop(0.55, '#0c1632');
  bg.addColorStop(1, '#060b1c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  for (const neb of layout.nebulae) {
    const g = ctx.createRadialGradient(neb.x, neb.y, neb.radius * 0.05, neb.x, neb.y, neb.radius);
    g.addColorStop(0, neb.innerColor);
    g.addColorStop(1, neb.outerColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(layout.milkyWayAngle);
  const mw = ctx.createLinearGradient(0, -R * 0.34, 0, R * 0.34);
  mw.addColorStop(0, 'rgba(186, 230, 253, 0)');
  mw.addColorStop(0.5, 'rgba(224, 242, 254, 0.13)');
  mw.addColorStop(1, 'rgba(186, 230, 253, 0)');
  ctx.fillStyle = mw;
  ctx.fillRect(-size, -R * 0.34, size * 2, R * 0.68);
  ctx.restore();
};

const drawGraticule = (ctx: CanvasRenderingContext2D, layout: StarChartLayout, lw: number) => {
  const { center, chartRadius: R, ecliptic } = layout;
  ctx.save();
  ctx.strokeStyle = 'rgba(234, 197, 114, 0.24)';
  ctx.lineWidth = lw;
  for (const frac of [0.22, 0.44, 0.66, 0.86, 0.96]) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, R * frac, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(center.x + Math.cos(a) * R * 0.22, center.y + Math.sin(a) * R * 0.22);
    ctx.lineTo(center.x + Math.cos(a) * R * 0.96, center.y + Math.sin(a) * R * 0.96);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(250, 214, 134, 0.46)';
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI * 2) / 72;
    const major = i % 6 === 0;
    const r0 = R * (major ? 0.89 : 0.925);
    ctx.lineWidth = major ? lw * 1.4 : lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(center.x + Math.cos(a) * r0, center.y + Math.sin(a) * r0);
    ctx.lineTo(center.x + Math.cos(a) * R * 0.96, center.y + Math.sin(a) * R * 0.96);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.58)';
  ctx.lineWidth = lw * 1.6;
  ctx.setLineDash([lw * 6, lw * 4]);
  ctx.beginPath();
  ctx.arc(ecliptic.center.x, ecliptic.center.y, ecliptic.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const drawStarSparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
  g.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 2.1);
  ctx.quadraticCurveTo(x, y, x + r * 2.1, y);
  ctx.quadraticCurveTo(x, y, x, y + r * 2.1);
  ctx.quadraticCurveTo(x, y, x - r * 2.1, y);
  ctx.quadraticCurveTo(x, y, x, y - r * 2.1);
  ctx.fill();
};

const drawStarsAndConstellations = (ctx: CanvasRenderingContext2D, layout: StarChartLayout, lw: number) => {
  ctx.save();
  for (const s of layout.stars) {
    ctx.fillStyle = s.color;
    ctx.globalAlpha = s.alpha;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const con of layout.constellations) {
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.65)';
    ctx.lineWidth = lw * 1.25;
    ctx.beginPath();
    con.stars.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (con.closeLoop && con.stars.length > 3) ctx.lineTo(con.stars[1].x, con.stars[1].y);
    ctx.stroke();
    for (const p of con.stars) drawStarSparkle(ctx, p.x, p.y, p.radius);
  }
  ctx.restore();
};

const drawLandmarks = (ctx: CanvasRenderingContext2D, layout: StarChartLayout, lw: number) => {
  const { planet, moon, compassRose } = layout;

  // Ringed golden planet
  ctx.save();
  ctx.translate(planet.x, planet.y);
  ctx.rotate(planet.tilt);
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = lw * 2.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, planet.radius * 2.1, planet.radius * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  const pg = ctx.createRadialGradient(
    -planet.radius * 0.3,
    -planet.radius * 0.3,
    planet.radius * 0.1,
    0,
    0,
    planet.radius
  );
  pg.addColorStop(0, '#fef08a');
  pg.addColorStop(0.55, '#d97706');
  pg.addColorStop(1, '#78350f');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(0, 0, planet.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = lw * 2.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, planet.radius * 2.1, planet.radius * 0.62, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();

  // Crescent moon
  ctx.save();
  ctx.translate(moon.x, moon.y);
  ctx.rotate(moon.rotation);
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.arc(0, 0, moon.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0e1b3c';
  ctx.beginPath();
  ctx.arc(moon.radius * 0.42, -moon.radius * 0.1, moon.radius * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ornate 8-point brass compass rose
  ctx.save();
  ctx.translate(compassRose.x, compassRose.y);
  for (let i = 0; i < 8; i++) {
    const len = i % 2 === 0 ? compassRose.radius : compassRose.radius * 0.68;
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    ctx.fillStyle = i % 2 === 0 ? '#f59e0b' : '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(len * 0.16, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = i % 2 === 0 ? '#fef08a' : '#64748b';
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(-len * 0.16, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.arc(0, 0, compassRose.radius * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

let cached: { seed: number; picture: Picture } | null = null;

export const makeStarChartPicture = (seed: number): Picture => {
  if (cached && cached.seed === seed) return cached.picture;

  const size = STAR_CHART_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { image: canvas, width: size, height: size };

  const layout = starChartLayoutForSeed(size, seed);
  const lw = Math.max(0.8, size / 560);

  drawBackdrop(ctx, layout);
  drawGraticule(ctx, layout, lw);
  drawStarsAndConstellations(ctx, layout, lw);
  drawLandmarks(ctx, layout, lw);

  const picture: Picture = { image: canvas, width: size, height: size };
  cached = { seed, picture };
  return picture;
};

export const starChartPlugin: PicturePlugin<'starchart'> = {
  id: 'starchart',
  label: 'Celestial Star Chart',
  render: ({ seed }) => makeStarChartPicture(seed)
};
