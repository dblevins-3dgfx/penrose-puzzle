// Keyboard and mouse wheel controls (spec 8). The step arithmetic is in
// rules.ts; these hooks only listen for the events.
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { WHEEL_NOTCH, rotateBy, wheelDeltaPixels, wheelSteps } from '../rules';

type SetRotation = Dispatch<SetStateAction<number>>;

// Left / Right arrows rotate; Ctrl/Cmd+Z undoes the last tile.
export const useKeyboardControls = (setRotation: SetRotation, undo: () => void) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setRotation(prev => rotateBy(prev, -1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setRotation(prev => rotateBy(prev, 1));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setRotation, undo]);
};

// Mouse wheel over the board rotates the tile: up = clockwise. A mouse
// wheel notch turns one step; a trackpad swipe turns one step for every
// TRACKPAD_STEP pixels scrolled (see wheelSteps). Any leftover partial step
// is dropped after a short pause in the swipe.
const SWIPE_END_MS = 150;

export const useWheelRotation = (canvasRef: RefObject<HTMLCanvasElement | null>, setRotation: SetRotation) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const swipe: { total: number; timer: ReturnType<typeof setTimeout> | undefined } = { total: 0, timer: undefined };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = wheelDeltaPixels(e.deltaY, e.deltaMode);
      const { steps, total } = wheelSteps(swipe.total, dy);
      if (Math.abs(dy) < WHEEL_NOTCH) {
        clearTimeout(swipe.timer);
        swipe.timer = setTimeout(() => { swipe.total = 0; }, SWIPE_END_MS);
      }
      swipe.total = total;
      if (steps) setRotation(prev => rotateBy(prev, steps));
    };

    // Non-passive so preventDefault can stop the page from scrolling
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      clearTimeout(swipe.timer);
    };
  }, [canvasRef, setRotation]);
};
