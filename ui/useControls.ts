// Keyboard and mouse wheel controls (spec 8 and 9). The step arithmetic is in
// rules.ts; these hooks only listen for the events.
import { useEffect, type RefObject } from 'react';
import { WHEEL_NOTCH, wheelDeltaPixels, wheelSteps, type Point } from '../rules';

// Turns the tile by a number of 36° steps (positive = clockwise).
type Rotate = (steps: number) => void;
type ZoomAt = (factor: number, focus: Point) => void;

// Left / Right arrows rotate; Ctrl/Cmd+Z undoes the last tile.
export const useKeyboardControls = (rotate: Rotate, undo: () => void) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        rotate(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        rotate(1);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rotate, undo]);
};

// + / = zooms in, - zooms out, 0 resets zoom and pan (ignored inside inputs).
export const useZoomKeys = (onZoomIn: () => void, onZoomOut: () => void, onReset: () => void) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        onZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        onReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onZoomIn, onZoomOut, onReset]);
};

// Mouse wheel over the board rotates the tile: up = clockwise. A mouse
// wheel notch turns one step; a trackpad swipe turns one step for every
// TRACKPAD_STEP pixels scrolled (see wheelSteps). Any leftover partial step
// is dropped after a short pause in the swipe. When `onZoom` is supplied,
// Ctrl/Cmd + wheel (including trackpad pinch-to-zoom) zooms around the cursor.
const SWIPE_END_MS = 150;

export const useWheelRotation = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  rotate: Rotate,
  onZoom?: ZoomAt
) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const swipe: { total: number; timer: ReturnType<typeof setTimeout> | undefined } = { total: 0, timer: undefined };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = wheelDeltaPixels(e.deltaY, e.deltaMode);
      if (onZoom && (e.ctrlKey || e.metaKey)) {
        const rect = canvas.getBoundingClientRect();
        onZoom(Math.exp(-dy * 0.008), { x: e.clientX - rect.left, y: e.clientY - rect.top });
        return;
      }
      const { steps, total } = wheelSteps(swipe.total, dy);
      if (Math.abs(dy) < WHEEL_NOTCH) {
        clearTimeout(swipe.timer);
        swipe.timer = setTimeout(() => { swipe.total = 0; }, SWIPE_END_MS);
      }
      swipe.total = total;
      if (steps) rotate(steps);
    };

    // Non-passive so preventDefault can stop the page from scrolling
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      clearTimeout(swipe.timer);
    };
  }, [canvasRef, rotate, onZoom]);
};
