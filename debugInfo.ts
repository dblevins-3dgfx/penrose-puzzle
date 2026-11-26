// Formats a concise, local-only diagnostic snapshot for bug reports (spec 8 & 9).
// Plain module with no React or DOM calls so it can be unit-tested in debugInfo.test.ts.
import type { BoardSize, SandboxCamera } from './rules';
import type { Camera, JigsawSettings, PuzzleSize, TrayFilter } from './jigsaw';

export interface DebugEnvironment {
  url: string;
  userAgent: string;
  displayMode: 'browser' | 'standalone';
  windowSize: BoardSize;
  visualViewport: BoardSize | null;
  boardSize: BoardSize;
  dpr: number;
  orientation: 'portrait' | 'landscape';
  maxTouchPoints: number;
  reducedMotion: boolean;
}

export interface JigsawDebugSnapshot {
  mode: 'jigsaw';
  env: DebugEnvironment;
  settings: JigsawSettings;
  camera: Camera;
  layoutScale: number;
  size: PuzzleSize;
  seed: number;
  picture: string;
  placed: number;
  total: number;
  solved: boolean;
  trayAll: number;
  trayEdges: number;
  trayFilter: TrayFilter;
}

export interface SandboxDebugSnapshot {
  mode: 'sandbox';
  env: DebugEnvironment;
  settings: JigsawSettings;
  camera: SandboxCamera;
  kites: number;
  darts: number;
  autoRotate: boolean;
  hasLooseTile: boolean;
}

export type DebugSnapshot = JigsawDebugSnapshot | SandboxDebugSnapshot;

const round = (n: number, digits = 2): string => Number(n.toFixed(digits)).toString();
const fmtSize = (s: BoardSize): string => `${Math.round(s.width)}x${Math.round(s.height)}`;

// Drops any URL fragment (#...) while keeping origin, path, and query (?seed=...).
export const sanitizeUrl = (href: string): string => {
  try {
    const u = new URL(href);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return href;
  }
};

export const formatDebugInfo = (snapshot: DebugSnapshot): string => {
  const { env, settings, camera } = snapshot;
  const vv = env.visualViewport ? fmtSize(env.visualViewport) : 'n/a';
  const lines = [
    'Penrose Puzzle debug info',
    `mode: ${snapshot.mode}`,
    `url: ${sanitizeUrl(env.url)}`,
    `display: ${env.displayMode}, ${env.orientation}, dpr=${round(env.dpr)}, touch=${env.maxTouchPoints}, reducedMotion=${env.reducedMotion}`,
    `viewport: window=${fmtSize(env.windowSize)}, visual=${vv}, board=${fmtSize(env.boardSize)}`
  ];

  if (snapshot.mode === 'jigsaw') {
    lines.push(
      `camera: zoom=${round(camera.zoom)}, pan=(${round(camera.panX, 1)}, ${round(camera.panY, 1)}), layoutScale=${round(snapshot.layoutScale, 3)}`,
      `puzzle: size=${snapshot.size}, seed=${snapshot.seed}, picture=${snapshot.picture}`,
      `progress: ${snapshot.placed}/${snapshot.total} (solved=${snapshot.solved}), tray=${snapshot.trayAll} all / ${snapshot.trayEdges} edges (filter=${snapshot.trayFilter})`,
      `settings: showPicture=${settings.showPicture}, showOutlines=${settings.showOutlines}, effects=${settings.effects}, sound=${settings.sound}`
    );
  } else {
    lines.push(
      `camera: zoom=${round(camera.zoom)}, pan=(${round(camera.panX, 1)}, ${round(camera.panY, 1)})`,
      `sandbox: kites=${snapshot.kites}, darts=${snapshot.darts}, autoRotate=${snapshot.autoRotate}, looseTile=${snapshot.hasLooseTile}`,
      `settings: effects=${settings.effects}, sound=${settings.sound}`
    );
  }

  lines.push(`ua: ${env.userAgent}`);
  return lines.join('\n');
};
