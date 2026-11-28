// The jigsaw puzzle screen (spec 9). Every decision is made by jigsaw.ts;
// this keeps the state, wires controls and pointer hooks, and lays out the
// board alongside the scrollable piece tray.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react';
import { Sparkles } from 'lucide-react';
import type { Point } from '../rules';
import {
  boundsOf,
  coverRect,
  isSolved,
  newPuzzleForViewport,
  progress,
  repositionForViewport,
  resolveTrayFilter,
  rotateGroup,
  seedFromQuery,
  trayPieces,
  type Piece,
  type TrayFilter,
  type ViewportLayout
} from '../jigsaw';
import {
  DEFAULT_CAMERA,
  easeCamera,
  isCameraAtFit,
  nextCameraOnResize,
  ZOOM_STEP,
  zoomCameraAt,
  type Camera
} from '../camera';
import type { JigsawSettings, PictureStyle, PuzzleSize } from '../settings';
import { formatDebugInfo } from '../debugInfo';
import { collectDebugEnvironment } from './collectDebugEnv';
import type { Picture } from './jigsawDraw';
import { getPicturePlugin } from '../pictures';
import { JigsawHelp } from './JigsawHelp';
import { JigsawSettingsDialog } from './JigsawSettingsDialog';
import { JigsawToolbar } from './JigsawToolbar';
import { JigsawTray } from './JigsawTray';
import { RotateControls } from './RotateControls';
import { ZoomControls } from './ZoomControls';
import { useBoardSize, useIsPortrait, usePreventSafariGesture } from './useBoardSize';
import { useKeyboardControls, useWheelRotation, useZoomKeys } from './useControls';
import { useJigsawRenderAndEffects } from './useJigsawEffects';
import { useBoardPointers, useTrayInteraction } from './useJigsawPointers';

