// Celebratory canvas animations for Jigsaw mode (spec 9):
// 0. Loose-piece snap: crisp aqua-white flash and micro-sparks along the shared seam.
// 1. Piece locked: subtle golden outline pulse, soft fill flash, and corner glints.
// 2. Outer border completed: golden light wave chasing around the outer perimeter.
// 3. Puzzle finished: glossy sheen sweep across the completed picture + Penrose
//    kite-and-dart confetti burst in the stained-glass palette.
import { getVertices, type BoardSize, type Point, type TileType } from '../rules';
import { boundsOf, pieceTile, type CelebrationEvents, type JoinedSeam, type Piece } from '../jigsaw';

export const SNAP_DURATION_MS = 420;
export const LOCK_DURATION_MS = 600;
export const BORDER_DURATION_MS = 1600;
export const SOLVE_DURATION_MS = 3400;
export const BORDER_TOAST_MS = 2400;

const CONFETTI_COUNT = 56;
// Stained-glass jewel palette matching pictures/penrose.ts
const CONFETTI_COLORS = ['#ea982e', '#c43d6c', '#1c9c98', '#424eb8', '#fef08a', '#67e8f9'];

const UNIT_KITE = getVertices({ type: 'kite', x: 0, y: 0, rotation: 0 });
const UNIT_DART = getVertices({ type: 'dart', x: 0, y: 0, rotation: 0 });

export interface SnapSparkEffect {
  seams: JoinedSeam[];
  startTime: number;
  duration: number;
}

export interface LockPulseEffect {
  pieceIds: number[];
  startTime: number;
  duration: number;
}

export interface BorderWaveEffect {
  startTime: number;
  duration: number;
}

export interface ConfettiParticle {
  type: TileType;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  tumblePhase: number;
  tumbleSpeed: number;
  scale: number;
  delay: number;
}

export interface SolveFinaleEffect {
  startTime: number;
  duration: number;
  confetti: ConfettiParticle[];
}

export interface ActiveEffects {
  snaps: SnapSparkEffect[];
  locks: LockPulseEffect[];
  border: BorderWaveEffect | null;
  solve: SolveFinaleEffect | null;
}

export const emptyEffects = (): ActiveEffects => ({ snaps: [], locks: [], border: null, solve: null });

export const hasActiveEffects = (effects: ActiveEffects, now: number): boolean =>
  effects.snaps.some(e => now < e.startTime + e.duration) ||
  effects.locks.some(e => now < e.startTime + e.duration) ||
  (effects.border !== null && now < effects.border.startTime + effects.border.duration) ||
  (effects.solve !== null && now < effects.solve.startTime + effects.solve.duration);

export const pruneEffects = (effects: ActiveEffects, now: number): ActiveEffects => ({
  snaps: effects.snaps.filter(e => now < e.startTime + e.duration),
  locks: effects.locks.filter(e => now < e.startTime + e.duration),
  border: effects.border && now < effects.border.startTime + effects.border.duration ? effects.border : null,
  solve: effects.solve && now < effects.solve.startTime + effects.solve.duration ? effects.solve : null
});

export const hasCelebrationEvents = (events: CelebrationEvents): boolean =>
  events.newlyLockedIds.length > 0 || events.joinedSeams.length > 0 || events.borderCompleted || events.puzzleSolved;

export const applyCelebrationEvents = (
  current: ActiveEffects,
  events: CelebrationEvents,
  now: number,
  viewport: BoardSize
): ActiveEffects => {
  const next = pruneEffects(current, now);
  if (events.joinedSeams.length > 0) {
    next.snaps = [...next.snaps, { seams: events.joinedSeams, startTime: now, duration: SNAP_DURATION_MS }];
  }
  if (events.newlyLockedIds.length > 0) {
    next.locks = [...next.locks, { pieceIds: events.newlyLockedIds, startTime: now, duration: LOCK_DURATION_MS }];
  }
  if (events.borderCompleted) {
    next.border = { startTime: now, duration: BORDER_DURATION_MS };
  }
  if (events.puzzleSolved) {
    next.solve = { startTime: now, duration: SOLVE_DURATION_MS, confetti: createConfetti(viewport) };
  }
  return next;
};

export const createConfetti = (viewport: BoardSize): ConfettiParticle[] => {
  const cx = viewport.width / 2;
  const cy = viewport.height * 0.44;
  const spreadX = Math.min(viewport.width * 0.34, 240);
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 220 + Math.random() * 340;
    particles.push({
      type: i % 2 === 0 ? 'kite' : 'dart',
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      x: cx + (Math.random() - 0.5) * spreadX,
      y: cy + (Math.random() - 0.5) * 70,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 7,
      tumblePhase: Math.random() * Math.PI * 2,
      tumbleSpeed: 4 + Math.random() * 6,
      scale: 0.17 + Math.random() * 0.13,
      delay: Math.random() * 0.22
    });
  }
  return particles;
};

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

