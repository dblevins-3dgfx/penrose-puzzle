// Reads live browser / device environment details for the Copy debug info
// diagnostics snapshot (spec 8 & 9). Stays local-only.
import type { BoardSize } from '../rules';
import type { DebugEnvironment } from '../debugInfo';

export const collectDebugEnvironment = (boardSize: BoardSize, isPortrait: boolean, dpr: number): DebugEnvironment => {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const vv = window.visualViewport;
  return {
    url: window.location.href,
    userAgent: window.navigator.userAgent,
    displayMode: standalone ? 'standalone' : 'browser',
    windowSize: { width: window.innerWidth, height: window.innerHeight },
    visualViewport: vv ? { width: vv.width, height: vv.height } : null,
    boardSize,
    dpr,
    orientation: isPortrait ? 'portrait' : 'landscape',
    maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  };
};