const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const useJigsawPicture = (style: PictureStyle, homes: Piece['home'][], seed: number, pixelScale: number) => {
  const [custom, setCustom] = useState<Picture | null>(null);
  const picture = useMemo<Picture>(
    () => custom ?? getPicturePlugin(style).render({ homes, seed, pixelScale }),
    [custom, style, homes, seed, pixelScale]
  );

  const chooseFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setCustom({ image: img, width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return { picture, isCustom: custom !== null, clearCustom: () => setCustom(null), chooseFile };
};

interface PuzzleState {
  size: PuzzleSize;
  seed: number;
  symmetric: boolean;
  baseHomes: Piece['home'][];
  pieces: Piece[];
  layout: ViewportLayout;
  trayFilter: TrayFilter;
}

const makePuzzleState = (
  size: PuzzleSize,
  seed: number,
  width: number,
  height: number,
  symmetric: boolean
): PuzzleState => {
  const { pieces, layout } = newPuzzleForViewport(size, seed, { width, height }, symmetric);
  return { size, seed, symmetric, baseHomes: pieces.map(p => p.home), pieces, layout, trayFilter: 'all' };
};

const FIT_TRANSITION_MS = 650;

const useBoardCamera = (viewport: { width: number; height: number }, animateEffects: boolean) => {
  const [camera, setCameraRaw] = useState<Camera>(DEFAULT_CAMERA);
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const cancelAnimation = useCallback(() => {
    if (animRef.current !== null) {
      window.cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  useEffect(() => cancelAnimation, [cancelAnimation]);

  const setCamera = useCallback(
    (next: Camera | ((c: Camera) => Camera)) => {
      cancelAnimation();
      setCameraRaw(next);
    },
    [cancelAnimation]
  );

  const clampToViewport = useCallback((vp: { width: number; height: number }) => {
    setCameraRaw(c => nextCameraOnResize(c, vp, animRef.current !== null).camera);
  }, []);

  const animateToFit = useCallback(() => {
    cancelAnimation();
    const from = cameraRef.current;
    if (isCameraAtFit(from)) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!animateEffects || reduced) {
      setCameraRaw(DEFAULT_CAMERA);
      return;
    }
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = (now - start) / FIT_TRANSITION_MS;
      if (t >= 1) {
        animRef.current = null;
        setCameraRaw(DEFAULT_CAMERA);
        return;
      }
      setCameraRaw(easeCamera(from, DEFAULT_CAMERA, t));
      animRef.current = window.requestAnimationFrame(step);
    };
    animRef.current = window.requestAnimationFrame(step);
  }, [animateEffects, cancelAnimation]);

  const zoomAt = useCallback(
    (factor: number, focus: Point) => setCamera(c => zoomCameraAt(c, factor, focus, viewport)),
    [setCamera, viewport]
  );
  const zoomIn = useCallback(
    () => zoomAt(ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 }),
    [zoomAt, viewport.width, viewport.height]
  );
  const zoomOut = useCallback(
    () => zoomAt(1 / ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 }),
    [zoomAt, viewport.width, viewport.height]
  );
  const resetZoom = useCallback(() => setCamera(DEFAULT_CAMERA), [setCamera]);
  return { camera, setCamera, clampToViewport, zoomAt, zoomIn, zoomOut, resetZoom, animateToFit };
};

const BorderCompleteToast = () => (
  <div
    role="status"
    aria-live="polite"
    className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 text-amber-200 border border-amber-400/70 shadow-lg rounded-full px-3.5 py-1.5 text-sm font-semibold flex items-center gap-1.5 backdrop-blur-xs"
  >
    <Sparkles size={15} className="text-amber-300" />
    Border complete!
  </div>
);

const buildJigsawDebugInfo = (
  puzzle: PuzzleState,
  pictureLabel: string,
  settings: JigsawSettings,
  camera: Camera,
  trayFilter: TrayFilter,
  viewport: { width: number; height: number },
  isPortrait: boolean,
  dpr: number
): string => {
  const { placed, total } = progress(puzzle.pieces);
  return formatDebugInfo({
    mode: 'jigsaw',
    env: collectDebugEnvironment(viewport, isPortrait, dpr),
    settings,
    camera,
    layoutScale: puzzle.layout.scale,
    size: puzzle.size,
    seed: puzzle.seed,
    picture: pictureLabel,
    placed,
    total,
    solved: isSolved(puzzle.pieces),
    trayAll: trayPieces(puzzle.pieces, 'all').length,
    trayEdges: trayPieces(puzzle.pieces, 'edges').length,
    trayFilter
  });
};

const usePuzzleViewportSync = (
  measured: boolean,
  vpWidth: number,
  vpHeight: number,
  setPuzzle: Dispatch<SetStateAction<PuzzleState>>,
  setCamera: Dispatch<SetStateAction<Camera>>,
  clampToViewport: (vp: { width: number; height: number }) => void
) => {
  const initializedViewport = useRef(false);
  useEffect(() => {
    if (!measured) return;
    if (!initializedViewport.current) {
      initializedViewport.current = true;
      setPuzzle(prev => makePuzzleState(prev.size, prev.seed, vpWidth, vpHeight, prev.symmetric));
      setCamera(DEFAULT_CAMERA);
      return;
    }
    setPuzzle(prev => ({ ...prev, ...repositionForViewport(prev.pieces, { width: vpWidth, height: vpHeight }) }));
    clampToViewport({ width: vpWidth, height: vpHeight });
  }, [measured, vpWidth, vpHeight, setPuzzle, setCamera, clampToViewport]);
};

const computePictureRect = (picture: Picture, pieces: readonly Piece[]) =>
  pieces.length
    ? coverRect(picture.width, picture.height, boundsOf(pieces.map(p => p.home)))
    : { x: 0, y: 0, w: 1, h: 1 };

const useJigsawSession = (
  settings: JigsawSettings,
  patchSettings: (patch: Partial<JigsawSettings>) => void,
  vpWidth: number,
  vpHeight: number,
  measured: boolean,
  cam: ReturnType<typeof useBoardCamera>
) => {
  const [puzzle, setPuzzle] = useState<PuzzleState>(() =>
    makePuzzleState(
      settings.size,
      seedFromQuery(window.location.search) ?? newSeed(),
      vpWidth,
      vpHeight,
      settings.symmetric
    )
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);

  usePuzzleViewportSync(measured, vpWidth, vpHeight, setPuzzle, cam.setCamera, cam.clampToViewport);

  const startPuzzle = (s: PuzzleSize, sym = settings.symmetric) => {
    setPuzzle(makePuzzleState(s, newSeed(), vpWidth, vpHeight, sym));
    cam.resetZoom();
    setSelectedId(null);
  };

  const setTrayFilter = useCallback((filter: TrayFilter) => {
    setPuzzle(prev => ({ ...prev, trayFilter: resolveTrayFilter(prev.pieces, filter) }));
  }, []);

  const changeSize = (s: PuzzleSize) => {
    patchSettings({ size: s });
    if (s !== puzzle.size) startPuzzle(s, settings.symmetric);
  };

  const changeSymmetric = (sym: boolean) => {
    patchSettings({ symmetric: sym });
    if (sym !== puzzle.symmetric) startPuzzle(puzzle.size, sym);
  };

  const updatePieces = useCallback((fn: (ps: Piece[]) => Piece[]) => {
    setPuzzle(prev => {
      const nextPieces = fn(prev.pieces);
      return { ...prev, pieces: nextPieces, trayFilter: resolveTrayFilter(nextPieces, prev.trayFilter) };
    });
  }, []);

  const rotate = useCallback(
    (steps: number) => {
      if (selectedId !== null) updatePieces(ps => rotateGroup(ps, selectedId, steps));
    },
    [selectedId, updatePieces]
  );

  return {
    puzzle,
    selectedId,
    setSelectedId,
    startPuzzle,
    setTrayFilter,
    changeSize,
    changeSymmetric,
    updatePieces,
    rotate
  };
};

interface JigsawProps {
  modeSwitch: ReactNode;
  active: boolean;
  settings: JigsawSettings;
  onChangeSettings: (patch: Partial<JigsawSettings>) => void;
}

export const Jigsaw = ({ modeSwitch, active, settings, onChangeSettings: patchSettings }: JigsawProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPortrait = useIsPortrait();
  const { width: vpWidth, height: vpHeight, dpr, measured } = useBoardSize(containerRef);
  const viewport = useMemo(() => ({ width: vpWidth, height: vpHeight }), [vpWidth, vpHeight]);

  const cam = useBoardCamera(viewport, settings.effects);
  const session = useJigsawSession(settings, patchSettings, vpWidth, vpHeight, measured, cam);
  const { puzzle, selectedId } = session;
  const { size, pieces, layout, trayFilter } = puzzle;

  const pic = useJigsawPicture(
    settings.picture,
    puzzle.baseHomes,
    puzzle.seed,
    Math.max(2, Math.min(4, Math.ceil(layout.scale * cam.camera.zoom * dpr)))
  );
  const [dropHighlight, setDropHighlight] = useState(false);
  const [overlay, setOverlay] = useState<'none' | 'settings' | 'help'>('none');

  const { placed, total } = progress(pieces);
  const solved = isSolved(pieces);

  const selectPicture = (style: PictureStyle) => {
    pic.clearCustom();
    patchSettings({ picture: style });
  };

  const handleStartFromTray = useTrayInteraction(
    canvasRef,
    trayRef,
    layout,
    viewport,
    cam.camera,
    isPortrait,
    session.updatePieces,
    session.setSelectedId
  );
  const boardHandlers = useBoardPointers(
    trayRef,
    pieces,
    selectedId,
    layout,
    viewport,
    cam.camera,
    cam.setCamera,
    session.updatePieces,
    session.setSelectedId,
    setDropHighlight
  );

  useKeyboardControls(session.rotate, undefined, active);
  useZoomKeys(cam.zoomIn, cam.zoomOut, cam.resetZoom, active);
  useWheelRotation(canvasRef, session.rotate, cam.zoomAt);
  usePreventSafariGesture(canvasRef);
  const closeOverlay = useCallback(() => setOverlay('none'), []);

  const pictureRect = useMemo(() => computePictureRect(pic.picture, pieces), [pic.picture, pieces]);
  const view = useMemo(
    () => ({ pieces, picture: pic.picture, settings, selectedId, board: layout.board }),
    [pieces, pic.picture, settings, selectedId, layout.board]
  );
  const puzzleKey = `${puzzle.seed}:${puzzle.size}:${puzzle.symmetric}`;
  const { borderToast } = useJigsawRenderAndEffects(
    canvasRef,
    view,
    puzzleKey,
    vpWidth,
    vpHeight,
    dpr,
    layout.scale,
    cam.camera,
    cam.animateToFit
  );

  const selectedPiece = pieces.find(p => p.id === selectedId);
  const canRotate = !!selectedPiece && !selectedPiece.locked && !selectedPiece.inTray;
  const pictureLabel = pic.isCustom ? 'custom' : settings.picture;

  return (
    <div className="w-full h-dvh overflow-hidden bg-slate-900 flex flex-col game-shell">
      <JigsawToolbar
        modeSwitch={modeSwitch}
        onNewPuzzle={() => session.startPuzzle(size)}
        picture={pictureLabel}
        onPicture={selectPicture}
        onChoosePicture={pic.chooseFile}
        placed={placed}
        total={total}
        solved={solved}
        onOpenSettings={() => setOverlay('settings')}
        onOpenHelp={() => setOverlay('help')}
      />

      <div className={`flex-1 min-h-0 flex ${isPortrait ? 'flex-col' : 'flex-row'}`}>
        <div ref={containerRef} className="flex-1 min-h-0 min-w-0 relative overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            onPointerDown={boardHandlers.onPointerDown}
            onPointerMove={boardHandlers.onPointerMove}
            onPointerUp={boardHandlers.onPointerUp}
            onPointerCancel={boardHandlers.onPointerUp}
            onContextMenu={boardHandlers.onContextMenu}
            style={{ touchAction: 'none' }}
            className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          />
          <ZoomControls
            camera={cam.camera}
            isPortrait={isPortrait}
            onZoomIn={cam.zoomIn}
            onZoomOut={cam.zoomOut}
            onReset={cam.resetZoom}
          />
          {canRotate && <RotateControls isPortrait={isPortrait} onRotate={session.rotate} />}
          {borderToast && <BorderCompleteToast />}
        </div>

        <JigsawTray
          trayRef={trayRef}
          pieces={pieces}
          picture={pic.picture}
          pictureRect={pictureRect}
          showOutlines={settings.showOutlines}
          filter={trayFilter}
          onFilter={session.setTrayFilter}
          isPortrait={isPortrait}
          dropHighlight={dropHighlight}
          onStartFromTray={handleStartFromTray}
        />
      </div>

      {overlay === 'settings' && (
        <JigsawSettingsDialog
          settings={settings}
          onChange={patchSettings}
          onChangeSize={session.changeSize}
          onChangeSymmetric={session.changeSymmetric}
          getDebugInfo={() =>
            buildJigsawDebugInfo(puzzle, pictureLabel, settings, cam.camera, trayFilter, viewport, isPortrait, dpr)
          }
          onClose={closeOverlay}
        />
      )}

      {overlay === 'help' && <JigsawHelp isTouchDevice={isTouchDevice} onClose={closeOverlay} />}
    </div>
  );
};
