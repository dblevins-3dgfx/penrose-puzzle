// The jigsaw puzzle screen (spec 9). Every decision is made by jigsaw.ts;
// this keeps the state, wires controls and pointer hooks, and lays out the
// board alongside the scrollable piece tray.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { Point } from '../rules';
import {
  boundsOf,
  coverRect,
  DEFAULT_CAMERA,
  easeCamera,
  isCameraAtFit,
  isSolved,
  newPuzzleForViewport,
  nextCameraOnResize,
  progress,
  repositionForViewport,
  rotateGroup,
  seedFromQuery,
  trayPieces,
  ZOOM_STEP,
  zoomCameraAt,
  type Camera,
  type JigsawSettings,
  type PictureStyle,
  type Piece,
  type PuzzleSize,
  type TrayFilter,
  type ViewportLayout
} from '../jigsaw';
import { formatDebugInfo } from '../debugInfo';
import { collectDebugEnvironment } from './collectDebugEnv';
import { makeDefaultPicture } from './defaultPicture';
import type { Picture } from './jigsawDraw';
import { makePenrosePicture } from './penrosePictureDraw';
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
import { useSharedSettings } from './useSharedSettings';

const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const noUndo = () => {};

const useJigsawPicture = (style: PictureStyle, homes: Piece['home'][], seed: number, pixelScale: number) => {
  const sunset = useMemo<Picture>(() => {
    const image = makeDefaultPicture();
    return { image, width: image.width, height: image.height };
  }, []);
  const [custom, setCustom] = useState<Picture | null>(null);
  const picture = useMemo<Picture>(() => {
    if (custom) return custom;
    if (style === 'sunset') return sunset;
    return makePenrosePicture(style, homes, seed, pixelScale);
  }, [custom, style, sunset, homes, seed, pixelScale]);

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
  baseHomes: Piece['home'][];
  pieces: Piece[];
  layout: ViewportLayout;
}

