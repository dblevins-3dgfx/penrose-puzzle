// Shared DOM pointer, board gesture state types, and two-finger touch pinch
// helpers used by both Jigsaw and Sandbox pointer hooks (spec 8 & 9).
import type { Point } from '../rules';

export const isInElement = (el: HTMLElement | null, clientX: number, clientY: number): boolean => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
};

export interface PinchMetrics {
  dist: number;
  mid: Point;
}

export interface PanGesture {
  mode: 'pan';
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  maxMove: number;
}

export interface PinchGesture {
  mode: 'pinch';
  metrics: PinchMetrics;
}

export type BoardGesture<D> = { mode: 'idle' } | PanGesture | PinchGesture | ({ mode: 'drag' } & D);

export const IDLE_GESTURE = { mode: 'idle' } as const;

export const startPanGesture = (pointerId: number, x: number, y: number): PanGesture => ({
  mode: 'pan',
  pointerId,
  startX: x,
  startY: y,
  x,
  y,
  maxMove: 0
});

export const stepPanGesture = (pan: PanGesture, x: number, y: number): { next: PanGesture; dx: number; dy: number } => {
  const dx = x - pan.x;
  const dy = y - pan.y;
  const moved = Math.hypot(x - pan.startX, y - pan.startY);
  return {
    next: { ...pan, x, y, maxMove: Math.max(pan.maxMove, moved) },
    dx,
    dy
  };
};

export const pairMetrics = (pts: [Point, Point]): PinchMetrics => {
  const [a, b] = pts;
  return {
    dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  };
};

// Computes incremental pan delta, zoom factor, and canvas-local focus point
// between consecutive two-finger touch frames.
export const stepPinch = (
  prev: PinchMetrics,
  touches: readonly Point[],
  canvas: HTMLCanvasElement
): { next: PinchMetrics; dx: number; dy: number; factor: number; focus: Point } => {
  const next = pairMetrics([touches[0], touches[1]]);
  const rect = canvas.getBoundingClientRect();
  return {
    next,
    dx: next.mid.x - prev.mid.x,
    dy: next.mid.y - prev.mid.y,
    factor: next.dist / prev.dist,
    focus: { x: next.mid.x - rect.left, y: next.mid.y - rect.top }
  };
};
