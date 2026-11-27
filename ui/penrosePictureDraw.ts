// Renders the three Penrose tiling pictures (spec 9) onto an offscreen canvas
// using a stained-glass palette gradient and Conway's circular matching arcs.
// All tiling and arc geometry comes from penrosePicture.ts; this only paints.
import { centroidOf, type Tile } from '../rules';
import { boundsOf, coverRect } from '../jigsaw';
import { pictureTiles, tileArcs, type CircularArc, type PenrosePictureStyle, type TilingTile } from '../penrosePicture';
import type { Picture } from './jigsawDraw';

type RGB = [number, number, number];

// Four harmonious jewel-tone corners for a smooth stained-glass wash across
// the solved puzzle so pieces from different regions are easy to tell apart.
const TOP_LEFT: RGB = [234, 152, 46]; // warm golden amber
const TOP_RIGHT: RGB = [196, 61, 108]; // ruby rose
const BOTTOM_LEFT: RGB = [28, 156, 152]; // peacock teal
const BOTTOM_RIGHT: RGB = [66, 78, 184]; // royal sapphire

const KITE_TINT: RGB = [255, 248, 232];
const DART_SHADE: RGB = [15, 23, 42];

const BG_COLOR = '#0f172a';
const LEAD_COLOR = 'rgba(15, 23, 42, 0.42)';
const ARC_CASING = 'rgba(15, 23, 42, 0.78)';
const PRIMARY_ARC_COLOR = '#fef08a'; // luminous warm gold (kite O, dart M)
const SECONDARY_ARC_COLOR = '#67e8f9'; // crisp aqua cyan (kite C, dart A')

const RENDER_SCALE = 2;

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const tileFill = (tile: TilingTile, box: { x: number; y: number; w: number; h: number }): string => {
  const c = centroidOf(tile.vertices);
  const u = clamp01((c.x - box.x) / (box.w || 1));
  const v = clamp01((c.y - box.y) / (box.h || 1));
  const base = mix(mix(TOP_LEFT, TOP_RIGHT, u), mix(BOTTOM_LEFT, BOTTOM_RIGHT, u), v);
  const shaded = tile.type === 'kite' ? mix(base, KITE_TINT, 0.16) : mix(base, DART_SHADE, 0.26);
  return `rgb(${Math.round(shaded[0])}, ${Math.round(shaded[1])}, ${Math.round(shaded[2])})`;
};

const traceTile = (ctx: CanvasRenderingContext2D, tile: TilingTile) => {
  const [v0, v1, v2, v3] = tile.vertices;
  ctx.beginPath();
  ctx.moveTo(v0.x, v0.y);
  ctx.lineTo(v1.x, v1.y);
  ctx.lineTo(v2.x, v2.y);
  ctx.lineTo(v3.x, v3.y);
  ctx.closePath();
};

const strokeArcs = (ctx: CanvasRenderingContext2D, arcs: CircularArc[], color: string, width: number) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const a of arcs) {
    ctx.moveTo(a.center.x + a.radius * Math.cos(a.startAngle), a.center.y + a.radius * Math.sin(a.startAngle));
    ctx.arc(a.center.x, a.center.y, a.radius, a.startAngle, a.endAngle, a.anticlockwise);
  }
  ctx.stroke();
  ctx.restore();
};

export const makePenrosePicture = (
  style: PenrosePictureStyle,
  homes: readonly Tile[],
  seed: number,
  pixelScale = RENDER_SCALE
): Picture => {
  const canvas = document.createElement('canvas');
  if (homes.length === 0) {
    canvas.width = 1;
    canvas.height = 1;
    return { image: canvas, width: 1, height: 1 };
  }

  const box = boundsOf(homes);
  const scale = Math.max(RENDER_SCALE, Math.min(4, Math.ceil(pixelScale)));
  canvas.width = Math.max(1, Math.round(box.w * scale));
  canvas.height = Math.max(1, Math.round(box.h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { image: canvas, width: canvas.width, height: canvas.height };

  // Align board coordinates to the exact rect drawJigsaw will map this canvas onto.
  const rect = coverRect(canvas.width, canvas.height, box);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(canvas.width / rect.w, canvas.height / rect.h);
  ctx.translate(-rect.x, -rect.y);

  const tiles = pictureTiles(style, homes, seed);
  const longEdge = tiles[0]?.longEdge ?? 40;

  // 1. Stained-glass tile fills and subtle lead lines
  ctx.strokeStyle = LEAD_COLOR;
  ctx.lineWidth = Math.max(0.75, longEdge * 0.032);
  ctx.lineJoin = 'round';
  for (const tile of tiles) {
    traceTile(ctx, tile);
    ctx.fillStyle = tileFill(tile, box);
    ctx.fill();
    ctx.stroke();
  }

  // 2. Circular matching arcs: casings first so tangent arcs never cut each other
  const primary: CircularArc[] = [];
  const secondary: CircularArc[] = [];
  for (const tile of tiles) {
    const [p, s] = tileArcs(tile);
    primary.push(p);
    secondary.push(s);
  }

  const casingWidth = Math.max(2.6, longEdge * 0.135);
  const arcWidth = Math.max(1.4, longEdge * 0.072);
  strokeArcs(ctx, [...primary, ...secondary], ARC_CASING, casingWidth);
  strokeArcs(ctx, primary, PRIMARY_ARC_COLOR, arcWidth);
  strokeArcs(ctx, secondary, SECONDARY_ARC_COLOR, arcWidth);

  ctx.restore();
  return { image: canvas, width: canvas.width, height: canvas.height };
};
