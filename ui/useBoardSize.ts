// Measures the board container's CSS pixel dimensions and devicePixelRatio
// so canvases can fill the entire available viewport crisply on any screen.
import { useEffect, useState, type RefObject } from 'react';
import { BOARD_H, BOARD_W, type BoardSize } from '../rules';

export interface MeasuredBoard extends BoardSize {
  dpr: number;
  measured: boolean;
}

const readDpr = () => (typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1);
const readPortrait = () => {
  if (typeof window === 'undefined') return false;
  const vv = window.visualViewport;
  return (vv?.height ?? window.innerHeight) > (vv?.width ?? window.innerWidth);
};

export const useIsPortrait = (): boolean => {
  const [portrait, setPortrait] = useState<boolean>(readPortrait);
  useEffect(() => {
    const update = () => setPortrait(readPortrait());
    const vv = window.visualViewport;
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    vv?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      vv?.removeEventListener('resize', update);
    };
  }, []);
  return portrait;
};

// Prevents iOS Safari's proprietary two-finger page-zoom gestures strictly on
// the gameplay canvas while leaving overlays and the rest of the page intact.
export const usePreventSafariGesture = (ref: RefObject<HTMLCanvasElement | null>) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', stop, { passive: false });
    el.addEventListener('gesturechange', stop, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', stop);
      el.removeEventListener('gesturechange', stop);
    };
  }, [ref]);
};

export const useBoardSize = (ref: RefObject<HTMLDivElement | null>): MeasuredBoard => {
  const [size, setSize] = useState<MeasuredBoard>(() => ({
    width: BOARD_W,
    height: BOARD_H,
    dpr: readDpr(),
    measured: false
  }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = readDpr();
      setSize(prev =>
        prev.measured && prev.width === width && prev.height === height && prev.dpr === dpr
          ? prev
          : { width, height, dpr, measured: true }
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    const vv = window.visualViewport;
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    vv?.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      vv?.removeEventListener('resize', update);
    };
  }, [ref]);

  return size;
};
