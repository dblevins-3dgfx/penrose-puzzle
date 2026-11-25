// Measures the board container's CSS pixel dimensions and devicePixelRatio
// so canvases can fill the entire available viewport crisply on any screen.
import { useEffect, useState, type RefObject } from 'react';
import { BOARD_H, BOARD_W, type BoardSize } from '../rules';

export interface MeasuredBoard extends BoardSize {
  dpr: number;
  measured: boolean;
}

const readDpr = () => (typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1);
const readPortrait = () => (typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false);

export const useIsPortrait = (): boolean => {
  const [portrait, setPortrait] = useState<boolean>(readPortrait);
  useEffect(() => {
    const update = () => setPortrait(readPortrait());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return portrait;
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
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);

  return size;
};