const makePuzzleState = (size: PuzzleSize, seed: number, width: number, height: number): PuzzleState => {
  const { pieces, layout } = newPuzzleForViewport(size, seed, { width, height });
  return { size, seed, baseHomes: pieces.map(p => p.home), pieces, layout };
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

export const Jigsaw = ({ modeSwitch }: { modeSwitch: ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPortrait = useIsPortrait();
  const { width: vpWidth, height: vpHeight, dpr, measured } = useBoardSize(containerRef);
  const viewport = useMemo(() => ({ width: vpWidth, height: vpHeight }), [vpWidth, vpHeight]);

  const [settings, setSettings] = useSharedSettings();
  const [puzzle, setPuzzle] = useState<PuzzleState>(() =>
    makePuzzleState(settings.size, seedFromQuery(window.location.search) ?? newSeed(), vpWidth, vpHeight)
  );
  const { size, pieces, layout } = puzzle;
  const { camera, setCamera, clampToViewport, zoomAt, zoomIn, zoomOut, resetZoom, animateToFit } = useBoardCamera(
    viewport,
    settings.effects
  );
  const initializedViewport = useRef(false);

  const { picture, isCustom, clearCustom, chooseFile } = useJigsawPicture(
    settings.picture,
    puzzle.baseHomes,
    puzzle.seed,
    Math.max(2, Math.min(4, Math.ceil(layout.scale * camera.zoom * dpr)))
  );
  const [trayFilter, setTrayFilter] = useState<TrayFilter>('all');
  const [dropHighlight, setDropHighlight] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!measured) return;
    if (!initializedViewport.current) {
      initializedViewport.current = true;
      setPuzzle(prev => makePuzzleState(prev.size, prev.seed, vpWidth, vpHeight));
      setCamera(DEFAULT_CAMERA);
      return;
    }
    setPuzzle(prev => ({ ...prev, ...repositionForViewport(prev.pieces, { width: vpWidth, height: vpHeight }) }));
    clampToViewport({ width: vpWidth, height: vpHeight });
  }, [measured, vpWidth, vpHeight, setCamera, clampToViewport]);

  const { placed, total } = progress(pieces);
  const solved = isSolved(pieces);

  const startPuzzle = (s: PuzzleSize) => {
    setPuzzle(makePuzzleState(s, newSeed(), vpWidth, vpHeight));
    resetZoom();
    setSelectedId(null);
    setTrayFilter('all');
  };

  const changeSize = (s: PuzzleSize) => {
    setSettings(prev => ({ ...prev, size: s }));
    if (s !== size) startPuzzle(s);
  };

  const selectPicture = (style: PictureStyle) => {
    clearCustom();
    setSettings(s => ({ ...s, picture: style }));
  };

  const updatePieces = useCallback((fn: (ps: Piece[]) => Piece[]) => {
    setPuzzle(prev => ({ ...prev, pieces: fn(prev.pieces) }));
  }, []);

  const handleStartFromTray = useTrayInteraction(
    canvasRef, trayRef, layout, viewport, camera, isPortrait, updatePieces, setSelectedId
  );
  const boardHandlers = useBoardPointers(
    trayRef, pieces, selectedId, layout, viewport, camera, setCamera, updatePieces, setSelectedId, setDropHighlight
  );

  const rotate = useCallback(
    (steps: number) => {
      if (selectedId !== null) updatePieces(ps => rotateGroup(ps, selectedId, steps));
    },
    [selectedId, updatePieces]
  );
  useKeyboardControls(rotate, noUndo);
  useZoomKeys(zoomIn, zoomOut, resetZoom);
  useWheelRotation(canvasRef, rotate, zoomAt);
  usePreventSafariGesture(canvasRef);
  const closeHelp = useCallback(() => setShowHelp(false), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  const pictureRect = useMemo(
    () => (pieces.length ? coverRect(picture.width, picture.height, boundsOf(pieces.map(p => p.home))) : { x: 0, y: 0, w: 1, h: 1 }),
    [pieces, picture.width, picture.height]
  );
  const view = useMemo(
    () => ({ pieces, picture, settings, selectedId, board: layout.board }),
    [pieces, picture, settings, selectedId, layout.board]
  );
  const puzzleKey = `${puzzle.seed}:${puzzle.size}`;
  const { borderToast } = useJigsawRenderAndEffects(
    canvasRef, view, puzzleKey, vpWidth, vpHeight, dpr, layout.scale, camera, animateToFit
  );

  const selectedPiece = pieces.find(p => p.id === selectedId);
  const canRotate = !!selectedPiece && !selectedPiece.locked && !selectedPiece.inTray;

  return (
    <div className="w-full h-dvh overflow-hidden bg-slate-900 flex flex-col game-shell">
      <JigsawToolbar
        modeSwitch={modeSwitch}
        onNewPuzzle={() => startPuzzle(size)}
        picture={isCustom ? 'custom' : settings.picture}
        onPicture={selectPicture}
        onChoosePicture={chooseFile}
        placed={placed}
        total={total}
        solved={solved}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHelp={() => setShowHelp(true)}
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
          <ZoomControls camera={camera} isPortrait={isPortrait} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
          {canRotate && <RotateControls isPortrait={isPortrait} onRotate={rotate} />}
          {borderToast && <BorderCompleteToast />}
        </div>

        <JigsawTray
          trayRef={trayRef}
          pieces={pieces}
          picture={picture}
          pictureRect={pictureRect}
          showOutlines={settings.showOutlines}
          filter={trayFilter}
          onFilter={setTrayFilter}
          isPortrait={isPortrait}
          dropHighlight={dropHighlight}
          onStartFromTray={handleStartFromTray}
        />
      </div>

      {showSettings && (
        <JigsawSettingsDialog
          settings={settings}
          onChange={setSettings}
          onChangeSize={changeSize}
          getDebugInfo={() => buildJigsawDebugInfo(puzzle, isCustom ? 'custom' : settings.picture, settings, camera, trayFilter, viewport, isPortrait, dpr)}
          onClose={closeSettings}
        />
      )}

      {showHelp && <JigsawHelp isTouchDevice={isTouchDevice} onClose={closeHelp} />}
    </div>
  );
};
