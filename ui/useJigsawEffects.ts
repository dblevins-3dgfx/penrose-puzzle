// Drives the jigsaw canvas rendering and celebratory effect animations (spec 9).
// Only runs a requestAnimationFrame loop while an effect is active; static
// frames render once per React update with zero idle overhead.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  detectCelebrations,
  orderedBorderLoops,
  soundCueFor,
  type Camera,
  type Piece
} from '../jigsaw';
import { drawJigsaw, type JigsawView } from './jigsawDraw';
import { playSound } from './jigsawSound';
import {
  BORDER_DURATION_MS,
  BORDER_TOAST_MS,
  createConfetti,
  drawScreenEffects,
  drawWorldEffects,
  emptyEffects,
  hasActiveEffects,
  LOCK_DURATION_MS,
  pruneEffects,
  SNAP_DURATION_MS,
  SOLVE_DURATION_MS,
  type ActiveEffects
} from './jigsawEffects';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useJigsawRenderAndEffects = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  view: JigsawView,
  puzzleKey: string,
  vpWidth: number,
  vpHeight: number,
  dpr: number,
  layoutScale: number,
  camera: Camera,
  onSolve?: () => void
) => {
  const effectsRef = useRef<ActiveEffects>(emptyEffects());
  const prevRef = useRef<{ key: string; pieces: Piece[] }>({ key: puzzleKey, pieces: view.pieces });
  const toastTimerRef = useRef<number | null>(null);
  const [borderToast, setBorderToast] = useState(false);

  const borderLoops = useMemo(() => orderedBorderLoops(view.pieces), [view.pieces]);

  // Detect snap / lock / border-complete / solve transitions cleanly per puzzle.
  useEffect(() => {
    const clearToast = () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setBorderToast(false);
    };

    const prev = prevRef.current;
    if (prev.key !== puzzleKey) {
      prevRef.current = { key: puzzleKey, pieces: view.pieces };
      effectsRef.current = emptyEffects();
      clearToast();
      return;
    }

    if (!view.settings.effects) {
      effectsRef.current = emptyEffects();
      clearToast();
    }

    const events = detectCelebrations(prev.pieces, view.pieces);
    prevRef.current = { key: puzzleKey, pieces: view.pieces };
    const hasEvents =
      events.newlyLockedIds.length > 0 ||
      events.joinedSeams.length > 0 ||
      events.borderCompleted ||
      events.puzzleSolved;
    if (!hasEvents) return;

    if (view.settings.effects) {
      const now = performance.now();
      const next = pruneEffects(effectsRef.current, now);
      if (events.joinedSeams.length > 0) {
        next.snaps = [...next.snaps, { seams: events.joinedSeams, startTime: now, duration: SNAP_DURATION_MS }];
      }
      if (events.newlyLockedIds.length > 0) {
        next.locks = [...next.locks, { pieceIds: events.newlyLockedIds, startTime: now, duration: LOCK_DURATION_MS }];
      }
      if (events.borderCompleted) {
        next.border = { startTime: now, duration: BORDER_DURATION_MS };
        setBorderToast(true);
        if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => {
          setBorderToast(false);
          toastTimerRef.current = null;
        }, BORDER_TOAST_MS);
      }
      if (events.puzzleSolved) {
        next.solve = {
          startTime: now,
          duration: SOLVE_DURATION_MS,
          confetti: createConfetti({ width: vpWidth, height: vpHeight })
        };
        clearToast();
      }
      effectsRef.current = next;
    }

    if (events.puzzleSolved) onSolve?.();
    if (view.settings.sound) {
      const cue = soundCueFor(events);
      if (cue) playSound(cue);
    }
  }, [puzzleKey, view.pieces, view.settings.effects, view.settings.sound, vpWidth, vpHeight, onSolve]);

  // Cleanup toast timer on unmount.
  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  // Paint the board immediately and animate at 60fps only while effects are active.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const backingW = Math.max(1, Math.round(vpWidth * dpr));
    const backingH = Math.max(1, Math.round(vpHeight * dpr));
    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }

    let rafId: number | null = null;
    const paint = (now: number) => {
      const reduced = prefersReducedMotion();
      effectsRef.current = pruneEffects(effectsRef.current, now);
      const active = hasActiveEffects(effectsRef.current, now);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const s = layoutScale * camera.zoom * dpr;
      ctx.setTransform(s, 0, 0, s, camera.panX * dpr, camera.panY * dpr);
      drawJigsaw(ctx, view);
      if (active) {
        drawWorldEffects(ctx, view.pieces, borderLoops, effectsRef.current, now, reduced);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScreenEffects(ctx, effectsRef.current, now, reduced);
        rafId = window.requestAnimationFrame(paint);
      } else {
        rafId = null;
      }
    };

    paint(performance.now());
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [canvasRef, view, borderLoops, vpWidth, vpHeight, dpr, layoutScale, camera]);

  return { borderToast };
};
