// The jigsaw puzzle screen (spec 9). Every decision is made by jigsaw.ts;
// this keeps the state, turns pointer events into calls, and lays out the
// board alongside the scrollable piece tray.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject
} from 'react';
import type { Point } from '../rules';
import {
  boundsOf,
  bringToFront,
  canReturnToTray,
  coverRect,
  isSolved,
  moveGroup,
  newPuzzleForViewport,
  parseSettings,
  pieceAt,
  popSpotOnBoard,
  progress,
  repositionForViewport,
  returnToTray,
  rotateGroup,
  seedFromQuery,
  serializeSettings,
  SETTINGS_KEY,
  settleGroup,
  takeFromTray,
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
import { useBoardSize, useIsPortrait } from './useBoardSize';
import { useKeyboardControls, useWheelRotation } from './useControls';

const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const noUndo = () => {};

const clientToBoard = (canvas: HTMLCanvasElement, clientX: number, clientY: number, scale: number): Point => {
  const rect = canvas.getBoundingClientRect();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
};

const isInElement = (el: HTMLElement | null, clientX: number, clientY: number): boolean => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
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

// Handles both dragging a piece directly out of the tray onto the board and
// quick-tapping a tray piece to pop it onto the board (without fighting native
// touch scrolling inside the tray).
const useTrayInteraction = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  trayRef: RefObject<HTMLDivElement | null>,
  layout: ViewportLayout,
  isPortrait: boolean,
  updatePieces: (fn: (ps: Piece[]) => Piece[]) => void,
  onSelect: (id: number | null) => void
) =>
  useCallback(
    (id: number, startEvent: PointerEvent<HTMLButtonElement>) => {
      if (startEvent.button !== 0) return;
      const startX = startEvent.clientX, startY = startEvent.clientY;
      const isTouch = startEvent.pointerType === 'touch';
      let lifted = false, scrolled = false;

      const onMove = (e: globalThis.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || scrolled) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!lifted) {
          if (isTouch) {
            const scrollMoved = isPortrait ? Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) : Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx);
            if (scrollMoved) { scrolled = true; return; }
            const pullOut = isPortrait ? dy < -12 : dx < -12;
            if (!pullOut) return;
          } else if (Math.hypot(dx, dy) <= 6) {
            return;
          }
          lifted = true;
          const pt = clientToBoard(canvas, e.clientX, e.clientY, layout.scale);
          onSelect(id);
          updatePieces(ps => takeFromTray(ps, id, pt, layout.board));
          return;
        }
        const pt = clientToBoard(canvas, e.clientX, e.clientY, layout.scale);
        updatePieces(ps => {
          const piece = ps.find(q => q.id === id);
          return piece ? moveGroup(ps, id, pt.x - piece.x, pt.y - piece.y, layout.board) : ps;
        });
      };

      const onEnd = (e: globalThis.PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        if (lifted) {
          if (isInElement(trayRef.current, e.clientX, e.clientY)) {
            onSelect(null);
            updatePieces(ps => returnToTray(ps, id));
          } else {
            updatePieces(ps => settleGroup(ps, id));
          }
          return;
        }
        if (!scrolled && Math.hypot(e.clientX - startX, e.clientY - startY) <= 8) {
          onSelect(id);
          updatePieces(ps => takeFromTray(ps, id, popSpotOnBoard(ps, layout.board), layout.board));
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [canvasRef, trayRef, layout.scale, layout.board, isPortrait, updatePieces, onSelect]
  );

// Handles dragging and right-clicking pieces already on the board, including
// highlighting the tray and returning single ungrouped pieces dropped over it.
const useBoardDrag = (
  trayRef: RefObject<HTMLDivElement | null>,
  pieces: Piece[],
  layout: ViewportLayout,
  updatePieces: (fn: (ps: Piece[]) => Piece[]) => void,
  onSelect: (id: number | null) => void,
  onDropHighlight: (active: boolean) => void
) => {
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = clientToBoard(e.currentTarget, e.clientX, e.clientY, layout.scale);
    const i = pieceAt(pieces, p);
    if (i < 0) return;
    const piece = pieces[i];
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: piece.id, dx: p.x - piece.x, dy: p.y - piece.y };
    onSelect(piece.id);
    updatePieces(ps => bringToFront(ps, i));
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    onDropHighlight(isInElement(trayRef.current, e.clientX, e.clientY) && canReturnToTray(pieces, d.id));
    const p = clientToBoard(e.currentTarget, e.clientX, e.clientY, layout.scale);
    updatePieces(ps => {
      const piece = ps.find(q => q.id === d.id);
      return piece ? moveGroup(ps, d.id, p.x - d.dx - piece.x, p.y - d.dy - piece.y, layout.board) : ps;
    });
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onDropHighlight(false);
    if (isInElement(trayRef.current, e.clientX, e.clientY) && canReturnToTray(pieces, d.id)) {
      onSelect(null);
      updatePieces(ps => returnToTray(ps, d.id));
      return;
    }
    updatePieces(ps => settleGroup(ps, d.id));
  };

  const onContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const i = pieceAt(pieces, clientToBoard(e.currentTarget, e.clientX, e.clientY, layout.scale));
    if (i < 0) return;
    const id = pieces[i].id;
    onSelect(id);
    updatePieces(ps => rotateGroup(bringToFront(ps, i), id, e.shiftKey ? -1 : 1));
  };

  return { onPointerDown, onPointerMove, onPointerUp, onContextMenu };
};

export const Jigsaw = ({ modeSwitch }: { modeSwitch: ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPortrait = useIsPortrait();
  const { width: vpWidth, height: vpHeight, dpr, measured } = useBoardSize(containerRef);

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
    setTrayFilter('all');
  };

  const selectPicture = (style: PictureStyle) => {
    clearCustom();
    setSettings(s => ({ ...s, picture: style }));
  };

  const updatePieces = useCallback((fn: (ps: Piece[]) => Piece[]) => {
    setPuzzle(prev => ({ ...prev, pieces: fn(prev.pieces) }));
  }, []);

  const handleStartFromTray = useTrayInteraction(canvasRef, trayRef, layout, isPortrait, updatePieces, setSelectedId);
  const boardHandlers = useBoardDrag(trayRef, pieces, layout, updatePieces, setSelectedId, setDropHighlight);

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

  const pictureRect = useMemo(
    () => (pieces.length ? coverRect(picture.width, picture.height, boundsOf(pieces.map(p => p.home))) : { x: 0, y: 0, w: 1, h: 1 }),
    [pieces, picture.width, picture.height]
  );
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