const drawLockPulse = (
  ctx: CanvasRenderingContext2D,
  byId: Map<number, Piece>,
  effect: LockPulseEffect,
  now: number,
  reducedMotion: boolean
) => {
  const t = Math.max(0, Math.min(1, (now - effect.startTime) / effect.duration));
  const easeOut = 1 - (1 - t) ** 3;
  const fade = 1 - easeOut;
  if (fade <= 0.01) return;

  const locked = effect.pieceIds.map(id => byId.get(id)).filter((p): p is Piece => !!p && p.locked);
  if (locked.length === 0) return;

  ctx.save();
  ctx.beginPath();
  for (const p of locked) tracePoints(ctx, getVertices(p.home));
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
  for (const p of locked) {
    const verts = getVertices(p.home);
    for (const v of verts) {
      const dx = v.x - p.home.x;
      const dy = v.y - p.home.y;
      const len = Math.hypot(dx, dy) || 1;
      const push = 13 * easeOut;
      drawSparkle(ctx, v.x + (dx / len) * push, v.y + (dy / len) * push, 4.6 * fade, sparkColor);
    }
  }
};

interface LoopSeg {
  a: Point;
  b: Point;
  start: number;
  len: number;
}

const buildLoopSegments = (loop: readonly Point[]): { segs: LoopSeg[]; total: number } => {
  const segs: LoopSeg[] = [];
  let total = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, start: total, len });
    total += len;
  }
  return { segs, total };
};

const sampleLoop = (segs: readonly LoopSeg[], total: number, rawDist: number): Point => {
  const d = ((rawDist % total) + total) % total;
  for (const s of segs) {
    if (d <= s.start + s.len || s === segs[segs.length - 1]) {
      const u = s.len > 0 ? Math.max(0, Math.min(1, (d - s.start) / s.len)) : 0;
      return { x: s.a.x + (s.b.x - s.a.x) * u, y: s.a.y + (s.b.y - s.a.y) * u };
    }
  }
  return segs[0].a;
};

