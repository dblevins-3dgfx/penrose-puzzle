// Renders the Topographic Relief Map built-in Jigsaw picture (spec section 9)
// onto a cached offscreen canvas. All elevation, hypsometric color, shading,
// and contour math lives in topographicPicture.ts; this only paints.
import { renderTopographicPixels, TOPO_CANVAS_SIZE } from '../topographicPicture';
import type { Picture } from './jigsawDraw';

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
  const img = new ImageData(new Uint8ClampedArray(pixels), size, size);
  ctx.putImageData(img, 0, 0);

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
