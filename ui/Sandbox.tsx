import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import {
  autoRotatePlacement,
  BOARD_H,
  BOARD_W,
  countTiles,
  isLegalPlacement,
  removeLastTile,
  rotateBy,
  snapPosition,
  type Point,
  type Tile,
  type TileType
} from '../rules';
import { drawBoard } from './draw';
import { HelpOverlay } from './HelpOverlay';
import { Toolbar } from './Toolbar';
import { useKeyboardControls, useWheelRotation } from './useControls';

// Touch devices have no hover, so the preview follows a finger drag and
// is lifted above the fingertip so it isn't hidden under it.
const TOUCH_OFFSET_Y = 60;
const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

// Convert a pointer event's CSS pixel position into the canvas's internal
// drawing coordinates, since the canvas is scaled to fit the window.
const canvasCoords = (canvas: HTMLCanvasElement, e: PointerEvent): Point => {
  const rect = canvas.getBoundingClientRect();
  const touch = e.pointerType === 'touch';
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height) - (touch ? TOUCH_OFFSET_Y : 0)
  };
};

// The free-building sandbox: place kites and darts under the matching
// rules (spec sections 4 to 8). `modeSwitch` goes in the header.
export const Sandbox = ({ modeSwitch }: { modeSwitch: ReactNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selectedTileType, setSelectedTileType] = useState<TileType>('kite');
  const [rotation, setRotation] = useState(0);
  const [hoveredPos, setHoveredPos] = useState<Point | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // Auto-rotate (spec 5b): on/off, and which of the fits near the pointer
  // to show (the rotate controls step through them)
  const [autoRotate, setAutoRotate] = useState(false);
  const [autoChoice, setAutoChoice] = useState(0);

  const counts = useMemo(() => countTiles(tiles), [tiles]);

  // The tile under the pointer: turned to fit the nearest free edge in
  // auto-rotate mode (spec 5b), otherwise snapped into place at the chosen
  // rotation (spec 5). Whether it can be placed there is spec 4.
  const snapped = useCallback(
    (p: Point): Tile => {
      const auto = autoRotate ? autoRotatePlacement(tiles, selectedTileType, p, autoChoice) : null;
      if (auto) return auto.tile;
      const candidate = { type: selectedTileType, x: p.x, y: p.y, rotation };
      const { x, y } = snapPosition(tiles, candidate);
      return { ...candidate, x, y };
    },
    [tiles, selectedTileType, rotation, autoRotate, autoChoice]
  );
  const preview = useMemo(() => {
    if (!hoveredPos) return null;
    const tile = snapped(hoveredPos);
    return { tile, valid: isLegalPlacement(tiles, tile) };
  }, [hoveredPos, snapped, tiles]);

  const place = (tile: Tile) => {
    if (!isLegalPlacement(tiles, tile)) return;
    setTiles([...tiles, tile]);
    // Keep the angle auto-rotate chose, and start the next tile at the
    // nearest fit again
    setRotation(tile.rotation);
    setAutoChoice(0);
  };
  // Rotating turns the tile, or in auto-rotate mode steps through the fits
  const rotate = useCallback(
    (steps: number) => (autoRotate ? setAutoChoice(c => c + steps) : setRotation(r => rotateBy(r, steps))),
    [autoRotate]
  );
  const undo = useCallback(() => setTiles(removeLastTile), []);
  const clearBoard = () => {
    setTiles([]);
    setRotation(0);
    setHoveredPos(null);
  };
  const closeHelp = useCallback(() => setShowHelp(false), []);

  useKeyboardControls(rotate, undo);
  useWheelRotation(canvasRef, rotate);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawBoard(ctx, tiles, preview);
  }, [tiles, preview]);

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') e.currentTarget.setPointerCapture?.(e.pointerId);
    setHoveredPos(canvasCoords(e.currentTarget, e));
  };
  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => setHoveredPos(canvasCoords(e.currentTarget, e));
  const handlePointerLeave = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') setHoveredPos(null);
  };
  // Mouse: click places immediately. Touch: lifting the finger leaves the
  // preview in place so it can be adjusted, and the Place button confirms.
  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    place(snapped(canvasCoords(e.currentTarget, e)));
  };
  const placeAtPreview = () => {
    if (!preview?.valid) return;
    place(preview.tile);
    setHoveredPos(null);
  };

  // The layout fills exactly the visible window (dvh tracks mobile browser
  // toolbars): header and controls take their natural height and the board
  // scales to the largest 4:3 size that fits in the rest.
  return (
    <div className="w-full h-dvh overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center p-2 sm:p-3">
      <div className="max-w-6xl w-full h-full flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Penrose Puzzle</h1>
            {modeSwitch}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-slate-300 text-sm">
              <span className="text-amber-400 font-semibold">{counts.kite}</span> kites ·{' '}
              <span className="text-indigo-400 font-semibold">{counts.dart}</span> darts
            </div>
            <button
              onClick={() => setShowHelp(true)}
              aria-label="How to Play"
              className="text-slate-300 hover:text-white flex items-center gap-1 text-sm"
            >
              <CircleHelp size={20} />
              <span className="hidden sm:inline">How to Play</span>
            </button>
          </div>
        </div>

        <Toolbar
          isTouchDevice={isTouchDevice}
          selectedTileType={selectedTileType}
          onSelectTileType={setSelectedTileType}
          rotation={preview ? preview.tile.rotation : rotation}
          onRotate={rotate}
          autoRotate={autoRotate}
          onToggleAutoRotate={() => {
            setAutoRotate(a => !a);
            setAutoChoice(0);
          }}
          canPlace={!!preview?.valid}
          onPlace={placeAtPreview}
          boardEmpty={tiles.length === 0}
          onUndo={undo}
          onClear={clearBoard}
        />

        {/* Size container: the canvas width is the smaller of the full
            width and the width a 4:3 board would have at the full height. */}
        <div className="flex-1 min-h-0 flex items-start justify-center" style={{ containerType: 'size' }}>
          <canvas
            ref={canvasRef}
            width={BOARD_W}
            height={BOARD_H}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            // Right-click rotates clockwise (Shift + right-click
            // counter-clockwise) instead of opening the browser menu.
            onContextMenu={e => {
              e.preventDefault();
              rotate(e.shiftKey ? -1 : 1);
            }}
            style={{ touchAction: 'none', width: 'min(100cqw, 100cqh * 4 / 3)' }}
            className="h-auto bg-white rounded shadow-2xl cursor-crosshair"
          />
        </div>
      </div>

      {showHelp && <HelpOverlay isTouchDevice={isTouchDevice} onClose={closeHelp} />}
    </div>
  );
};

