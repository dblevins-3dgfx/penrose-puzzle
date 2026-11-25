import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  autoRotatePlacement,
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
import { useBoardSize } from './useBoardSize';
import { useKeyboardControls, useWheelRotation } from './useControls';

// Touch devices have no hover, so the preview follows a finger drag and
// is lifted above the fingertip so it isn't hidden under it.
const TOUCH_OFFSET_Y = 60;
const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

// Convert a pointer event's CSS pixel position into board coordinates (1:1 CSS pixels).
const canvasCoords = (canvas: HTMLCanvasElement, e: PointerEvent): Point => {
  const rect = canvas.getBoundingClientRect();
  const touch = e.pointerType === 'touch';
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top - (touch ? TOUCH_OFFSET_Y : 0)
  };
};

// The free-building sandbox: place kites and darts under the matching
// rules (spec sections 4 to 8). `modeSwitch` goes in the slim top bar.
export const Sandbox = ({ modeSwitch }: { modeSwitch: ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const board = useBoardSize(containerRef);

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
      const auto = autoRotate ? autoRotatePlacement(tiles, selectedTileType, p, autoChoice, board) : null;
      if (auto) return auto.tile;
      const candidate = { type: selectedTileType, x: p.x, y: p.y, rotation };
      const { x, y } = snapPosition(tiles, candidate, board);
      return { ...candidate, x, y };
    },
    [tiles, selectedTileType, rotation, autoRotate, autoChoice, board]
  );
  const preview = useMemo(() => {
    if (!hoveredPos) return null;
    const tile = snapped(hoveredPos);
    return { tile, valid: isLegalPlacement(tiles, tile, false, board) };
  }, [hoveredPos, snapped, tiles, board]);

  const place = (tile: Tile) => {
    if (!isLegalPlacement(tiles, tile, false, board)) return;
    setTiles([...tiles, tile]);
    // Keep the angle auto-rotate chose, and start the next tile at the
    // nearest fit again
    setRotation(tile.rotation);
    setAutoChoice(0);
  };
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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const backingW = Math.max(1, Math.round(board.width * board.dpr));
    const backingH = Math.max(1, Math.round(board.height * board.dpr));
    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }
    ctx.setTransform(board.dpr, 0, 0, board.dpr, 0, 0);
    drawBoard(ctx, tiles, preview, board);
  }, [tiles, preview, board]);

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') e.currentTarget.setPointerCapture?.(e.pointerId);
    setHoveredPos(canvasCoords(e.currentTarget, e));
  };
  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => setHoveredPos(canvasCoords(e.currentTarget, e));
  const handlePointerLeave = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse') setHoveredPos(null);
  };
  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    place(snapped(canvasCoords(e.currentTarget, e)));
  };
  const placeAtPreview = () => {
    if (!preview?.valid) return;
    place(preview.tile);
    setHoveredPos(null);
  };

  return (
    <div className="w-full h-dvh overflow-hidden bg-slate-900 flex flex-col">
      <Toolbar
        modeSwitch={modeSwitch}
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
        kiteCount={counts.kite}
        dartCount={counts.dart}
        onOpenHelp={() => setShowHelp(true)}
      />

      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={e => {
            e.preventDefault();
            rotate(e.shiftKey ? -1 : 1);
          }}
          style={{ touchAction: 'none' }}
          className="absolute inset-0 w-full h-full cursor-crosshair"
        />
      </div>

      {showHelp && <HelpOverlay isTouchDevice={isTouchDevice} onClose={closeHelp} />}
    </div>
  );
};
