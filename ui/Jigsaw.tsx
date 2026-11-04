// The jigsaw puzzle screen (spec 11). Every decision is made by jigsaw.ts;
// this keeps the state, turns pointer events into calls, and lays out the
// page.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { BOARD_H, BOARD_W, type Point } from '../rules';
import {
  bringToFront,
  isSolved,
  moveGroup,
  newPuzzle,
  pieceAt,
  progress,
  rotateGroup,
  seedFromQuery,
  settleGroup,
  type Piece,
  type PuzzleSize
} from '../jigsaw';
import { makeDefaultPicture } from './defaultPicture';
import { Overlay } from './HelpOverlay';
import { drawJigsaw, type Picture } from './jigsawDraw';
import { JigsawToolbar } from './JigsawToolbar';
import { useKeyboardControls, useWheelRotation } from './useControls';

const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const noUndo = () => {};

const canvasCoords = (canvas: HTMLCanvasElement, e: MouseEvent): Point => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
};

export const Jigsaw = ({ modeSwitch }: { modeSwitch: ReactNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<PuzzleSize>('medium');
  // The first puzzle can be chosen with ?seed= in the address
  const [pieces, setPieces] = useState<Piece[]>(() => newPuzzle('medium', seedFromQuery(window.location.search) ?? newSeed()));
  const [picture, setPicture] = useState<Picture>(() => {
    const image = makeDefaultPicture();
    return { image, width: image.width, height: image.height };
  });
  const [showPicture, setShowPicture] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // The piece being dragged, and where on it the pointer took hold
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const { placed, total } = progress(pieces);
  const solved = isSolved(pieces);

  const startPuzzle = (s: PuzzleSize) => {
    setSize(s);
    setPieces(newPuzzle(s, newSeed()));
    setSelectedId(null);
  };

  const choosePicture = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPicture({ image: img, width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const rotate = useCallback(
    (steps: number) => {
      if (selectedId !== null) setPieces(ps => rotateGroup(ps, selectedId, steps));
    },
    [selectedId]
  );
  useKeyboardControls(rotate, noUndo);
  useWheelRotation(canvasRef, rotate);
  const closeHelp = useCallback(() => setShowHelp(false), []);

  const view = useMemo(() => ({ pieces, picture, showPicture, selectedId }), [pieces, picture, showPicture, selectedId]);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawJigsaw(ctx, view);
  }, [view]);

  // Pressing on a loose piece picks up its group, selects it, and brings it
  // to the top; dragging moves the group; letting go drops it, locking it
  // in if it is home or snapping it to a matching neighbor. Right-click
  // turns the group under the pointer.
  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = canvasCoords(e.currentTarget, e);
    const i = pieceAt(pieces, p);
    if (i < 0) return;
    const piece = pieces[i];
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: piece.id, dx: p.x - piece.x, dy: p.y - piece.y };
    setSelectedId(piece.id);
    setPieces(bringToFront(pieces, i));
  };
  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = canvasCoords(e.currentTarget, e);
    setPieces(ps => {
      const piece = ps.find(q => q.id === d.id);
      return piece ? moveGroup(ps, d.id, p.x - d.dx - piece.x, p.y - d.dy - piece.y) : ps;
    });
  };
  const handlePointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setPieces(ps => settleGroup(ps, d.id));
  };
  const handleContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const i = pieceAt(pieces, canvasCoords(e.currentTarget, e));
    if (i < 0) return;
    const id = pieces[i].id;
    setSelectedId(id);
    setPieces(ps => rotateGroup(bringToFront(ps, i), id, e.shiftKey ? -1 : 1));
  };

  return (
    <div className="w-full h-dvh overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center p-2 sm:p-3">
      <div className="max-w-6xl w-full h-full flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Penrose Puzzle</h1>
            {modeSwitch}
          </div>
          <div className="flex items-center gap-4">
            <div className={`text-sm font-semibold ${solved ? 'text-emerald-400' : 'text-slate-300'}`} aria-live="polite">
              {solved ? `Solved! All ${total} pieces in place` : `${placed} / ${total} placed`}
            </div>
            <button onClick={() => setShowHelp(true)}
              aria-label="How to Play" className="text-slate-300 hover:text-white flex items-center gap-1 text-sm">
              <CircleHelp size={20} />
              <span className="hidden sm:inline">How to Play</span>
            </button>
          </div>
        </div>

        <JigsawToolbar
          isTouchDevice={isTouchDevice}
          size={size}
          onSize={startPuzzle}
          onNewPuzzle={() => startPuzzle(size)}
          showPicture={showPicture}
          onToggleShowPicture={() => setShowPicture(s => !s)}
          onChoosePicture={choosePicture}
          canRotate={selectedId !== null && !pieces.find(p => p.id === selectedId)?.locked}
          onRotate={rotate}
        />

        <div className="flex-1 min-h-0 flex items-start justify-center" style={{ containerType: 'size' }}>
          <canvas
            ref={canvasRef}
            width={BOARD_W}
            height={BOARD_H}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={handleContextMenu}
            style={{ touchAction: 'none', width: 'min(100cqw, 100cqh * 4 / 3)' }}
            className="h-auto bg-white rounded shadow-2xl cursor-grab active:cursor-grabbing"
          />
        </div>
      </div>

      {showHelp && (
        <Overlay onClose={closeHelp}>
          <p className="mb-3">Put the picture back together. Every piece is a kite or dart from a Penrose tiling.</p>
          <ul className="list-disc list-inside space-y-2">
            <li>The gray outline on the left shows where the pieces go</li>
            <li>Drag a piece to move it; it locks in when you drop it in its own place at the right angle</li>
            <li>Drop a piece next to one it borders in the picture, at the same angle, and they snap together and move as one</li>
            <li>
              {isTouchDevice
                ? 'Tap a piece to select it, then turn it with the rotate buttons (36° steps)'
                : 'Turn the selected piece with the scroll wheel or Left/Right arrow keys, or right-click a piece to turn it (Shift + right-click for the other way)'}
            </li>
            <li>Show picture faintly shows the whole picture in the outline</li>
            <li>Your picture swaps in a photo from your device (it stays on your device)</li>
            <li>New puzzle starts over with a different part of the tiling</li>
          </ul>
        </Overlay>
      )}
    </div>
  );
};
