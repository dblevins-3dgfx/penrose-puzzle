// Drives the jigsaw canvas rendering and celebratory effect animations (spec 9).
// Only runs a requestAnimationFrame loop while an effect is active; static
// frames render once per React update with zero idle overhead.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Camera } from '../camera';
import { detectCelebrations, orderedBorderLoops, soundCueFor, type Piece } from '../jigsaw';
import { drawJigsaw, type JigsawView } from './jigsawDraw';
import { playSound } from './sound';
import {
  applyCelebrationEvents,
  BORDER_TOAST_MS,
  drawScreenEffects,
  drawWorldEffects,
  emptyEffects,
  hasActiveEffects,
  hasCelebrationEvents,
  pruneEffects,
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

    const showBorderToast = () => {
      clearToast();
      setBorderToast(true);
      toastTimerRef.current = window.setTimeout(() => {
        setBorderToast(false);
        toastTimerRef.current = null;
      }, BORDER_TOAST_MS);
    };

    const prev = prevRef.current;
    prevRef.current = { key: puzzleKey, pieces: view.pieces };
    if (prev.key !== puzzleKey) {
      effectsRef.current = emptyEffects();
      clearToast();
      return;
    }

    if (!view.settings.effects) {
      effectsRef.current = emptyEffects();
      clearToast();
    }

    const events = detectCelebrations(prev.pieces, view.pieces);
    if (!hasCelebrationEvents(events)) return;

    if (view.settings.effects) {
      effectsRef.current = applyCelebrationEvents(effectsRef.current, events, performance.now(), {
        width: vpWidth,
        height: vpHeight
      });
      if (events.puzzleSolved) clearToast();
      else if (events.borderCompleted) showBorderToast();
    }

    if (events.puzzleSolved) onSolve?.();
    if (view.settings.sound) {
      const cue = soundCueFor(events);
      if (cue) playSound(cue);
    }
  }, [puzzleKey, view.pieces, view.settings.effects, view.settings.sound, vpWidth, vpHeight, onSolve]);

  // Cleanup toast timer on unmount.
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    []
  );

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