const drawBorderGlow = (ctx: CanvasRenderingContext2D, loops: readonly Point[][], alpha: number) => {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const loop of loops) tracePoints(ctx, loop);
  ctx.shadowColor = `rgba(251, 191, 36, ${(0.95 * alpha).toFixed(3)})`;
  ctx.shadowBlur = 16 * alpha;
  ctx.strokeStyle = `rgba(251, 191, 36, ${(0.75 * alpha).toFixed(3)})`;
  ctx.lineWidth = 7.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(254, 249, 195, ${(0.92 * alpha).toFixed(3)})`;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();
};

const drawComet = (
  ctx: CanvasRenderingContext2D,
  segs: readonly LoopSeg[],
  total: number,
  headDist: number,
  trailLen: number,
  fade: number,
  color: string
) => {
  const steps = 12;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < steps; i++) {
    const f0 = i / steps;
    const f1 = (i + 1) / steps;
    const p0 = sampleLoop(segs, total, headDist - f0 * trailLen);
    const p1 = sampleLoop(segs, total, headDist - f1 * trailLen);
    ctx.strokeStyle = color;
    ctx.globalAlpha = fade * (1 - f0) * 0.9;
    ctx.lineWidth = (1 - f0) * 6.5 + 1;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  const head = sampleLoop(segs, total, headDist);
  ctx.globalAlpha = fade;
  drawSparkle(ctx, head.x, head.y, 8.5 * fade, '#ffffff');
  ctx.restore();
};

const drawBorderWave = (
  ctx: CanvasRenderingContext2D,
  loops: readonly Point[][],
  effect: BorderWaveEffect,
  now: number,
  reducedMotion: boolean
) => {
  if (loops.length === 0) return;
  const t = Math.max(0, Math.min(1, (now - effect.startTime) / effect.duration));
  const pulse = Math.sin(Math.PI * t);
  drawBorderGlow(ctx, loops, pulse * (reducedMotion ? 0.9 : 0.72));
  if (reducedMotion) return;

  const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const fade = t < 0.8 ? 1 : (1 - t) / 0.2;
  for (const loop of loops) {
    const { segs, total } = buildLoopSegments(loop);
    if (total <= 0) continue;
    const trail = Math.min(total * 0.18, 120);
    const travel = total * 1.15 * eased;
    drawComet(ctx, segs, total, travel, trail, fade, '#fef08a');
    drawComet(ctx, segs, total, travel + total * 0.5, trail, fade, '#67e8f9');
  }
};

const drawSolveSheen = (
  ctx: CanvasRenderingContext2D,
  pieces: readonly Piece[],
  loops: readonly Point[][],
  effect: SolveFinaleEffect,
  now: number,
  reducedMotion: boolean
) => {
  const elapsed = now - effect.startTime;
  const haloT = Math.max(0, Math.min(1, elapsed / 2200));
  if (haloT < 1) drawBorderGlow(ctx, loops, Math.sin(Math.PI * haloT) * 0.9);
  if (reducedMotion || elapsed > 1350 || pieces.length === 0) return;

  const st = Math.max(0, Math.min(1, elapsed / 1350));
  const homes = pieces.map(p => p.home);
  const box = boundsOf(homes);
  const span = box.w + box.h;
  const bandW = Math.max(48, span * 0.24);
  const offset = -bandW + (span + bandW * 2) * st;
  const alpha = Math.sin(Math.PI * st) * 0.62;

  ctx.save();
  ctx.beginPath();
  for (const h of homes) tracePoints(ctx, getVertices(h));
  ctx.clip();

  const x0 = box.x + offset;
  const y0 = box.y;
  const grad = ctx.createLinearGradient(x0 - bandW, y0 - bandW, x0 + bandW, y0 + bandW);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.45, `rgba(254, 249, 195, ${alpha.toFixed(3)})`);
  grad.addColorStop(0.55, `rgba(255, 255, 255, ${(alpha * 1.2).toFixed(3)})`);
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(box.x - 20, box.y - 20, box.w + 40, box.h + 40);
  ctx.restore();
};

const drawSnapSpark = (
  ctx: CanvasRenderingContext2D,
  byId: Map<number, Piece>,
  effect: SnapSparkEffect,
  now: number,
  reducedMotion: boolean
) => {
  const t = Math.max(0, Math.min(1, (now - effect.startTime) / effect.duration));
  const easeOut = 1 - (1 - t) ** 3;
  const fade = 1 - easeOut;
  if (fade <= 0.01) return;

  for (const seam of effect.seams) {
    const piece = byId.get(seam.pieceId);
    const partner = byId.get(seam.partnerId);
    if (!piece || !partner || piece.locked || piece.inTray || partner.locked || partner.inTray) continue;

    const verts = getVertices(pieceTile(piece));
    const a = verts[seam.edgeIndex];
    const b = verts[(seam.edgeIndex + 1) % 4];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
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
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const push = 9 * easeOut;
    drawSparkle(ctx, mx, my, 5.2 * fade, `rgba(255, 255, 255, ${(0.95 * fade).toFixed(3)})`);
    drawSparkle(ctx, mx + nx * push, my + ny * push, 3.2 * fade, `rgba(103, 232, 249, ${(0.9 * fade).toFixed(3)})`);
    drawSparkle(ctx, mx - nx * push, my - ny * push, 3.2 * fade, `rgba(103, 232, 249, ${(0.9 * fade).toFixed(3)})`);
  }
};

export const drawWorldEffects = (
  ctx: CanvasRenderingContext2D,
  pieces: readonly Piece[],
  borderLoops: readonly Point[][],
  effects: ActiveEffects,
  now: number,
  reducedMotion: boolean
) => {
  if (effects.locks.length > 0 || effects.snaps.length > 0) {
    const byId = new Map<number, Piece>();
    for (const p of pieces) byId.set(p.id, p);
    for (const lock of effects.locks) drawLockPulse(ctx, byId, lock, now, reducedMotion);
    for (const snap of effects.snaps) drawSnapSpark(ctx, byId, snap, now, reducedMotion);
  }
  if (effects.border) drawBorderWave(ctx, borderLoops, effects.border, now, reducedMotion);
  if (effects.solve) drawSolveSheen(ctx, pieces, borderLoops, effects.solve, now, reducedMotion);
};

export const drawScreenEffects = (
  ctx: CanvasRenderingContext2D,
  effects: ActiveEffects,
  now: number,
  reducedMotion: boolean
) => {
  const solve = effects.solve;
  if (!solve || reducedMotion) return;
  const totalSec = solve.duration / 1000;
  const elapsedSec = (now - solve.startTime) / 1000;
  if (elapsedSec < 0 || elapsedSec >= totalSec) return;

  const drag = 1.25;
  const gravity = 290;

  ctx.save();
  for (const p of solve.confetti) {
    const t = elapsedSec - p.delay;
    if (t <= 0) continue;
    const life = t / Math.max(0.1, totalSec - p.delay);
    if (life >= 1) continue;

    const dragFactor = (1 - Math.exp(-drag * t)) / drag;
    const x = p.x + p.vx * dragFactor;
    const y = p.y + p.vy * dragFactor + 0.5 * gravity * t * t;
    const alpha = life < 0.72 ? 1 : (1 - life) / 0.28;
    const flutter = 0.28 + 0.72 * Math.abs(Math.cos(p.tumblePhase + p.tumbleSpeed * t));
    const poly = p.type === 'kite' ? UNIT_KITE : UNIT_DART;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(p.rotation + p.spin * t);
    ctx.scale(p.scale * flutter, p.scale);
    ctx.beginPath();
    tracePoints(ctx, poly);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
};
