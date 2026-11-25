// The jigsaw puzzle screen (spec 9). Every decision is made by jigsaw.ts;
// this keeps the state, turns pointer events into calls, and lays out the
// page to fill the viewport.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { Point } from '../rules';
import {
  bringToFront,
  isSolved,
  moveGroup,
  newPuzzleForViewport,
  parseSettings,
  pieceAt,
  progress,
  repositionForViewport,
  rotateGroup,
  seedFromQuery,
  serializeSettings,
  SETTINGS_KEY,
  settleGroup,
  type JigsawSettings,
  type PictureStyle,
  type Piece,
  type PuzzleSize,
  type ViewportLayout
} from '../jigsaw';
import { makeDefaultPicture } from './defaultPicture';
import { drawJigsaw, type Picture } from './jigsawDraw';
import { makePenrosePicture } from './penrosePictureDraw';
import { JigsawHelp } from './JigsawHelp';
import { JigsawSettingsDialog } from './JigsawSettingsDialog';
import { JigsawToolbar } from './JigsawToolbar';
import { useBoardSize } from './useBoardSize';
import { useKeyboardControls, useWheelRotation } from './useControls';

const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const noUndo = () => {};

const canvasCoords = (canvas: HTMLCanvasElement, e: MouseEvent, scale: number): Point => {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
};

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

export const Jigsaw = ({ modeSwitch }: { modeSwitch: ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width: vpWidth, height: vpHeight, dpr, measured } = useBoardSize(containerRef);

  // The first puzzle can be chosen with ?seed= in the address. Keeping baseHomes
  // separate from moving pieces avoids redrawing the offscreen tiling on drag/resize.
  const [puzzle, setPuzzle] = useState<PuzzleState>(() =>
    makePuzzleState('medium', seedFromQuery(window.location.search) ?? newSeed(), vpWidth, vpHeight)
  );
  const { size, pieces, layout } = puzzle;
  const initializedViewport = useRef(false);

  const [settings, setSettings] = useJigsawSettings();
  const picturePixelScale = Math.ceil(layout.scale * dpr);
  const { picture, isCustom, clearCustom, chooseFile } = useJigsawPicture(
    settings.picture,
    puzzle.baseHomes,
    puzzle.seed,
    picturePixelScale
  );
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  // On the first real viewport measurement, scatter the initial puzzle to match
  // the actual screen; on later resizes, reflow the puzzle and clamp loose pieces.
  useEffect(() => {
    if (!measured) return;
    if (!initializedViewport.current) {
      initializedViewport.current = true;
      setPuzzle(prev => makePuzzleState(prev.size, prev.seed, vpWidth, vpHeight));
      return;
    }
    setPuzzle(prev => {
      const next = repositionForViewport(prev.pieces, { width: vpWidth, height: vpHeight });
      return { ...prev, pieces: next.pieces, layout: next.layout };
    });
  }, [measured, vpWidth, vpHeight]);

  const { placed, total } = progress(pieces);
  const solved = isSolved(pieces);

  const startPuzzle = (s: PuzzleSize) => {
    setPuzzle(makePuzzleState(s, newSeed(), vpWidth, vpHeight));
    setSelectedId(null);
  };

  const selectPicture = (style: PictureStyle) => {
    clearCustom();
    setSettings(s => ({ ...s, picture: style }));
  };

  const updatePieces = useCallback((fn: (ps: Piece[]) => Piece[]) => {
    setPuzzle(prev => ({ ...prev, pieces: fn(prev.pieces) }));
  }, []);

  const rotate = useCallback(
    (steps: number) => {
      if (selectedId !== null) updatePieces(ps => rotateGroup(ps, selectedId, steps));
    },
    [selectedId, updatePieces]
  );
  useKeyboardControls(rotate, noUndo);
  useWheelRotation(canvasRef, rotate);
  const closeHelp = useCallback(() => setShowHelp(false), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  const view = useMemo(
    () => ({ pieces, picture, settings, selectedId, board: layout.board }),
    [pieces, picture, settings, selectedId, layout.board]
  );
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
    const s = layout.scale * dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    drawJigsaw(ctx, view);
  }, [view, vpWidth, vpHeight, dpr, layout.scale]);

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = canvasCoords(e.currentTarget, e, layout.scale);
    const i = pieceAt(pieces, p);
    if (i < 0) return;
    const piece = pieces[i];
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: piece.id, dx: p.x - piece.x, dy: p.y - piece.y };
    setSelectedId(piece.id);
    updatePieces(ps => bringToFront(ps, i));
  };
  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = canvasCoords(e.currentTarget, e, layout.scale);
    updatePieces(ps => {
      const piece = ps.find(q => q.id === d.id);
      return piece ? moveGroup(ps, d.id, p.x - d.dx - piece.x, p.y - d.dy - piece.y, layout.board) : ps;
    });
  };
  const handlePointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    updatePieces(ps => settleGroup(ps, d.id));
  };
  const handleContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const i = pieceAt(pieces, canvasCoords(e.currentTarget, e, layout.scale));
    if (i < 0) return;
    const id = pieces[i].id;
    setSelectedId(id);
    updatePieces(ps => rotateGroup(bringToFront(ps, i), id, e.shiftKey ? -1 : 1));
  };

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
        canRotate={selectedId !== null && !pieces.find(p => p.id === selectedId)?.locked}
        onRotate={rotate}
        placed={placed}
        total={total}
        solved={solved}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHelp={() => setShowHelp(true)}
      />

      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={handleContextMenu}
          style={{ touchAction: 'none' }}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        />
      </div>

      {showSettings && <JigsawSettingsDialog settings={settings} onChange={setSettings} onClose={closeSettings} />}

      {showHelp && <JigsawHelp isTouchDevice={isTouchDevice} onClose={closeHelp} />}
    </div>
  );
};
