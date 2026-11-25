// The jigsaw puzzle screen (spec 9). Every decision is made by jigsaw.ts;
// this keeps the state, wires controls and pointer hooks, and lays out the
// board alongside the scrollable piece tray.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Point } from '../rules';
import {
  boundsOf,
  clampCamera,
  coverRect,
  DEFAULT_CAMERA,
  isSolved,
  newPuzzleForViewport,
  parseSettings,
  progress,
  repositionForViewport,
  rotateGroup,
  seedFromQuery,
  serializeSettings,
  SETTINGS_KEY,
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
import { makeDefaultPicture } from './defaultPicture';
import { drawJigsaw, type Picture } from './jigsawDraw';
import { makePenrosePicture } from './penrosePictureDraw';
import { JigsawHelp } from './JigsawHelp';
import { JigsawSettingsDialog } from './JigsawSettingsDialog';
import { JigsawToolbar } from './JigsawToolbar';
import { JigsawTray } from './JigsawTray';
import { ZoomControls } from './ZoomControls';
import { useBoardSize, useIsPortrait } from './useBoardSize';
import { useKeyboardControls, useWheelRotation, useZoomKeys } from './useControls';
import { useBoardPointers, useTrayInteraction } from './useJigsawPointers';

const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const noUndo = () => {};

const useJigsawSettings = () => {
  // Settings are kept in the browser (spec 9). Storage can be unavailable
  // (private browsing, blocked cookies); the game then just doesn't save.
  const [settings, setSettings] = useState<JigsawSettings>(() => {
    try {
      return parseSettings(window.localStorage.getItem(SETTINGS_KEY));
    } catch {
      return parseSettings(null);
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
    } catch {
      // Not saved; the settings still apply until the page is reloaded
    }
  }, [settings]);
  return [settings, setSettings] as const;
};

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

const useBoardCamera = (viewport: { width: number; height: number }) => {
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const zoomAt = useCallback(
    (factor: number, focus: Point) => setCamera(c => zoomCameraAt(c, factor, focus, viewport)),
    [viewport]
  );
  const zoomIn = useCallback(
    () => zoomAt(ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 }),
    [zoomAt, viewport.width, viewport.height]
  );
  const zoomOut = useCallback(
    () => zoomAt(1 / ZOOM_STEP, { x: viewport.width / 2, y: viewport.height / 2 }),
    [zoomAt, viewport.width, viewport.height]
  );
  const resetZoom = useCallback(() => setCamera(DEFAULT_CAMERA), []);
  return { camera, setCamera, zoomAt, zoomIn, zoomOut, resetZoom };
};

const useCanvasRender = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  view: Parameters<typeof drawJigsaw>[1],
  vpWidth: number,
  vpHeight: number,
  dpr: number,
  layoutScale: number,
  camera: Camera
) => {
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = layoutScale * camera.zoom * dpr;
    ctx.setTransform(s, 0, 0, s, camera.panX * dpr, camera.panY * dpr);
    drawJigsaw(ctx, view);
  }, [canvasRef, view, vpWidth, vpHeight, dpr, layoutScale, camera]);
};

export const Jigsaw = ({ modeSwitch }: { modeSwitch: ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPortrait = useIsPortrait();
  const { width: vpWidth, height: vpHeight, dpr, measured } = useBoardSize(containerRef);
  const viewport = useMemo(() => ({ width: vpWidth, height: vpHeight }), [vpWidth, vpHeight]);

  const [puzzle, setPuzzle] = useState<PuzzleState>(() =>
    makePuzzleState('medium', seedFromQuery(window.location.search) ?? newSeed(), vpWidth, vpHeight)
  );
  const { size, pieces, layout } = puzzle;
  const { camera, setCamera, zoomAt, zoomIn, zoomOut, resetZoom } = useBoardCamera(viewport);
  const initializedViewport = useRef(false);

  const [settings, setSettings] = useJigsawSettings();
  const { picture, isCustom, clearCustom, chooseFile } = useJigsawPicture(
    settings.picture,
    puzzle.baseHomes,
    puzzle.seed,
    Math.ceil(layout.scale * camera.zoom * dpr)
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
    setPuzzle(prev => {
      const next = repositionForViewport(prev.pieces, { width: vpWidth, height: vpHeight });
      return { ...prev, pieces: next.pieces, layout: next.layout };
    });
    setCamera(c => clampCamera(c, { width: vpWidth, height: vpHeight }));
  }, [measured, vpWidth, vpHeight, setCamera]);

  const { placed, total } = progress(pieces);
  const solved = isSolved(pieces);

  const startPuzzle = (s: PuzzleSize) => {
    setPuzzle(makePuzzleState(s, newSeed(), vpWidth, vpHeight));
    resetZoom();
    setSelectedId(null);
    setTrayFilter('all');
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
    trayRef, pieces, layout, viewport, camera, setCamera, updatePieces, setSelectedId, setDropHighlight
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
  useCanvasRender(canvasRef, view, vpWidth, vpHeight, dpr, layout.scale, camera);

  const selectedPiece = pieces.find(p => p.id === selectedId);
  const canRotate = !!selectedPiece && !selectedPiece.locked && !selectedPiece.inTray;

  return (
    <div className="w-full h-dvh overflow-hidden bg-slate-900 flex flex-col">
      <JigsawToolbar
        modeSwitch={modeSwitch}
        isTouchDevice={isTouchDevice}
        size={size}
        onSize={startPuzzle}
        onNewPuzzle={() => startPuzzle(size)}
        picture={isCustom ? 'custom' : settings.picture}
        onPicture={selectPicture}
        onChoosePicture={chooseFile}
        canRotate={canRotate}
        onRotate={rotate}
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
          <ZoomControls camera={camera} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetZoom} />
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

      {showSettings && <JigsawSettingsDialog settings={settings} onChange={setSettings} onClose={closeSettings} />}

      {showHelp && <JigsawHelp isTouchDevice={isTouchDevice} onClose={closeHelp} />}
    </div>
  );
};
