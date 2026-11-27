// Placement visual effects for Sandbox mode (spec 7): warm golden lock glow
// and corner glints on the newly placed tile, plus crisp aqua-white seam
// sparks along each newly connected edge (matching Jigsaw's visual language).
import { getVertices, type Point, type Segment, type Tile } from '../rules';

export const SANDBOX_LOCK_MS = 600;
export const SANDBOX_SEAM_MS = 420;

export interface SandboxPlacementEffect {
  tile: Tile;
  seams: Segment[];
  startTime: number;
}

export const hasActiveSandboxEffects = (effects: readonly SandboxPlacementEffect[], now: number): boolean =>
  effects.some(e => now < e.startTime + SANDBOX_LOCK_MS);

export const pruneSandboxEffects = (
  effects: readonly SandboxPlacementEffect[],
  now: number
): SandboxPlacementEffect[] => effects.filter(e => now < e.startTime + SANDBOX_LOCK_MS);

const tracePoints = (ctx: CanvasRenderingContext2D, pts: readonly Point[]) => {
  if (pts.length === 0) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
};

const drawSparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
  if (r <= 0.4) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rad = i % 2 === 0 ? r : r * 0.32;
    if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawTileGlow = (ctx: CanvasRenderingContext2D, tile: Tile, elapsed: number, reducedMotion: boolean) => {
  const t = Math.max(0, Math.min(1, elapsed / SANDBOX_LOCK_MS));
  const easeOut = 1 - (1 - t) ** 3;
  const fade = 1 - easeOut;
  if (fade <= 0.01) return;

  const verts = getVertices(tile);
  ctx.save();
  ctx.beginPath();
  tracePoints(ctx, verts);
  ctx.fillStyle = `rgba(254, 240, 138, ${(0.34 * fade).toFixed(3)})`;
  ctx.fill();

  ctx.lineJoin = 'round';
  ctx.shadowColor = `rgba(251, 191, 36, ${(0.85 * fade).toFixed(3)})`;
  ctx.shadowBlur = 12 * fade;
  ctx.strokeStyle = `rgba(254, 240, 138, ${(0.95 * fade).toFixed(3)})`;
  ctx.lineWidth = 2.2 + 3.2 * easeOut;
  ctx.stroke();
  ctx.restore();

  if (reducedMotion) return;
  const sparkColor = `rgba(254, 249, 195, ${(0.95 * fade).toFixed(3)})`;
  for (const v of verts) {
    const dx = v.x - tile.x;
    const dy = v.y - tile.y;
    const len = Math.hypot(dx, dy) || 1;
    const push = 13 * easeOut;
    drawSparkle(ctx, v.x + (dx / len) * push, v.y + (dy / len) * push, 4.6 * fade, sparkColor);
  }
};

const drawSeamSparks = (
  ctx: CanvasRenderingContext2D,
  seams: readonly Segment[],
  elapsed: number,
  reducedMotion: boolean
) => {
  if (seams.length === 0 || elapsed >= SANDBOX_SEAM_MS) return;
  const t = Math.max(0, Math.min(1, elapsed / SANDBOX_SEAM_MS));
  const easeOut = 1 - (1 - t) ** 3;
  const fade = 1 - easeOut;
  if (fade <= 0.01) return;

  for (const s of seams) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.shadowColor = `rgba(103, 232, 249, ${(0.9 * fade).toFixed(3)})`;
    ctx.shadowBlur = 9 * fade;
    ctx.strokeStyle = `rgba(103, 232, 249, ${(0.88 * fade).toFixed(3)})`;
    ctx.lineWidth = 4.2 + 2.2 * easeOut;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255, 255, 255, ${(0.96 * fade).toFixed(3)})`;
    ctx.lineWidth = 1.8 * fade + 0.4;
    ctx.stroke();
    ctx.restore();

    if (reducedMotion) continue;
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const push = 9 * easeOut;
    drawSparkle(ctx, mx, my, 5.2 * fade, `rgba(255, 255, 255, ${(0.95 * fade).toFixed(3)})`);
    drawSparkle(ctx, mx + nx * push, my + ny * push, 3.2 * fade, `rgba(103, 232, 249, ${(0.9 * fade).toFixed(3)})`);
    drawSparkle(ctx, mx - nx * push, my - ny * push, 3.2 * fade, `rgba(103, 232, 249, ${(0.9 * fade).toFixed(3)})`);
  }
};

export const drawSandboxEffects = (
  ctx: CanvasRenderingContext2D,
  effects: readonly SandboxPlacementEffect[],
  now: number,
  reducedMotion: boolean
) => {
  for (const e of effects) {
    const elapsed = now - e.startTime;
    drawTileGlow(ctx, e.tile, elapsed, reducedMotion);
    drawSeamSparks(ctx, e.seams, elapsed, reducedMotion);
  }
};
